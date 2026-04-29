"""
Tests for Quant X Position Manager
Covers: open/close positions, P&L calculation, gap validation, performance summary.
"""

import pytest
import pandas as pd
from ml.position_manager import PositionManager, ClosedTrade
from ml.strategies.base import TradeSignal, Direction, Position


def _make_signal(
    symbol="RELIANCE",
    strategy="ConsolidationBreakout",
    entry_price=100.0,
    stop_loss=90.0,
    target=120.0,
    direction=Direction.BUY,
):
    return TradeSignal(
        strategy=strategy,
        symbol=symbol,
        direction=direction,
        entry_price=entry_price,
        stop_loss=stop_loss,
        target=target,
    )


class TestOpenPosition:
    """Test position opening logic."""

    def test_basic_open(self):
        pm = PositionManager()
        signal = _make_signal()
        pos = pm.open_position(signal, quantity=100, entry_date=pd.Timestamp("2025-01-01"))
        assert pos is not None
        assert pos.symbol == "RELIANCE"
        assert pos.entry_price == 100.0
        assert pm.position_count == 1

    def test_duplicate_symbol_rejected(self):
        pm = PositionManager()
        signal = _make_signal()
        pm.open_position(signal, quantity=100, entry_date=pd.Timestamp("2025-01-01"))
        result = pm.open_position(signal, quantity=50, entry_date=pd.Timestamp("2025-01-02"))
        assert result is None
        assert pm.position_count == 1

    def test_gap_down_extreme_rejected(self):
        """Gap down > 3% from signal price should be skipped."""
        pm = PositionManager()
        signal = _make_signal(entry_price=100.0, stop_loss=90.0, target=120.0)
        # Actual fill at 96 = 4% below signal price
        result = pm.open_position(signal, quantity=100, entry_date=pd.Timestamp("2025-01-01"), actual_entry_price=96.0)
        assert result is None

    def test_gap_up_returns_radar(self):
        """Gap up > 2% should return RADAR sentinel."""
        pm = PositionManager()
        signal = _make_signal(entry_price=100.0, stop_loss=90.0, target=120.0)
        result = pm.open_position(signal, quantity=100, entry_date=pd.Timestamp("2025-01-01"), actual_entry_price=103.0)
        assert result == "RADAR"

    def test_entry_below_stop_rejected(self):
        pm = PositionManager()
        signal = _make_signal(entry_price=100.0, stop_loss=90.0, target=120.0)
        result = pm.open_position(signal, quantity=100, entry_date=pd.Timestamp("2025-01-01"), actual_entry_price=89.0)
        assert result is None

    def test_poor_rr_at_actual_entry_rejected(self):
        """If R:R < 1.5 at actual entry, skip."""
        pm = PositionManager()
        signal = _make_signal(entry_price=100.0, stop_loss=90.0, target=110.0)
        # Actual entry at 101.5: risk=11.5, reward=8.5, R:R=0.74
        result = pm.open_position(signal, quantity=100, entry_date=pd.Timestamp("2025-01-01"), actual_entry_price=101.5)
        assert result is None

    def test_actual_entry_price_used(self):
        pm = PositionManager()
        signal = _make_signal(entry_price=100.0, stop_loss=90.0, target=120.0)
        pos = pm.open_position(signal, quantity=100, entry_date=pd.Timestamp("2025-01-01"), actual_entry_price=101.0)
        assert pos is not None
        assert pos.entry_price == 101.0


class TestClosePosition:
    """Test position closing and P&L calculation."""

    def test_close_long_profit(self):
        pm = PositionManager()
        signal = _make_signal(entry_price=100.0, stop_loss=90.0, target=120.0)
        pm.open_position(signal, quantity=100, entry_date=pd.Timestamp("2025-01-01"))

        trade = pm.close_position("RELIANCE", exit_price=115.0, exit_reason="target_hit")
        assert trade is not None
        assert trade.pnl_pct == 15.0
        assert trade.pnl_amount == 1500.0
        assert pm.position_count == 0

    def test_close_long_loss(self):
        pm = PositionManager()
        signal = _make_signal(entry_price=100.0, stop_loss=90.0, target=120.0)
        pm.open_position(signal, quantity=100, entry_date=pd.Timestamp("2025-01-01"))

        trade = pm.close_position("RELIANCE", exit_price=90.0, exit_reason="stop_loss")
        assert trade is not None
        assert trade.pnl_pct == -10.0
        assert trade.pnl_amount == -1000.0

    def test_close_breakeven(self):
        """Trade closed at entry price should have 0% P&L."""
        pm = PositionManager()
        signal = _make_signal(entry_price=100.0, stop_loss=90.0, target=120.0)
        pm.open_position(signal, quantity=100, entry_date=pd.Timestamp("2025-01-01"))

        trade = pm.close_position("RELIANCE", exit_price=100.0, exit_reason="time_exit")
        assert trade is not None
        assert trade.pnl_pct == 0.0
        assert trade.pnl_amount == 0.0

    def test_close_nonexistent_returns_none(self):
        pm = PositionManager()
        result = pm.close_position("NONEXIST", exit_price=100.0, exit_reason="stop_loss")
        assert result is None


class TestPerformanceSummary:
    """Test get_performance_summary calculations."""

    def test_empty_trades(self):
        pm = PositionManager()
        summary = pm.get_performance_summary()
        assert summary['total_trades'] == 0
        assert summary['win_rate'] == 0
        assert summary['profit_factor'] == 0

    def test_all_winners_profit_factor_capped(self):
        """profit_factor should not be infinity when no losses."""
        pm = PositionManager()
        pm.closed_trades = [
            ClosedTrade(
                symbol="A", strategy="s", direction="BUY",
                entry_price=100, exit_price=110, entry_date="2025-01-01",
                exit_date="2025-01-05", hold_days=5, pnl_pct=10.0,
                pnl_amount=1000, exit_reason="target", quantity=100,
            ),
        ]
        summary = pm.get_performance_summary()
        assert summary['profit_factor'] is None  # Should be None, not inf

    def test_mixed_trades_summary(self):
        pm = PositionManager()
        pm.closed_trades = [
            ClosedTrade("A", "s1", "BUY", 100, 120, "d1", "d2", 5, 20.0, 2000, "target", 100),
            ClosedTrade("B", "s1", "BUY", 100, 90, "d1", "d2", 3, -10.0, -1000, "stop", 100),
            ClosedTrade("C", "s2", "BUY", 100, 105, "d1", "d2", 2, 5.0, 500, "target", 100),
        ]
        summary = pm.get_performance_summary()
        assert summary['total_trades'] == 3
        assert summary['win_rate'] == pytest.approx(66.7, abs=0.1)
        assert summary['max_win'] == 20.0
        assert summary['max_loss'] == -10.0
        assert summary['profit_factor'] > 0
        assert 's1' in summary['by_strategy']
        assert 's2' in summary['by_strategy']

    def test_strategy_breakdown(self):
        pm = PositionManager()
        pm.closed_trades = [
            ClosedTrade("A", "strat1", "BUY", 100, 110, "d1", "d2", 5, 10.0, 1000, "target", 100),
            ClosedTrade("B", "strat1", "BUY", 100, 95, "d1", "d2", 3, -5.0, -500, "stop", 100),
        ]
        summary = pm.get_performance_summary()
        strat = summary['by_strategy']['strat1']
        assert strat['trades'] == 2
        assert strat['wins'] == 1
        assert strat['win_rate'] == 50.0


class TestCapacity:
    """Test position capacity limits."""

    def test_unlimited_capacity(self):
        pm = PositionManager(max_positions=0)
        assert pm.has_capacity

    def test_limited_capacity(self):
        pm = PositionManager(max_positions=1)
        signal = _make_signal(symbol="A")
        pm.open_position(signal, quantity=10, entry_date=pd.Timestamp("2025-01-01"))
        assert not pm.has_capacity
