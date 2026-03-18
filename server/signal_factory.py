"""
signal_factory.py
=================
Factory + singleton cache for sport-specific logic processors.

Adding a new sport takes exactly one line — add it to _REGISTRY below.
"""

from __future__ import annotations

from typing import Dict, Type

from server.base_logic import BaseSportLogic
from server.sports.general_logic import GeneralLogic
from server.sports.cricket_logic import CricketLogic
from server.sports.yoga_logic import YogaLogic
from server.sports.badminton_logic import BadmintonLogic
from server.sports.skating_logic import SkatingLogic

_REGISTRY: Dict[str, Type[BaseSportLogic]] = {
    "general":   GeneralLogic,
    "cricket":   CricketLogic,
    "yoga":      YogaLogic,
    "badminton": BadmintonLogic,
    "skating":   SkatingLogic,
}

_INSTANCES: Dict[str, BaseSportLogic] = {}


def get_sport_processor(sport_name: str) -> BaseSportLogic:
    """
    Return a cached instance of the processor for *sport_name*.

    The instance is created once on first request and reused on every
    subsequent call — processors are never re-created per frame.

    Parameters
    ----------
    sport_name : str
        Case-insensitive sport identifier (e.g. "cricket", "yoga").

    Returns
    -------
    BaseSportLogic
        Singleton processor instance for the requested sport.

    Raises
    ------
    ValueError
        If *sport_name* is not registered.
    """
    key = sport_name.strip().lower()

    if key not in _REGISTRY:
        available = ", ".join(sorted(_REGISTRY))
        raise ValueError(
            f"Unknown sport: {sport_name!r}. "
            f"Available sports: {available}"
        )

    if key not in _INSTANCES:
        _INSTANCES[key] = _REGISTRY[key]()

    return _INSTANCES[key]


def registered_sports() -> list[str]:
    """Return a sorted list of all registered sport names."""
    return sorted(_REGISTRY)
