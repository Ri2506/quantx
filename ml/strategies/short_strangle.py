"""
================================================================================
Algorithm 3: ShortStrangle — Sell OTM CE + OTM PE
================================================================================
Entry: Range-bound market (PCR 0.7-1.3, VIX>12) + OI-based range detection
Exit: Combined premium SL, per-leg SL, time-based, profit target
Variants: Expiry, Intraday, Carry, Chanakya, Sidha-Sauda (5 strategies)
================================================================================
"""

from datetime import datetime, date, time
from typing import Dict, Optional

from .options_base import (
    BaseOptionsStrategy, OptionsChainSnapshot, OptionsTradeSignal,
    ExitSignal, FOLeg,
)


class ShortStrangle(BaseOptionsStrategy):
    """
    Short strangle: sell OTM CE + OTM PE equidistant from ATM.
    Profits from range-bound markets and theta decay.
    """

    name = "ShortStrangle"
    category = "short_strangle"
    template_slug = "short_strangle"

    def scan(self, chain: OptionsChainSnapshot, params: Dict) -> Optional[OptionsTradeSignal]:
        # === MARKET CONDITION FILTER ===
        if not (0.7 <= chain.pcr <= 1.3):
            return None
        if chain.iv_index < 12:
            return None

        # === STRIKE SELECTION ===
        distance = params.get('distance_from_atm', 100)
        ce_strike = chain.atm_strike + distance
        pe_strike = chain.atm_strike - distance

        ce_opt = chain.get_contract(ce_strike, 'CE')
        pe_opt = chain.get_contract(pe_strike, 'PE')
        if not ce_opt or not pe_opt:
            return None

        combined_premium = ce_opt.ltp + pe_opt.ltp
        if combined_premium <= 0:
            return None

        # === TIME FILTER ===
        hold_type = params.get('hold_type', 'intraday')
        if hold_type == 'intraday':
            if not self.is_market_hours(time(9, 20), time(14, 30)):
                return None
        else:
            if not self.is_market_hours(time(9, 20), time(15, 0)):
                return None

        # === POSITION SIZING ===
        lots = params.get('lots', 1)

        confidence = min(85, 50 + (chain.pcr - 0.7) * 30 + min(chain.iv_index / 25, 20))
        reasons = [
            f"PCR: {chain.pcr:.2f} (range-bound)",
            f"IV Index: {chain.iv_index:.1f}",
            f"Strikes: {ce_strike}CE / {pe_strike}PE",
            f"Combined premium: {combined_premium:.1f}",
        ]

        return OptionsTradeSignal(
            strategy=self.name,
            symbol=chain.symbol,
            legs=[
                FOLeg(symbol=chain.symbol, strike=ce_strike, option_type='CE',
                      direction='SELL', lots=lots, entry_price=ce_opt.ltp),
                FOLeg(symbol=chain.symbol, strike=pe_strike, option_type='PE',
                      direction='SELL', lots=lots, entry_price=pe_opt.ltp),
            ],
            net_premium=combined_premium * lots * chain.lot_size,
            max_profit=combined_premium * lots * chain.lot_size,
            max_loss=float('inf'),
            confidence=confidence,
            reasons=reasons,
            margin_required=chain.spot_price * chain.lot_size * 0.15 * lots * 2,
            hold_type=hold_type,
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
        sl_type = params.get('sl_type', 'combined')
        now = datetime.now()
        entry_date = position.get('entry_date', now.date())
        if isinstance(entry_date, str):
            entry_date = date.fromisoformat(entry_date)

        # Combined premium SL
        if sl_type == 'combined':
            if combined_current >= combined_entry * (1 + sl_pct):
                return ExitSignal(reason='combined_sl_hit', exit_price=combined_current)
        else:
            # Per-leg SL
            if ce_ltp >= legs[0].get('entry_price', 0) * (1 + sl_pct):
                return ExitSignal(reason='ce_sl_hit', exit_price=ce_ltp)
            if pe_ltp >= legs[1].get('entry_price', 0) * (1 + sl_pct):
                return ExitSignal(reason='pe_sl_hit', exit_price=pe_ltp)

        # Time-based exits
        hold_type = params.get('hold_type', 'intraday')
        if hold_type == 'intraday' and now.time() >= time(15, 15):
            return ExitSignal(reason='eod_exit')
        elif hold_type == 'overnight' and now.date() > entry_date and now.time() >= time(9, 30):
            return ExitSignal(reason='overnight_exit')
        elif hold_type == 'carry' and (now.date() - entry_date).days >= 3:
            return ExitSignal(reason='carry_exit')
        elif hold_type == 'expiry' and now.date() == chain.expiry and now.time() >= time(15, 15):
            return ExitSignal(reason='expiry_exit')

        # Profit target: 50% of premium decayed
        if combined_current <= combined_entry * 0.5:
            return ExitSignal(reason='profit_target', exit_price=combined_current)

        return None
