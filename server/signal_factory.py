"""
signal_factory.py
=================
Hierarchical factory + singleton cache for sport-specific logic processors.

Registry keys use  category:action  notation (e.g. "cricket:batting").
Short names (e.g. "cricket") are resolved via DEFAULT_ACTIONS before lookup.

Adding a new sport sub-mode takes one line in _REGISTRY.
Adding a new sport's default takes one line in DEFAULT_ACTIONS.

Singleton cache is keyed on the FULL resolved  category:action  string so
that "cricket:batting" and "cricket:bowling" never share state.
"""

from __future__ import annotations

from typing import Dict, Type

from server.base_logic import BaseSportLogic
from server.sports.general_logic import GeneralLogic
from server.sports.cricket_logic import CricketLogic
from server.sports.yoga_logic import YogaLogic
from server.sports.badminton_logic import BadmintonLogic
from server.sports.skating_logic import SkatingLogic

DEFAULT_ACTIONS: Dict[str, str] = {
    "general":   "general:default",
    "cricket":   "cricket:batting",
    "yoga":      "yoga:pose",
    "badminton": "badminton:smash",
    "skating":   "skating:stride",
}

_REGISTRY: Dict[str, Type[BaseSportLogic]] = {
    "general:default":   GeneralLogic,
    "cricket:batting":   CricketLogic,
    "yoga:pose":         YogaLogic,
    "badminton:smash":   BadmintonLogic,
    "skating:stride":    SkatingLogic,
}

_INSTANCES: Dict[str, BaseSportLogic] = {}


def _resolve_key(sport_name: str) -> str:
    """
    Normalise *sport_name* to a full  category:action  key.

    - Already contains ":"  → use as-is (lowercased + stripped)
    - Short name            → look up DEFAULT_ACTIONS
    - Unrecognised short    → "general:default" (never raises)
    """
    key = sport_name.strip().lower()
    if ":" in key:
        return key
    return DEFAULT_ACTIONS.get(key, "general:default")


def get_sport_processor(sport_name: str) -> BaseSportLogic:
    """
    Return a cached singleton processor for *sport_name*.

    Resolution order
    ----------------
    1. Normalise to full  category:action  key via _resolve_key()
    2. Look up in _REGISTRY
    3. If not found → fall back to GeneralLogic (no exception raised)
    4. Instantiate once and cache under the resolved key

    The instance is NEVER re-created per frame.
    """
    full_key = _resolve_key(sport_name)

    if full_key not in _INSTANCES:
        cls = _REGISTRY.get(full_key, GeneralLogic)
        _INSTANCES[full_key] = cls()

    return _INSTANCES[full_key]


def registered_sports() -> list[str]:
    """Return all registered  category:action  keys, sorted."""
    return sorted(_REGISTRY)


def registered_categories() -> list[str]:
    """Return unique top-level category names (left side of ':'), sorted."""
    return sorted({k.split(":")[0] for k in _REGISTRY})
