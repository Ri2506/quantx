"""
================================================================================
Algorithm 2: CreditSpread — Bull Put / Bear Call Credit Spreads
================================================================================
Entry: V-Score (inverse volatility) + Viscosity signal
Exit: Max loss cap, overnight exit, early profit, expiry
Variants: Curvature, Zen, Theta-Harvest, etc. (10 strategies via params)
================================================================================
"""

import math
from datetime import datetime, date, time
from typing import Dict, Optional

from .options_base import (
    BaseOptionsStrategy, OptionsChainSnapshot, OptionsTradeSignal,
    ExitSignal, FOLeg,
)


class CreditSpread(BaseOptionsStrategy):
    """
    Credit spread selling using V-Score (inverse volatility) + viscosity signal.
    All 10 credit spread strategies are parameter variants of this class.
    """

    name = "CreditSpread"
    category = "credit_spread"
    template_slug = "credit_spread"

    def scan(self, chain: OptionsChainSnapshot, params: Dict) -> Optional[OptionsTradeSignal]:
        # === V-SCORE ALPHA (Inverse Volatility) ===
        current_iv = chain.iv_index
        iv_20d_mean = params.get('_iv_20d_mean', current_iv)
        iv_20d_std = params.get('_iv_20d_std', current_iv * 0.1)

        iv_z_score = (current_iv - iv_20d_mean) / max(iv_20d_std, 0.01)
        alpha = 1.0 / (1.0 + math.exp(iv_z_score))  # Sigmoid: low IV → alpha near 1

        # === VISCOSITY SIGNAL ===
        spot_return = (chain.spot_price - params.get('_prev_close', chain.spot_price)) / max(chain.spot_price, 1)
        iv_change = (current_iv - params.get('_prev_iv', current_iv)) / max(params.get('_prev_iv', 1), 0.01)
        alpha9 = 1.0 / (1.0 + math.exp(-(spot_return * 100 - iv_change * 100)))

        # === ENTRY DECISION ===
        spread_width = params.get('spread_width', 100)

        if alpha > 0.75 and alpha9 > 0.7:
            # BULLISH → Sell credit PUT spread
            sell_strike = chain.atm_strike - spread_width
            buy_strike = sell_strike - spread_width
            option_type = 'PE'
        elif alpha < 0.25 and alpha9 < 0.3:
            # BEARISH → Sell credit CALL spread
            sell_strike = chain.atm_strike + spread_width
            buy_strike = sell_strike + spread_width
            option_type = 'CE'
        else:
            return None

        # === TIME FILTER ===
        if not self.is_market_hours(time(10, 15), time(14, 15)):
            return None

        # === CONTRACTS ===
        sell_opt = chain.get_contract(sell_strike, option_type)
        buy_opt = chain.get_contract(buy_strike, option_type)
        if not sell_opt or not buy_opt:
            return None

        credit = sell_opt.ltp - buy_opt.ltp
        if credit <= 0:
            return None

        max_loss_per_lot = (spread_width * chain.lot_size) - (credit * chain.lot_size)
        max_loss_cap = params.get('max_loss_cap', 3000)
        lots = max(1, int(max_loss_cap / max(max_loss_per_lot, 1)))

        confidence = min(90, 50 + alpha * 20 + alpha9 * 20)
        reasons = [
            f"V-Score alpha: {alpha:.2f}",
            f"Viscosity alpha: {alpha9:.2f}",
            f"Spread: {sell_strike}/{buy_strike} {option_type}",
            f"Credit: {credit:.1f} x {lots} lots",
        ]

        return OptionsTradeSignal(
            strategy=self.name,
            symbol=chain.symbol,
            legs=[
                FOLeg(symbol=chain.symbol, strike=sell_strike, option_type=option_type,
                      direction='SELL', lots=lots, entry_price=sell_opt.ltp),
                FOLeg(symbol=chain.symbol, strike=buy_strike, option_type=option_type,
                      direction='BUY', lots=lots, entry_price=buy_opt.ltp),
            ],
            net_premium=credit * lots * chain.lot_size,
            max_profit=credit * lots * chain.lot_size,
            max_loss=max_loss_cap,
            confidence=confidence,
            reasons=reasons,
            margin_required=max_loss_per_lot * lots,
            hold_type=params.get('hold_type', 'overnight'),
        )

    def should_exit(self, chain: OptionsChainSnapshot, position: Dict,
                    params: Dict) -> Optional[ExitSignal]:
        hold_type = params.get('hold_type', 'overnight')
        now = datetime.now()
        entry_time = position.get('entry_time', now)
        if isinstance(entry_time, str):
            entry_time = datetime.fromisoformat(entry_time)

        # Compute current spread P&L
        legs = position.get('legs', [])
        if len(legs) >= 2:
            sell_ltp = self.get_option_ltp(chain, legs[0])
            buy_ltp = self.get_option_ltp(chain, legs[1])
            entry_credit = legs[0].get('entry_price', 0) - legs[1].get('entry_price', 0)
            current_spread = sell_ltp - buy_ltp
            current_pnl = (entry_credit - current_spread) * position.get('lots', 1) * chain.lot_size
        else:
            current_pnl = 0

        # Max loss hit
        max_loss_cap = params.get('max_loss_cap', 3000)
        if current_pnl <= -max_loss_cap:
            return ExitSignal(reason='max_loss_hit', exit_price=0)

        # Hold type exits
        if hold_type == 'overnight':
            if now.date() > entry_time.date() and now.time() >= time(9, 30):
                return ExitSignal(reason='overnight_exit')
        elif hold_type == 'exit_early':
            max_profit = position.get('max_profit', 0)
            if max_profit > 0 and current_pnl >= max_profit * 0.5:
                return ExitSignal(reason='early_profit_exit')

        # EOD on expiry day
        if now.date() == chain.expiry and now.time() >= time(15, 15):
            return ExitSignal(reason='expiry_exit')

        return None
