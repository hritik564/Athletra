from abc import ABC, abstractmethod
from typing import Any, Dict


class BaseSportLogic(ABC):

    @abstractmethod
    def process_frame(self, data: Dict[str, Any]) -> None:
        """Process a single frame of biomechanical data."""

    @abstractmethod
    def get_metrics(self) -> Dict[str, Any]:
        """Return the current computed metrics."""

    @abstractmethod
    def reset(self) -> None:
        """Reset internal state for a new session."""
