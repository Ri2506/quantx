// ============================================================================
// SWINGAI - SETTINGS PAGE
// User profile, trading preferences, broker connection, notifications
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { api, handleApiError } from '../../lib/api'
import {
  User,
  Shield,
  Bell,
  Wallet,
  TrendingUp,
  Settings,
  ChevronRight,
  Save,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Loader2,
  Link2,
  Unlink,
} from 'lucide-react'

// ============================================================================
// SETTINGS PAGE
// ============================================================================

export default function SettingsPage() {
  const router = useRouter()
  const { user, profile, refreshProfile, loading: authLoading } = useAuth()

  // Form states
  const [activeTab, setActiveTab] = useState<'profile' | 'trading' | 'broker' | 'notifications'>('profile')
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

  // Broker form
  const [brokerForm, setBrokerForm] = useState({
    broker_name: 'zerodha',
    api_key: '',
    api_secret: '',
    client_id: '',
    totp_secret: '',
  })
  const [brokerStatus, setBrokerStatus] = useState<any>(null)

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
        push_signals: !!profile.push_enabled,
        push_trades: !!profile.push_enabled,
      })
    }
  }, [profile])

  // Load broker status
  useEffect(() => {
    const loadBrokerStatus = async () => {
      try {
        const status = await api.broker.getStatus()
        setBrokerStatus(status)
      } catch (err) {
        console.error('Failed to load broker status:', err)
      }
    }
    if (user) {
      loadBrokerStatus()
    }
  }, [user])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

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

  const handleConnectBroker = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await api.broker.connect(brokerForm)
      const status = await api.broker.getStatus()
      setBrokerStatus(status)
      setMessage({ type: 'success', text: 'Broker connected successfully!' })
      setBrokerForm({ ...brokerForm, api_key: '', api_secret: '', totp_secret: '' })
    } catch (err) {
      setMessage({ type: 'error', text: handleApiError(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnectBroker = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await api.broker.disconnect()
      setBrokerStatus({ connected: false })
      setMessage({ type: 'success', text: 'Broker disconnected.' })
    } catch (err) {
      setMessage({ type: 'error', text: handleApiError(err) })
    } finally {
      setSaving(false)
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
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-neon-cyan animate-spin" />
      </div>
    )
  }

  if (!user) return null

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'trading', label: 'Trading', icon: TrendingUp },
    { id: 'broker', label: 'Broker', icon: Wallet },
    { id: 'notifications', label: 'Notifications', icon: Bell },
  ] as const

  return (
    <div className="min-h-screen bg-background-primary px-4 md:px-6 py-6 md:py-8">
      {/* Header */}
      <div className="mx-auto max-w-6xl mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors">
              <ArrowLeft className="w-5 h-5 text-text-secondary" />
            </Link>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold"><span className="gradient-text-professional">Settings</span></h1>
              <p className="text-sm text-text-secondary">Manage your account and preferences</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto">
        {/* Message */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
              message.type === 'success'
                ? 'bg-neon-green/10 border border-neon-green/20'
                : 'bg-red-500/10 border border-red-500/30'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-neon-green" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400" />
            )}
            <p className={message.type === 'success' ? 'text-neon-green' : 'text-red-400'}>
              {message.text}
            </p>
          </motion.div>
        )}

        {/* Tab Navigation - horizontal scroll on mobile, vertical on lg */}
        <nav className="flex overflow-x-auto gap-2 pb-2 mb-6 lg:mb-0 lg:flex-col lg:overflow-visible lg:w-56 lg:float-left lg:mr-8 scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'glass-card-neu border border-neon-cyan/20 text-neon-cyan font-medium shadow-glow-sm'
                  : 'text-text-secondary hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
              <ChevronRight className={`w-4 h-4 ml-auto hidden lg:block ${activeTab === tab.id ? 'opacity-100' : 'opacity-0'}`} />
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="lg:overflow-hidden">
          <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6 md:p-8">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-text-primary mb-1">Profile Information</h2>
                    <p className="text-sm text-text-muted">Update your personal details</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">Full Name</label>
                      <input
                        type="text"
                        value={profileForm.full_name}
                        onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                        className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">Email</label>
                      <input
                        type="email"
                        value={user?.email || ''}
                        disabled
                        className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-text-muted cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">Phone</label>
                      <input
                        type="tel"
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                        placeholder="+91 98765 43210"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">Trading Capital ({'\u20B9'})</label>
                      <input
                        type="number"
                        value={profileForm.capital}
                        onChange={(e) => setProfileForm({ ...profileForm, capital: Number(e.target.value) })}
                        className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                        min="10000"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 btn-tv-gradient btn-press rounded-xl text-white font-medium shadow-glow-sm hover:shadow-glow-md transition-all disabled:opacity-50"
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
                    <h2 className="text-xl font-bold text-text-primary mb-1">Trading Preferences</h2>
                    <p className="text-sm text-text-muted">Configure your trading settings and risk management</p>
                  </div>

                  {profile && (
                    <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                      <h3 className="text-sm font-medium text-text-secondary mb-2">Execution Status</h3>
                      {(() => {
                        const start = profile.paper_trading_started_at ? new Date(profile.paper_trading_started_at) : profile.created_at ? new Date(profile.created_at) : null
                        const paperEnds = start ? new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000) : null
                        const liveEligible = !!profile.live_trading_whitelisted && paperEnds ? new Date() >= paperEnds : false
                        return (
                          <div className="space-y-1 text-sm text-text-muted">
                            <div>Mode: <span className="text-text-primary">{liveEligible ? 'Live Eligible' : 'Paper Only'}</span></div>
                            <div>Paper trading until: <span className="text-text-primary">{paperEnds ? paperEnds.toDateString() : 'N/A'}</span></div>
                            <div>Live whitelist: <span className="text-text-primary">{profile.live_trading_whitelisted ? 'Yes' : 'No'}</span></div>
                            <div>Kill switch: <span className="text-text-primary">{profile.kill_switch_active ? 'Active' : 'Off'}</span></div>
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  <div className="space-y-6">
                    {/* Risk Profile */}
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-3">Risk Profile</label>
                      <div className="grid grid-cols-3 gap-3">
                        {['conservative', 'moderate', 'aggressive'].map((risk) => (
                          <button
                            key={risk}
                            onClick={() => setTradingForm({ ...tradingForm, risk_profile: risk })}
                            className={`p-4 rounded-xl border transition-all ${
                              tradingForm.risk_profile === risk
                                ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan'
                                : 'border-white/[0.06] text-text-secondary hover:border-white/[0.12]'
                            }`}
                          >
                            <span className="capitalize font-medium">{risk}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Trading Mode */}
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-3">Trading Mode</label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { id: 'signal_only', label: 'Signals Only', desc: 'View signals, trade manually' },
                          { id: 'semi_auto', label: 'Semi-Auto', desc: 'Approve each trade' },
                          { id: 'full_auto', label: 'Full Auto', desc: 'Auto-execute trades' },
                        ].map((mode) => (
                          <button
                            key={mode.id}
                            onClick={() => setTradingForm({ ...tradingForm, trading_mode: mode.id })}
                            className={`p-4 rounded-xl border transition-all text-left ${
                              tradingForm.trading_mode === mode.id
                                ? 'border-neon-cyan bg-neon-cyan/10'
                                : 'border-white/[0.06] hover:border-white/[0.12]'
                            }`}
                          >
                            <span className={`font-medium ${tradingForm.trading_mode === mode.id ? 'text-neon-cyan' : 'text-text-primary'}`}>
                              {mode.label}
                            </span>
                            <p className="text-xs text-text-muted mt-1">{mode.desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Position Settings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Max Positions</label>
                        <input
                          type="number"
                          value={tradingForm.max_positions}
                          onChange={(e) => setTradingForm({ ...tradingForm, max_positions: Number(e.target.value) })}
                          className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                          min="1"
                          max="20"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Risk Per Trade (%)</label>
                        <input
                          type="number"
                          value={tradingForm.risk_per_trade}
                          onChange={(e) => setTradingForm({ ...tradingForm, risk_per_trade: Number(e.target.value) })}
                          className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                          min="0.5"
                          max="10"
                          step="0.5"
                        />
                      </div>
                    </div>

                    {/* Loss Limits */}
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-3">Loss Limits (%)</label>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs text-text-muted mb-1">Daily</label>
                          <input
                            type="number"
                            value={tradingForm.daily_loss_limit}
                            onChange={(e) => setTradingForm({ ...tradingForm, daily_loss_limit: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-lg text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-text-muted mb-1">Weekly</label>
                          <input
                            type="number"
                            value={tradingForm.weekly_loss_limit}
                            onChange={(e) => setTradingForm({ ...tradingForm, weekly_loss_limit: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-lg text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-text-muted mb-1">Monthly</label>
                          <input
                            type="number"
                            value={tradingForm.monthly_loss_limit}
                            onChange={(e) => setTradingForm({ ...tradingForm, monthly_loss_limit: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-lg text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                          />
                        </div>
                      </div>
                    </div>

                    {/* F&O Settings */}
                    <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="font-medium text-text-primary">F&O Trading</h3>
                          <p className="text-sm text-text-muted">Enable futures & options trading</p>
                        </div>
                        <button
                          onClick={() => setTradingForm({ ...tradingForm, fo_enabled: !tradingForm.fo_enabled })}
                          className={`w-12 h-6 rounded-full transition-colors ${
                            tradingForm.fo_enabled ? 'bg-neon-cyan' : 'bg-white/[0.06]'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                            tradingForm.fo_enabled ? 'translate-x-6' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </div>
                      {tradingForm.fo_enabled && (
                        <div>
                          <label className="block text-sm text-text-muted mb-2">Preferred Option Type</label>
                          <select
                            value={tradingForm.preferred_option_type}
                            onChange={(e) => setTradingForm({ ...tradingForm, preferred_option_type: e.target.value })}
                            className="w-full px-3 py-2 bg-white/[0.02] border border-white/[0.06] rounded-lg text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                          >
                            <option value="put_options">Put Options</option>
                            <option value="futures">Futures</option>
                            <option value="both">Both</option>
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Trailing SL */}
                    <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                      <div>
                        <h3 className="font-medium text-text-primary">Trailing Stop Loss</h3>
                        <p className="text-sm text-text-muted">Automatically trail SL as price moves in favor</p>
                      </div>
                      <button
                        onClick={() => setTradingForm({ ...tradingForm, trailing_sl_enabled: !tradingForm.trailing_sl_enabled })}
                        className={`w-12 h-6 rounded-full transition-colors ${
                          tradingForm.trailing_sl_enabled ? 'bg-neon-cyan' : 'bg-white/[0.06]'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          tradingForm.trailing_sl_enabled ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveTrading}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 btn-tv-gradient btn-press rounded-xl text-white font-medium shadow-glow-sm hover:shadow-glow-md transition-all disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Settings
                  </button>
                </div>
              )}

              {/* Broker Tab */}
              {activeTab === 'broker' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-text-primary mb-1">Broker Connection</h2>
                    <p className="text-sm text-text-muted">Connect your broker for auto-trading</p>
                  </div>

                  {/* Current Status */}
                  {brokerStatus?.connected ? (
                    <div className="p-4 bg-neon-green/10 border border-neon-green/20 rounded-xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-neon-green/20 rounded-full flex items-center justify-center">
                            <Link2 className="w-5 h-5 text-neon-green" />
                          </div>
                          <div>
                            <p className="font-medium text-neon-green">Connected to {brokerStatus.broker_name}</p>
                            <p className="text-sm text-text-muted">Last synced: {brokerStatus.last_sync ? new Date(brokerStatus.last_sync).toLocaleString() : 'Never'}</p>
                          </div>
                        </div>
                        <button
                          onClick={handleDisconnectBroker}
                          disabled={saving}
                          className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
                        >
                          <Unlink className="w-4 h-4" />
                          Disconnect
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Select Broker</label>
                        <select
                          value={brokerForm.broker_name}
                          onChange={(e) => setBrokerForm({ ...brokerForm, broker_name: e.target.value })}
                          className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                        >
                          <option value="zerodha">Zerodha</option>
                          <option value="angelone">Angel One</option>
                          <option value="upstox">Upstox</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-2">API Key</label>
                          <input
                            type="text"
                            value={brokerForm.api_key}
                            onChange={(e) => setBrokerForm({ ...brokerForm, api_key: e.target.value })}
                            className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                            placeholder="Your API key"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-2">API Secret</label>
                          <input
                            type="password"
                            value={brokerForm.api_secret}
                            onChange={(e) => setBrokerForm({ ...brokerForm, api_secret: e.target.value })}
                            className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                            placeholder="Your API secret"
                          />
                        </div>
                        {brokerForm.broker_name === 'angelone' && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-text-secondary mb-2">Client ID</label>
                              <input
                                type="text"
                                value={brokerForm.client_id}
                                onChange={(e) => setBrokerForm({ ...brokerForm, client_id: e.target.value })}
                                className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                                placeholder="Your client ID"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-text-secondary mb-2">TOTP Secret</label>
                              <input
                                type="password"
                                value={brokerForm.totp_secret}
                                onChange={(e) => setBrokerForm({ ...brokerForm, totp_secret: e.target.value })}
                                className="w-full px-4 py-3 bg-white/[0.02] border border-white/[0.06] rounded-xl text-text-primary focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                                placeholder="TOTP secret for 2FA"
                              />
                            </div>
                          </>
                        )}
                      </div>

                      <button
                        onClick={handleConnectBroker}
                        disabled={saving || !brokerForm.api_key}
                        className="flex items-center gap-2 px-6 py-3 btn-tv-gradient btn-press rounded-xl text-white font-medium shadow-glow-sm hover:shadow-glow-md transition-all disabled:opacity-50"
                      >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                        Connect Broker
                      </button>
                    </div>
                  )}

                  {/* Help */}
                  <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                    <h3 className="font-medium text-text-primary mb-2">How to get API credentials?</h3>
                    <ul className="text-sm text-text-muted space-y-1">
                      <li>&#8226; <strong>Zerodha:</strong> Go to kite.zerodha.com &rarr; My Profile &rarr; API</li>
                      <li>&#8226; <strong>Angel One:</strong> Go to smartapi.angelbroking.com &rarr; Create App</li>
                      <li>&#8226; <strong>Upstox:</strong> Go to upstox.com/developer &rarr; Create App</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-text-primary mb-1">Notification Preferences</h2>
                    <p className="text-sm text-text-muted">Choose how you want to be notified</p>
                  </div>

                  <div className="space-y-4">
                    {/* Master Toggle */}
                    <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                      <div>
                        <h3 className="font-medium text-text-primary">Enable Notifications</h3>
                        <p className="text-sm text-text-muted">Receive alerts for signals, trades, and updates</p>
                      </div>
                      <button
                        onClick={() => setNotificationForm({ ...notificationForm, notifications_enabled: !notificationForm.notifications_enabled })}
                        className={`w-12 h-6 rounded-full transition-colors ${
                          notificationForm.notifications_enabled ? 'bg-neon-cyan' : 'bg-white/[0.06]'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          notificationForm.notifications_enabled ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>

                    {notificationForm.notifications_enabled && (
                      <>
                        {/* Email Notifications */}
                        <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
                          <h3 className="font-medium text-text-primary">Email Notifications</h3>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-text-secondary">New Signals</span>
                            <button
                              onClick={() => setNotificationForm({ ...notificationForm, email_signals: !notificationForm.email_signals })}
                              className={`w-10 h-5 rounded-full transition-colors ${
                                notificationForm.email_signals ? 'bg-neon-cyan' : 'bg-white/[0.06]'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                notificationForm.email_signals ? 'translate-x-5' : 'translate-x-0.5'
                              }`} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-text-secondary">Trade Executions</span>
                            <button
                              onClick={() => setNotificationForm({ ...notificationForm, email_trades: !notificationForm.email_trades })}
                              className={`w-10 h-5 rounded-full transition-colors ${
                                notificationForm.email_trades ? 'bg-neon-cyan' : 'bg-white/[0.06]'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                notificationForm.email_trades ? 'translate-x-5' : 'translate-x-0.5'
                              }`} />
                            </button>
                          </div>
                        </div>

                        {/* Push Notifications */}
                        <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-medium text-text-primary">Push — Signal Alerts</h3>
                              <p className="text-xs text-text-muted">Get push notifications for new signals</p>
                            </div>
                            <button
                              onClick={() => setNotificationForm({ ...notificationForm, push_signals: !notificationForm.push_signals })}
                              className={`w-10 h-5 rounded-full transition-colors ${
                                notificationForm.push_signals ? 'bg-neon-cyan' : 'bg-white/[0.06]'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                notificationForm.push_signals ? 'translate-x-5' : 'translate-x-0.5'
                              }`} />
                            </button>
                          </div>
                        </div>

                        <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-medium text-text-primary">Push — Trade Updates</h3>
                              <p className="text-xs text-text-muted">Get push notifications for trade executions</p>
                            </div>
                            <button
                              onClick={() => setNotificationForm({ ...notificationForm, push_trades: !notificationForm.push_trades })}
                              className={`w-10 h-5 rounded-full transition-colors ${
                                notificationForm.push_trades ? 'bg-neon-cyan' : 'bg-white/[0.06]'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                                notificationForm.push_trades ? 'translate-x-5' : 'translate-x-0.5'
                              }`} />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <button
                    onClick={handleSaveNotifications}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 btn-tv-gradient btn-press rounded-xl text-white font-medium shadow-glow-sm hover:shadow-glow-md transition-all disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Preferences
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
  )
}
