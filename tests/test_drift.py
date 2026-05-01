"""PR 195 — feature drift (PSI + KS) tests."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml.eval.drift import (
    DriftConfig,
    feature_drift_report,
    ks_drift,
    psi,
    summarize_report,
)


# ---------- PSI ----------

def test_psi_zero_for_identical_distributions():
    rng = np.random.default_rng(42)
    ref = rng.normal(0, 1, 1000)
    # Same distribution, different sample
    cur = rng.normal(0, 1, 1000)
    val = psi(ref, cur)
    # Sampling noise puts PSI < 0.10 routinely
    assert val < 0.1


def test_psi_high_for_shifted_distribution():
    rng = np.random.default_rng(42)
    ref = rng.normal(0, 1, 1000)
    cur = rng.normal(2.0, 1, 1000)   # mean shifted
    val = psi(ref, cur)
    assert val > 0.25, f"PSI for shifted dist should exceed 0.25, got {val}"


def test_psi_zero_when_reference_constant():
    """Constant reference → PSI undefined → treat as 0."""
    ref = np.ones(500)
    cur = np.random.randn(500)
    assert psi(ref, cur) == 0.0


def test_psi_handles_nan():
    rng = np.random.default_rng(0)
    ref = rng.normal(0, 1, 1000)
    ref[::10] = np.nan
    cur = rng.normal(0, 1, 1000)
    val = psi(ref, cur)
    assert val >= 0.0   # no crash


def test_psi_handles_empty_input():
    assert psi(np.array([]), np.random.randn(100)) == 0.0
    assert psi(np.random.randn(100), np.array([])) == 0.0


# ---------- KS ----------

def test_ks_low_pvalue_for_different_distributions():
    rng = np.random.default_rng(0)
    ref = rng.normal(0, 1, 500)
    cur = rng.normal(2, 1, 500)
    stat, pval = ks_drift(ref, cur)
    assert pval < 0.05


def test_ks_high_pvalue_for_same_distribution():
    rng = np.random.default_rng(1)
    ref = rng.normal(0, 1, 500)
    cur = rng.normal(0, 1, 500)
    stat, pval = ks_drift(ref, cur)
    assert pval > 0.01


def test_ks_returns_safe_default_on_tiny_sample():
    stat, pval = ks_drift([1.0], [2.0])
    assert stat == 0.0
    assert pval == 1.0


# ---------- feature_drift_report ----------

def test_report_separates_severities():
    rng = np.random.default_rng(0)
    n = 1000
    ref = pd.DataFrame({
        "stable":   rng.normal(0, 1, n),
        "warning":  rng.normal(0, 1, n),
        "alerted":  rng.normal(0, 1, n),
    })
    cur = pd.DataFrame({
        "stable":   rng.normal(0, 1, n),     # same dist
        "warning":  rng.normal(0.4, 1, n),    # mild shift → PSI ≈ 0.10-0.20
        "alerted":  rng.normal(2.0, 1, n),    # large shift → PSI > 0.25
    })
    rep = feature_drift_report(ref, cur)
    assert rep["stable"]["severity"] == "none"
    # The mid-shift bucket should land in warn or alert
    assert rep["warning"]["severity"] in {"warn", "alert"}
    assert rep["alerted"]["severity"] == "alert"
    assert rep["alerted"]["alert"] is True


def test_report_only_includes_common_columns():
    ref = pd.DataFrame({"a": [1.0] * 10, "b": [2.0] * 10})
    cur = pd.DataFrame({"a": [3.0] * 10, "c": [4.0] * 10})
    rep = feature_drift_report(ref, cur)
    assert "a" in rep
    assert "b" not in rep   # not in current
    assert "c" not in rep   # not in reference


def test_report_empty_when_no_common_columns():
    ref = pd.DataFrame({"a": [1.0]})
    cur = pd.DataFrame({"b": [1.0]})
    assert feature_drift_report(ref, cur) == {}


# ---------- summarize_report ----------

def test_summarize_counts_severities():
    rep = {
        "f1": {"psi": 0.05, "ks_stat": 0.01, "ks_pvalue": 0.5, "alert": False, "severity": "none"},
        "f2": {"psi": 0.15, "ks_stat": 0.10, "ks_pvalue": 0.04, "alert": False, "severity": "warn"},
        "f3": {"psi": 0.30, "ks_stat": 0.50, "ks_pvalue": 0.001, "alert": True, "severity": "alert"},
    }
    s = summarize_report(rep)
    assert s["n_features"] == 3
    assert s["n_alerts"] == 1
    assert s["n_warnings"] == 1
    assert s["max_psi"] == 0.30
    # top_drifted is sorted by PSI desc
    assert s["top_drifted"][0]["feature"] == "f3"


def test_summarize_empty_report():
    s = summarize_report({})
    assert s["n_features"] == 0
    assert s["n_alerts"] == 0
    assert s["max_psi"] == 0.0


def test_drift_config_defaults():
    cfg = DriftConfig()
    assert cfg.psi_warn == 0.10
    assert cfg.psi_alert == 0.25
    assert cfg.ks_pvalue_alert == 0.05
