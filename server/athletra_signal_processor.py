#!/usr/bin/env python3
"""
AthletraSignalProcessor
=======================
Real-time biomechanical signal processing pipeline that converts raw MediaPipe
pose landmarks into stable, normalised biomechanical signals.

Pipeline stages
---------------
1. Normalization  – shoulder-width scale reference (EMA-smoothed)
2. Smoothing      – One-Euro Filter or EMA per landmark axis
3. Heuristic Gate – velocity-based event detection for target joint
4. Upsampling     – CubicSpline 10× interpolation on scalar joint angle
5. Confidence     – frame-count ramp × signal-consistency score
"""

from __future__ import annotations

import math
import time
from collections import deque
from typing import Any, Dict, List, Optional, Tuple

try:
    from typing import TypedDict
except ImportError:
    from typing_extensions import TypedDict

import numpy as np
from scipy.interpolate import CubicSpline

from server.base_logic import BaseSportLogic, empty_standard_output
from server.signal_factory import get_sport_processor


class DerivedSignals(TypedDict):
    """Pre-calculated biomechanical signals derived from smoothed landmarks."""
    angles:          Dict[str, float]
    target_velocity: float
    shoulder_width:  float
    gate_open:       bool


class FramePacket(TypedDict):
    """
    Typed contract passed to every BaseSportLogic.process_frame() call.

    Fields
    ------
    landmarks        : 33 smoothed image-space landmarks {x,y,z,visibility}
    world_landmarks  : 33 raw world-space landmarks (may be empty list)
    timestamp        : monotonic seconds
    bbox_confidence  : person-detection confidence from MediaPipe [0, 1]
    derived          : pre-calculated angles, velocity, shoulder_width
    """
    landmarks:       List[Dict[str, float]]
    world_landmarks: List[Dict[str, float]]
    timestamp:       float
    bbox_confidence: float
    derived:         DerivedSignals

LANDMARK_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist", "left_pinky", "right_pinky",
    "left_index", "right_index", "left_thumb", "right_thumb",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_ankle", "right_ankle", "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]

LANDMARK_INDEX: Dict[str, int] = {name: i for i, name in enumerate(LANDMARK_NAMES)}

JOINT_ANGLE_DEFS: Dict[str, Tuple[int, int, int]] = {
    "left_elbow":    (11, 13, 15),
    "right_elbow":   (12, 14, 16),
    "left_shoulder": (13, 11, 23),
    "right_shoulder":(14, 12, 24),
    "left_hip":      (11, 23, 25),
    "right_hip":     (12, 24, 26),
    "left_knee":     (23, 25, 27),
    "right_knee":    (24, 26, 28),
    "left_ankle":    (25, 27, 31),
    "right_ankle":   (26, 28, 32),
}


def _euclidean(a: Dict, b: Dict) -> float:
    return math.sqrt(
        (a["x"] - b["x"]) ** 2 +
        (a["y"] - b["y"]) ** 2 +
        (a["z"] - b["z"]) ** 2
    )


def _calc_angle_from_dicts(a: Dict, b: Dict, c: Dict) -> float:
    ba = np.array([a["x"] - b["x"], a["y"] - b["y"], a["z"] - b["z"]])
    bc = np.array([c["x"] - b["x"], c["y"] - b["y"], c["z"] - b["z"]])
    cos_val = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    return round(math.degrees(math.acos(np.clip(cos_val, -1.0, 1.0))), 2)


class _OneEuroFilter:
    """
    One-Euro Filter for a single scalar signal.

    Adaptively smooths slow-moving signals (heavy damping) while keeping
    fast-moving signals responsive (low lag). Two internal EMA stages:
    one on the value, one on its derivative.

    Parameters
    ----------
    min_cutoff : float
        Minimum cutoff frequency (Hz). Lower = more smoothing at rest.
    beta : float
        Speed coefficient. Higher = faster adaptation to rapid motion.
    d_cutoff : float
        Derivative cutoff frequency. Fixed; controls derivative smoothing.
    """

    def __init__(self, min_cutoff: float = 1.0, beta: float = 0.007, d_cutoff: float = 1.0):
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._x: Optional[float] = None
        self._dx: float = 0.0
        self._t: Optional[float] = None

    @staticmethod
    def _alpha(cutoff: float, dt: float) -> float:
        tau = 1.0 / (2.0 * math.pi * cutoff)
        return 1.0 / (1.0 + tau / dt)

    def reset(self) -> None:
        self._x = None
        self._dx = 0.0
        self._t = None

    def __call__(self, x: float, timestamp: float) -> float:
        if self._t is None:
            self._x = x
            self._t = timestamp
            return x

        dt = max(timestamp - self._t, 1e-6)
        self._t = timestamp

        a_d = self._alpha(self.d_cutoff, dt)
        dx = (x - self._x) / dt
        self._dx = a_d * dx + (1.0 - a_d) * self._dx

        cutoff = self.min_cutoff + self.beta * abs(self._dx)
        a = self._alpha(cutoff, dt)
        self._x = a * x + (1.0 - a) * self._x
        return self._x


class _EMAFilter:
    """Exponential Moving Average for a single scalar signal."""

    def __init__(self, alpha: float = 0.3):
        self.alpha = alpha
        self._x: Optional[float] = None

    def reset(self) -> None:
        self._x = None

    def __call__(self, x: float, timestamp: float = 0.0) -> float:
        if self._x is None:
            self._x = x
        else:
            self._x = self.alpha * x + (1.0 - self.alpha) * self._x
        return self._x


class AthletraSignalProcessor:
    """
    Real-time biomechanical signal processor for MediaPipe pose landmarks.

    Parameters
    ----------
    target_joint : str
        Name of the landmark that drives the motion gate (e.g. "left_wrist").
    smoothing_method : str
        "one_euro" (default) or "ema".
    ema_alpha : float
        EMA decay coefficient when smoothing_method="ema" (0 < alpha ≤ 1).
    one_euro_min_cutoff : float
        One-Euro min cutoff frequency.
    one_euro_beta : float
        One-Euro speed coefficient.
    one_euro_d_cutoff : float
        One-Euro derivative cutoff.
    visibility_threshold : float
        Landmarks below this visibility are ignored (filter state held).
    gate_threshold_open : float
        Normalised velocity (shoulder-widths/s) to open the motion gate.
    gate_threshold_close : float
        Normalised velocity to close the motion gate (hysteresis).
    upsample_factor : int
        CubicSpline upsampling multiplier applied to buffered angle signal.
    shoulder_smooth_alpha : float
        EMA alpha for smoothing shoulder_width (stable scale reference).
    confidence_min_frames : int
        Frames required before confidence ramps to 1.0.
    target_angle_joint : str
        Joint whose angle is computed per frame and buffered for upsampling.
        Defaults to target_joint (if it has an angle definition), otherwise
        falls back to "left_knee".
    velocity_history_len : int
        Number of recent velocity readings used for consistency score.
    """

    def __init__(
        self,
        sport_name: str = "general",
        target_joint: str = "left_wrist",
        smoothing_method: str = "one_euro",
        ema_alpha: float = 0.3,
        one_euro_min_cutoff: float = 1.0,
        one_euro_beta: float = 0.007,
        one_euro_d_cutoff: float = 1.0,
        visibility_threshold: float = 0.5,
        gate_threshold_open: float = 0.15,
        gate_threshold_close: float = 0.05,
        upsample_factor: int = 10,
        shoulder_smooth_alpha: float = 0.15,
        confidence_min_frames: int = 10,
        target_angle_joint: Optional[str] = None,
        velocity_history_len: int = 20,
    ):
        if gate_threshold_close >= gate_threshold_open:
            raise ValueError("gate_threshold_close must be < gate_threshold_open")

        self.sport_name = sport_name.strip().lower()
        self._sport_processor: BaseSportLogic = get_sport_processor(self.sport_name)

        self.target_joint = target_joint
        self.smoothing_method = smoothing_method
        self.visibility_threshold = visibility_threshold
        self.gate_threshold_open = gate_threshold_open
        self.gate_threshold_close = gate_threshold_close
        self.upsample_factor = upsample_factor
        self.confidence_min_frames = confidence_min_frames
        self.velocity_history_len = velocity_history_len

        target_lm_idx = LANDMARK_INDEX.get(target_joint)
        if target_lm_idx is None:
            raise ValueError(f"Unknown target_joint: {target_joint!r}. "
                             f"Valid names: {list(LANDMARK_NAMES)}")
        self._target_idx: int = target_lm_idx

        if target_angle_joint is not None:
            if target_angle_joint not in JOINT_ANGLE_DEFS:
                raise ValueError(f"Unknown target_angle_joint: {target_angle_joint!r}")
            self._angle_joint: str = target_angle_joint
        elif target_joint in JOINT_ANGLE_DEFS:
            self._angle_joint = target_joint
        else:
            self._angle_joint = "left_knee"

        self._sw_ema = _EMAFilter(alpha=shoulder_smooth_alpha)
        self._smoothed_sw: float = 0.0

        def _make_filter():
            if smoothing_method == "one_euro":
                return _OneEuroFilter(one_euro_min_cutoff, one_euro_beta, one_euro_d_cutoff)
            return _EMAFilter(alpha=ema_alpha)

        self._filters: List[Dict[str, Any]] = [
            {"x": _make_filter(), "y": _make_filter(), "z": _make_filter()}
            for _ in range(33)
        ]

        self._smoothed_landmarks: List[Optional[Dict]] = [None] * 33
        self._prev_target_pos: Optional[Dict] = None
        self._gate_open: bool = False
        self._buffer: List[Dict] = []

        self._frame_count: int = 0
        self._missing_frames: int = 0

        self._velocity_history: deque = deque(maxlen=velocity_history_len)
        self._last_velocity: float = 0.0

    def reset(self) -> None:
        """Reset all internal state (start of a new session)."""
        for fset in self._filters:
            fset["x"].reset()
            fset["y"].reset()
            fset["z"].reset()
        self._sw_ema.reset()
        self._smoothed_sw = 0.0
        self._smoothed_landmarks = [None] * 33
        self._prev_target_pos = None
        self._gate_open = False
        self._buffer = []
        self._frame_count = 0
        self._missing_frames = 0
        self._velocity_history.clear()
        self._last_velocity = 0.0

    def _validate_landmarks(
        self, landmarks: Optional[List[Dict]]
    ) -> Optional[List[Dict]]:
        """
        Return landmarks only if the list is valid and critical landmarks exist.

        Early exit: returns None immediately if input is None, has wrong length,
        or if both shoulder landmarks are missing / low-visibility.
        """
        if landmarks is None:
            return None
        if len(landmarks) != 33:
            return None

        ls = landmarks[11]
        rs = landmarks[12]
        if ls.get("visibility", 0) < self.visibility_threshold and \
           rs.get("visibility", 0) < self.visibility_threshold:
            return None

        return landmarks

    def _compute_shoulder_width(self, landmarks: List[Dict]) -> Optional[float]:
        ls, rs = landmarks[11], landmarks[12]
        if ls.get("visibility", 0) < self.visibility_threshold or \
           rs.get("visibility", 0) < self.visibility_threshold:
            return None
        return _euclidean(ls, rs)

    def _smooth_landmark(self, idx: int, lm: Dict, timestamp: float) -> Dict:
        fset = self._filters[idx]
        sx = fset["x"](lm["x"], timestamp)
        sy = fset["y"](lm["y"], timestamp)
        sz = fset["z"](lm["z"], timestamp)
        return {"x": sx, "y": sy, "z": sz, "visibility": lm.get("visibility", 1.0)}

    def _apply_smoothing(
        self, landmarks: List[Dict], timestamp: float
    ) -> List[Dict]:
        smoothed = []
        for i, lm in enumerate(landmarks):
            vis = lm.get("visibility", 1.0)
            if vis >= self.visibility_threshold:
                s = self._smooth_landmark(i, lm, timestamp)
                self._smoothed_landmarks[i] = s
                smoothed.append(s)
            else:
                held = self._smoothed_landmarks[i]
                if held is not None:
                    smoothed.append(held)
                else:
                    smoothed.append(lm)
        return smoothed

    def _compute_velocity(
        self,
        current_pos: Dict,
        prev_pos: Optional[Dict],
        dt: float,
        shoulder_width: float,
    ) -> float:
        """
        Scalar velocity of target landmark normalised by shoulder_width.

        Returns 0.0 if prev_pos is not available or shoulder_width is zero.
        This is a scalar (speed), not a coordinate vector.
        """
        if prev_pos is None or shoulder_width < 1e-6 or dt < 1e-6:
            return 0.0
        dist = _euclidean(current_pos, prev_pos)
        return (dist / dt) / shoulder_width

    def _compute_joint_angle(self, smoothed: List[Dict], joint: str) -> Optional[float]:
        if joint not in JOINT_ANGLE_DEFS:
            return None
        ia, ib, ic = JOINT_ANGLE_DEFS[joint]
        a, b, c = smoothed[ia], smoothed[ib], smoothed[ic]
        vis_ok = all(
            v.get("visibility", 1.0) >= self.visibility_threshold
            for v in [a, b, c]
        )
        if not vis_ok:
            return None
        return _calc_angle_from_dicts(a, b, c)

    def _confidence(self) -> float:
        frame_ramp = min(self._frame_count / max(self.confidence_min_frames, 1), 1.0)

        if len(self._velocity_history) < 2:
            consistency = 0.0
        else:
            arr = np.array(self._velocity_history)
            std = float(np.std(arr))
            mean = float(np.mean(arr)) + 1e-8
            cv = std / mean
            consistency = float(np.clip(1.0 - cv, 0.0, 1.0))

        return round(frame_ramp * consistency, 4)

    def update(
        self,
        landmarks: Optional[List[Dict]],
        timestamp: Optional[float] = None,
        world_landmarks: Optional[List[Dict]] = None,
        bbox_confidence: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Process one frame of MediaPipe landmarks.

        Parameters
        ----------
        landmarks : list[dict] | None
            33-element list of ``{x, y, z, visibility}`` image-space dicts,
            or None when detection failed.
        timestamp : float | None
            Monotonic seconds. Defaults to time.time().
        world_landmarks : list[dict] | None
            33-element list of world-space dicts (optional). Passed through
            in FramePacket; sport logic may use for 3-D angles.
        bbox_confidence : float
            Person-detection confidence from MediaPipe [0, 1]. Default 1.0.
            Low values are NOT a fallback trigger — the active sport logic
            handles them by appending "low_confidence" to StandardOutput.issues.

        Returns
        -------
        dict with keys:
            smoothed_landmarks, shoulder_width, target_velocity, joint_angle,
            gate_open, captured_segment (dict | None), confidence, frame_count,
            missing_frames, sport_metrics (StandardOutput)
        """
        if timestamp is None:
            timestamp = time.time()

        valid = self._validate_landmarks(landmarks)

        if valid is None:
            self._missing_frames += 1
            return {
                "smoothed_landmarks": [],
                "shoulder_width": self._smoothed_sw,
                "target_velocity": 0.0,
                "joint_angle": None,
                "gate_open": self._gate_open,
                "captured_segment": None,
                "confidence": self._confidence(),
                "frame_count": self._frame_count,
                "missing_frames": self._missing_frames,
                "sport_metrics": empty_standard_output(),
            }

        self._frame_count += 1

        raw_sw = self._compute_shoulder_width(valid)
        if raw_sw is not None and raw_sw > 1e-6:
            self._smoothed_sw = float(self._sw_ema(raw_sw))
        shoulder_width = self._smoothed_sw if self._smoothed_sw > 1e-6 else (raw_sw or 0.1)

        smoothed = self._apply_smoothing(valid, timestamp)

        target_pos = smoothed[self._target_idx]

        if self._prev_target_pos is not None and self._frame_count > 1:
            dt = max(timestamp - getattr(self, "_prev_timestamp", timestamp - 0.033), 1e-6)
        else:
            dt = 0.033
        setattr(self, "_prev_timestamp", timestamp)

        velocity = self._compute_velocity(target_pos, self._prev_target_pos, dt, shoulder_width)
        self._last_velocity = velocity
        self._velocity_history.append(velocity)

        self._prev_target_pos = target_pos

        joint_angle = self._compute_joint_angle(smoothed, self._angle_joint)

        captured_segment = None
        prev_gate = self._gate_open

        if not self._gate_open and velocity > self.gate_threshold_open:
            self._gate_open = True

        if self._gate_open:
            self._buffer.append({
                "timestamp": timestamp,
                "frame_index": self._frame_count,
                "target_position": {"x": target_pos["x"], "y": target_pos["y"], "z": target_pos["z"]},
                "velocity": velocity,
                "joint_angle": joint_angle,
                "shoulder_width": shoulder_width,
            })

        if self._gate_open and velocity < self.gate_threshold_close:
            self._gate_open = False
            if len(self._buffer) >= 2:
                captured_segment = self._process_segment(self._buffer)
            self._buffer = []

        all_angles: Dict[str, float] = {}
        for joint_name in JOINT_ANGLE_DEFS:
            angle = self._compute_joint_angle(smoothed, joint_name)
            if angle is not None:
                all_angles[joint_name] = angle

        derived: DerivedSignals = {
            "angles":          all_angles,
            "target_velocity": round(velocity, 6),
            "shoulder_width":  shoulder_width,
            "gate_open":       self._gate_open,
        }

        packet: FramePacket = {
            "landmarks":       [
                {"x": lm["x"], "y": lm["y"], "z": lm["z"], "visibility": lm.get("visibility", 1.0)}
                for lm in smoothed
            ],
            "world_landmarks": world_landmarks if world_landmarks is not None else [],
            "timestamp":       timestamp,
            "bbox_confidence": bbox_confidence,
            "derived":         derived,
        }

        self._sport_processor.process_frame(packet)

        return {
            "smoothed_landmarks": packet["landmarks"],
            "shoulder_width":     shoulder_width,
            "target_velocity":    round(velocity, 6),
            "joint_angle":        joint_angle,
            "gate_open":          self._gate_open,
            "captured_segment":   captured_segment,
            "confidence":         self._confidence(),
            "frame_count":        self._frame_count,
            "missing_frames":     self._missing_frames,
            "sport_metrics":      self._sport_processor.get_metrics(),
        }

    def _process_segment(self, buffer: List[Dict]) -> Dict[str, Any]:
        """
        Run CubicSpline upsampling on the captured joint-angle scalar signal.

        Interpolation is applied only to the scalar joint-angle (or velocity
        if angle is unavailable) — never to raw coordinates.
        """
        timestamps = [f["timestamp"] for f in buffer]
        angles = [f["joint_angle"] for f in buffer]
        velocities = [f["velocity"] for f in buffer]

        valid_angle_mask = [a is not None for a in angles]
        use_angles = sum(valid_angle_mask) >= 2

        if use_angles:
            signal_times = [timestamps[i] for i, v in enumerate(valid_angle_mask) if v]
            signal_values = [angles[i] for i, v in enumerate(valid_angle_mask) if v]
        else:
            signal_times = timestamps
            signal_values = velocities

        t0 = signal_times[0]
        rel_times = [t - t0 for t in signal_times]

        n_out = len(signal_times) * self.upsample_factor
        t_dense = np.linspace(0, rel_times[-1], n_out)

        try:
            cs = CubicSpline(rel_times, signal_values)
            upsampled = cs(t_dense).tolist()
        except Exception:
            upsampled = signal_values

        peak_idx = int(np.argmax(upsampled))
        trough_idx = int(np.argmin(upsampled))

        duration = signal_times[-1] - signal_times[0]
        frame_count = len(buffer)
        effective_fps = frame_count / duration if duration > 1e-6 else 0.0

        return {
            "duration": round(duration, 4),
            "frame_count": frame_count,
            "effective_fps": round(effective_fps, 2),
            "signal_type": "joint_angle" if use_angles else "velocity",
            "joint": self._angle_joint,
            "upsampled_times": (t0 + t_dense).tolist(),
            "upsampled_values": upsampled,
            "peak_angle": round(upsampled[peak_idx], 2),
            "peak_time": round(float(t0 + t_dense[peak_idx]), 4),
            "min_angle": round(upsampled[trough_idx], 2),
            "trough_time": round(float(t0 + t_dense[trough_idx]), 4),
            "raw_frames": buffer,
        }

    def flush_gate(self) -> Optional[Dict[str, Any]]:
        """
        Force-close the gate and return any buffered segment (end of stream).

        Returns None if the buffer has fewer than 2 frames.
        """
        if self._gate_open and len(self._buffer) >= 2:
            segment = self._process_segment(self._buffer)
            self._buffer = []
            self._gate_open = False
            return segment
        self._buffer = []
        self._gate_open = False
        return None


# ══════════════════════════════════════════════════════════════════════════════
# Batch Analysis Engine  —  Signal-Centered Analysis Core
# ══════════════════════════════════════════════════════════════════════════════
#
# Operates on a COMPLETED capture (all frames available at once).
# Implements:
#   1. Hip-centric local coordinate system
#   2. Shoulder-width normalization (EMA-smoothed scale reference)
#   3. Adaptive 1 Euro filter (dynamic beta = base_beta + k_vel × smoothed_vel)
#   4. EMA velocity smoothing (alpha = 0.35) for wrist velocity
#   5. Peak detection: argmax + minimum threshold + prominence + direction check
#   6. Analysis window: [peak−6 → peak+3] with Gaussian weighting (σ = 2.0)
#   7. Metrics: head_stability, balance_score, hip_rotation, elbow_control
#   8. Confidence weighting: every metric × landmark visibility confidence
#   9. Primary issue heuristic from metric thresholds
#  10. Cooldown metadata (1 500 ms) returned with every valid result
# ──────────────────────────────────────────────────────────────────────────────

# ── Sport configuration ────────────────────────────────────────────────────────
_SPORT_CFG: Dict[str, Dict] = {
    "cricket":   {
        "lead_wrist":  "left_wrist",
        "swing_dir":   (1.0, 0.0),           # horizontal (off-side drive)
        "lead_arm":    ("left_shoulder",  "left_elbow",  "left_wrist"),
        "elbow_range": (110, 160),
    },
    "badminton": {
        "lead_wrist":  "right_wrist",
        "swing_dir":   (0.707, 0.707),        # diagonal down-forward (smash)
        "lead_arm":    ("right_shoulder", "right_elbow", "right_wrist"),
        "elbow_range": (100, 150),
    },
    "skating":   {
        "lead_wrist":  "left_wrist",
        "swing_dir":   (1.0, 0.0),            # forward stride
        "lead_arm":    ("left_shoulder",  "left_elbow",  "left_wrist"),
        "elbow_range": (90,  150),
    },
    "yoga":      {
        "lead_wrist":  "left_wrist",
        "swing_dir":   (0.0, 1.0),            # vertical extension
        "lead_arm":    ("left_shoulder",  "left_elbow",  "left_wrist"),
        "elbow_range": (150, 180),
    },
}
_SPORT_CFG["general"] = _SPORT_CFG["cricket"]   # sensible default

# ── Landmarks used by the batch pipeline ──────────────────────────────────────
_BATCH_LM = [
    "nose",
    "left_shoulder",  "right_shoulder",
    "left_elbow",     "right_elbow",
    "left_wrist",     "right_wrist",
    "left_hip",       "right_hip",
    "left_knee",      "right_knee",
    "left_ankle",     "right_ankle",
]

# ── Signal / analysis constants ────────────────────────────────────────────────
_MIN_VEL_THRESHOLD  = 0.008   # normalized units/frame — minimum peak for valid shot
_PROMINENCE_RATIO   = 1.50    # peak must be ≥ 1.5× median velocity
_DIR_COS_THRESHOLD  = 0.60    # |cos(θ)| with expected swing direction
_WIN_PRE            = 6       # frames before peak in analysis window
_WIN_POST           = 3       # frames after peak
_GAUSSIAN_SIGMA     = 2.0     # σ for Gaussian weighting
_HEAD_STD_SCALE     = 0.15    # normalized std that maps to 0.0 head stability
_BALANCE_STD_SCALE  = 0.30    # normalized hip std that maps to 0.0 balance score
_HIP_ROT_OPTIMAL    = 0.45    # optimal shoulder–hip rotation (radians)
_HIP_ROT_WIDTH      = 0.30    # Gaussian σ for hip rotation scoring (radians)
_ELBOW_TOLERANCE    = 40      # degrees outside optimal range → 0 score
_COOLDOWN_MS        = 1500    # milliseconds to enforce after valid shot
_VIS_FLOOR          = 0.50    # visibility threshold for valid landmark
_BASE_BETA          = 0.007   # 1 Euro base speed coefficient
_K_VEL              = 0.50    # dynamic beta scaling: β += k_vel × smoothed_vel
_EMA_VEL_ALPHA      = 0.35    # EMA alpha for velocity smoothing
_SW_EMA_ALPHA       = 0.15    # EMA alpha for shoulder-width normalization


# ── Module-level helpers (pure functions) ─────────────────────────────────────

def _gw(n: int, center: float, sigma: float) -> List[float]:
    """Un-normalised Gaussian weights; normalised to sum=1."""
    raw = [math.exp(-0.5 * ((i - center) / sigma) ** 2) for i in range(n)]
    s   = sum(raw) or 1.0
    return [r / s for r in raw]


def _wmean(values: List[float], weights: List[float]) -> float:
    ws = sum(weights) or 1.0
    return sum(v * w for v, w in zip(values, weights)) / ws


def _wstd(values: List[float], weights: List[float]) -> float:
    m   = _wmean(values, weights)
    ws  = sum(weights) or 1.0
    var = sum(w * (v - m) ** 2 for v, w in zip(values, weights)) / ws
    return math.sqrt(max(var, 0.0))


def _angle2d(A: Dict, B: Dict, C: Dict) -> float:
    """2-D angle in degrees at vertex B between rays B→A and B→C."""
    bax = A["x"] - B["x"];  bay = A["y"] - B["y"]
    bcx = C["x"] - B["x"];  bcy = C["y"] - B["y"]
    dot = bax * bcx + bay * bcy
    mag_ba = math.sqrt(bax * bax + bay * bay)
    mag_bc = math.sqrt(bcx * bcx + bcy * bcy)
    if mag_ba < 1e-7 or mag_bc < 1e-7:
        return 180.0
    cos_val = max(-1.0, min(1.0, dot / (mag_ba * mag_bc)))
    return math.degrees(math.acos(cos_val))


def _batch_error(reason: str, n_frames: int, peak_vel: float = 0.0) -> Dict[str, Any]:
    return {
        "overall_score":   0.0,
        "primary_issue":   reason,
        "metrics":         {
            "head_stability": 0.0,
            "balance_score":  0.0,
            "hip_rotation":   0.0,
            "elbow_control":  0.0,
        },
        "confidence_score": 0.0,
        "peak_frame":       None,
        "analysis_window":  None,
        "peak_velocity":    round(peak_vel, 4),
        "cooldown_ms":      0,
        "n_frames":         n_frames,
    }


# ── Main entry point ───────────────────────────────────────────────────────────

def analyze_batch(
    pose_results: List[Dict[str, Any]],
    sport: str = "general",
    fps: float = 3.0,
) -> Dict[str, Any]:
    """
    Signal-Centered Analysis Core — batch mode.

    Parameters
    ----------
    pose_results : list[dict]
        Output frames from pose_detection.py main().  Each element has at least
        ``detected`` (bool) and ``landmarks`` (dict[str, {x,y,z,visibility}]).
    sport : str
        One of "cricket", "badminton", "skating", "yoga", "general".
    fps : float
        Estimated capture frame-rate used to synthesise filter timestamps.

    Returns
    -------
    dict
        overall_score, primary_issue, metrics, confidence_score,
        peak_frame (1-indexed), analysis_window, peak_velocity, cooldown_ms.
    """
    sport_key  = sport.strip().lower()
    cfg        = _SPORT_CFG.get(sport_key, _SPORT_CFG["general"])

    # ── 1. Extract valid (detected) frames ─────────────────────────────────────
    valid = [
        (orig_i, r)
        for orig_i, r in enumerate(pose_results)
        if r.get("detected") and r.get("landmarks")
    ]
    N = len(valid)
    if N < 3:
        return _batch_error("insufficient_frames", N)

    # ── 2. Build raw per-landmark sequences ────────────────────────────────────
    seqs: Dict[str, Dict[str, List[float]]] = {
        name: {"x": [], "y": [], "vis": []} for name in _BATCH_LM
    }
    for _, frame in valid:
        lms = frame["landmarks"]
        for name in _BATCH_LM:
            raw = lms.get(name) or {}
            seqs[name]["x"].append(float(raw.get("x", 0.5)))
            seqs[name]["y"].append(float(raw.get("y", 0.5)))
            seqs[name]["vis"].append(float(raw.get("visibility", 0.0)))

    # ── 3. Hip midpoint (global translation reference) + shoulder width ─────────
    hip_mx = [(seqs["left_hip"]["x"][i]  + seqs["right_hip"]["x"][i])  / 2 for i in range(N)]
    hip_my = [(seqs["left_hip"]["y"][i]  + seqs["right_hip"]["y"][i])  / 2 for i in range(N)]

    raw_sw = []
    for i in range(N):
        dx = seqs["left_shoulder"]["x"][i] - seqs["right_shoulder"]["x"][i]
        dy = seqs["left_shoulder"]["y"][i] - seqs["right_shoulder"]["y"][i]
        raw_sw.append(max(math.sqrt(dx * dx + dy * dy), 0.01))

    # EMA-smooth shoulder width (stable scale reference)
    sw_ema = [raw_sw[0]] * N
    for i in range(1, N):
        sw_ema[i] = _SW_EMA_ALPHA * raw_sw[i] + (1 - _SW_EMA_ALPHA) * sw_ema[i - 1]

    # ── 4. Hip-centric transform + shoulder-width normalisation ─────────────────
    # local_norm[name]['x'][i] = (raw_x - hip_mid_x) / sw_ema
    local_norm: Dict[str, Dict[str, List[float]]] = {}
    for name in _BATCH_LM:
        lx, ly = [], []
        for i in range(N):
            sw = max(sw_ema[i], 0.001)
            lx.append((seqs[name]["x"][i] - hip_mx[i]) / sw)
            ly.append((seqs[name]["y"][i] - hip_my[i]) / sw)
        local_norm[name] = {"x": lx, "y": ly}

    # ── 5. Adaptive 1 Euro filter + EMA velocity smoothing ─────────────────────
    # Dynamic beta is updated BEFORE each frame using PREVIOUS frame's EMA velocity.
    # This makes the filter more responsive during fast motion and smoother at rest.
    fbank: Dict[str, Dict[str, _OneEuroFilter]] = {
        name: {"x": _OneEuroFilter(1.0, _BASE_BETA), "y": _OneEuroFilter(1.0, _BASE_BETA)}
        for name in _BATCH_LM
    }
    fout: Dict[str, Dict[str, float]] = {
        name: {"x": local_norm[name]["x"][0], "y": local_norm[name]["y"][0]}
        for name in _BATCH_LM
    }
    filtered: Dict[str, Dict[str, List[float]]] = {
        name: {"x": [], "y": []} for name in _BATCH_LM
    }

    smoothed_vel_ema = 0.0   # maintains causally across frames
    prev_wrist_x     = local_norm[cfg["lead_wrist"]]["x"][0]
    prev_wrist_y     = local_norm[cfg["lead_wrist"]]["y"][0]

    wrist_vel_raw:  List[float] = []
    wrist_vel_ema:  List[float] = []
    wrist_dir_x:    List[float] = []
    wrist_dir_y:    List[float] = []

    for i in range(N):
        t = float(i) / max(fps, 0.5)

        # Update all filter betas with PREVIOUS frame's smoothed velocity (causal)
        dyn_beta = _BASE_BETA + _K_VEL * smoothed_vel_ema
        for name in _BATCH_LM:
            fbank[name]["x"].beta = dyn_beta
            fbank[name]["y"].beta = dyn_beta

        # Apply filter per landmark; hold last output when visibility is low
        for name in _BATCH_LM:
            vis = seqs[name]["vis"][i]
            if vis >= _VIS_FLOOR:
                fx = fbank[name]["x"](local_norm[name]["x"][i], t)
                fy = fbank[name]["y"](local_norm[name]["y"][i], t)
                fout[name] = {"x": fx, "y": fy}
            # else: fout[name] holds last valid output (missing-landmark hold)
            filtered[name]["x"].append(fout[name]["x"])
            filtered[name]["y"].append(fout[name]["y"])

        # Wrist velocity from filtered hip-centric positions
        cur_wx = filtered[cfg["lead_wrist"]]["x"][i]
        cur_wy = filtered[cfg["lead_wrist"]]["y"][i]
        dvx    = cur_wx - prev_wrist_x
        dvy    = cur_wy - prev_wrist_y
        raw_v  = math.sqrt(dvx * dvx + dvy * dvy)

        wrist_vel_raw.append(raw_v)
        wrist_dir_x.append(dvx)
        wrist_dir_y.append(dvy)

        # EMA smooth velocity  (alpha = 0.35)
        smoothed_vel_ema = _EMA_VEL_ALPHA * raw_v + (1 - _EMA_VEL_ALPHA) * smoothed_vel_ema
        wrist_vel_ema.append(smoothed_vel_ema)

        prev_wrist_x = cur_wx
        prev_wrist_y = cur_wy

    # ── 6. Peak detection ──────────────────────────────────────────────────────
    peak_vel  = max(wrist_vel_ema)
    peak_idx  = wrist_vel_ema.index(peak_vel)

    # 6a. Minimum velocity threshold  → "no_valid_shot"
    if peak_vel < _MIN_VEL_THRESHOLD:
        return _batch_error("no_valid_shot", N, peak_vel)

    # 6b. Prominence check: peak ≥ prominence_ratio × median velocity
    sorted_vels = sorted(wrist_vel_ema)
    median_vel  = sorted_vels[N // 2]
    if peak_vel < _PROMINENCE_RATIO * max(median_vel, 1e-8):
        return _batch_error("no_prominent_peak", N, peak_vel)

    # 6c. Direction filtering: cosine similarity of peak displacement with expected swing
    expected_ex, expected_ey = cfg["swing_dir"]
    pvx = wrist_dir_x[peak_idx]
    pvy = wrist_dir_y[peak_idx]
    speed_at_peak = math.sqrt(pvx * pvx + pvy * pvy)
    if speed_at_peak > 1e-7:
        cos_sim = abs(pvx * expected_ex + pvy * expected_ey) / speed_at_peak
        if cos_sim < _DIR_COS_THRESHOLD:
            return _batch_error("wrong_direction", N, peak_vel)

    # ── 7. Analysis window [peak−6 → peak+3] ──────────────────────────────────
    win_start   = max(0, peak_idx - _WIN_PRE)
    win_end     = min(N - 1, peak_idx + _WIN_POST)
    window      = list(range(win_start, win_end + 1))
    peak_offset = peak_idx - win_start
    win_size    = len(window)

    # ── 8. Gaussian weights centred at peak_offset ─────────────────────────────
    weights = _gw(win_size, float(peak_offset), _GAUSSIAN_SIGMA)

    # ── 9a. Head Stability Score ───────────────────────────────────────────────
    # nose_local is already hip-centric and normalised by shoulder_width.
    # Stability = 1 − normalised_weighted_std_dev over analysis window.
    # Weighted by visibility confidence.
    nose_x_w  = [filtered["nose"]["x"][i] for i in window]
    nose_y_w  = [filtered["nose"]["y"][i] for i in window]
    nose_vis_w = [seqs["nose"]["vis"][i]   for i in window]

    std_nx  = _wstd(nose_x_w, weights)
    std_ny  = _wstd(nose_y_w, weights)
    norm_std_n = math.sqrt(std_nx ** 2 + std_ny ** 2)

    raw_head = max(0.0, 1.0 - norm_std_n / _HEAD_STD_SCALE)
    nose_conf = _wmean(nose_vis_w, weights)
    head_stability = max(0.0, min(1.0, raw_head * nose_conf))

    # ── 9b. Balance Score ─────────────────────────────────────────────────────
    # Hip midpoint stability in ORIGINAL frame coordinates removes the
    # hip-centric transform — we want to see actual lateral body sway.
    hip_x_w    = [hip_mx[i] for i in window]
    hip_vis_w  = [
        (seqs["left_hip"]["vis"][i] + seqs["right_hip"]["vis"][i]) / 2
        for i in window
    ]
    avg_sw  = sum(sw_ema[i] for i in window) / max(win_size, 1)
    std_hx  = _wstd(hip_x_w, weights)
    norm_hx = std_hx / max(avg_sw, 0.001)

    raw_balance = max(0.0, 1.0 - norm_hx / _BALANCE_STD_SCALE)
    hip_conf    = _wmean(hip_vis_w, weights)
    balance_score = max(0.0, min(1.0, raw_balance * hip_conf))

    # ── 9c. Hip Rotation ──────────────────────────────────────────────────────
    # Angle delta between shoulder line and hip line over analysis window,
    # Gaussian-weighted.  Scored using a Gaussian centred at the optimal angle.
    rot_vals: List[float] = []
    rot_vis_vals: List[float] = []
    for idx, i in enumerate(window):
        ls_x = seqs["left_shoulder"]["x"][i];  ls_y = seqs["left_shoulder"]["y"][i]
        rs_x = seqs["right_shoulder"]["x"][i];  rs_y = seqs["right_shoulder"]["y"][i]
        lh_x = seqs["left_hip"]["x"][i];        lh_y = seqs["left_hip"]["y"][i]
        rh_x = seqs["right_hip"]["x"][i];       rh_y = seqs["right_hip"]["y"][i]

        sh_angle = math.atan2(ls_y - rs_y, ls_x - rs_x)
        hp_angle = math.atan2(lh_y - rh_y, lh_x - rh_x)
        delta    = abs(sh_angle - hp_angle)
        delta    = min(delta, math.pi - delta)   # fold to [0, π/2]
        rot_vals.append(delta)

        vis_prod = (
            seqs["left_shoulder"]["vis"][i] *
            seqs["right_shoulder"]["vis"][i] *
            seqs["left_hip"]["vis"][i] *
            seqs["right_hip"]["vis"][i]
        ) ** 0.25
        rot_vis_vals.append(vis_prod)

    combined_w = [weights[k] * rot_vis_vals[k] for k in range(win_size)]
    cw_sum     = sum(combined_w)
    if cw_sum > 1e-7:
        avg_rot = sum(r * w for r, w in zip(rot_vals, combined_w)) / cw_sum
    else:
        avg_rot = 0.0

    if sport_key == "yoga":
        # Yoga rewards stability → low rotation → score from 1 (no rot) down to 0
        raw_hip_rot = max(0.0, 1.0 - avg_rot / (math.pi / 2))
    else:
        # Dynamic sports: Gaussian scoring peaked at _HIP_ROT_OPTIMAL
        raw_hip_rot = math.exp(-0.5 * ((avg_rot - _HIP_ROT_OPTIMAL) / _HIP_ROT_WIDTH) ** 2)

    hip_rot_conf = cw_sum / max(sum(weights), 1e-7)
    hip_rotation = max(0.0, min(1.0, raw_hip_rot * hip_rot_conf))

    # ── 9d. Lead Elbow Control at peak frame ──────────────────────────────────
    s_name, e_name, w_name = cfg["lead_arm"]
    elbow_angle_deg: Optional[float] = None
    elbow_control   = 0.5   # neutral default when landmarks unavailable

    if peak_idx < N:
        A = {"x": filtered[s_name]["x"][peak_idx], "y": filtered[s_name]["y"][peak_idx]}
        B = {"x": filtered[e_name]["x"][peak_idx], "y": filtered[e_name]["y"][peak_idx]}
        C = {"x": filtered[w_name]["x"][peak_idx], "y": filtered[w_name]["y"][peak_idx]}
        angle_deg      = _angle2d(A, B, C)
        elbow_angle_deg = round(angle_deg, 1)

        opt_min, opt_max = cfg["elbow_range"]
        if opt_min <= angle_deg <= opt_max:
            raw_elbow = 1.0
        elif angle_deg < opt_min:
            raw_elbow = max(0.0, (angle_deg - (opt_min - _ELBOW_TOLERANCE)) / _ELBOW_TOLERANCE)
        else:
            raw_elbow = max(0.0, ((opt_max + _ELBOW_TOLERANCE) - angle_deg) / _ELBOW_TOLERANCE)

        arm_conf = (
            seqs[s_name]["vis"][peak_idx] *
            seqs[e_name]["vis"][peak_idx] *
            seqs[w_name]["vis"][peak_idx]
        ) ** (1.0 / 3.0)

        elbow_control = max(0.0, min(1.0, raw_elbow * arm_conf))

    # ── 10. Confidence-weighted overall score ─────────────────────────────────
    overall_score = (
        0.40 * head_stability +
        0.25 * balance_score  +
        0.20 * hip_rotation   +
        0.15 * elbow_control
    )

    # Global confidence: mean visibility of five core landmarks over analysis window
    core_lm    = ["nose", "left_shoulder", "right_shoulder", "left_hip", "right_hip"]
    conf_vals  = [
        seqs[name]["vis"][i]
        for name in core_lm
        for i in window
    ]
    confidence_score = sum(conf_vals) / max(len(conf_vals), 1)

    # ── 11. Primary issue heuristic ───────────────────────────────────────────
    if head_stability < 0.75:
        primary_issue = "head_instability"
    elif balance_score < 0.70:
        primary_issue = "poor_balance"
    elif hip_rotation < 0.60:
        primary_issue = "limited_hip_rotation"
    elif elbow_control < 0.65:
        primary_issue = "elbow_breakdown"
    else:
        primary_issue = "none"

    return {
        "overall_score":   round(overall_score,    3),
        "primary_issue":   primary_issue,
        "metrics": {
            "head_stability": round(head_stability, 3),
            "balance_score":  round(balance_score,  3),
            "hip_rotation":   round(hip_rotation,   3),
            "elbow_control":  round(elbow_control,  3),
        },
        "confidence_score": round(confidence_score, 3),
        "peak_frame":       peak_idx + 1,       # 1-indexed for UI/AI
        "analysis_window":  [win_start + 1, win_end + 1],
        "peak_velocity":    round(peak_vel, 4),
        "elbow_angle_deg":  elbow_angle_deg,
        "cooldown_ms":      _COOLDOWN_MS,
        "n_frames":         N,
    }
