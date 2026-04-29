"""
Quant X Main Bot
=================
Orchestrates the complete trading workflow:

    Every trading day:
      3:30 PM (Market Close)
        └─ Scanner runs: Fetch OHLCV for stock universe
        └─ Each strategy scans all stocks for setups
        └─ Generate entry candidates with entry/SL/target

      9:00-9:15 AM (Next Day Pre-Market)
        └─ Place orders for confirmed setups
        └─ Market orders at 9:15 AM open

      9:15 AM - 3:30 PM (Market Hours)
        └─ Position Manager monitors all open positions
        └─ Check: Stop loss hit? → EXIT at loss
        └─ Check: Target hit? → BOOK PROFIT
        └─ Check: Trailing stop triggered? → EXIT with profit
        └─ Check: Max hold days exceeded? → EXIT at close
"""

import json
import logging
import os
from datetime import date
from typing import List, Dict, Optional, Set
from dataclasses import dataclass, field

import pandas as pd

from .scanner import scan_stock, get_all_strategies
from .position_manager import PositionManager, ClosedTrade
from .risk_manager import RiskManager, RiskConfig
from .features.indicators import compute_all_indicators
from .strategies.base import TradeSignal, Direction

logger = logging.getLogger(__name__)


def _load_nse_holidays(path: str = "data/nse_holidays_2026.json") -> Set[date]:
    """Load NSE holiday dates from a JSON file.

    Returns an empty set if the file is missing or malformed so the bot
    still starts (weekends are always skipped regardless).
    """
    try:
        with open(path, "r") as f:
            data = json.load(f)
        return {date.fromisoformat(d) for d in data.get("holidays", [])}
    except (FileNotFoundError, json.JSONDecodeError, ValueError) as e:
        logger.warning(f"Could not load NSE holidays from {path}: {e}")
        return set()


@dataclass
class BotConfig:
    """Configuration for the trading bot.

    User-configurable risk parameters:
    - risk_per_trade_pct: How much of account to risk per trade (default 3%)
    - max_positions: Max simultaneous open positions (0=unlimited)
    - max_trades_per_month: Max new entries per month (default 12, 0=unlimited)
    """
    account_capital: float = 500000.0  # INR 5 lakhs
    risk_per_trade_pct: float = 3.0  # 3% risk per trade
    max_positions: int = 0  # 0 = unlimited — take every qualified signal
    max_trades_per_month: int = 12  # Max trades per month (0 = unlimited)
    max_signals_per_scan: int = 20
    min_confidence: float = 65.0  # Minimum confidence to consider (matches scanner)
    min_risk_reward: float = 1.5  # Minimum risk:reward ratio


@dataclass
class ScanReport:
    """Report from a daily scan."""
    date: str
    signals: List[TradeSignal]
    entries_taken: List[TradeSignal]
    exits_triggered: List[ClosedTrade]
    positions_open: int
    risk_summary: dict


class SwingBot:
    """
    Main trading bot that orchestrates scanning, entry, and position management.

    Usage:
        bot = SwingBot(config)
        # Daily scan at market close
        report = bot.run_daily_scan(stock_data)
        # Monitor positions during market hours
        exits = bot.monitor_positions(stock_data)
    """

    def __init__(self, config: Optional[BotConfig] = None):
        self.config = config or BotConfig()

        # Initialize components
        risk_config = RiskConfig(
            account_capital=self.config.account_capital,
            risk_per_trade_pct=self.config.risk_per_trade_pct,
            max_open_positions=self.config.max_positions,
        )
        self.risk_manager = RiskManager(risk_config)
        self._nse_holidays = _load_nse_holidays()
        self.position_manager = PositionManager(
            max_positions=self.config.max_positions,
            nse_holidays=self._nse_holidays,
        )
        self.strategies = get_all_strategies()
        self._strategies_map = {s.name: s for s in self.strategies}

    def run_daily_scan(
        self,
        stock_data: Dict[str, pd.DataFrame],
        scan_date: str = "",
    ) -> ScanReport:
        """
        Run the daily end-of-day scan.

        Called at market close (3:30 PM). Scans all stocks for setups,
        filters by risk/confidence, and determines entries for next day.

        Args:
            stock_data: Dict mapping symbol -> OHLCV DataFrame
            scan_date: Date string for logging

        Returns:
            ScanReport with signals, entries, and status
        """
        if self.risk_manager.is_halted:
            logger.warning(f"Trading halted: {self.risk_manager.halt_reason}")
            return ScanReport(
                date=scan_date,
                signals=[],
                entries_taken=[],
                exits_triggered=[],
                positions_open=self.position_manager.position_count,
                risk_summary=self.risk_manager.get_risk_summary(),
            )

        # 1. Scan all stocks for setups
        all_signals = []
        for symbol, df in stock_data.items():
            # Skip stocks we already have positions in
            if self.position_manager.get_position(symbol) is not None:
                continue

            try:
                signals = scan_stock(df, symbol, self.strategies)
                all_signals.extend(signals)
            except Exception as e:
                logger.error(f"Scan failed for {symbol}: {e}")

        # 2. Filter by minimum confidence and risk:reward
        filtered = [
            s for s in all_signals
            if s.confidence >= self.config.min_confidence
            and s.risk_reward >= self.config.min_risk_reward
        ]

        # 3. Sort by confidence (best first)
        filtered.sort(key=lambda s: (s.confidence, s.risk_reward), reverse=True)

        # 4. Select entries respecting portfolio limits
        entries_taken = []
        for signal in filtered:
            if not self.position_manager.has_capacity:
                break

            # Monthly trade limit check
            if self.risk_manager.monthly_trade_limit_reached:
                logger.info("Monthly trade limit reached, skipping remaining signals")
                break

            # Size the position (once)
            quantity = self.risk_manager.calculate_position_size(
                signal.entry_price,
                signal.stop_loss,
            )

            if quantity <= 0:
                continue

            # Check portfolio heat using the computed quantity
            risk_amount = abs(signal.entry_price - signal.stop_loss) * quantity

            if not self.risk_manager.check_portfolio_heat(
                self.position_manager.open_positions,
                new_risk_amount=risk_amount,
            ):
                continue

            # Open position
            entry_date = pd.Timestamp(scan_date) if scan_date else pd.Timestamp.now()
            result = self.position_manager.open_position(signal, quantity, entry_date)
            if result == "RADAR":
                logger.info(f"RADAR: {signal.symbol} gap-up detected, watching for pullback")
                continue
            if result is not None:
                entries_taken.append(signal)
                self.risk_manager.monthly_trades += 1

        logger.info(
            f"Scan complete: {len(all_signals)} signals found, "
            f"{len(filtered)} passed filters, {len(entries_taken)} entries taken"
        )

        return ScanReport(
            date=scan_date,
            signals=filtered[:self.config.max_signals_per_scan],
            entries_taken=entries_taken,
            exits_triggered=[],
            positions_open=self.position_manager.position_count,
            risk_summary=self.risk_manager.get_risk_summary(),
        )

    def monitor_positions(
        self,
        stock_data: Dict[str, pd.DataFrame],
    ) -> List[ClosedTrade]:
        """
        Monitor open positions and handle exits.

        Called during market hours or at end of day.
        Checks each open position for exit conditions.

        Args:
            stock_data: Dict mapping symbol -> latest OHLCV DataFrame (with indicators)

        Returns:
            List of trades that were closed
        """
        # Compute indicators for stocks with open positions
        enriched_data = {}
        for symbol in self.position_manager.open_positions:
            df = stock_data.get(symbol)
            if df is None:
                continue
            try:
                enriched_data[symbol] = compute_all_indicators(df)
            except Exception as e:
                logger.error(f"Failed to compute indicators for {symbol}: {e}")
                enriched_data[symbol] = df

        # Update positions and check exits
        closed_trades = self.position_manager.update_positions(
            enriched_data,
            self._strategies_map,
        )

        # Record P&L for risk management
        for trade in closed_trades:
            self.risk_manager.record_trade_result(trade.pnl_pct)

        return closed_trades

    def get_status(self) -> dict:
        """Get current bot status."""
        return {
            'open_positions': self.position_manager.position_count,
            'max_positions': self.config.max_positions,
            'positions': {
                symbol: {
                    'strategy': pos.strategy,
                    'entry_price': pos.entry_price,
                    'stop_loss': pos.stop_loss,
                    'target': pos.target,
                    'hold_days': pos.hold_days,
                    'direction': pos.direction.value,
                }
                for symbol, pos in self.position_manager.open_positions.items()
            },
            'risk': self.risk_manager.get_risk_summary(),
            'performance': self.position_manager.get_performance_summary(),
        }

    def get_signals_only(
        self,
        stock_data: Dict[str, pd.DataFrame],
    ) -> List[TradeSignal]:
        """
        Scan for signals without taking positions.
        Useful for paper trading or signal display.

        Returns:
            List of all signals sorted by confidence
        """
        all_signals = []
        for symbol, df in stock_data.items():
            try:
                signals = scan_stock(df, symbol, self.strategies)
                all_signals.extend(signals)
            except Exception as e:
                logger.error(f"Scan failed for {symbol}: {e}")

        all_signals.sort(key=lambda s: (s.confidence, s.risk_reward), reverse=True)
        return all_signals
