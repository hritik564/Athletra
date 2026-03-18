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

import numpy as np
from scipy.interpolate import CubicSpline

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
    ) -> Dict[str, Any]:
        """
        Process one frame of MediaPipe landmarks.

        Parameters
        ----------
        landmarks : list[dict] | None
            33-element list of ``{x, y, z, visibility}`` dicts, or None.
        timestamp : float | None
            Seconds since epoch (or any monotonic float). Uses time.time()
            if not provided.

        Returns
        -------
        dict with keys:
            smoothed_landmarks, shoulder_width, target_velocity, joint_angle,
            gate_open, captured_segment (dict | None), confidence, frame_count,
            missing_frames
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

        return {
            "smoothed_landmarks": [
                {"x": lm["x"], "y": lm["y"], "z": lm["z"], "visibility": lm.get("visibility", 1.0)}
                for lm in smoothed
            ],
            "shoulder_width": shoulder_width,
            "target_velocity": round(velocity, 6),
            "joint_angle": joint_angle,
            "gate_open": self._gate_open,
            "captured_segment": captured_segment,
            "confidence": self._confidence(),
            "frame_count": self._frame_count,
            "missing_frames": self._missing_frames,
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
