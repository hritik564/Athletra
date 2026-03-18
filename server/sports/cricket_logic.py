"""
cricket_logic.py
================
CricketBattingLogic — real-time batting analysis using the FramePacket contract.

Signal consumption
------------------
Reads exclusively from packet['derived'] — no landmark math is redone here.
  packet['derived']['target_velocity']  → normalised wrist speed (shoulder-widths/s)
  packet['derived']['angles']           → pre-calculated joint angles (degrees)
  packet['derived']['shoulder_width']   → EMA-smoothed scale reference
  packet['landmarks']                   → smoothed image-space positions [0,1]

Coordinate notes
----------------
MediaPipe image-space: y=0 is top, y=1 is bottom.
  "Wrist above shoulder" → wrist.y < shoulder.y → backlift > 0
  All vertical distances are in shoulder-width units for scale-invariance.

Phase timeline
--------------
  IDLE   ──► RECORDING  (velocity crosses swing_threshold)
  RECORDING tracks:
    Backlift phase  – ongoing max of (mid_shoulder_y − wrist_y) / sw
    Impact frame    – the single frame of peak_velocity; capture angles here
    Downswing phase – every frame AFTER peak_velocity; track nose wobble
  RECORDING ──► COMPLETED  (velocity < 30 % of peak, i.e. follow-through done)

Singleton safety
----------------
The factory caches one instance for the lifetime of the process.
Call reset() between separate batting sessions to restart the state machine.
"""

from __future__ import annotations

from typing import List

from server.base_logic import (
    BaseSportLogic, StandardOutput, EventInfo, empty_standard_output
)

_LOW_CONFIDENCE_THRESHOLD = 0.5
_SWING_THRESHOLD          = 0.30   # shoulder-widths/s  → gate opens
_COMPLETION_RATIO         = 0.30   # drop to 30 % of peak → swing is done
_MIN_RECORDING_FRAMES     = 3      # ignore spurious flicks shorter than this
_CRAMPED_ARMS_THRESHOLD   = 160.0  # degrees
_HEAD_WOBBLE_THRESHOLD    = 0.10   # shoulder-width units
_LOW_BACKLIFT_THRESHOLD   = 0.50   # shoulder-width units


class CricketBattingLogic(BaseSportLogic):
    """
    Real-time batting analysis processor.

    Metrics emitted in StandardOutput.metrics
    ------------------------------------------
    bat_speed           peak target_velocity (normalised, no unit recomputation)
    control_score       1 - nose_displacement during downswing, clamped [0,1]
    power_score         bat_speed × (elbow_extension / 180), clamped [0,1]
    elbow_extension     max(left_elbow, right_elbow) at impact frame (°)
    front_knee_angle    max(left_knee, right_knee) at impact frame (°)
    backlift_height     peak (mid_shoulder_y − wrist_y) / sw during swing
    nose_displacement   max − min nose Y during downswing phase

    Issues
    ------
    "low_confidence"      bbox_confidence below threshold (not a fallback)
    "CRAMPED_ARMS"        elbow_extension < 160° at impact
    "POOR_HEAD_STABILITY" nose_displacement > 0.10 during downswing
    "LOW_BACKLIFT"        max backlift < 0.50 shoulder-widths
    """

    def __init__(self) -> None:
        super().__init__()
        self._reset_session()

    # ── Internal helpers ────────────────────────────────────────────────────

    def _reset_session(self) -> None:
        """Zero all per-swing accumulators. Called at start of each new swing."""
        self._event_start: float = 0.0
        self._event_end:   float = 0.0

        self._peak_velocity:         float = 0.0
        self._frame_count_recording: int   = 0
        self._past_peak:             bool  = False

        # Impact frame capture (at peak velocity)
        self._impact_elbow_ext:  float = 0.0
        self._impact_knee_angle: float = 0.0

        # Backlift accumulator
        self._max_backlift: float = 0.0

        # Nose-wobble accumulator (downswing frames only)
        self._nose_downswing_y: List[float] = []

        # Low-confidence frame counter for this swing
        self._low_confidence_frames: int = 0

    # ── BaseSportLogic interface ─────────────────────────────────────────────

    def process_frame(self, packet) -> None:
        """
        Consume one FramePacket and update the internal batting model.

        Low bbox_confidence frames are processed normally — the active logic
        records the flag in issues rather than switching to a fallback.
        """
        derived    = packet["derived"]
        velocity   = derived["target_velocity"]      # already normalised
        angles     = derived["angles"]
        sw         = derived["shoulder_width"]
        landmarks  = packet["landmarks"]
        ts         = packet["timestamp"]
        bbox_conf  = packet.get("bbox_confidence", 1.0)

        # ── Low-confidence flag (not a fallback) ──────────────────────────
        if bbox_conf < _LOW_CONFIDENCE_THRESHOLD:
            self._low_confidence_frames += 1

        # ── IDLE: watch for swing onset ───────────────────────────────────
        if self.state == "idle":
            if velocity > _SWING_THRESHOLD:
                self._reset_session()
                self._event_start = ts
                self.transition_to("recording")
            return

        # ── COMPLETED: wait for explicit reset() ─────────────────────────
        if self.state == "completed":
            return

        # ── RECORDING ─────────────────────────────────────────────────────
        self._frame_count_recording += 1

        # 1. Track peak velocity → identify impact frame
        if velocity >= self._peak_velocity:
            self._peak_velocity = velocity
            self._past_peak     = False

            # Impact frame: capture elbow extension and front knee angle.
            # Use max of left/right to handle both batting stances.
            self._impact_elbow_ext = max(
                angles.get("left_elbow",  0.0),
                angles.get("right_elbow", 0.0),
            )
            self._impact_knee_angle = max(
                angles.get("left_knee",  0.0),
                angles.get("right_knee", 0.0),
            )
        else:
            # Velocity is declining → we have passed the impact frame
            self._past_peak = True

        # 2. Backlift height: peak vertical rise of wrist above mid-shoulder.
        #    Image-space: lower y = higher position.
        #    backlift = (mid_shoulder_y − best_wrist_y) / sw  [units: sw]
        if sw > 1e-6 and len(landmarks) > 16:
            mid_shoulder_y = (landmarks[11]["y"] + landmarks[12]["y"]) / 2.0
            # Whichever wrist is higher (smaller y) represents the bat end
            wrist_y        = min(landmarks[15]["y"], landmarks[16]["y"])
            backlift        = (mid_shoulder_y - wrist_y) / sw
            self._max_backlift = max(self._max_backlift, backlift)

        # 3. Nose-wobble tracking — only AFTER the impact frame (downswing).
        if self._past_peak and len(landmarks) > 0:
            self._nose_downswing_y.append(landmarks[0]["y"])

        # 4. Completion check: velocity dropped to ≤30 % of peak.
        #    Require at least _MIN_RECORDING_FRAMES to suppress spurious flicks.
        if (
            self._past_peak
            and self._peak_velocity > 0
            and velocity < _COMPLETION_RATIO * self._peak_velocity
            and self._frame_count_recording >= _MIN_RECORDING_FRAMES
        ):
            self._event_end = ts
            self.transition_to("completed")

    def get_metrics(self) -> StandardOutput:
        """
        Return the current StandardOutput.

        Safe to call in any state:
          idle      → all zeros, no issues
          recording → partial metrics based on frames seen so far
          completed → final metrics, confidence = 1.0
        """
        # ── Metric computations ───────────────────────────────────────────

        bat_speed = round(self._peak_velocity, 2)

        nose_disp = (
            round(max(self._nose_downswing_y) - min(self._nose_downswing_y), 4)
            if len(self._nose_downswing_y) >= 2
            else 0.0
        )

        # control_score: 1 − wobble, clamped to [0, 1]
        control_score = round(max(0.0, min(1.0, 1.0 - nose_disp)), 2)

        # power_score: bat_speed × normalised elbow extension, clamped [0, 1]
        elbow_ratio = self._impact_elbow_ext / 180.0 if self._impact_elbow_ext > 0 else 0.0
        power_score = round(max(0.0, min(1.0, bat_speed * elbow_ratio)), 2)

        # ── Confidence ────────────────────────────────────────────────────
        if self.state == "idle":
            confidence = 0.0
        elif self.state == "completed":
            confidence = 1.0
        else:
            # Linear ramp: 30 frames ≈ 1 second at typical capture rate
            confidence = min(0.9, self._frame_count_recording / 30.0)

        if self._low_confidence_frames > 0:
            confidence *= 0.8   # penalise for low-quality frames

        confidence = round(confidence, 2)

        # ── Issue detection ───────────────────────────────────────────────
        issues: list[str] = []

        if self._low_confidence_frames > 0:
            issues.append("low_confidence")

        # Only flag biomechanical issues when a swing has actually been seen
        if self._impact_elbow_ext > 0 and self._impact_elbow_ext < _CRAMPED_ARMS_THRESHOLD:
            issues.append("CRAMPED_ARMS")

        if nose_disp > _HEAD_WOBBLE_THRESHOLD:
            issues.append("POOR_HEAD_STABILITY")

        if 0 < self._max_backlift < _LOW_BACKLIFT_THRESHOLD:
            issues.append("LOW_BACKLIFT")

        # ── Assemble output ───────────────────────────────────────────────
        duration = round(self._event_end - self._event_start, 4)

        return StandardOutput(
            metrics={
                "bat_speed":         bat_speed,
                "control_score":     control_score,
                "power_score":       power_score,
                "elbow_extension":   round(self._impact_elbow_ext,  2),
                "front_knee_angle":  round(self._impact_knee_angle, 2),
                "backlift_height":   round(self._max_backlift,       2),
                "nose_displacement": round(nose_disp,                2),
            },
            confidence=confidence,
            phase=self.state,
            issues=issues,
            event=EventInfo(
                start_time=round(self._event_start, 4),
                end_time=round(self._event_end,     4),
                duration=duration,
            ),
        )

    def reset(self) -> None:
        """
        Fully reset for a new batting session.

        The factory singleton is preserved — only session state is cleared.
        """
        self._reset_session()
        self.state = "idle"
