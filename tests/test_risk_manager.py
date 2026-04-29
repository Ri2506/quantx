"""
Tests for Quant X Risk Manager
Covers: position sizing, loss limits, halt logic, drawdown protection, edge cases.
"""

import pytest
from ml.risk_manager import RiskManager, RiskConfig


class TestPositionSizing:
    """Test calculate_position_size with various scenarios."""

    def test_basic_sizing(self):
        rm = RiskManager(RiskConfig(account_capital=500_000, risk_per_trade_pct=3.0))
        # Risk = 500k * 3% = 15000, stop distance = 10 → 1500 shares
        # But max_position_pct=20% caps at 500k * 20% / 100 = 1000 shares
        qty = rm.calculate_position_size(entry_price=100.0, stop_loss=90.0)
        assert qty == 1000  # Capped by max_position_pct

    def test_capped_by_max_position(self):
        rm = RiskManager(RiskConfig(
            account_capital=500_000,
            risk_per_trade_pct=3.0,
            max_position_pct=20.0,
        ))
        # Cheap stock: risk says buy 15000 shares, but 20% cap = 100k / 1 = 100k shares
        # Still capped by risk-based sizing in this case
        qty = rm.calculate_position_size(entry_price=1.0, stop_loss=0.0001)
        max_by_capital = int(500_000 * 0.20 / 1.0)
        assert qty <= max_by_capital

    def test_stop_distance_zero_returns_zero(self):
        rm = RiskManager()
        qty = rm.calculate_position_size(entry_price=100.0, stop_loss=100.0)
        assert qty == 0

    def test_stop_distance_near_zero_returns_capped(self):
        """When stop is very close to entry, position size should be capped by max_position_pct."""
        rm = RiskManager(RiskConfig(
            account_capital=500_000,
            risk_per_trade_pct=3.0,
            max_position_pct=20.0,
        ))
        qty = rm.calculate_position_size(entry_price=100.0, stop_loss=99.99)
        max_shares = int(500_000 * 0.20 / 100.0)  # 1000
        assert qty <= max_shares

    def test_minimum_one_share(self):
        rm = RiskManager(RiskConfig(account_capital=100, risk_per_trade_pct=1.0))
        qty = rm.calculate_position_size(entry_price=1000.0, stop_loss=500.0)
        assert qty >= 1

    def test_halted_returns_zero(self):
        rm = RiskManager()
        rm._halt_daily = True
        qty = rm.calculate_position_size(entry_price=100.0, stop_loss=90.0)
        assert qty == 0

    def test_consecutive_loss_reduces_size(self):
        config = RiskConfig(
            account_capital=500_000,
            risk_per_trade_pct=2.0,
            max_position_pct=50.0,  # High cap so risk-based sizing is the binding constraint
            consecutive_loss_reduce_after=3,
            consecutive_loss_size_mult=0.5,
        )
        rm = RiskManager(config)

        # Risk = 500k * 2% = 10000, stop distance = 10 → 1000 shares
        normal_qty = rm.calculate_position_size(entry_price=100.0, stop_loss=90.0)
        assert normal_qty == 1000

        # Simulate 3 consecutive losses → risk drops to 1%
        rm.consecutive_losses = 3
        reduced_qty = rm.calculate_position_size(entry_price=100.0, stop_loss=90.0)

        assert reduced_qty < normal_qty
        assert reduced_qty == 500  # 50% of normal


class TestLossLimits:
    """Test daily/weekly/monthly loss limits and halt logic."""

    def test_daily_loss_halt(self):
        rm = RiskManager(RiskConfig(daily_loss_limit_pct=5.0))
        rm.record_trade_result(-3.0)
        assert not rm.is_halted

        rm.record_trade_result(-3.0)  # total -6%
        assert rm.is_halted
        assert rm._halt_daily

    def test_weekly_loss_halt(self):
        rm = RiskManager(RiskConfig(weekly_loss_limit_pct=8.0))
        rm.record_trade_result(-4.0)
        rm.record_trade_result(-5.0)  # total -9%
        assert rm._halt_weekly

    def test_monthly_loss_halt(self):
        rm = RiskManager(RiskConfig(monthly_loss_limit_pct=15.0))
        for _ in range(4):
            rm.record_trade_result(-4.0)  # total -16%
        assert rm._halt_monthly

    def test_winning_trade_resets_consecutive_losses(self):
        rm = RiskManager()
        rm.record_trade_result(-2.0)
        rm.record_trade_result(-2.0)
        assert rm.consecutive_losses == 2

        rm.record_trade_result(3.0)
        assert rm.consecutive_losses == 0

    def test_reset_daily(self):
        rm = RiskManager()
        rm.record_trade_result(-6.0)
        assert rm._halt_daily
        rm.reset_daily()
        assert not rm._halt_daily
        assert rm.daily_pnl == 0.0

    def test_reset_monthly_clears_all(self):
        rm = RiskManager()
        rm.record_trade_result(-20.0)
        rm.reset_monthly()
        assert not rm.is_halted
        assert rm.daily_pnl == 0.0
        assert rm.weekly_pnl == 0.0
        assert rm.monthly_pnl == 0.0
        assert rm.consecutive_losses == 0

    def test_resume_trading(self):
        rm = RiskManager()
        rm._halt_daily = True
        rm._halt_weekly = True
        rm.resume_trading()
        assert not rm.is_halted

    def test_halt_reason_message(self):
        rm = RiskManager(RiskConfig(daily_loss_limit_pct=5.0))
        rm.record_trade_result(-6.0)
        assert "Daily loss limit hit" in rm.halt_reason


class TestPortfolioHeat:
    """Test portfolio heat (total risk exposure) checking."""

    def test_within_heat_limit(self):
        rm = RiskManager(RiskConfig(
            account_capital=500_000,
            max_portfolio_heat_pct=25.0,
        ))
        # No open positions, new risk = 10k (2% of account)
        assert rm.check_portfolio_heat({}, new_risk_amount=10_000)

    def test_exceeds_heat_limit(self):
        rm = RiskManager(RiskConfig(
            account_capital=500_000,
            max_portfolio_heat_pct=25.0,
        ))
        # New risk = 130k (26% of account)
        assert not rm.check_portfolio_heat({}, new_risk_amount=130_000)


class TestMaxDrawdown:
    """Test max drawdown protection (newly added)."""

    def test_drawdown_triggers_halt(self):
        rm = RiskManager(RiskConfig(
            account_capital=500_000,
            max_drawdown_pct=20.0,
        ))
        # Simulate equity dropping to 380k (24% DD from 500k peak)
        rm.update_equity(500_000)
        rm.update_equity(380_000)
        assert rm.is_halted
        assert "drawdown" in rm.halt_reason.lower()

    def test_drawdown_within_limit(self):
        rm = RiskManager(RiskConfig(
            account_capital=500_000,
            max_drawdown_pct=20.0,
        ))
        rm.update_equity(500_000)
        rm.update_equity(450_000)  # 10% DD
        assert not rm._halt_drawdown

    def test_peak_equity_tracks_new_highs(self):
        rm = RiskManager(RiskConfig(
            account_capital=500_000,
            max_drawdown_pct=20.0,
        ))
        rm.update_equity(500_000)
        rm.update_equity(600_000)  # New peak
        rm.update_equity(500_000)  # 16.7% DD from 600k
        assert not rm._halt_drawdown  # Still under 20%

        rm.update_equity(470_000)  # 21.7% DD from 600k
        assert rm._halt_drawdown


class TestExecutionCost:
    """Test execution cost calculation."""

    def test_buy_side_cost(self):
        rm = RiskManager(RiskConfig(slippage_pct=0.05, brokerage_pct=0.03))
        cost = rm.calculate_execution_cost(price=100.0, quantity=100, is_sell=False)
        # slippage: 10000 * 0.0005 = 5, brokerage: 10000 * 0.0003 = 3
        assert cost == 8.0

    def test_sell_side_includes_stt(self):
        rm = RiskManager(RiskConfig(slippage_pct=0.05, brokerage_pct=0.03, stt_pct=0.1))
        cost = rm.calculate_execution_cost(price=100.0, quantity=100, is_sell=True)
        # slippage: 5, brokerage: 3, stt: 10
        assert cost == 18.0


class TestRiskSummary:
    """Test get_risk_summary output."""

    def test_summary_structure(self):
        rm = RiskManager()
        summary = rm.get_risk_summary()
        assert 'account_capital' in summary
        assert 'is_halted' in summary
        assert 'daily_pnl' in summary
        assert 'consecutive_losses' in summary

    def test_monthly_trade_limit(self):
        rm = RiskManager(RiskConfig(max_trades_per_month=5))
        rm.monthly_trades = 5
        assert rm.monthly_trade_limit_reached

        rm.monthly_trades = 4
        assert not rm.monthly_trade_limit_reached

    def test_unlimited_monthly_trades(self):
        rm = RiskManager(RiskConfig(max_trades_per_month=0))
        rm.monthly_trades = 999
        assert not rm.monthly_trade_limit_reached
