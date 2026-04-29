"""
================================================================================
Algorithm 1: NakedOptionBuy — Directional Option Buying
================================================================================
Entry: IV skew + OI flow alpha signals → buy OTM calls or puts
Exit: Fixed SL, trailing SL, fixed target, or EOD
Variants: SkewHunter, Index Sniper, Savdhaan, etc. (21 strategies via params)
================================================================================
"""

import math
from datetime import datetime, time
from typing import Dict, Optional

from .options_base import (
    BaseOptionsStrategy, OptionsChainSnapshot, OptionsTradeSignal,
    ExitSignal, FOLeg, normalize_percentile, avg,
)


class NakedOptionBuy(BaseOptionsStrategy):
    """
    Directional option buying using IV skew + OI flow alpha signals.
    All 21 option buying strategies are parameter variants of this class.
    """

    name = "NakedOptionBuy"
    category = "options_buying"
    template_slug = "naked_buy"

    def scan(self, chain: OptionsChainSnapshot, params: Dict) -> Optional[OptionsTradeSignal]:
        # === ALPHA SIGNAL 1: Volume-OI Flow ===
        otm_call_vol = sum(
            c.volume for c in chain.chain
            if c.option_type == 'CE' and c.strike > chain.atm_strike
        )
        itm_put_vol = sum(
            c.volume for c in chain.chain
            if c.option_type == 'PE' and c.strike > chain.atm_strike
        )
        otm_call_oi_chg = sum(
            abs(c.oi_change) for c in chain.chain
            if c.option_type == 'CE' and c.strike > chain.atm_strike
        )
        itm_put_oi_chg = sum(
            abs(c.oi_change) for c in chain.chain
            if c.option_type == 'PE' and c.strike > chain.atm_strike
        )

        vol_ratio = otm_call_vol / max(itm_put_vol, 1)
        oi_ratio = otm_call_oi_chg / max(itm_put_oi_chg, 1)
        alpha1 = normalize_percentile(vol_ratio + oi_ratio)

        # === ALPHA SIGNAL 2: IV Skew ===
        otm_dist = params.get('otm_distance', 100)
        otm_call_iv = avg([
            c.iv for c in chain.chain
            if c.option_type == 'CE' and c.strike == chain.atm_strike + otm_dist
        ])
        itm_call_iv = avg([
            c.iv for c in chain.chain
            if c.option_type == 'CE' and c.strike == chain.atm_strike - otm_dist
        ])
        otm_put_iv = avg([
            c.iv for c in chain.chain
            if c.option_type == 'PE' and c.strike == chain.atm_strike - otm_dist
        ])
        itm_put_iv = avg([
            c.iv for c in chain.chain
            if c.option_type == 'PE' and c.strike == chain.atm_strike + otm_dist
        ])

        iv_skew_call = otm_call_iv - itm_call_iv
        iv_skew_put = otm_put_iv - itm_put_iv
        alpha2 = normalize_percentile(iv_skew_call - iv_skew_put)

        # === ENTRY DECISION ===
        direction_filter = params.get('direction_filter')
        direction = None
        if alpha1 > 0.75 and alpha2 > 0.8:
            direction = 'CE'
        elif alpha1 < 0.25 and alpha2 < 0.2:
            direction = 'PE'

        if direction is None:
            return None
        if direction_filter and direction != direction_filter:
            return None

        # === TIME FILTER ===
        if not self.is_market_hours(time(10, 15), time(14, 15)):
            return None

        # === STRIKE SELECTION ===
        otm_strikes = params.get('otm_strikes', 2)
        if direction == 'CE':
            strike = chain.atm_strike + (otm_strikes * chain.strike_gap)
        else:
            strike = chain.atm_strike - (otm_strikes * chain.strike_gap)

        option = chain.get_contract(strike, direction)
        if not option or option.ltp < 20:
            return None

        # === SL & TARGET ===
        sl_pct = params.get('sl_pct', 40) / 100
        target_type = params.get('target_type', 'fixed')
        sl_price = option.ltp * (1 - sl_pct)

        if target_type == 'fixed':
            target_pct = params.get('target_pct', 90) / 100
            target_price = option.ltp * (1 + target_pct)
            max_profit = (target_price - option.ltp) * chain.lot_size
        else:
            target_price = None
            max_profit = float('inf')

        confidence = min(95, 50 + alpha1 * 25 + alpha2 * 20)
        reasons = [
            f"OI flow alpha: {alpha1:.2f}",
            f"IV skew alpha: {alpha2:.2f}",
            f"Direction: {direction}",
            f"Strike: {strike}",
        ]

        return OptionsTradeSignal(
            strategy=self.name,
            symbol=chain.symbol,
            legs=[FOLeg(
                symbol=chain.symbol,
                strike=strike,
                option_type=direction,
                direction='BUY',
                lots=1,
                entry_price=option.ltp,
            )],
            net_premium=-option.ltp * chain.lot_size,
            max_profit=max_profit,
            max_loss=option.ltp * chain.lot_size,
            confidence=confidence,
            reasons=reasons,
            hold_type=params.get('hold_type', 'intraday'),
        )

    def should_exit(self, chain: OptionsChainSnapshot, position: Dict,
                    params: Dict) -> Optional[ExitSignal]:
        leg = position.get('legs', [{}])[0]
        current_ltp = self.get_option_ltp(chain, leg)
        if current_ltp <= 0:
            return None

        entry = position.get('entry_price', leg.get('entry_price', 0))
        if entry <= 0:
            return None

        sl_pct = params.get('sl_pct', 40) / 100
        target_type = params.get('target_type', 'fixed')

        # Fixed SL
        if current_ltp <= entry * (1 - sl_pct):
            return ExitSignal(reason='sl_hit', exit_price=current_ltp)

        # Trailing SL
        if target_type == 'trailing':
            highest = position.get('highest_since_entry', entry)
            tsl = highest * (1 - sl_pct)
            if current_ltp <= tsl:
                return ExitSignal(reason='trailing_sl', exit_price=current_ltp)

        # Fixed target
        if target_type == 'fixed':
            target_pct = params.get('target_pct', 90) / 100
            if current_ltp >= entry * (1 + target_pct):
                return ExitSignal(reason='target_hit', exit_price=current_ltp)

        # EOD exit
        now = datetime.now().time()
        if now >= time(15, 15):
            return ExitSignal(reason='eod_exit', exit_price=current_ltp)

        return None
