"""
base_logic.py
=============
Abstract base class and shared type contracts for all sport-specific logic.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Literal

try:
    from typing import TypedDict
except ImportError:
    from typing_extensions import TypedDict

SessionState = Literal["idle", "recording", "completed"]

_VALID_TRANSITIONS: Dict[str, set] = {
    "idle":      {"recording"},
    "recording": {"completed", "idle"},
    "completed": {"idle"},
}


class EventInfo(TypedDict):
    start_time: float
    end_time: float
    duration: float


class StandardOutput(TypedDict):
    metrics:    Dict[str, Any]
    confidence: float
    phase:      str
    issues:     List[str]
    event:      EventInfo


def empty_standard_output() -> StandardOutput:
    """Return a valid zero-value StandardOutput. Use as the stub default."""
    return StandardOutput(
        metrics={},
        confidence=0.0,
        phase="idle",
        issues=[],
        event=EventInfo(start_time=0.0, end_time=0.0, duration=0.0),
    )


class BaseSportLogic(ABC):
    """
    Abstract base for every sport-specific processor.

    Concrete classes must implement:
        process_frame(packet)   – called once per valid FramePacket
        get_metrics()           – returns StandardOutput
        reset()                 – clears session state

    State machine
    -------------
    Allowed transitions:
        idle  ──►  recording  ──►  completed
                      ▲                │
                      └────────────────┘  (completed → idle to restart)
    """

    def __init__(self) -> None:
        self.state: SessionState = "idle"

    def transition_to(self, new_state: SessionState) -> None:
        """
        Move to *new_state* if the transition is legal.

        Raises
        ------
        ValueError
            If the transition is not permitted from the current state.
        """
        allowed = _VALID_TRANSITIONS.get(self.state, set())
        if new_state not in allowed:
            raise ValueError(
                f"Illegal state transition: {self.state!r} → {new_state!r}. "
                f"Allowed from {self.state!r}: {sorted(allowed) or 'none'}"
            )
        self.state = new_state

    @abstractmethod
    def process_frame(self, packet: Any) -> None:
        """Process one FramePacket. Called only when landmarks are valid."""

    @abstractmethod
    def get_metrics(self) -> StandardOutput:
        """Return the current StandardOutput for this sport."""

    @abstractmethod
    def reset(self) -> None:
        """Reset all internal session state and return to 'idle'."""
