"""F10 Sector rotation engine.

Turns the nightly Qlib ``alpha_scores`` table + NSE FII/DII activity
into per-sector momentum + rotation flags + top-stocks. Writes to
``sector_scores``; served by ``/api/sector-rotation``.
"""

from .sector_engine import (
    CANONICAL_SECTORS,
    SectorSnapshot,
    compute_and_store,
    load_latest_snapshot,
    map_to_canonical,
    sector_for_symbol,
)

__all__ = [
    "CANONICAL_SECTORS",
    "SectorSnapshot",
    "compute_and_store",
    "load_latest_snapshot",
    "map_to_canonical",
    "sector_for_symbol",
]
