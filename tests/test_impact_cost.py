"""PR 196 — Almgren-Chriss square-root impact cost tests."""
from __future__ import annotations

import numpy as np
import pytest

from ml.eval.impact_cost import (
    DEFAULT_BASE_BPS,
    ImpactCostConfig,
    apply_impact_to_returns,
    impact_cost_bps,
)


def test_returns_base_bps_when_zero_size():
    """Trade size 0 → cost = base_bps only."""
    assert impact_cost_bps(0, adv=1e9, vol_pct=0.02) == DEFAULT_BASE_BPS


def test_returns_base_bps_when_zero_adv():
    """Symbol with no ADV (illiquid) → return base_bps only (no impact
    term — caller should refuse the trade)."""
    assert impact_cost_bps(1e6, adv=0, vol_pct=0.02) == DEFAULT_BASE_BPS


def test_impact_grows_with_participation():
    """Larger trade size relative to ADV → higher cost (√ law)."""
    small = impact_cost_bps(1e5, adv=1e9, vol_pct=0.02)
    medium = impact_cost_bps(1e7, adv=1e9, vol_pct=0.02)
    large = impact_cost_bps(1e8, adv=1e9, vol_pct=0.02)
    assert small < medium < large


def test_impact_grows_with_volatility():
    """Higher vol → higher impact for the same trade size."""
    low_vol = impact_cost_bps(1e7, adv=1e9, vol_pct=0.01)
    high_vol = impact_cost_bps(1e7, adv=1e9, vol_pct=0.05)
    assert high_vol > low_vol


def test_impact_capped_at_max_bps():
    """Even an absurd participation rate doesn't exceed max_bps."""
    cost = impact_cost_bps(
        trade_size=1e12, adv=1.0, vol_pct=10.0,   # absurd
        cfg=ImpactCostConfig(max_bps=200.0),
    )
    assert cost <= 200.0


def test_zero_vol_returns_base_bps_only():
    """vol_pct = 0 → impact term zero."""
    assert impact_cost_bps(1e7, adv=1e9, vol_pct=0.0) == DEFAULT_BASE_BPS


def test_squareroot_law_holds():
    """4× participation → 2× impact (above base)."""
    base_cost = impact_cost_bps(1e6, adv=1e9, vol_pct=0.02)
    cost_4x = impact_cost_bps(4e6, adv=1e9, vol_pct=0.02)
    impact_base = base_cost - DEFAULT_BASE_BPS
    impact_4x = cost_4x - DEFAULT_BASE_BPS
    # 4× participation → √4 = 2× impact term
    assert impact_4x == pytest.approx(2.0 * impact_base, rel=0.01)


# ---------- apply_impact_to_returns ----------

def test_apply_no_position_change_no_cost_after_entry():
    """After the entry on bar 0, holding a constant position incurs
    no further cost. Bar 0 itself pays the entry cost (0 -> 0.5)."""
    pos = np.array([0.5] * 100)
    rets = np.array([0.001] * 100)
    out = apply_impact_to_returns(pos, rets, adv=1e9, vol_pct=0.02, capital=1e7)
    # Bar 0: entry trade → cost subtracted
    assert out[0] < rets[0]
    # Bars 1..99: no position change → returns unchanged
    np.testing.assert_array_equal(out[1:], rets[1:])


def test_apply_first_entry_pays_cost():
    """Going from 0 to 1.0 incurs cost on bar 0."""
    pos = np.array([1.0, 1.0, 1.0])
    rets = np.array([0.001, 0.001, 0.001])
    out = apply_impact_to_returns(
        pos, rets, adv=1e9, vol_pct=0.02, capital=1e7,
    )
    # Bar 0 has the entry trade, cost > 0 so out < raw
    assert out[0] < rets[0]
    # Bars 1, 2 have no position change — no cost
    assert out[1] == rets[1]
    assert out[2] == rets[2]


def test_apply_position_flip_pays_double():
    """+1 → -1 trade is 2× position change → bigger cost than +1 → 0."""
    pos_unit = np.array([1.0, 0.0])    # close out
    pos_flip = np.array([1.0, -1.0])   # flip from long to short
    rets = np.array([0.0, 0.0])

    out_unit = apply_impact_to_returns(
        pos_unit, rets, adv=1e9, vol_pct=0.02, capital=1e7,
    )
    out_flip = apply_impact_to_returns(
        pos_flip, rets, adv=1e9, vol_pct=0.02, capital=1e7,
    )
    # Both pay entry cost on bar 0; on bar 1 the flip pays 2x exit cost
    assert out_flip[1] < out_unit[1]


def test_apply_returns_same_shape():
    pos = np.random.uniform(-1, 1, 100)
    rets = np.random.normal(0, 0.01, 100)
    out = apply_impact_to_returns(pos, rets, adv=1e9, vol_pct=0.02, capital=1e7)
    assert out.shape == rets.shape


def test_config_defaults():
    cfg = ImpactCostConfig()
    assert cfg.base_bps == DEFAULT_BASE_BPS
    assert cfg.impact_coef == 0.7
    assert cfg.max_bps == 200.0
