"""
PR 140 — Black-Scholes Greeks computer.

Used by the F&O strategy generator and the /fo-strategies UI to render
Delta / Theta / Vega / Gamma per strike per leg, plus a per-strategy
aggregate. Vol input expected as annualized decimal (e.g. 0.18 for
18%); time-to-expiry in calendar days.

Single-file by design — Greeks math is pure and doesn't justify a
sub-package.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional

OptionType = Literal["call", "put"]


def _norm_cdf(x: float) -> float:
    return 0.5 * (1 + math.erf(x / math.sqrt(2)))


def _norm_pdf(x: float) -> float:
    return math.exp(-x * x / 2.0) / math.sqrt(2 * math.pi)


def _safe_log(x: float) -> float:
    if x <= 0:
        return float("-inf")
    return math.log(x)


def _d1_d2(spot: float, strike: float, rate: float, vol: float, t_years: float) -> tuple[float, float]:
    if vol <= 0 or t_years <= 0 or strike <= 0 or spot <= 0:
        return float("nan"), float("nan")
    sqrt_t = math.sqrt(t_years)
    d1 = (_safe_log(spot / strike) + (rate + 0.5 * vol * vol) * t_years) / (vol * sqrt_t)
    d2 = d1 - vol * sqrt_t
    return d1, d2


@dataclass
class GreeksResult:
    price: float
    delta: float
    gamma: float
    theta: float       # per-day
    vega: float        # per-1pp move in vol
    rho: float

    def to_dict(self) -> Dict[str, float]:
        return {
            "price": self.price,
            "delta": self.delta,
            "gamma": self.gamma,
            "theta": self.theta,
            "vega": self.vega,
            "rho": self.rho,
        }


def bs_greeks(
    *,
    spot: float,
    strike: float,
    rate: float,
    vol: float,
    days_to_expiry: float,
    option_type: OptionType,
) -> GreeksResult:
    """Black-Scholes price + Greeks for a single European option.

    rate / vol annualized; days_to_expiry in calendar days.
    """
    t = max(days_to_expiry, 0) / 365.0
    d1, d2 = _d1_d2(spot, strike, rate, vol, t)
    if math.isnan(d1) or math.isnan(d2):
        return GreeksResult(0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    if option_type == "call":
        price = spot * _norm_cdf(d1) - strike * math.exp(-rate * t) * _norm_cdf(d2)
        delta = _norm_cdf(d1)
        rho = strike * t * math.exp(-rate * t) * _norm_cdf(d2) / 100.0
        theta_year = (
            -(spot * _norm_pdf(d1) * vol) / (2.0 * math.sqrt(t))
            - rate * strike * math.exp(-rate * t) * _norm_cdf(d2)
        )
    else:
        price = strike * math.exp(-rate * t) * _norm_cdf(-d2) - spot * _norm_cdf(-d1)
        delta = _norm_cdf(d1) - 1
        rho = -strike * t * math.exp(-rate * t) * _norm_cdf(-d2) / 100.0
        theta_year = (
            -(spot * _norm_pdf(d1) * vol) / (2.0 * math.sqrt(t))
            + rate * strike * math.exp(-rate * t) * _norm_cdf(-d2)
        )
    gamma = _norm_pdf(d1) / (spot * vol * math.sqrt(t)) if (spot * vol * math.sqrt(t)) else 0.0
    vega = spot * _norm_pdf(d1) * math.sqrt(t) / 100.0
    theta_day = theta_year / 365.0
    return GreeksResult(
        price=float(price), delta=float(delta), gamma=float(gamma),
        theta=float(theta_day), vega=float(vega), rho=float(rho),
    )


@dataclass
class StrategyLeg:
    option_type: OptionType
    strike: float
    quantity: int            # positive = long, negative = short

    def signed_qty(self) -> int:
        return self.quantity


def aggregate_greeks(
    legs: List[StrategyLeg],
    *,
    spot: float,
    rate: float,
    vol: float,
    days_to_expiry: float,
) -> Dict[str, float]:
    """Sum Greeks across legs with sign convention (short = negative)."""
    totals = {"price": 0.0, "delta": 0.0, "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0}
    for leg in legs:
        g = bs_greeks(
            spot=spot, strike=leg.strike, rate=rate, vol=vol,
            days_to_expiry=days_to_expiry, option_type=leg.option_type,
        )
        sign = 1 if leg.quantity >= 0 else -1
        qty = abs(leg.quantity)
        for k, v in g.to_dict().items():
            totals[k] += sign * qty * v
    return totals


__all__ = [
    "GreeksResult",
    "OptionType",
    "StrategyLeg",
    "aggregate_greeks",
    "bs_greeks",
]
