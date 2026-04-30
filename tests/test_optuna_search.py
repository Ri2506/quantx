"""
PR 165 — tests for Optuna search wrapper.

Verifies:
  - Returns best params + best value when optuna installed
  - Falls back gracefully when optuna unavailable (no exception)
  - Failure inside objective doesn't crash the search
  - direction='minimize' works for loss-based objectives
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from ml.training.optuna_search import (
    OptunaConfig,
    SearchSpace,
    run_optuna_search,
)


def test_finds_optimum_on_simple_quadratic():
    # Optimize -(x-0.5)^2 — max at x=0.5
    pytest.importorskip("optuna")
    space = SearchSpace(
        suggest=lambda trial: {"x": trial.suggest_float("x", 0.0, 1.0)}
    )

    def obj(params):
        return -((params["x"] - 0.5) ** 2)

    cfg = OptunaConfig(n_trials=30, direction="maximize", seed=42)
    result = run_optuna_search(obj, space, cfg)
    assert result["optimized"] is True
    assert result["n_trials_run"] == 30
    assert result["best_value"] > -0.05  # close to 0
    assert abs(result["best_params"]["x"] - 0.5) < 0.15


def test_minimize_direction_reversed():
    pytest.importorskip("optuna")
    space = SearchSpace(
        suggest=lambda trial: {"x": trial.suggest_float("x", 0.0, 1.0)}
    )

    # Minimize (x-0.3)^2 — min at x=0.3
    def obj(params):
        return (params["x"] - 0.3) ** 2

    cfg = OptunaConfig(n_trials=30, direction="minimize", seed=42)
    result = run_optuna_search(obj, space, cfg)
    assert result["best_value"] < 0.05
    assert abs(result["best_params"]["x"] - 0.3) < 0.15


def test_failing_objective_doesnt_crash_search():
    pytest.importorskip("optuna")
    space = SearchSpace(
        suggest=lambda trial: {"x": trial.suggest_int("x", 0, 10)}
    )
    call_count = {"n": 0}

    def obj(params):
        call_count["n"] += 1
        if call_count["n"] % 3 == 0:
            raise RuntimeError("simulated trainer failure")
        return float(params["x"])

    cfg = OptunaConfig(n_trials=15, direction="maximize", seed=0)
    result = run_optuna_search(obj, space, cfg)
    # All 15 trials attempted, even though some failed
    assert result["n_trials_run"] == 15
    # Best params should have been found from non-failing trials
    assert result["best_value"] > 0


def test_falls_back_when_optuna_missing():
    space = SearchSpace(
        suggest=lambda trial: {"x": trial.suggest_float("x", 0.5, 1.5)}
    )

    def obj(params):
        return params["x"] ** 2

    with patch.dict("sys.modules", {"optuna": None}):
        # Force ImportError inside run_optuna_search
        import importlib
        import ml.training.optuna_search as mod
        importlib.reload(mod)
        result = mod.run_optuna_search(obj, space, OptunaConfig(n_trials=20))
    assert result["optimized"] is False
    assert result["n_trials_run"] == 1


def test_categorical_search():
    pytest.importorskip("optuna")
    space = SearchSpace(
        suggest=lambda trial: {
            "kernel": trial.suggest_categorical("kernel", ["linear", "rbf", "poly"]),
            "c": trial.suggest_float("c", 0.01, 10.0, log=True),
        }
    )

    def obj(params):
        # Synthetic: 'rbf' with log(c)~0 is best
        kernel_score = {"linear": 0.5, "rbf": 1.0, "poly": 0.7}[params["kernel"]]
        c_pen = abs(params["c"] - 1.0)
        return kernel_score - c_pen

    cfg = OptunaConfig(n_trials=20, direction="maximize", seed=1)
    result = run_optuna_search(obj, space, cfg)
    # rbf should be the optimal kernel
    assert result["best_params"]["kernel"] == "rbf"
