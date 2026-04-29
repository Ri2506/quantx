"""
PR 153 — smoke-test that every trainer module imports cleanly + has the
required Trainer protocol fields.

This is the single test that catches the worst class of pre-launch
failure: a trainer file fails to import on the GPU box because of a
typo, missing dep, or broken relative import — and the runner silently
skips it with a discovery warning. Better to fail CI than to hand the
GPU box a broken pipeline.
"""

from __future__ import annotations

import importlib

import pytest

from ml.training.base import Trainer, TrainResult
from ml.training.discovery import discover_sorted, discover_trainers


def test_discovery_returns_at_least_one_trainer():
    trainers = discover_trainers()
    assert len(trainers) >= 1, "no trainers discovered — runner is empty"


def test_each_discovered_trainer_has_required_fields():
    """Every trainer module must declare ``name`` + override ``train``."""
    for t in discover_trainers():
        assert isinstance(t, Trainer), f"{t!r} is not a Trainer subclass"
        assert isinstance(t.name, str) and t.name, f"trainer {t!r} has no .name"
        # depends_on must be a list of strings.
        assert isinstance(t.depends_on, list), f"{t.name} depends_on must be list"
        for dep in t.depends_on:
            assert isinstance(dep, str), f"{t.name} dep {dep!r} not a string"
        # ``train`` must be overridden (non-abstract).
        assert "train" in type(t).__dict__ or any(
            "train" in base.__dict__ for base in type(t).__mro__[1:]
        ), f"{t.name} did not override train()"


def test_trainer_names_are_unique():
    names = [t.name for t in discover_trainers()]
    assert len(names) == len(set(names)), f"duplicate trainer names: {names}"


def test_topo_sort_orders_dependencies_before_dependents():
    """If trainer B declares depends_on=['A'], A must appear first."""
    sorted_trainers = discover_sorted()
    seen: set[str] = set()
    for t in sorted_trainers:
        for dep in t.depends_on or []:
            # dep may not be in the trainer set (logged + skipped at
            # discovery time) — only enforce ordering when both exist.
            if dep in {x.name for x in sorted_trainers}:
                assert dep in seen, (
                    f"trainer {t.name} runs before dep {dep}: "
                    f"order = {[x.name for x in sorted_trainers]}"
                )
        seen.add(t.name)


@pytest.mark.parametrize(
    "module_name",
    [
        "ml.training.trainers.regime_hmm",
        "ml.training.trainers.lgbm_signal_gate",
        "ml.training.trainers.intraday_lstm",
        "ml.training.trainers.momentum_zero_shot",
        "ml.training.trainers.vix_tft",
        "ml.training.trainers.options_rl",
        "ml.training.trainers.earnings_xgb",
        "ml.training.trainers.finrl_x_ensemble",
    ],
)
def test_trainer_module_imports(module_name: str):
    """Each trainer module must be importable. Import errors here mean
    a deploy will silently lose that trainer."""
    importlib.import_module(module_name)
