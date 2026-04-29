"""
================================================================================
Algorithm 4: ShortStraddle — Sell ATM CE + ATM PE
================================================================================
Entry: IV mean reversion — sell when IV elevated (z-score > threshold)
Filters: Kurtosis (fat-tail), Lattice (IV only), Rangetrap (ADX < 25)
Exit: Combined SL, profit target (60% decay), EOD
Variants: Kurtosis, Lattice, Rangetrap (3 strategies)
================================================================================
"""

import math
from datetime import datetime, time
from typing import Dict, Optional

from .options_base import (
    BaseOptionsStrategy, OptionsChainSnapshot, OptionsTradeSignal,
    ExitSignal, FOLeg,
)


class ShortStraddle(BaseOptionsStrategy):
    """
    Short straddle: sell ATM CE + ATM PE when IV is elevated.
    Profits from IV mean reversion and theta decay.
    """

    name = "ShortStraddle"
    category = "short_straddle"
    template_slug = "short_straddle"

    def scan(self, chain: OptionsChainSnapshot, params: Dict) -> Optional[OptionsTradeSignal]:
        # === IV MEAN REVERSION FILTER ===
        iv_20d_mean = params.get('_iv_20d_mean', chain.iv_index)
        iv_20d_std = params.get('_iv_20d_std', chain.iv_index * 0.15)
        iv_threshold = params.get('iv_z_threshold', 1.5)

        iv_z = (chain.iv_index - iv_20d_mean) / max(iv_20d_std, 0.01)
        if iv_z < iv_threshold:
            return None

        # === FILTER VARIANTS ===
        filter_type = params.get('filter_type', 'kurtosis')

        if filter_type == 'kurtosis':
            kurtosis = params.get('_returns_kurtosis', 3.0)
            if kurtosis < 3.5:
                return None
        elif filter_type == 'rangetrap':
            adx = params.get('_adx', 30)
            if adx > 25:
                return None
        # lattice: no additional filter

        # === STRIKE SELECTION: ATM ===
        atm_ce = chain.get_contract(chain.atm_strike, 'CE')
        atm_pe = chain.get_contract(chain.atm_strike, 'PE')
        if not atm_ce or not atm_pe:
            return None

        combined = atm_ce.ltp + atm_pe.ltp
        if combined <= 0:
            return None

        lots = params.get('lots', 1)
        confidence = min(80, 40 + iv_z * 15 + chain.pcr * 10)

        reasons = [
            f"IV z-score: {iv_z:.2f} > {iv_threshold}",
            f"Filter: {filter_type}",
            f"ATM strike: {chain.atm_strike}",
            f"Combined premium: {combined:.1f}",
        ]

        return OptionsTradeSignal(
            strategy=self.name,
            symbol=chain.symbol,
            legs=[
                FOLeg(symbol=chain.symbol, strike=chain.atm_strike, option_type='CE',
                      direction='SELL', lots=lots, entry_price=atm_ce.ltp),
                FOLeg(symbol=chain.symbol, strike=chain.atm_strike, option_type='PE',
                      direction='SELL', lots=lots, entry_price=atm_pe.ltp),
            ],
            net_premium=combined * lots * chain.lot_size,
            max_profit=combined * lots * chain.lot_size,
            max_loss=float('inf'),
            confidence=confidence,
            reasons=reasons,
            margin_required=chain.spot_price * chain.lot_size * 0.20 * lots * 2,
            hold_type='intraday',
        )

    def should_exit(self, chain: OptionsChainSnapshot, position: Dict,
                    params: Dict) -> Optional[ExitSignal]:
        legs = position.get('legs', [])
        if len(legs) < 2:
            return None

        ce_ltp = self.get_option_ltp(chain, legs[0])
        pe_ltp = self.get_option_ltp(chain, legs[1])
        combined_current = ce_ltp + pe_ltp
        combined_entry = position.get('entry_combined_premium',
                                      legs[0].get('entry_price', 0) + legs[1].get('entry_price', 0))

        sl_pct = params.get('sl_pct', 30) / 100

        # Combined SL
        if combined_current >= combined_entry * (1 + sl_pct):
            return ExitSignal(reason='sl_hit', exit_price=combined_current)

        # Profit target: 60% decay
        if combined_current <= combined_entry * 0.4:
            return ExitSignal(reason='profit_target', exit_price=combined_current)

        # EOD exit
        if datetime.now().time() >= time(15, 15):
            return ExitSignal(reason='eod_exit', exit_price=combined_current)

        return None
