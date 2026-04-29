/**
 * Public model naming registry — the moat layer.
 *
 * Mirrors `src/backend/core/public_models.py`. Every user-facing
 * surface MUST import names from here rather than hard-coding them.
 * Internal model names (TFT / Qlib / FinBERT / etc.) never reach
 * the browser.
 *
 * Naming convention:
 *   *Lens / *Cast / *Scope → forecast / view engines
 *   *IQ                    → intelligence / classification
 *   *Rank                  → ranking
 *   *Pulse                 → real-time / tick
 *   AutoPilot, EarningsScout, Counterpoint, SectorFlow → one-word roles
 */

export type PublicModelKey =
  | 'swing_forecast'
  | 'intraday_forecast'
  | 'cross_sectional_ranker'
  | 'trajectory_forecast'
  | 'regime_detector'
  | 'sentiment_engine'
  | 'portfolio_optimizer'
  | 'execution_engine'
  | 'pattern_scorer'
  | 'cot_agents'
  | 'debate_engine'
  | 'sector_rotation'
  | 'earnings_predictor'
  | 'vix_forecaster'

export interface PublicModel {
  key: PublicModelKey
  name: string
  role: string
  hex: string
}

export const PUBLIC_MODELS: Record<PublicModelKey, PublicModel> = {
  swing_forecast: {
    key: 'swing_forecast',
    name: 'SwingLens',
    role: 'Swing forecast engine — 5-day quantile outlook',
    hex: '#4FECCD',
  },
  intraday_forecast: {
    key: 'intraday_forecast',
    name: 'TickPulse',
    role: 'Intraday forecast engine — 5-minute tick dynamics',
    hex: '#FEB113',
  },
  cross_sectional_ranker: {
    key: 'cross_sectional_ranker',
    name: 'AlphaRank',
    role: 'Cross-sectional alpha ranker — nightly universe sieve',
    hex: '#5DCBD8',
  },
  trajectory_forecast: {
    key: 'trajectory_forecast',
    name: 'HorizonCast',
    role: 'Long-horizon trajectory forecaster',
    hex: '#8D5CFF',
  },
  regime_detector: {
    key: 'regime_detector',
    name: 'RegimeIQ',
    role: 'Market regime detector — bull · sideways · bear',
    hex: '#FF9900',
  },
  sentiment_engine: {
    key: 'sentiment_engine',
    name: 'ToneScan',
    role: 'News sentiment engine — NSE-tuned',
    hex: '#05B878',
  },
  portfolio_optimizer: {
    key: 'portfolio_optimizer',
    name: 'AllocIQ',
    role: 'Portfolio optimizer — quality-first allocation',
    hex: '#FFD166',
  },
  execution_engine: {
    key: 'execution_engine',
    name: 'AutoPilot',
    role: 'Autonomous execution engine — volatility-gated',
    hex: '#FF5947',
  },
  pattern_scorer: {
    key: 'pattern_scorer',
    name: 'PatternScope',
    role: 'Pattern quality scorer',
    hex: '#00E5CC',
  },
  cot_agents: {
    key: 'cot_agents',
    name: 'InsightAI',
    role: 'Multi-agent reasoning — portfolio doctor',
    hex: '#4FECCD',
  },
  debate_engine: {
    key: 'debate_engine',
    name: 'Counterpoint',
    role: 'Bull / Bear debate — high-stakes signals',
    hex: '#8D5CFF',
  },
  sector_rotation: {
    key: 'sector_rotation',
    name: 'SectorFlow',
    role: 'Sector rotation tracker',
    hex: '#5DCBD8',
  },
  earnings_predictor: {
    key: 'earnings_predictor',
    name: 'EarningsScout',
    role: 'Earnings surprise model',
    hex: '#FEB113',
  },
  vix_forecaster: {
    key: 'vix_forecaster',
    name: 'VolCast',
    role: 'Volatility forecaster',
    hex: '#4FECCD',
  },
}

export function publicLabel(key: PublicModelKey | string): string {
  const m = (PUBLIC_MODELS as Record<string, PublicModel>)[key]
  if (!m) return String(key).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return m.name
}

export function publicModel(key: PublicModelKey | string): PublicModel | null {
  return (PUBLIC_MODELS as Record<string, PublicModel>)[key] ?? null
}

export function allPublicModels(): PublicModel[] {
  return Object.values(PUBLIC_MODELS)
}
