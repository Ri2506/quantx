"""
SwingAI Position Manager
==========================
Tracks open positions, manages trailing stops, and handles exits.

Responsibilities:
- Track all open positions with entry details
- Update positions each bar (trailing stops, breakeven moves)
- Check exit conditions via strategy's should_exit()
- Record closed trades for performance tracking
"""

import logging
from typing import List, Optional, Dict
from dataclasses import dataclass, field
from datetime import datetime
import pandas as pd

from .strategies.base import Position, TradeSignal, ExitSignal, Direction

logger = logging.getLogger(__name__)


@dataclass
class ClosedTrade:
    """Record of a completed trade."""
    symbol: str
    strategy: str
    direction: str
    entry_price: float
    exit_price: float
    entry_date: str
    exit_date: str
    hold_days: int
    pnl_pct: float
    pnl_amount: float
    exit_reason: str
    quantity: int = 0


class PositionManager:
    """Manages open positions and tracks trade history."""

    def __init__(self, max_positions: int = 0):
        self.max_positions = max_positions  # 0 = unlimited
        self.open_positions: Dict[str, Position] = {}  # symbol -> Position
        self.closed_trades: List[ClosedTrade] = []

    @property
    def position_count(self) -> int:
        return len(self.open_positions)

    @property
    def has_capacity(self) -> bool:
        if self.max_positions <= 0:
            return True  # unlimited
        return self.position_count < self.max_positions

    def get_position(self, symbol: str) -> Optional[Position]:
        return self.open_positions.get(symbol)

    def open_position(
        self,
        signal: TradeSignal,
        quantity: int,
        entry_date: pd.Timestamp,
        actual_entry_price: Optional[float] = None,
    ) -> Optional[Position]:
        """
        Open a new position from a trade signal.

        Entry uses next-candle-open logic: the signal fires at candle close,
        but the actual entry happens at next bar's open (or the live fill price).

        Args:
            signal: The TradeSignal that triggered entry
            quantity: Number of shares
            entry_date: Date of entry
            actual_entry_price: Actual fill price (next bar open). If None,
                               falls back to signal.entry_price.

        Returns:
            The newly created Position, or None if validation fails.
        """
        if signal.symbol in self.open_positions:
            logger.warning(f"Already have position in {signal.symbol}, skipping")
            return None

        entry_price = actual_entry_price if actual_entry_price is not None else signal.entry_price

        # Gap down > 3% = extreme — skip entirely
        signal_price = signal.entry_price
        if entry_price < signal_price * 0.97:
            logger.info(f"Skipping {signal.symbol}: gap down {((1-entry_price/signal_price))*100:.1f}% too extreme")
            return None

        # Gap up > 2% = don't chase. Return "RADAR" sentinel so caller
        # can watch for pullback re-entry (gap up = buyers present, wait
        # for retest of support / order block / key MA).
        if entry_price > signal_price * 1.02:
            logger.info(
                f"RADAR {signal.symbol}: gap up {((entry_price/signal_price)-1)*100:.1f}% "
                f"— watching for pullback re-entry"
            )
            return "RADAR"  # type: ignore[return-value]

        # Validate: entry must be above stop loss
        if entry_price <= signal.stop_loss:
            logger.info(f"Skipping {signal.symbol}: entry {entry_price:.2f} <= stop {signal.stop_loss:.2f}")
            return None

        # Validate R:R from actual entry
        actual_risk = entry_price - signal.stop_loss
        actual_reward = signal.target - entry_price
        if actual_risk <= 0 or actual_reward <= 0 or (actual_reward / actual_risk) < 1.5:
            logger.info(f"Skipping {signal.symbol}: R:R {actual_reward/actual_risk:.1f} < 1.5 at actual entry")
            return None

        position = Position(
            symbol=signal.symbol,
            strategy=signal.strategy,
            direction=signal.direction,
            entry_price=entry_price,
            entry_date=entry_date,
            stop_loss=signal.stop_loss,
            target=signal.target,
            quantity=quantity,
            trailing_stop=signal.stop_loss,
            highest_since_entry=entry_price,
            lowest_since_entry=entry_price,
        )

        self.open_positions[signal.symbol] = position
        logger.info(
            f"Opened {signal.direction.value} {signal.symbol} @ {entry_price:.2f} "
            f"(signal @ {signal_price:.2f}) "
            f"| SL={signal.stop_loss:.2f} | Target={signal.target:.2f} "
            f"| Strategy={signal.strategy} | Qty={quantity}"
        )
        return position

    def close_position(
        self,
        symbol: str,
        exit_price: float,
        exit_reason: str,
        exit_date: str = "",
    ) -> Optional[ClosedTrade]:
        """
        Close an open position and record the trade.

        Returns:
            ClosedTrade record, or None if no position found.
        """
        position = self.open_positions.pop(symbol, None)
        if position is None:
            logger.warning(f"No open position for {symbol}")
            return None

        # Calculate P&L
        if position.direction == Direction.BUY:
            pnl_pct = (exit_price - position.entry_price) / position.entry_price * 100
            pnl_amount = (exit_price - position.entry_price) * position.quantity
        else:
            pnl_pct = (position.entry_price - exit_price) / position.entry_price * 100
            pnl_amount = (position.entry_price - exit_price) * position.quantity

        trade = ClosedTrade(
            symbol=symbol,
            strategy=position.strategy,
            direction=position.direction.value,
            entry_price=position.entry_price,
            exit_price=exit_price,
            entry_date=str(position.entry_date),
            exit_date=exit_date or str(datetime.now()),
            hold_days=position.hold_days,
            pnl_pct=round(pnl_pct, 2),
            pnl_amount=round(pnl_amount, 2),
            exit_reason=exit_reason,
            quantity=position.quantity,
        )

        self.closed_trades.append(trade)
        emoji = "+" if pnl_pct > 0 else ""
        logger.info(
            f"Closed {symbol} @ {exit_price:.2f} | {emoji}{pnl_pct:.2f}% "
            f"| Reason={exit_reason} | Hold={position.hold_days}d "
            f"| Strategy={position.strategy}"
        )
        return trade

    def update_positions(
        self,
        stock_data: Dict[str, pd.DataFrame],
        strategies_map: Dict[str, 'BaseStrategy'],
    ) -> List[ClosedTrade]:
        """
        Update all open positions with latest data.
        Check exit conditions for each position.

        Args:
            stock_data: Dict of symbol -> DataFrame with latest OHLCV + indicators
            strategies_map: Dict of strategy_name -> strategy instance

        Returns:
            List of trades that were closed this update.
        """
        closed = []
        symbols_to_close = []

        for symbol, position in self.open_positions.items():
            df = stock_data.get(symbol)
            if df is None or len(df) < 2:
                continue

            strategy = strategies_map.get(position.strategy)
            if strategy is None:
                logger.warning(f"Strategy {position.strategy} not found for {symbol}")
                continue

            # Increment hold_days (engine owns this in backtest; position_manager owns it in live)
            position.hold_days += 1

            try:
                exit_signal = strategy.should_exit(df, position)
                if exit_signal is not None:
                    symbols_to_close.append((symbol, exit_signal))
            except Exception as e:
                logger.error(f"Exit check failed for {symbol}: {e}")

        # Close positions (can't modify dict during iteration)
        for symbol, exit_signal in symbols_to_close:
            curr_date = str(stock_data[symbol].index[-1]) if hasattr(stock_data[symbol].index[-1], 'strftime') else ""
            trade = self.close_position(
                symbol,
                exit_signal.exit_price,
                exit_signal.reason,
                exit_date=curr_date,
            )
            if trade:
                closed.append(trade)

        return closed

    def get_performance_summary(self) -> dict:
        """Calculate performance metrics from closed trades."""
        if not self.closed_trades:
            return {
                'total_trades': 0,
                'win_rate': 0,
                'avg_pnl_pct': 0,
                'total_pnl': 0,
                'max_win': 0,
                'max_loss': 0,
                'avg_hold_days': 0,
                'profit_factor': 0,
                'by_strategy': {},
            }

        pnls = [t.pnl_pct for t in self.closed_trades]
        wins = [p for p in pnls if p > 0]
        losses = [p for p in pnls if p <= 0]

        total_wins = sum(wins) if wins else 0
        total_losses = abs(sum(losses)) if losses else 0

        # Per-strategy breakdown
        by_strategy = {}
        for trade in self.closed_trades:
            if trade.strategy not in by_strategy:
                by_strategy[trade.strategy] = {'trades': 0, 'wins': 0, 'total_pnl': 0}
            by_strategy[trade.strategy]['trades'] += 1
            if trade.pnl_pct > 0:
                by_strategy[trade.strategy]['wins'] += 1
            by_strategy[trade.strategy]['total_pnl'] += trade.pnl_pct

        for name, stats in by_strategy.items():
            stats['win_rate'] = round(stats['wins'] / stats['trades'] * 100, 1) if stats['trades'] > 0 else 0
            stats['avg_pnl'] = round(stats['total_pnl'] / stats['trades'], 2) if stats['trades'] > 0 else 0

        return {
            'total_trades': len(self.closed_trades),
            'win_rate': round(len(wins) / len(pnls) * 100, 1),
            'avg_pnl_pct': round(sum(pnls) / len(pnls), 2),
            'total_pnl': round(sum(pnls), 2),
            'max_win': round(max(pnls), 2),
            'max_loss': round(min(pnls), 2),
            'avg_hold_days': round(sum(t.hold_days for t in self.closed_trades) / len(self.closed_trades), 1),
            'profit_factor': round(total_wins / total_losses, 2) if total_losses > 0 else float('inf'),
            'by_strategy': by_strategy,
        }
