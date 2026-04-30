"""
PR 163 — financial-ML labeling utilities.

Replaces naive sign-of-return labels (used by lgbm_signal_gate +
intraday_lstm) with the triple-barrier method from López de Prado's
"Advances in Financial Machine Learning" (chapter 3).

Public surface:

    from ml.labeling import triple_barrier_labels, TripleBarrierConfig

    cfg = TripleBarrierConfig(profit_target_atr=2.0, stop_loss_atr=1.0,
                              vertical_barrier_days=10)
    labels = triple_barrier_labels(close, atr, cfg)
"""

from .triple_barrier import (
    TripleBarrierConfig,
    triple_barrier_labels,
)

__all__ = [
    "TripleBarrierConfig",
    "triple_barrier_labels",
]
