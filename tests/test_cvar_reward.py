"""PR 178 — CVaR reward shaping tests."""
from __future__ import annotations

import numpy as np
import pytest

from ml.rl.cvar_reward import CVaRConfig, CVaRRewardShaper, make_cvar_wrapper


# ---------- CVaRConfig validation ----------

def test_invalid_alpha_rejected():
    with pytest.raises(ValueError):
        CVaRRewardShaper(CVaRConfig(alpha=0.0))
    with pytest.raises(ValueError):
        CVaRRewardShaper(CVaRConfig(alpha=1.0))


def test_small_window_rejected():
    with pytest.raises(ValueError):
        CVaRRewardShaper(CVaRConfig(rolling_window=5))


# ---------- shape() semantics ----------

def test_warmup_returns_raw_reward():
    """Before warmup_steps observations, no penalty applied."""
    cfg = CVaRConfig(alpha=0.05, target_cvar=-0.02, penalty_lambda=10.0,
                     rolling_window=100, warmup_steps=50)
    s = CVaRRewardShaper(cfg)
    for _ in range(49):
        out = s.shape(-1.0)   # huge breach but in warmup
        assert out == -1.0


def test_no_breach_returns_raw_reward():
    """When rolling CVaR is shallower than target, reward is unchanged."""
    cfg = CVaRConfig(alpha=0.05, target_cvar=-0.10, penalty_lambda=10.0,
                     rolling_window=20, warmup_steps=10)
    s = CVaRRewardShaper(cfg)
    # Feed 20 mildly-positive returns; CVaR should be near zero, well
    # above target -0.10 → no penalty
    for _ in range(20):
        out = s.shape(0.001)
        if s.current_cvar() is not None:
            # No breach → raw reward returned
            assert out == 0.001


def test_breach_applies_penalty():
    """When the rolling worst-tail breaches target, reward is reduced."""
    cfg = CVaRConfig(alpha=0.10, target_cvar=-0.02, penalty_lambda=2.0,
                     rolling_window=20, warmup_steps=10)
    s = CVaRRewardShaper(cfg)
    # Feed 18 small returns + 2 deep losses → CVaR_10% picks the worst 2
    for _ in range(18):
        s.shape(0.001)
    s.shape(-0.10)
    last = s.shape(-0.10)
    # CVaR_10% over the last 20 = mean of the 2 worst = -0.10
    # breach = -0.02 - (-0.10) = +0.08
    # penalty = 2.0 * 0.08 = 0.16
    # last raw reward = -0.10; shaped = -0.10 - 0.16 = -0.26
    assert last < -0.10
    assert s._n_breaches > 0


def test_reset_clears_buffer():
    cfg = CVaRConfig(rolling_window=20, warmup_steps=5)
    s = CVaRRewardShaper(cfg)
    for _ in range(20):
        s.shape(-1.0)
    assert s._n_seen == 20
    s.reset()
    assert s._n_seen == 0
    assert len(s._buffer) == 0


# ---------- stats() ----------

def test_stats_reports_breach_rate():
    cfg = CVaRConfig(alpha=0.10, target_cvar=-0.01, penalty_lambda=1.0,
                     rolling_window=20, warmup_steps=10)
    s = CVaRRewardShaper(cfg)
    # Feed 15 mild + 5 deep losses
    for _ in range(15):
        s.shape(0.001)
    for _ in range(5):
        s.shape(-0.10)
    stats = s.stats()
    assert stats["cvar_steps_seen"] == 20
    assert stats["cvar_breaches"] >= 1
    assert "cvar_breach_rate" in stats
    assert stats["cvar_target"] == -0.01
    assert stats["cvar_alpha"] == 0.10


# ---------- current_cvar() math ----------

def test_current_cvar_is_tail_mean():
    """For a known sequence, CVaR_α matches the mean of the worst α-quantile."""
    cfg = CVaRConfig(alpha=0.20, rolling_window=20, warmup_steps=5)
    s = CVaRRewardShaper(cfg)
    # Feed 10 returns: -10, -8, -6, ..., 8 (linear)
    rewards = list(range(-10, 10, 2))
    for r in rewards:
        s.shape(float(r))
    cvar = s.current_cvar()
    # alpha=0.20 over 10 obs → cutoff at 20th percentile
    arr = np.asarray(rewards, dtype=float)
    cutoff = np.quantile(arr, 0.20)
    expected = float(arr[arr <= cutoff].mean())
    assert abs(cvar - expected) < 1e-6


# ---------- make_cvar_wrapper ----------

class _FakeEnv5Tuple:
    """Mimics the Gymnasium 5-tuple step API."""
    action_space = None
    observation_space = None
    def __init__(self, rewards):
        self._rewards = list(rewards)
        self._i = 0
    def reset(self, **kwargs):
        self._i = 0
        return ("obs", {})
    def step(self, action):
        r = self._rewards[self._i % len(self._rewards)]
        self._i += 1
        return ("obs", float(r), False, False, {})


class _FakeEnv4Tuple:
    """Mimics the legacy gym 0.21 4-tuple step API."""
    action_space = None
    observation_space = None
    def __init__(self, rewards):
        self._rewards = list(rewards)
        self._i = 0
    def reset(self, **kwargs):
        self._i = 0
        return "obs"
    def step(self, action):
        r = self._rewards[self._i % len(self._rewards)]
        self._i += 1
        return ("obs", float(r), False, {})


def test_wrapper_gymnasium_5tuple():
    env = make_cvar_wrapper(
        _FakeEnv5Tuple([0.001] * 50 + [-0.10] * 50),
        CVaRConfig(alpha=0.10, target_cvar=-0.01, penalty_lambda=1.0,
                   rolling_window=50, warmup_steps=20),
    )
    env.reset()
    last = 0.0
    for _ in range(100):
        out = env.step(0)
        assert len(out) == 5
        last = out[1]
    # By the end of 100 steps the rolling CVaR should have breached and
    # shaped rewards differ from raw.
    assert env.shaper._n_breaches > 0


def test_wrapper_gym_4tuple():
    env = make_cvar_wrapper(
        _FakeEnv4Tuple([0.001] * 50 + [-0.10] * 50),
        CVaRConfig(alpha=0.10, target_cvar=-0.01, penalty_lambda=1.0,
                   rolling_window=50, warmup_steps=20),
    )
    env.reset()
    for _ in range(100):
        out = env.step(0)
        assert len(out) == 4
    assert env.shaper._n_breaches > 0


def test_wrapper_resets_shaper_on_reset():
    env = make_cvar_wrapper(
        _FakeEnv5Tuple([-1.0] * 200),
        CVaRConfig(rolling_window=20, warmup_steps=5),
    )
    env.reset()
    for _ in range(100):
        env.step(0)
    assert env.shaper._n_seen == 100
    env.reset()
    assert env.shaper._n_seen == 0
