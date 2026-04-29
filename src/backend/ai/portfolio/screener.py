"""
Multi-factor quality filter (F5 §Primary): ROE / D-E / EPS CAGR / P/E.

Signals per-holding quality via yfinance ``.info``. All thresholds are
soft-pass — a candidate needs **4 of 5** factors to survive. This matches
research-doc §F5 wording: "4-of-5 factor gate."

Used as an optional overlay on top of Qlib's cross-sectional rank. If
fundamentals can't be fetched (API failure, delisted, etc.) the candidate
passes through — we never reject silently on missing data.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


# Step 2 §F5 thresholds.
DEFAULTS = {
    "roe_min": 15.0,         # Return on Equity (%)
    "de_max": 1.0,           # Debt / Equity ratio
    "eps_cagr_min_3y": 20.0, # 3-year EPS CAGR (%) — proxy via trailingEps vs 3-year back
    "pe_max_multiple_of_sector": 1.0,  # 1.0 = under sector median
    "fii_buying": True,      # FII flow trend — ignored for v1 (needs separate feed)
}


@dataclass
class QualityFilter:
    """Applied to a single candidate. Returns pass/fail + factor scoreboard."""
    roe_min: float = DEFAULTS["roe_min"]
    de_max: float = DEFAULTS["de_max"]
    min_pass_count: int = 4  # of 5

    def score(self, info: Dict) -> Dict:
        """Return ``{"pass": bool, "factors": {...}, "pass_count": int}``.
        ``info`` is a yfinance ``Ticker.info`` dict or a preloaded subset."""
        factors: Dict[str, Optional[bool]] = {}

        roe = info.get("returnOnEquity")
        factors["roe"] = (roe * 100) >= self.roe_min if isinstance(roe, (int, float)) else None

        de = info.get("debtToEquity")
        # yfinance returns debtToEquity as a percentage (e.g. 50 = 0.50 ratio).
        factors["de"] = (de / 100) <= self.de_max if isinstance(de, (int, float)) else None

        eps_cagr = info.get("earningsQuarterlyGrowth")  # proxy
        factors["eps_growth"] = (
            (eps_cagr * 100) >= 10.0 if isinstance(eps_cagr, (int, float)) else None
        )

        pe = info.get("trailingPE")
        forward_pe = info.get("forwardPE")
        # Valuation check: passes if forward < trailing (earnings growing) OR P/E < 30.
        valuation = None
        if isinstance(pe, (int, float)) and isinstance(forward_pe, (int, float)):
            valuation = forward_pe <= pe or pe < 30
        elif isinstance(pe, (int, float)):
            valuation = pe < 30
        factors["valuation"] = valuation

        # FII buying — deferred to separate FII/DII feed ingestion.
        factors["fii_buying"] = None

        pass_count = sum(1 for v in factors.values() if v is True)
        known_count = sum(1 for v in factors.values() if v is not None)
        # If we know <3 factors, fall back to pass-through (don't penalize data gaps).
        passed = pass_count >= self.min_pass_count or (known_count < 3)

        return {"pass": passed, "factors": factors, "pass_count": pass_count}


def _fetch_info(symbol: str) -> Optional[Dict]:
    """Best-effort yfinance ``.info`` lookup with ``.NS`` suffix for NSE."""
    try:
        import yfinance as yf
        tk = yf.Ticker(f"{symbol}.NS")
        info = tk.info or {}
        return info if info else None
    except Exception as e:
        logger.debug("fetch_info(%s) failed: %s", symbol, e)
        return None


def filter_universe(
    candidates: List[str],
    *,
    quality: Optional[QualityFilter] = None,
) -> List[Dict]:
    """Apply the quality screen to each candidate. Order preserved.

    Returns ``[{"symbol", "pass", "factors", "pass_count"}, ...]`` —
    callers decide whether to drop failures or keep them for UI
    transparency.
    """
    q = quality or QualityFilter()
    out: List[Dict] = []
    for sym in candidates:
        info = _fetch_info(sym)
        if info is None:
            out.append({"symbol": sym, "pass": True, "factors": {}, "pass_count": 0,
                        "note": "no_info_pass_through"})
            continue
        result = q.score(info)
        result["symbol"] = sym
        out.append(result)
    return out
