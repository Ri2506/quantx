// ============================================================================
// QUANT X - SETTINGS PAGE
// User profile, trading preferences, broker connection, notifications
// Intellectia.ai Design System
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../contexts/AuthContext'
import { api, handleApiError } from '../../lib/api'
import {
  User,
  Shield,
  Bell,
  Wallet,
  TrendingUp,
  Settings,
  Save,
  AlertCircle,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
  MessageCircle,
  Lock,
  ArrowUpRight,
  Sparkles,
  ChevronDown,
  Check,
} from 'lucide-react'
import AppLayout from '@/components/shared/AppLayout'
import BrokerConnectTile, { BrokerName, BrokerStatus as BrokerConnStatus } from '@/components/broker/BrokerConnectTile'

// ============================================================================
// SETTINGS PAGE
// ============================================================================

export default function SettingsPage() {
  const router = useRouter()
  const { user, profile, refreshProfile, loading: authLoading } = useAuth()

  // Form states
  type TabKey = 'profile' | 'trading' | 'broker' | 'notifications' | 'tier' | 'kill_switch' | 'data'
  const [activeTab, setActiveTab] = useState<TabKey>('profile')
  // PR 25 — tier + kill-switch panel state
  const [tierInfo, setTierInfo] = useState<{ tier: 'free'|'pro'|'elite'; is_admin: boolean; copilot_daily_cap: number } | null>(null)
  // PR 117 — onboarding quiz recommendation. Same gap as /pricing (PR 115),
  // but for the in-app surface where existing users actually open the
  // tier panel. Best-effort fetch; failure is silent.
  const [quizRec, setQuizRec] = useState<{
    recommended_tier: 'free' | 'pro' | 'elite'
    risk_profile: 'conservative' | 'moderate' | 'aggressive' | null
  } | null>(null)
  useEffect(() => {
    let active = true
    // PR 118 — cache helper avoids re-hit on every settings nav.
    import('@/lib/onboardingStatusCache').then(({ getOnboardingStatus }) => {
      getOnboardingStatus().then((s) => {
        if (!active || !s || !s.completed || !s.recommended_tier) return
        setQuizRec({
          recommended_tier: s.recommended_tier,
          risk_profile: s.current_risk_profile,
        })
      })
    }).catch(() => {})
    return () => { active = false }
  }, [])
  const [killPauseHours, setKillPauseHours] = useState<number>(24)
  const [dataBusy, setDataBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Profile form
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone: '',
    capital: 100000,
  })

  // Trading form
  const [tradingForm, setTradingForm] = useState({
    risk_profile: 'moderate',
    trading_mode: 'signal_only',
    max_positions: 5,
    risk_per_trade: 2,
    fo_enabled: false,
    preferred_option_type: 'put_options',
    daily_loss_limit: 5,
    weekly_loss_limit: 10,
    monthly_loss_limit: 20,
    trailing_sl_enabled: true,
  })

  // Broker state — PR 6: 3-tile grid, one-click OAuth (Zerodha/Upstox) +
  // credentials modal (Angel One).
  const [brokerConnections, setBrokerConnections] = useState<
    Array<{
      broker_name: BrokerName
      status: BrokerConnStatus
      account_id: string | null
      last_synced_at: string | null
    }>
  >([])
  const [brokerBusy, setBrokerBusy] = useState<BrokerName | null>(null)
  const [angelModalOpen, setAngelModalOpen] = useState(false)
  const [angelForm, setAngelForm] = useState({
    api_key: '',
    client_id: '',
    password: '',
    totp_secret: '',
  })
  const [showAngelPassword, setShowAngelPassword] = useState(false)

  // Notification form
  const [notificationForm, setNotificationForm] = useState({
    notifications_enabled: true,
    email_signals: true,
    email_trades: true,
    push_enabled: false,
    push_signals: false,
    push_trades: false,
  })

  // Load profile data
  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || '',
        phone: profile.phone || '',
        capital: profile.capital || 100000,
      })
      setTradingForm({
        risk_profile: profile.risk_profile || 'moderate',
        trading_mode: profile.trading_mode || 'signal_only',
        max_positions: profile.max_positions || 5,
        risk_per_trade: profile.risk_per_trade || 2,
        fo_enabled: profile.fo_enabled || false,
        preferred_option_type: profile.preferred_option_type || 'put_options',
        daily_loss_limit: profile.daily_loss_limit || 5,
        weekly_loss_limit: profile.weekly_loss_limit || 10,
        monthly_loss_limit: profile.monthly_loss_limit || 20,
        trailing_sl_enabled: profile.trailing_sl_enabled ?? true,
      })
      setNotificationForm({
        notifications_enabled: profile.notifications_enabled ?? true,
        email_signals: true,
        email_trades: true,
        push_enabled: false,
        push_signals: false,
        push_trades: false,
      })
    }
  }, [profile])

  // Load per-broker connection list.
  const loadBrokerConnections = async () => {
    try {
      const resp = await api.broker.getConnections()
      setBrokerConnections(resp.brokers || [])
    } catch (err) {
      console.error('Failed to load broker connections:', err)
    }
  }

  useEffect(() => {
    if (user) loadBrokerConnections()
  }, [user])

  // No redirect — allow browsing without auth (middleware handles gating when Supabase is configured)

  // Save handlers
  const handleSaveProfile = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await api.user.updateProfile(profileForm)
      await refreshProfile()
      setMessage({ type: 'success', text: 'Profile updated successfully!' })
    } catch (err) {
      setMessage({ type: 'error', text: handleApiError(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTrading = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await api.user.updateProfile(tradingForm)
      await refreshProfile()
      setMessage({ type: 'success', text: 'Trading settings updated!' })
    } catch (err) {
      setMessage({ type: 'error', text: handleApiError(err) })
    } finally {
      setSaving(false)
    }
  }

  // One-click connect — Zerodha / Upstox use OAuth redirect. Angel One
  // opens the credentials modal (SmartAPI has no OAuth).
  const handleConnectBroker = async (broker: BrokerName) => {
    setMessage(null)
    if (broker === 'angelone') {
      setAngelModalOpen(true)
      return
    }
    setBrokerBusy(broker)
    try {
      const resp = await api.broker.initiateOAuth(broker)
      if (!resp.auth_url) {
        throw new Error('No auth URL returned from broker')
      }
      // Preserve state across redirect so /broker/callback can verify it.
      try {
        sessionStorage.setItem('broker_oauth_state', resp.state)
        sessionStorage.setItem('broker_oauth_broker', broker)
      } catch {}
      window.location.href = resp.auth_url
    } catch (err) {
      setMessage({ type: 'error', text: handleApiError(err) })
      setBrokerBusy(null)
    }
  }

  const handleDisconnectBroker = async (broker: BrokerName) => {
    setBrokerBusy(broker)
    setMessage(null)
    try {
      await api.broker.disconnect(broker)
      await loadBrokerConnections()
      setMessage({ type: 'success', text: `${broker} disconnected.` })
    } catch (err) {
      setMessage({ type: 'error', text: handleApiError(err) })
    } finally {
      setBrokerBusy(null)
    }
  }

  const handleAngelSubmit = async () => {
    setBrokerBusy('angelone')
    setMessage(null)
    try {
      await api.broker.connect({
        broker_name: 'angelone',
        api_key: angelForm.api_key,
        client_id: angelForm.client_id,
        password: angelForm.password,
        totp_secret: angelForm.totp_secret,
      })
      setAngelModalOpen(false)
      setAngelForm({ api_key: '', client_id: '', password: '', totp_secret: '' })
      await loadBrokerConnections()
      setMessage({ type: 'success', text: 'Angel One connected.' })
    } catch (err) {
      setMessage({ type: 'error', text: handleApiError(err) })
    } finally {
      setBrokerBusy(null)
    }
  }

  const handleSaveNotifications = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await api.user.updateProfile({
        notifications_enabled: notificationForm.notifications_enabled,
        push_enabled: notificationForm.push_signals || notificationForm.push_trades,
      })
      await refreshProfile()
      setMessage({ type: 'success', text: 'Notification settings updated!' })
    } catch (err) {
      setMessage({ type: 'error', text: handleApiError(err) })
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) {
    return (
      <AppLayout>
      <div className="flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
      </AppLayout>
    )
  }

  if (!user) return (
    <AppLayout>
    <div className="flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-sm animate-fade-in-up">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Settings className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-white">Sign in to access Settings</h2>
        <p className="text-d-text-muted text-sm">Manage your profile, trading preferences, and broker connection.</p>
        <a href="/login" className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-black rounded-full font-semibold hover:bg-primary-hover transition-all shadow-glow-primary">
          Sign In
        </a>
      </div>
    </div>
    </AppLayout>
  )

  // Left-rail nav. Most entries switch the inline panel; a few (`href`)
  // route to dedicated pages — WhatsApp (PR 60) and Security/2FA (PR 62)
  // are full flows with their own state, so they live on their own URLs
  // instead of being inlined here.
  type NavItem =
    | { id: TabKey; label: string; icon: typeof User; href?: undefined }
    | { id: string; label: string; icon: typeof User; href: string }
  const tabs: NavItem[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'broker', label: 'Broker', icon: Wallet },
    { id: 'trading', label: 'Risk profile', icon: TrendingUp },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'whatsapp', label: 'WhatsApp digest', icon: MessageCircle, href: '/settings/whatsapp' },
    { id: 'security', label: 'Security + 2FA', icon: Lock, href: '/settings/security' },
    { id: 'tier', label: 'Tier + billing', icon: Shield },
    { id: 'kill_switch', label: 'Kill switch', icon: AlertCircle },
    { id: 'data', label: 'Data', icon: Save },
  ]

  return (
    <AppLayout>
    <div className="relative px-4 md:px-6 py-6 md:py-8">
      <style>{`
        @keyframes settings-gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
      {/* Header */}
      <div className="mx-auto max-w-6xl mb-8">
        <div className="relative">
          {/* Subtle animated gradient accent behind header */}
          <div
            className="pointer-events-none absolute -left-4 -top-4 h-[calc(100%+32px)] w-[calc(100%+32px)] rounded-2xl opacity-30"
            style={{
              background: 'linear-gradient(135deg, rgba(0,240,255,0.04) 0%, rgba(146,80,255,0.04) 50%, rgba(13,142,214,0.04) 100%)',
              backgroundSize: '200% 200%',
              animation: 'settings-gradient-shift 8s ease-in-out infinite',
            }}
          />
          {/* Settings icon with glow */}
          <div className="relative inline-flex items-center gap-4 mb-2">
            <div className="relative">
              <div className="pointer-events-none absolute -inset-2 rounded-full bg-accent/[0.08] blur-lg" />
              <Settings className="relative w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white">Settings</h1>
          </div>
          <p className="text-sm text-d-text-muted mt-1">Manage your account and preferences</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              message.type === 'success'
                ? 'bg-up/10 border border-up/20'
                : 'bg-down/10 border border-down/20'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-up" />
            ) : (
              <AlertCircle className="w-5 h-5 text-down" />
            )}
            <p className={message.type === 'success' ? 'text-up' : 'text-down'}>
              {message.text}
            </p>
          </div>
        )}

        {/* PR 25 — left-rail tab navigation per Step 4 §5.3 */}
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
          <aside className="trading-surface !p-2 h-fit">
            <nav className="flex lg:flex-col gap-0.5 overflow-x-auto lg:overflow-visible">
              {tabs.map((tab) => {
                const external = 'href' in tab && !!tab.href
                const isActive = !external && activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (external) {
                        router.push(tab.href!)
                      } else {
                        setActiveTab(tab.id as TabKey)
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-2 text-[12px] rounded-md transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-white/[0.05] text-white'
                        : 'text-d-text-secondary hover:text-white hover:bg-white/[0.02]'
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 text-left">{tab.label}</span>
                    {external && <ArrowUpRight className="w-3 h-3 shrink-0 text-d-text-muted" />}
                  </button>
                )
              })}
            </nav>
          </aside>

          <div className="trading-surface !p-6 md:!p-8 min-h-[500px]">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Profile Information</h2>
                  <p className="text-sm text-d-text-muted">Update your personal details</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Full Name</label>
                    <input
                      type="text"
                      value={profileForm.full_name}
                      onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                      className="w-full px-4 py-3 bg-d-bg-sidebar border border-d-border rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Email</label>
                    <input
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="w-full px-4 py-3 bg-d-bg-sidebar border border-d-border rounded-lg text-d-text-muted cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Phone</label>
                    <input
                      type="tel"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="w-full px-4 py-3 bg-d-bg-sidebar border border-d-border rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">Trading Capital ({'\u20B9'})</label>
                    <input
                      type="number"
                      value={profileForm.capital}
                      onChange={(e) => setProfileForm({ ...profileForm, capital: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-d-bg-sidebar border border-d-border rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
                      min="10000"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-black rounded-full font-semibold btn-beam hover:bg-primary-hover transition-all disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            )}

            {/* Trading Tab */}
            {activeTab === 'trading' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Trading Preferences</h2>
                  <p className="text-sm text-d-text-muted">Configure your trading settings and risk management</p>
                </div>

                {profile && (
                  <div className="p-4 rounded-lg border border-d-border bg-d-bg-card">
                    <h3 className="text-sm font-medium text-white/80 mb-2">Execution Status</h3>
                    {(() => {
                      const start = profile.paper_trading_started_at ? new Date(profile.paper_trading_started_at) : profile.created_at ? new Date(profile.created_at) : null
                      const paperEnds = start ? new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000) : null
                      const liveEligible = !!profile.live_trading_whitelisted && paperEnds ? new Date() >= paperEnds : false
                      return (
                        <div className="space-y-1 text-sm text-d-text-muted">
                          <div>Mode: <span className="text-white">{liveEligible ? 'Live Eligible' : 'Paper Only'}</span></div>
                          <div>Paper trading until: <span className="text-white">{paperEnds ? paperEnds.toDateString() : 'N/A'}</span></div>
                          <div>Live whitelist: <span className="text-white">{profile.live_trading_whitelisted ? 'Yes' : 'No'}</span></div>
                          <div className="flex items-center justify-between">
                            <span>Kill switch:</span>
                            <button
                              onClick={async () => {
                                if (profile.kill_switch_active) {
                                  try {
                                    await api.user.updateProfile({ kill_switch_active: false })
                                    await refreshProfile()
                                    setMessage({ type: 'success', text: 'Kill switch deactivated.' })
                                  } catch {
                                    setMessage({ type: 'error', text: 'Failed to deactivate kill switch.' })
                                  }
                                } else {
                                  if (!confirm('WARNING: This will close ALL open positions and pause trading. Continue?')) return
                                  try {
                                    await api.trades.killSwitch()
                                    await refreshProfile()
                                    setMessage({ type: 'success', text: 'Kill switch activated. All positions closed.' })
                                  } catch {
                                    setMessage({ type: 'error', text: 'Failed to activate kill switch.' })
                                  }
                                }
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                                profile.kill_switch_active
                                  ? 'border-2 border-down/40 bg-down/5 text-down hover:bg-down/10'
                                  : 'bg-white/[0.04] border border-d-border text-d-text-muted hover:bg-white/[0.08]'
                              }`}
                            >
                              {profile.kill_switch_active ? 'ACTIVE \u2014 Deactivate' : 'Activate Kill Switch'}
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}

                <div className="space-y-6">
                  {/* Risk Profile */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-3">Risk Profile</label>
                    <div className="grid grid-cols-3 gap-3">
                      {['conservative', 'moderate', 'aggressive'].map((risk) => (
                        <button
                          key={risk}
                          onClick={() => setTradingForm({ ...tradingForm, risk_profile: risk })}
                          className={`p-4 rounded-lg border transition-all duration-200 ${
                            tradingForm.risk_profile === risk
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-d-border text-d-text-muted hover:border-white/20'
                          }`}
                        >
                          <span className="capitalize font-medium">{risk}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Trading Mode */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-3">Trading Mode</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'signal_only', label: 'Signals Only', desc: 'View signals, trade manually' },
                        { id: 'semi_auto', label: 'Semi-Auto', desc: 'Approve each trade' },
                        { id: 'full_auto', label: 'Full Auto', desc: 'Auto-execute trades' },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          onClick={() => setTradingForm({ ...tradingForm, trading_mode: mode.id })}
                          className={`p-4 rounded-lg border transition-all duration-200 text-left ${
                            tradingForm.trading_mode === mode.id
                              ? 'border-primary bg-primary/10'
                              : 'border-d-border hover:border-white/20'
                          }`}
                        >
                          <span className={`font-medium ${tradingForm.trading_mode === mode.id ? 'text-primary' : 'text-white'}`}>
                            {mode.label}
                          </span>
                          <p className="text-xs text-d-text-muted mt-1">{mode.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Position Settings */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">Max Positions</label>
                      <input
                        type="number"
                        value={tradingForm.max_positions}
                        onChange={(e) => setTradingForm({ ...tradingForm, max_positions: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-d-bg-sidebar border border-d-border rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
                        min="1"
                        max="20"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-2">Risk Per Trade (%)</label>
                      <input
                        type="number"
                        value={tradingForm.risk_per_trade}
                        onChange={(e) => setTradingForm({ ...tradingForm, risk_per_trade: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-d-bg-sidebar border border-d-border rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
                        min="0.5"
                        max="10"
                        step="0.5"
                      />
                    </div>
                  </div>

                  {/* Loss Limits */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-3">Loss Limits (%)</label>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-d-text-muted mb-1">Daily</label>
                        <input
                          type="number"
                          value={tradingForm.daily_loss_limit}
                          onChange={(e) => setTradingForm({ ...tradingForm, daily_loss_limit: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-d-bg-sidebar border border-d-border rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-d-text-muted mb-1">Weekly</label>
                        <input
                          type="number"
                          value={tradingForm.weekly_loss_limit}
                          onChange={(e) => setTradingForm({ ...tradingForm, weekly_loss_limit: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-d-bg-sidebar border border-d-border rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-d-text-muted mb-1">Monthly</label>
                        <input
                          type="number"
                          value={tradingForm.monthly_loss_limit}
                          onChange={(e) => setTradingForm({ ...tradingForm, monthly_loss_limit: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-d-bg-sidebar border border-d-border rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-primary/40"
                        />
                      </div>
                    </div>
                  </div>

                  {/* F&O Settings */}
                  <div className="p-4 bg-d-bg-card border border-d-border rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-medium text-white">F&O Trading</h3>
                        <p className="text-sm text-d-text-muted">Enable futures & options trading</p>
                      </div>
                      <button
                        onClick={() => setTradingForm({ ...tradingForm, fo_enabled: !tradingForm.fo_enabled })}
                        className={`w-12 h-6 rounded-full transition-colors duration-200 ${
                          tradingForm.fo_enabled ? 'bg-primary' : 'bg-white/[0.04]'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
                          tradingForm.fo_enabled ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                    {tradingForm.fo_enabled && (
                      <div>
                        <label className="block text-sm text-d-text-muted mb-2">Preferred Option Type</label>
                        <select
                          value={tradingForm.preferred_option_type}
                          onChange={(e) => setTradingForm({ ...tradingForm, preferred_option_type: e.target.value })}
                          className="w-full px-3 py-2 bg-d-bg-sidebar border border-d-border rounded-lg text-white focus:outline-none focus:border-primary/40"
                        >
                          <option value="put_options">Put Options</option>
                          <option value="futures">Futures</option>
                          <option value="both">Both</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Trailing SL */}
                  <div className="flex items-center justify-between p-4 bg-d-bg-card border border-d-border rounded-lg">
                    <div>
                      <h3 className="font-medium text-white">Trailing Stop Loss</h3>
                      <p className="text-sm text-d-text-muted">Automatically trail SL as price moves in favor</p>
                    </div>
                    <button
                      onClick={() => setTradingForm({ ...tradingForm, trailing_sl_enabled: !tradingForm.trailing_sl_enabled })}
                      className={`w-12 h-6 rounded-full transition-colors duration-200 ${
                        tradingForm.trailing_sl_enabled ? 'bg-primary' : 'bg-white/[0.04]'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
                        tradingForm.trailing_sl_enabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleSaveTrading}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-black rounded-full font-semibold btn-beam hover:bg-primary-hover transition-all disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Settings
                </button>
              </div>
            )}

            {/* Broker Tab — PR 6: one-click OAuth for Zerodha + Upstox, credentials modal for Angel One */}
            {activeTab === 'broker' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Broker connection</h2>
                  <p className="text-sm text-d-text-muted">
                    Click a broker to connect via one-click OAuth. Live trading unlocks after connection on Elite tier.
                  </p>
                </div>

                {message?.type === 'error' && activeTab === 'broker' && (
                  <div className="p-3 bg-down/10 border border-down/20 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-down mt-0.5 shrink-0" />
                    <p className="text-sm text-down">{message.text}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(['zerodha', 'upstox', 'angelone'] as BrokerName[]).map((b) => {
                    const row = brokerConnections.find((c) => c.broker_name === b)
                    return (
                      <BrokerConnectTile
                        key={b}
                        broker={b}
                        status={(row?.status as BrokerConnStatus) || 'not_connected'}
                        accountId={row?.account_id}
                        lastSyncedAt={row?.last_synced_at}
                        busy={brokerBusy === b}
                        onConnect={() => handleConnectBroker(b)}
                        onDisconnect={() => handleDisconnectBroker(b)}
                      />
                    )
                  })}
                </div>

                <div className="trading-surface flex items-start gap-3">
                  <Shield className="w-4 h-4 text-d-text-muted mt-0.5 shrink-0" />
                  <div className="text-[12px] text-d-text-muted leading-relaxed space-y-1">
                    <p>
                      Credentials are encrypted with AES-256 (Fernet) before storage. Disconnect anytime to null stored tokens.
                    </p>
                    <p>
                      Zerodha Kite Connect requires a ₹2,000/month API subscription (paid to Zerodha, not us). Upstox and Angel One APIs are free.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Angel One credentials modal (SmartAPI has no OAuth redirect) */}
            {angelModalOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                onClick={() => !brokerBusy && setAngelModalOpen(false)}
              >
                <div
                  className="trading-surface w-full max-w-md space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div>
                    <h3 className="text-white font-semibold text-[16px]">Connect Angel One</h3>
                    <p className="text-[12px] text-d-text-muted mt-0.5">
                      SmartAPI credentials — get API key + TOTP secret from <a href="https://smartapi.angelbroking.com" target="_blank" rel="noreferrer" className="text-primary underline">smartapi.angelbroking.com</a>.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FieldInput
                      label="API key"
                      value={angelForm.api_key}
                      onChange={(v) => setAngelForm({ ...angelForm, api_key: v })}
                      placeholder="SmartAPI key"
                    />
                    <FieldInput
                      label="Client ID"
                      value={angelForm.client_id}
                      onChange={(v) => setAngelForm({ ...angelForm, client_id: v.toUpperCase() })}
                      placeholder="e.g. D12345"
                      uppercase
                    />
                    <FieldInput
                      label="PIN / Password"
                      value={angelForm.password}
                      onChange={(v) => setAngelForm({ ...angelForm, password: v })}
                      placeholder="Login password or MPIN"
                      type={showAngelPassword ? 'text' : 'password'}
                      adornment={
                        <button
                          type="button"
                          onClick={() => setShowAngelPassword(!showAngelPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-d-text-muted hover:text-white"
                        >
                          {showAngelPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      }
                    />
                    <FieldInput
                      label="TOTP secret"
                      value={angelForm.totp_secret}
                      onChange={(v) => setAngelForm({ ...angelForm, totp_secret: v.replace(/\s/g, '').toUpperCase() })}
                      placeholder="TOTP secret key"
                      mono
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => setAngelModalOpen(false)}
                      disabled={!!brokerBusy}
                      className="flex-1 py-2 text-[13px] text-d-text-secondary border border-d-border rounded-md hover:bg-white/[0.03] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAngelSubmit}
                      disabled={!!brokerBusy || !angelForm.api_key || !angelForm.client_id || !angelForm.password || !angelForm.totp_secret}
                      className="flex-1 py-2 text-[13px] font-medium bg-primary text-black rounded-md hover:bg-primary-hover transition-colors disabled:opacity-40"
                    >
                      {brokerBusy === 'angelone' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Connecting…
                        </span>
                      ) : (
                        'Connect Angel One'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}


            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Notification Preferences</h2>
                  <p className="text-sm text-d-text-muted">Choose how you want to be notified</p>
                </div>

                <div className="space-y-4">
                  {/* Master Toggle */}
                  <div className="flex items-center justify-between p-4 bg-d-bg-card border border-d-border rounded-lg">
                    <div>
                      <h3 className="font-medium text-white">Enable Notifications</h3>
                      <p className="text-sm text-d-text-muted">Receive alerts for signals, trades, and updates</p>
                    </div>
                    <button
                      onClick={() => setNotificationForm({ ...notificationForm, notifications_enabled: !notificationForm.notifications_enabled })}
                      className={`w-12 h-6 rounded-full transition-colors duration-200 ${
                        notificationForm.notifications_enabled ? 'bg-primary' : 'bg-white/[0.04]'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
                        notificationForm.notifications_enabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  {notificationForm.notifications_enabled && (
                    <>
                      {/* Email Notifications */}
                      <div className="p-4 bg-d-bg-card border border-d-border rounded-lg space-y-3">
                        <h3 className="font-medium text-white">Email Notifications</h3>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-white/60">New Signals</span>
                          <button
                            onClick={() => setNotificationForm({ ...notificationForm, email_signals: !notificationForm.email_signals })}
                            className={`w-10 h-5 rounded-full transition-colors duration-200 ${
                              notificationForm.email_signals ? 'bg-primary' : 'bg-white/[0.04]'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                              notificationForm.email_signals ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-white/60">Trade Executions</span>
                          <button
                            onClick={() => setNotificationForm({ ...notificationForm, email_trades: !notificationForm.email_trades })}
                            className={`w-10 h-5 rounded-full transition-colors duration-200 ${
                              notificationForm.email_trades ? 'bg-primary' : 'bg-white/[0.04]'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                              notificationForm.email_trades ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </div>
                      </div>

                      {/* Push Notifications */}
                      <div className="p-4 bg-d-bg-card border border-d-border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium text-white">Push -- Signal Alerts</h3>
                            <p className="text-xs text-d-text-muted">Get push notifications for new signals</p>
                          </div>
                          <button
                            onClick={() => setNotificationForm({ ...notificationForm, push_signals: !notificationForm.push_signals })}
                            className={`w-10 h-5 rounded-full transition-colors duration-200 ${
                              notificationForm.push_signals ? 'bg-primary' : 'bg-white/[0.04]'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                              notificationForm.push_signals ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </div>
                      </div>

                      <div className="p-4 bg-d-bg-card border border-d-border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium text-white">Push -- Trade Updates</h3>
                            <p className="text-xs text-d-text-muted">Get push notifications for trade executions</p>
                          </div>
                          <button
                            onClick={() => setNotificationForm({ ...notificationForm, push_trades: !notificationForm.push_trades })}
                            className={`w-10 h-5 rounded-full transition-colors duration-200 ${
                              notificationForm.push_trades ? 'bg-primary' : 'bg-white/[0.04]'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                              notificationForm.push_trades ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Cross-link to dedicated channel pages that have their own
                    opt-in flows (OTP, deep-links, TOTP). Sidebar already
                    shows these, but surfacing them from the channel tab
                    matches user intent when they come to "set up alerts". */}
                <div className="space-y-2">
                  <h3 className="text-[12px] uppercase tracking-wider text-d-text-muted">Additional channels</h3>
                  <button
                    type="button"
                    onClick={() => router.push('/settings/whatsapp')}
                    className="w-full flex items-center justify-between gap-3 p-4 rounded-lg border border-d-border bg-d-bg-card hover:bg-white/[0.03] transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <MessageCircle className="w-4 h-4 text-primary" />
                      <div>
                        <p className="text-[13px] font-medium text-white">WhatsApp daily digest</p>
                        <p className="text-[11px] text-d-text-muted">Pro+ — morning brief + evening summary</p>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-d-text-muted" />
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/onboarding/telegram')}
                    className="w-full flex items-center justify-between gap-3 p-4 rounded-lg border border-d-border bg-d-bg-card hover:bg-white/[0.03] transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Bell className="w-4 h-4 text-primary" />
                      <div>
                        <p className="text-[13px] font-medium text-white">Telegram bot</p>
                        <p className="text-[11px] text-d-text-muted">Free tier included — instant alerts + digest</p>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-d-text-muted" />
                  </button>
                </div>

                {/* PR 124 — watchlist preset pin manager. Cross-device
                    pins (PR 123) need a single surface to review and
                    edit; otherwise users have to open every symbol
                    individually to delete a pin. */}
                <WatchlistPinsPanel />

                <button
                  onClick={handleSaveNotifications}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-black rounded-full font-semibold btn-beam hover:bg-primary-hover transition-all disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Preferences
                </button>
              </div>
            )}

            {/* PR 25 — Tier + billing tab */}
            {activeTab === 'tier' && (
              <TierPanel
                tierInfo={tierInfo}
                onLoad={setTierInfo}
                setMessage={setMessage}
                quizRec={quizRec}
              />
            )}

            {/* PR 25 — Kill switch tab */}
            {activeTab === 'kill_switch' && (
              <KillSwitchPanel
                profile={profile}
                pauseHours={killPauseHours}
                setPauseHours={setKillPauseHours}
                onRefreshProfile={refreshProfile}
                setMessage={setMessage}
              />
            )}

            {/* PR 25 — Data tab */}
            {activeTab === 'data' && (
              <DataPanel
                busy={dataBusy}
                setBusy={setDataBusy}
                setMessage={setMessage}
              />
            )}
          </div>
        </div>
        </div>
      </div>
    </AppLayout>
  )
}

// ============================================================================
// PR 25 — Tier + billing tab
// ============================================================================

function TierPanel({
  tierInfo,
  onLoad,
  setMessage,
  quizRec,
}: {
  tierInfo: { tier: 'free'|'pro'|'elite'; is_admin: boolean; copilot_daily_cap: number } | null
  onLoad: (v: { tier: 'free'|'pro'|'elite'; is_admin: boolean; copilot_daily_cap: number }) => void
  setMessage: (m: { type: 'success'|'error'; text: string } | null) => void
  quizRec: { recommended_tier: 'free'|'pro'|'elite'; risk_profile: 'conservative'|'moderate'|'aggressive'|null } | null
}) {
  useEffect(() => {
    if (tierInfo) return
    api.user.getTier()
      .then((t) => onLoad({ tier: t.tier, is_admin: t.is_admin, copilot_daily_cap: t.copilot_daily_cap }))
      .catch(() => setMessage({ type: 'error', text: 'Failed to load tier info' }))
  }, [tierInfo, onLoad, setMessage])

  // PR 119 — per-session dismiss for the recommendation banner. Same
  // helper as /pricing so a dismiss in one surface mutes the other.
  const [recDismissed, setRecDismissed] = useState(false)
  // PR 121 — collapsed by default; expanding reveals 3-bullet delta.
  const [recExpanded, setRecExpanded] = useState(false)
  useEffect(() => {
    if (!quizRec) return
    let active = true
    import('@/lib/quizRecDismiss').then(({ isQuizRecDismissed }) => {
      if (!active) return
      if (quizRec.recommended_tier === 'free') return
      setRecDismissed(isQuizRecDismissed(quizRec.recommended_tier))
    }).catch(() => {})
    return () => { active = false }
  }, [quizRec])

  if (!tierInfo) {
    return <div className="flex items-center justify-center min-h-[200px]"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
  }

  // PR 93 — bullets aligned to /pricing static plans (PR 92) and to the
  // engine-name moat. Prior copy leaked internal product-spec codes
  // (F4 / F5 / F6) and used the deprecated "AI Auto-trader" framing
  // instead of the public engine name (AutoPilot). Pro bullets also
  // missed Portfolio Doctor + Weekly Review which are key Pro unlocks.
  const tierMeta: Record<string, { name: string; price: string; bullets: string[]; cta: string; href: string }> = {
    free: {
      name: 'Free',
      price: '\u20B90',
      bullets: [
        '1 swing signal / day',
        'Copilot 5 messages / day',
        'Paper trading + League',
        'Watchlist (5 symbols) + Telegram digest',
      ],
      cta: 'Upgrade to Pro',
      href: '/pricing',
    },
    pro: {
      name: 'Pro',
      price: '\u20B9999/mo',
      bullets: [
        'Unlimited swing + intraday signals',
        'Momentum Picks + Scanner Lab',
        'Copilot 150 messages / day',
        'WhatsApp digest + Alerts Studio',
        'Portfolio Doctor + Weekly Review',
      ],
      cta: 'Upgrade to Elite',
      href: '/pricing',
    },
    elite: {
      name: 'Elite',
      price: '\u20B91,999/mo',
      bullets: [
        'AutoPilot (live auto-trader)',
        'AI SIP portfolio + F&O strategies',
        'Counterpoint debate on signals',
        'Copilot unlimited',
        'Portfolio Doctor unlimited',
      ],
      cta: 'Manage billing',
      href: '/pricing',
    },
  }
  const current = tierMeta[tierInfo.tier] ?? tierMeta.free
  // PR 117 — show quiz recommendation only when it's an actual upsell
  // vs the user's current tier. Mirrors the /pricing gating (PR 115)
  // so we never present a "downgrade" suggestion.
  const tierRank = (t: 'free'|'pro'|'elite') => (t === 'elite' ? 2 : t === 'pro' ? 1 : 0)
  const showQuizRec =
    quizRec &&
    quizRec.recommended_tier !== 'free' &&
    tierRank(quizRec.recommended_tier) > tierRank(tierInfo.tier) &&
    !recDismissed
  const recCopy = showQuizRec
    ? (quizRec!.recommended_tier === 'elite'
        ? { name: 'Elite', pitch: 'AutoPilot live auto-trader, AI SIP portfolio, F&O strategies, Counterpoint debate.' }
        : { name: 'Pro', pitch: 'Unlimited swing + intraday signals, Scanner Lab, 150 Copilot messages/day.' })
    : null
  // PR 120 — risk-profile-aware reasoning (mirrors /pricing). Generic
  // pitch if the quiz didn't capture risk_profile.
  const recReason = (() => {
    if (!showQuizRec || !quizRec || quizRec.recommended_tier === 'free') return null
    const r = quizRec.risk_profile
    const t = quizRec.recommended_tier
    if (!r) return null
    if (t === 'pro') {
      if (r === 'conservative') return 'Defensive profile — Pro adds Portfolio Doctor and the Weekly Review so you know what your holdings are doing without taking on more trades.'
      if (r === 'moderate')     return 'Balanced profile — unlimited swing signals + Scanner Lab give you enough setups per week without overwhelming the watchlist.'
      return 'Active profile — you said you trade weekly+; Pro removes the 1/day signal cap and unlocks intraday + WhatsApp digest.'
    }
    if (r === 'conservative') return 'Defensive profile — Elite\'s AI SIP portfolio + Counterpoint debate suit hands-off long-term capital better than active trading.'
    if (r === 'moderate')     return 'Balanced profile — Elite\'s AI SIP and unlimited Portfolio Doctor compound into a managed-portfolio outcome with light oversight.'
    return 'Active profile — AutoPilot, F&O strategies, and Counterpoint were built for traders who want full automation with override control.'
  })()
  // PR 121 — delta bullets per upgrade path (mirrors /pricing).
  // PR 123 — A/B variant. PR 125 — fire EXPERIMENT_EXPOSED on tier-tab
  // mount so Settings users count toward the denominator.
  const [recVariant, setRecVariant] = useState<'feature_led' | 'outcome_led'>('feature_led')
  useEffect(() => {
    if (!showQuizRec) return
    let active = true
    Promise.all([
      import('@/lib/abVariant'),
      import('@/lib/supabase').then((m) => m.supabase.auth.getUser()),
    ]).then(([mod, userResp]) => {
      if (!active) return
      const uid = userResp?.data?.user?.id ?? null
      const v = mod.getVariant('quiz_rec_delta_copy', ['feature_led', 'outcome_led'] as const, uid)
      setRecVariant(v)
      // PR 127 — tag exposure with tier so per-arm conversion is
      // decomposable by tier. tierInfo is non-null here since
      // showQuizRec is gated on it.
      void mod.reportExposure('quiz_rec_delta_copy', v, {
        current_tier: tierInfo?.tier ?? null,
      })
    }).catch(() => {})
    return () => { active = false }
  }, [showQuizRec, tierInfo?.tier])
  const recDelta: string[] | null = (() => {
    if (!showQuizRec || !quizRec || quizRec.recommended_tier === 'free') return null
    const key = `${tierInfo.tier}->${quizRec.recommended_tier}`
    const featureLed: Record<string, string[]> = {
      'free->pro': [
        'Unlimited swing + intraday signals (vs 1/day on Free)',
        'Scanner Lab unlocked — 50+ live screeners + Pattern Scanner',
        'Copilot 150 messages/day + WhatsApp digest + Portfolio Doctor',
      ],
      'free->elite': [
        'AutoPilot — live auto-trader with Kelly sizing + VIX overlay',
        'AI SIP portfolio + F&O strategies (Iron Condor, Straddle, etc.)',
        'Counterpoint debate on every high-stakes signal + unlimited Copilot',
      ],
      'pro->elite': [
        'AutoPilot live execution — your signals act on themselves',
        'AI SIP portfolio + F&O strategy generator',
        'Counterpoint Bull/Bear debate + Copilot unlimited (vs 150/day)',
      ],
    }
    const outcomeLed: Record<string, string[]> = {
      'free->pro': [
        'Stop missing setups — every qualifying breakout reaches you, not just one a day',
        'Find ideas faster — 50+ live scanners surface the next move in seconds',
        'Talk through every trade — Copilot 150/day + a Sunday review of what worked',
      ],
      'free->elite': [
        'Trade while you sleep — AutoPilot sizes positions and executes for you',
        'Build a long-term portfolio — AI SIP rebalances monthly, no manual work',
        'Pressure-test high-stakes calls — Bull vs Bear debate before you commit',
      ],
      'pro->elite': [
        'Cross the manual→automated line — AutoPilot acts on signals you already trust',
        'Compound passively — AI SIP runs alongside your active trades',
        'Get a second opinion on every big bet — Counterpoint debate per signal',
      ],
    }
    const map = recVariant === 'outcome_led' ? outcomeLed : featureLed
    return map[key] ?? null
  })()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Tier + billing</h2>
        <p className="text-sm text-d-text-muted">Your current plan, usage, and upgrade options.</p>
      </div>

      {showQuizRec && recCopy && (
        <div
          className="relative rounded-xl border px-4 py-3 pr-10"
          style={{
            borderColor: 'rgba(255,209,102,0.35)',
            background: 'linear-gradient(135deg, rgba(255,209,102,0.08) 0%, rgba(255,209,102,0.02) 100%)',
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,209,102,0.14)', border: '1px solid rgba(255,209,102,0.40)' }}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#FFD166]" />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-white">
                  Quiz recommended: <span className="text-[#FFD166]">{recCopy.name}</span>
                  {quizRec!.risk_profile && (
                    <span className="text-d-text-muted font-normal text-[11px] ml-2 capitalize">
                      · {quizRec!.risk_profile} risk profile
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-d-text-secondary mt-0.5 leading-relaxed">{recReason ?? recCopy.pitch}</p>
                {recDelta && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = !recExpanded
                      setRecExpanded(next)
                      // PR 122 — fire on expand only.
                      // PR 125 — tag with the variant rendered on this
                      // surface so /pricing and /settings share funnel
                      // decomposition by arm.
                      const tier = quizRec!.recommended_tier
                      if (next && (tier === 'pro' || tier === 'elite')) {
                        import('@/lib/reportUpgradeIntent').then(({ reportUpgradeIntent }) => {
                          void reportUpgradeIntent(tier, 'quiz_rec_what_changes', recVariant)
                        }).catch(() => {})
                      }
                    }}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#FFD166] hover:text-white transition-colors"
                    aria-expanded={recExpanded}
                  >
                    {recExpanded ? 'Hide' : 'What changes for you'}
                    <ChevronDown className={`w-3 h-3 transition-transform ${recExpanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
              </div>
            </div>
            <a
              href="/onboarding/risk-quiz"
              className="text-[11px] text-d-text-muted hover:text-white whitespace-nowrap"
            >
              Retake quiz →
            </a>
          </div>
          {recExpanded && recDelta && (
            <ul className="mt-2 ml-11 space-y-1.5">
              {recDelta.map((b) => (
                <li key={b} className="flex items-start gap-2 text-[11px] text-d-text-secondary leading-relaxed">
                  <CheckCircle className="w-3 h-3 text-[#FFD166] mt-0.5 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => {
              setRecDismissed(true)
              import('@/lib/quizRecDismiss').then(({ dismissQuizRec }) => {
                if (quizRec!.recommended_tier !== 'free') {
                  dismissQuizRec(quizRec!.recommended_tier)
                }
              }).catch(() => {})
            }}
            aria-label="Dismiss recommendation"
            className="absolute top-2 right-2 p-1 rounded text-d-text-muted hover:text-white hover:bg-white/[0.05]"
          >
            <span aria-hidden className="text-[12px] leading-none">×</span>
          </button>
        </div>
      )}

      <div
        className="trading-surface flex flex-col md:flex-row gap-5"
        style={{
          borderLeft: `3px solid ${tierInfo.tier === 'elite' ? '#FFD166' : tierInfo.tier === 'pro' ? '#4FECCD' : '#8E8E8E'}`,
        }}
      >
        <div className="flex-1">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[11px] uppercase tracking-wider text-d-text-muted">Current plan</span>
            {tierInfo.is_admin && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold">
                Admin
              </span>
            )}
          </div>
          <p className="numeric text-[28px] font-semibold text-white">{current.name}</p>
          <p className="numeric text-[13px] text-d-text-muted">{current.price}</p>
          <ul className="mt-3 space-y-1">
            {current.bullets.map((b) => (
              <li key={b} className="text-[12px] text-d-text-primary flex items-start gap-1.5">
                <CheckCircle className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-2 shrink-0 min-w-[180px]">
          {tierInfo.tier !== 'elite' && (
            <a
              href={current.href}
              onClick={() => {
                // PR 100 — fire UPGRADE_INITIATED so the conversion-funnel
                // report can credit the Settings panel for upgrades that
                // started here vs. /pricing direct.
                const target = tierInfo.tier === 'free' ? 'pro' : 'elite'
                import('@/lib/reportUpgradeIntent').then(({ reportUpgradeIntent }) => {
                  void reportUpgradeIntent(target, 'settings_tier_panel')
                }).catch(() => {})
              }}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12px] font-medium bg-primary text-black rounded-md hover:bg-primary-hover transition-colors"
            >
              {current.cta}
            </a>
          )}
          <a
            href="/pricing"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12px] border border-d-border text-white rounded-md hover:bg-white/[0.03] transition-colors"
          >
            Compare plans
          </a>
        </div>
      </div>

      <div className="trading-surface">
        <h3 className="text-[12px] uppercase tracking-wider text-d-text-muted mb-2">Copilot usage today</h3>
        <div className="flex items-baseline gap-2">
          <span className="numeric text-[24px] font-semibold text-white">{tierInfo.copilot_daily_cap}</span>
          <span className="text-[11px] text-d-text-muted">messages / day cap</span>
        </div>
        <p className="text-[11px] text-d-text-muted mt-2">
          Resets every 00:00 UTC. Exceeding the cap returns an upgrade prompt — no account penalty.
        </p>
      </div>

      <div className="trading-surface">
        <h3 className="text-[12px] uppercase tracking-wider text-d-text-muted mb-2">Billing history</h3>
        <p className="text-[12px] text-d-text-muted">
          Invoice download + Razorpay subscription details — wiring lands with the Razorpay webhook PR.
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// PR 25 — Kill switch tab
// ============================================================================

function KillSwitchPanel({
  profile,
  pauseHours,
  setPauseHours,
  onRefreshProfile,
  setMessage,
}: {
  profile: any
  pauseHours: number
  setPauseHours: (n: number) => void
  onRefreshProfile: () => Promise<void>
  setMessage: (m: { type: 'success'|'error'; text: string } | null) => void
}) {
  const [firing, setFiring] = useState(false)
  const active = !!profile?.kill_switch_active

  const fire = async () => {
    if (!confirm('This halts all auto-trading and cancels pending orders. Continue?')) return
    setFiring(true)
    try {
      await api.trades.killSwitch()
      await onRefreshProfile()
      setMessage({ type: 'success', text: 'Kill switch activated — auto-trading paused.' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to activate kill switch.' })
    } finally {
      setFiring(false)
    }
  }

  const clear = async () => {
    setFiring(true)
    try {
      await api.user.updateProfile({ kill_switch_active: false })
      await onRefreshProfile()
      setMessage({ type: 'success', text: 'Kill switch cleared.' })
    } catch {
      setMessage({ type: 'error', text: 'Failed to clear kill switch.' })
    } finally {
      setFiring(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Kill switch</h2>
        <p className="text-sm text-d-text-muted">
          Instantly pause auto-trading + cancel pending orders. Open positions are <strong>not</strong> liquidated —
          close them manually from the Portfolio page.
        </p>
      </div>

      <div
        className="trading-surface"
        style={{
          borderLeft: `3px solid ${active ? '#FF5947' : '#2D303D'}`,
          background: active ? 'rgba(255,89,71,0.05)' : undefined,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] uppercase tracking-wider text-d-text-muted">Status</p>
            <p
              className="text-[22px] font-semibold mt-1"
              style={{ color: active ? '#FF5947' : '#05B878' }}
            >
              {active ? 'ACTIVE — trading paused' : 'Armed'}
            </p>
          </div>
          {active ? (
            <button
              onClick={clear}
              disabled={firing}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium border border-d-border text-white rounded-md hover:bg-white/[0.03] transition-colors disabled:opacity-50"
            >
              {firing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Clear kill switch
            </button>
          ) : (
            <button
              onClick={fire}
              disabled={firing}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold bg-down text-white rounded-md hover:bg-down/90 transition-colors disabled:opacity-50"
            >
              {firing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertCircle className="w-3.5 h-3.5" />}
              Fire kill switch
            </button>
          )}
        </div>
      </div>

      <div className="trading-surface">
        <h3 className="text-[12px] uppercase tracking-wider text-d-text-muted mb-3">Auto-resume timer</h3>
        <p className="text-[12px] text-d-text-muted mb-3">
          Optional: auto-clear the kill switch after N hours so you don't forget to re-arm. Leaving it off keeps
          the switch active until you manually clear it.
        </p>
        <div className="flex items-center gap-2">
          {[4, 12, 24, 48].map((h) => (
            <button
              key={h}
              onClick={() => setPauseHours(h)}
              className={`px-3 py-1.5 text-[11px] rounded-md border transition-colors ${
                pauseHours === h
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-d-border text-d-text-muted hover:text-white'
              }`}
            >
              {h}h
            </button>
          ))}
          <span className="text-[11px] text-d-text-muted ml-2">
            (timer wiring lands with scheduler PR)
          </span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// PR 25 — Data tab
// ============================================================================

function DataPanel({
  busy,
  setBusy,
  setMessage,
}: {
  busy: boolean
  setBusy: (v: boolean) => void
  setMessage: (m: { type: 'success'|'error'; text: string } | null) => void
}) {
  const downloadJson = async () => {
    setBusy(true)
    try {
      const [profile, trades, signals] = await Promise.all([
        api.user.getProfile().catch(() => null),
        api.trades.getAll?.({}).catch(() => null),
        api.signals.getToday().catch(() => null),
      ])
      const payload = {
        exported_at: new Date().toISOString(),
        profile,
        trades,
        signals,
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `swingai-export-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMessage({ type: 'success', text: 'Data exported.' })
    } catch {
      setMessage({ type: 'error', text: 'Export failed. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Data + account</h2>
        <p className="text-sm text-d-text-muted">Export everything we have on you, or delete your account outright.</p>
      </div>

      <div className="trading-surface space-y-2">
        <h3 className="text-[13px] font-medium text-white">Download my data (GDPR-style)</h3>
        <p className="text-[12px] text-d-text-muted">
          JSON export of your profile, trades, signals, and preferences. Does not include password hashes or
          broker tokens — those are encrypted at rest and never leave our infrastructure.
        </p>
        <button
          onClick={downloadJson}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-[12px] border border-d-border text-white rounded-md hover:bg-white/[0.03] transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Download JSON
        </button>
      </div>

      <div className="trading-surface space-y-2" style={{ borderLeft: '3px solid #FF5947' }}>
        <h3 className="text-[13px] font-medium text-down">Delete account</h3>
        <p className="text-[12px] text-d-text-muted">
          Permanently deletes your profile, trades, signals, watchlists, and broker connections. Irreversible.
          Subscriptions are cancelled + refunded if inside the 7-day window.
        </p>
        <button
          onClick={() => setMessage({ type: 'error', text: 'Delete-account flow is pending admin-signoff wiring.' })}
          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium bg-down/10 border border-down/30 text-down rounded-md hover:bg-down/20 transition-colors"
        >
          Delete account…
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// FieldInput — tiny helper used in Angel One credentials modal
// ============================================================================

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  mono,
  uppercase,
  adornment,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  mono?: boolean
  uppercase?: boolean
  adornment?: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-d-text-secondary mb-1">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={`w-full px-3 py-2 bg-[#0A0D14] border border-d-border rounded-md text-[13px] text-white placeholder:text-d-text-muted focus:outline-none focus:border-primary/50 ${
            mono ? 'font-mono tracking-wider' : ''
          } ${uppercase ? 'uppercase' : ''}`}
        />
        {adornment}
      </div>
    </div>
  )
}

// ============================================================================
// PR 124 — Watchlist preset pin manager
// ============================================================================
//
// Single surface for the user to review + delete watchlist alert preset
// pins (PR 122/123). Without this, removing a pin meant opening that
// specific symbol's alert modal — a friction point that grew with the
// pin count. Reads from /api/user/ui-preferences (PR 123) so all
// devices see the same view.

const PRESET_LABEL: Record<string, string> = {
  pct5: '±5%',
  pct10: '±10%',
  pct5_breakout: '+5% breakout',
  pct5_drop: '−5% drop',
  atr1: '±1× ATR',
  atr2: '±2× ATR',
}

function WatchlistPinsPanel() {
  const [pins, setPins] = useState<Record<string, string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // PR 125 — bulk-apply state.
  const [bulkOpen, setBulkOpen] = useState(false)
  const [watchlist, setWatchlist] = useState<string[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkPreset, setBulkPreset] = useState<string>('atr2')
  // PR 126 — search filter for users with 50+ symbol watchlists.
  const [bulkFilter, setBulkFilter] = useState('')
  // PR 127 — undo state for the last bulk apply. Bulk-apply overwrites
  // existing per-symbol pins, which is destructive. The undo snapshot
  // captures the pre-apply pin map; clicking Undo restores it. ~10s
  // visibility — long enough to react, short enough to not linger.
  const [undoSnapshot, setUndoSnapshot] = useState<Record<string, string> | null>(null)
  const [undoCountdown, setUndoCountdown] = useState(0)

  const reload = async () => {
    try {
      const r = await api.user.getUIPreferences()
      const p = (r?.ui_preferences?.watchlist_preset_pins || {}) as Record<string, string>
      setPins(p)
    } catch (err) {
      setError(handleApiError(err))
    }
  }
  useEffect(() => { void reload() }, [])

  const loadWatchlist = async () => {
    try {
      const r = await api.watchlist.getAll()
      const symbols = (r.watchlist || [])
        .map((w) => String(w.symbol || '').toUpperCase())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
      setWatchlist(symbols)
    } catch (err) {
      setError(handleApiError(err))
    }
  }
  const openBulk = async () => {
    setBulkOpen(true)
    setSelected(new Set())
    setBulkFilter('')
    if (watchlist === null) await loadWatchlist()
  }
  const toggleSelected = (sym: string) => {
    const next = new Set(selected)
    if (next.has(sym)) next.delete(sym)
    else next.add(sym)
    setSelected(next)
  }
  // PR 126 — Select-all targets the filtered subset so a user can
  // narrow with the search box and bulk-pick just that group.
  const filteredWatchlist = (() => {
    if (!watchlist) return [] as string[]
    const q = bulkFilter.trim().toUpperCase()
    if (!q) return watchlist
    return watchlist.filter((s) => s.includes(q))
  })()
  const selectAll = () => setSelected(new Set(filteredWatchlist))
  const selectNone = () => setSelected(new Set())
  const applyBulk = async () => {
    if (selected.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.user.getUIPreferences()
      const before = { ...((r?.ui_preferences?.watchlist_preset_pins || {}) as Record<string, string>) }
      const cur = { ...before }
      Array.from(selected).forEach((sym) => { cur[sym] = bulkPreset })
      const merged = { ...(r?.ui_preferences || {}), watchlist_preset_pins: cur }
      await api.user.updateUIPreferences(merged)
      // Mirror to sessionStorage so an immediate watchlist visit picks
      // them up without a tab reload.
      try {
        const m = await import('@/lib/watchlistPresetMemory')
        Array.from(selected).forEach((sym) => {
          m.saveAlertPreset(bulkPreset as any, { symbol: sym, perSymbol: true })
        })
      } catch {}
      setPins(cur)
      setBulkOpen(false)
      // PR 127 — capture pre-apply snapshot for the undo affordance.
      setUndoSnapshot(before)
      setUndoCountdown(10)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setBusy(false)
    }
  }

  // PR 127 — undo countdown timer. Clears the snapshot when it hits 0.
  useEffect(() => {
    if (undoCountdown <= 0) {
      if (undoSnapshot) setUndoSnapshot(null)
      return
    }
    const t = setTimeout(() => setUndoCountdown((c) => c - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoCountdown])

  const undoBulk = async () => {
    if (!undoSnapshot) return
    setBusy(true)
    setError(null)
    try {
      const r = await api.user.getUIPreferences()
      const merged = { ...(r?.ui_preferences || {}), watchlist_preset_pins: undoSnapshot }
      await api.user.updateUIPreferences(merged)
      // Reconcile sessionStorage: clear keys that were added, restore
      // keys that were overwritten with their prior value.
      try {
        const m = await import('@/lib/watchlistPresetMemory')
        const cur = (await api.user.getUIPreferences())?.ui_preferences?.watchlist_preset_pins || {}
        // For every symbol currently pinned but not in snapshot, drop.
        for (const sym of Object.keys(cur)) {
          if (!(sym in undoSnapshot)) m.clearSymbolPreset(sym)
        }
        // Restore snapshot values to sessionStorage too.
        for (const [sym, pid] of Object.entries(undoSnapshot)) {
          m.saveAlertPreset(pid as any, { symbol: sym, perSymbol: true })
        }
      } catch {}
      setPins(undoSnapshot)
      setUndoSnapshot(null)
      setUndoCountdown(0)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const removeOne = async (symbol: string) => {
    if (!pins) return
    setBusy(true)
    setError(null)
    try {
      const next = { ...pins }
      delete next[symbol]
      const r = await api.user.getUIPreferences()
      const merged = { ...(r?.ui_preferences || {}), watchlist_preset_pins: next }
      await api.user.updateUIPreferences(merged)
      setPins(next)
      // PR 124 — also drop the per-tab sessionStorage entry so the next
      // modal open for this symbol doesn't auto-apply the deleted pin.
      try {
        const m = await import('@/lib/watchlistPresetMemory')
        m.clearSymbolPreset(symbol)
      } catch {}
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const clearAll = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await api.user.getUIPreferences()
      const merged = { ...(r?.ui_preferences || {}), watchlist_preset_pins: {} }
      await api.user.updateUIPreferences(merged)
      // Drop sessionStorage entries for any symbols we know about.
      if (pins) {
        try {
          const m = await import('@/lib/watchlistPresetMemory')
          for (const sym of Object.keys(pins)) m.clearSymbolPreset(sym)
        } catch {}
      }
      setPins({})
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setBusy(false)
    }
  }

  if (pins === null) {
    return (
      <div className="p-4 bg-d-bg-card border border-d-border rounded-lg">
        <Loader2 className="w-4 h-4 text-primary animate-spin" />
      </div>
    )
  }

  const entries = Object.entries(pins)

  return (
    <div className="p-4 bg-d-bg-card border border-d-border rounded-lg space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-white">Watchlist alert pins</h3>
          <p className="text-[12px] text-d-text-muted">
            Per-symbol presets that override your global default. Synced across devices.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openBulk}
            disabled={busy}
            className="text-[11px] text-primary hover:text-primary-hover disabled:opacity-50 transition-colors"
          >
            Bulk apply
          </button>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              disabled={busy}
              className="text-[11px] text-d-text-muted hover:text-down disabled:opacity-50 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {undoSnapshot && undoCountdown > 0 && (
        <div className="rounded-md border border-primary/40 bg-primary/[0.06] px-3 py-2 flex items-center justify-between gap-2 text-[12px]">
          <span className="text-white">
            Bulk apply saved.{' '}
            <span className="text-d-text-muted">
              Reverts in {undoCountdown}s if you don&apos;t undo.
            </span>
          </span>
          <button
            type="button"
            onClick={undoBulk}
            disabled={busy}
            className="text-[11px] text-primary hover:text-primary-hover disabled:opacity-50 font-medium"
          >
            Undo
          </button>
        </div>
      )}

      {bulkOpen && (
        <div className="rounded-md border border-d-border bg-[#0A0D14] p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-medium text-white">Pick symbols + preset</p>
            <button
              type="button"
              onClick={() => setBulkOpen(false)}
              className="text-[11px] text-d-text-muted hover:text-white"
            >
              Cancel
            </button>
          </div>
          {watchlist === null ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : watchlist.length === 0 ? (
            <p className="text-[12px] text-d-text-muted">
              Your watchlist is empty. Add symbols first, then come back.
            </p>
          ) : (
            <>
              {/* PR 126 — search filter; only shown when watchlist
                  is large enough to be worth filtering. */}
              {watchlist.length > 8 && (
                <input
                  type="text"
                  value={bulkFilter}
                  onChange={(e) => setBulkFilter(e.target.value.toUpperCase())}
                  placeholder="Filter symbols (e.g. NIFTY)"
                  className="w-full bg-[#0E1220] border border-d-border rounded-md px-2.5 py-1.5 text-[12px] text-white placeholder:text-d-text-muted focus:outline-none focus:border-primary/50 font-mono"
                />
              )}
              <div className="flex items-center gap-2 text-[11px]">
                <button type="button" onClick={selectAll} className="text-d-text-muted hover:text-white">
                  Select all{bulkFilter ? ' (filtered)' : ''}
                </button>
                <span className="text-d-text-muted">·</span>
                <button type="button" onClick={selectNone} className="text-d-text-muted hover:text-white">
                  None
                </button>
                <span className="ml-auto text-d-text-muted">
                  {selected.size} selected{bulkFilter ? ` · ${filteredWatchlist.length} match` : ''}
                </span>
              </div>
              <div className="max-h-48 overflow-y-auto rounded border border-d-border divide-y divide-d-border">
                {filteredWatchlist.length === 0 ? (
                  <p className="px-2.5 py-2 text-[11px] text-d-text-muted">
                    No symbols match &ldquo;{bulkFilter}&rdquo;.
                  </p>
                ) : filteredWatchlist.map((sym) => (
                  <label key={sym} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] cursor-pointer hover:bg-white/[0.03]">
                    <input
                      type="checkbox"
                      checked={selected.has(sym)}
                      onChange={() => toggleSelected(sym)}
                      className="accent-primary"
                    />
                    <span className="font-mono text-white">{sym}</span>
                    {pins?.[sym] && (
                      <span className="ml-auto text-[10px] text-d-text-muted">
                        currently: {PRESET_LABEL[pins[sym]] ?? pins[sym]}
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-d-text-muted">Preset:</span>
                {(['pct5', 'pct10', 'pct5_breakout', 'pct5_drop', 'atr1', 'atr2'] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setBulkPreset(id)}
                    className={`px-2.5 py-1 rounded-md text-[10px] border transition-colors ${
                      bulkPreset === id
                        ? 'border-primary/60 bg-primary/[0.10] text-primary'
                        : 'border-d-border text-d-text-secondary hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    {PRESET_LABEL[id]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={applyBulk}
                disabled={busy || selected.size === 0}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium bg-primary text-black rounded-md hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Pin {PRESET_LABEL[bulkPreset]} to {selected.size} {selected.size === 1 ? 'symbol' : 'symbols'}
              </button>
            </>
          )}
        </div>
      )}
      {entries.length === 0 ? (
        <p className="text-[12px] text-d-text-muted">
          No pins yet. Open any watchlist alert and check &ldquo;Pin this preset to {'{SYMBOL}'}&rdquo; to start.
        </p>
      ) : (
        <ul className="divide-y divide-d-border rounded-md border border-d-border">
          {entries.sort(([a], [b]) => a.localeCompare(b)).map(([sym, presetId]) => (
            <li key={sym} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="text-[13px] font-mono text-white">{sym}</p>
                <p className="text-[11px] text-d-text-muted">
                  {PRESET_LABEL[presetId] ?? presetId}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeOne(sym)}
                disabled={busy}
                className="px-2 py-1 text-[11px] text-d-text-muted hover:text-down disabled:opacity-50 transition-colors"
                aria-label={`Remove pin for ${sym}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-[11px] text-down">{error}</p>
      )}
    </div>
  )
}
