// ============================================================================
// SWINGAI - SUBSCRIPTION & PAYMENT PAGE
// Complete Razorpay Integration for Indian Users
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Check, Zap, Shield, Star, ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'
import GradientBorder from '@/components/ui/GradientBorder'

// ============================================================================
// TYPES
// ============================================================================

interface Plan {
  id: string
  name: string
  display_name: string
  description: string
  price_monthly: number
  price_quarterly: number
  price_yearly: number
  max_signals_per_day: number
  max_positions: number
  max_capital: number
  signal_only: boolean
  semi_auto: boolean
  full_auto: boolean
  equity_trading: boolean
  futures_trading: boolean
  options_trading: boolean
  telegram_alerts: boolean
  priority_support: boolean
  api_access: boolean
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  handler: (response: RazorpayResponse) => void
  prefill: {
    name: string
    email: string
    contact: string
  }
  theme: {
    color: string
  }
}

interface RazorpayResponse {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => {
      open: () => void
    }
  }
}

// ============================================================================
// PRICING CARD COMPONENT
// ============================================================================

function PricingCard({
  plan,
  billingPeriod,
  currentPlan,
  onSelect,
  loading
}: {
  plan: Plan
  billingPeriod: 'monthly' | 'quarterly' | 'yearly'
  currentPlan: string | null
  onSelect: (plan: Plan) => void
  loading: boolean
}) {
  const isPopular = plan.name === 'pro'
  const isCurrent = currentPlan === plan.id

  const getPrice = () => {
    switch (billingPeriod) {
      case 'monthly': return plan.price_monthly
      case 'quarterly': return plan.price_quarterly
      case 'yearly': return plan.price_yearly
    }
  }

  const getMonthlyEquivalent = () => {
    const price = getPrice()
    switch (billingPeriod) {
      case 'monthly': return price
      case 'quarterly': return price / 3
      case 'yearly': return price / 12
    }
  }

  const getSavings = () => {
    if (billingPeriod === 'monthly') return 0
    const monthlyTotal = plan.price_monthly * (billingPeriod === 'quarterly' ? 3 : 12)
    return monthlyTotal - getPrice()
  }

  const formatPrice = (paise: number) => {
    return `₹${(paise / 100).toLocaleString('en-IN')}`
  }

  const features = [
    { label: `${plan.max_signals_per_day} signals/day`, included: true },
    { label: `${plan.max_positions} max positions`, included: true },
    { label: `₹${(plan.max_capital / 100000).toFixed(0)}L max capital`, included: true },
    { label: 'Signal-only mode', included: plan.signal_only },
    { label: 'Semi-auto trading', included: plan.semi_auto },
    { label: 'Full-auto trading', included: plan.full_auto },
    { label: 'Equity trading', included: plan.equity_trading },
    { label: 'Futures trading', included: plan.futures_trading },
    { label: 'Options trading', included: plan.options_trading },
    { label: 'Push notifications', included: plan.telegram_alerts },
    { label: 'Priority support', included: plan.priority_support },
    { label: 'API access', included: plan.api_access },
  ]

  const cardContent = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      className={`relative rounded-2xl p-8 transition-all ${
        isPopular
          ? 'bg-gradient-to-b from-neon-cyan/90 to-neon-cyan/70 text-text-primary ring-4 ring-neon-cyan/30 scale-105'
          : 'glass-card-neu text-text-primary border border-white/[0.04] hover:border-white/[0.06]'
      }`}
    >
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-black text-sm font-bold rounded-full flex items-center gap-1">
          <Star className="w-4 h-4" /> MOST POPULAR
        </div>
      )}

      {isCurrent && (
        <div className="absolute -top-4 right-4 px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">
          CURRENT PLAN
        </div>
      )}

      {/* Plan Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          {plan.name === 'free' && <Zap className="w-5 h-5 text-text-secondary" />}
          {plan.name === 'starter' && <Zap className="w-5 h-5 text-neon-cyan" />}
          {plan.name === 'pro' && <Shield className="w-5 h-5 text-neon-gold" />}
          <h3 className="text-xl font-bold">{plan.display_name}</h3>
        </div>
        <p className={`text-sm ${isPopular ? 'text-neon-cyan/80' : 'text-text-secondary'}`}>
          {plan.description}
        </p>
      </div>

      {/* Price */}
      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold">{formatPrice(getMonthlyEquivalent())}</span>
          <span className={isPopular ? 'text-neon-cyan/80' : 'text-text-secondary'}>/month</span>
        </div>
        {billingPeriod !== 'monthly' && (
          <div className="mt-1">
            <span className={`text-sm ${isPopular ? 'text-neon-cyan/80' : 'text-text-secondary'}`}>
              Billed {formatPrice(getPrice())} {billingPeriod}
            </span>
            {getSavings() > 0 && (
              <span className="ml-2 text-sm text-neon-green font-medium">
                Save {formatPrice(getSavings())}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-3 mb-8">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2">
            <Check className={`w-5 h-5 flex-shrink-0 ${
              feature.included
                ? isPopular ? 'text-neon-cyan/80' : 'text-neon-green'
                : 'text-text-secondary/50'
            }`} />
            <span className={
              feature.included
                ? isPopular ? 'text-text-primary' : 'text-text-secondary'
                : 'text-text-secondary/50 line-through'
            }>
              {feature.label}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA Button */}
      <button
        onClick={() => onSelect(plan)}
        disabled={loading || isCurrent || plan.name === 'free'}
        className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
          isCurrent
            ? 'bg-white/[0.06] text-text-secondary cursor-not-allowed'
            : plan.name === 'free'
            ? 'bg-white/[0.04] text-text-secondary cursor-not-allowed'
            : isPopular
            ? 'bg-text-primary text-space-void hover:bg-neon-cyan/10 btn-beam'
            : 'bg-neon-cyan text-space-void hover:bg-neon-cyan/90 btn-beam'
        }`}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isCurrent ? (
          'Current Plan'
        ) : plan.name === 'free' ? (
          'Free Forever'
        ) : (
          <>
            Upgrade Now <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>
    </motion.div>
  )

  return (
    <Card3D>
      {isPopular ? (
        <GradientBorder>{cardContent}</GradientBorder>
      ) : (
        cardContent
      )}
    </Card3D>
  )
}

// ============================================================================
// MAIN SUBSCRIPTION PAGE
// ============================================================================

export default function SubscriptionPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [currentPlan, setCurrentPlan] = useState<string | null>(null)
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly')
  const [loading, setLoading] = useState(false)
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null)

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    document.body.appendChild(script)

    return () => {
      document.body.removeChild(script)
    }
  }, [])

  // Fetch plans
  useEffect(() => {
    fetchPlans()
    fetchCurrentSubscription()
  }, [])

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/plans')
      const data = await response.json()
      setPlans(data.plans)
    } catch (error) {
      toast.error('Failed to load plans')
    }
  }

  const fetchCurrentSubscription = async () => {
    try {
      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      const data = await response.json()
      setCurrentPlan(data.subscription_plan_id)
    } catch (error) {
      console.error('Failed to fetch subscription')
    }
  }

  const handleSelectPlan = async (plan: Plan) => {
    if (plan.name === 'free') return

    setProcessingPlanId(plan.id)
    setLoading(true)

    try {
      // Create Razorpay order
      const response = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
          plan_id: plan.id,
          billing_period: billingPeriod
        })
      })

      const data = await response.json()

      if (!data.order_id) {
        throw new Error('Failed to create order')
      }

      // Get user info for prefill
      const userResponse = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      })
      const user = await userResponse.json()

      // Open Razorpay checkout
      const options: RazorpayOptions = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: 'SwingAI',
        description: `${plan.display_name} - ${billingPeriod} subscription`,
        order_id: data.order_id,
        handler: async (response: RazorpayResponse) => {
          await handlePaymentSuccess(response)
        },
        prefill: {
          name: user.full_name || '',
          email: user.email || '',
          contact: user.phone || ''
        },
        theme: {
          color: '#3b82f6'
        }
      }

      const razorpay = new window.Razorpay(options)
      razorpay.open()

    } catch (error) {
      toast.error('Failed to initiate payment')
    } finally {
      setLoading(false)
      setProcessingPlanId(null)
    }
  }

  const handlePaymentSuccess = async (response: RazorpayResponse) => {
    try {
      const verifyResponse = await fetch('/api/payments/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature
        })
      })

      const data = await verifyResponse.json()

      if (data.success) {
        toast.success('🎉 Payment successful! Subscription activated.')
        router.push('/dashboard')
      } else {
        throw new Error('Payment verification failed')
      }
    } catch (error) {
      toast.error('Payment verification failed. Please contact support.')
    }
  }

  return (
    <div className="min-h-screen bg-space-void text-text-primary py-20">
      <div className="container mx-auto px-6">
        {/* Header */}
        <ScrollReveal>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Choose Your <span className="text-neon-cyan">Trading Plan</span>
            </h1>
            <p className="text-text-secondary text-lg max-w-2xl mx-auto">
              Unlock the full power of AI market intelligence. All plans include our core engine and risk controls. Upgrade anytime.
            </p>
          </motion.div>
        </ScrollReveal>

        {/* Billing Toggle */}
        <ScrollReveal delay={0.05}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex justify-center mb-12"
          >
            <div className="inline-flex items-center p-1 glass-card-neu rounded-xl border border-white/[0.04]">
              {(['monthly', 'quarterly', 'yearly'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setBillingPeriod(period)}
                  className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                    billingPeriod === period
                      ? 'bg-neon-cyan text-space-void'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                  {period === 'yearly' && (
                    <span className="ml-2 text-xs text-neon-green">Save 20%</span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        </ScrollReveal>

        {/* Pricing Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * (i + 1) }}
            >
              <PricingCard
                plan={plan}
                billingPeriod={billingPeriod}
                currentPlan={currentPlan}
                onSelect={handleSelectPlan}
                loading={loading && processingPlanId === plan.id}
              />
            </motion.div>
          ))}
        </div>

        {/* Trust Badges */}
        <ScrollReveal delay={0.2}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-16 text-center"
          >
            <div className="flex flex-wrap justify-center items-center gap-8 text-text-secondary">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-neon-green" />
                <span>Secure Payments via Razorpay</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-neon-green" />
                <span>Cancel Anytime</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-neon-green" />
                <span>GST Invoice Included</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-neon-green" />
                <span>7-Day Free Trial</span>
              </div>
            </div>
          </motion.div>
        </ScrollReveal>

        {/* FAQ */}
        <ScrollReveal delay={0.25}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-20 max-w-3xl mx-auto"
          >
            <h2 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>

            <div className="space-y-4">
              {[
                {
                  q: 'Can I upgrade or downgrade my plan?',
                  a: 'Yes, you can upgrade anytime. When upgrading, you only pay the difference. Downgrades take effect at the end of your current billing period.'
                },
                {
                  q: 'Is there a free trial?',
                  a: 'Yes! All paid plans come with a 7-day free trial. No credit card required to start.'
                },
                {
                  q: 'What payment methods do you accept?',
                  a: 'We accept all major credit/debit cards, UPI, Net Banking, and wallets through Razorpay.'
                },
                {
                  q: 'Can I get a refund?',
                  a: 'We offer a 7-day money-back guarantee. If you\'re not satisfied, contact support for a full refund.'
                },
                {
                  q: 'Do I need to connect a broker?',
                  a: 'Broker connection is optional. You can use signal-only mode without connecting a broker, or connect Zerodha/Angel One/Upstox for auto-trading.'
                }
              ].map((faq, i) => (
                <div key={i} className="glass-card-neu rounded-xl p-6 border border-white/[0.04]">
                  <h3 className="font-semibold text-text-primary mb-2">{faq.q}</h3>
                  <p className="text-text-secondary">{faq.a}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </ScrollReveal>
      </div>
    </div>
  )
}
