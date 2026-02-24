// ============================================================================
// SWINGAI - SIGNUP PAGE
// 3-step wizard: Account → Plan → Preferences
// ============================================================================

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  Chrome,
  ArrowRight,
  ArrowLeft,
  TrendingUp,
  Loader2,
  Check,
  Zap,
  Shield,
  Sparkles,
} from 'lucide-react'

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const accountSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
  terms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions',
  }),
}).refine((data) => data.password === data.confirm_password, {
  message: "Passwords don't match",
  path: ['confirm_password'],
})

type AccountFormData = z.infer<typeof accountSchema>

// ============================================================================
// PRICING PLANS
// ============================================================================

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: 'Perfect to get started',
    features: [
      '5 signals per day',
      'Basic technical analysis',
      'Email alerts',
      '7-day trade history',
    ],
    icon: Sparkles,
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 499,
    description: 'For active traders',
    features: [
      '20 signals per day',
      'Advanced technical analysis',
      'Push notifications',
      '30-day trade history',
      'Portfolio analytics',
    ],
    icon: Zap,
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 1499,
    description: 'For serious traders',
    features: [
      'Unlimited signals',
      'AI market insights',
      'All alert channels',
      'Unlimited history',
      'Advanced analytics',
      'Auto-trading (coming soon)',
      'Priority support',
    ],
    icon: Shield,
    recommended: true,
  },
]

// ============================================================================
// SIGNUP PAGE
// ============================================================================

export default function SignupPage() {
  const router = useRouter()
  const { signUp, signInWithGoogle } = useAuth()
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

  const [step, setStep] = useState(1)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('starter')
  const [formData, setFormData] = useState<AccountFormData | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
  })

  // ============================================================================
  // HANDLE ACCOUNT CREATION
  // ============================================================================

  const onAccountSubmit = async (data: AccountFormData) => {
    setFormData(data)
    setStep(2)
  }

  // ============================================================================
  // HANDLE FINAL SIGNUP
  // ============================================================================

  const handleFinalSignup = async () => {
    if (!formData) return

    setIsLoading(true)

    try {
      await signUp(formData.email, formData.password, formData.full_name)
      toast.success('Account created! Please check your email to verify.')
      router.push(demoMode ? '/dashboard' : '/verify-email')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create account')
    } finally {
      setIsLoading(false)
    }
  }

  // ============================================================================
  // HANDLE GOOGLE SIGNUP
  // ============================================================================

  const handleGoogleSignup = async () => {
    setIsGoogleLoading(true)

    try {
      await signInWithGoogle()
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign up with Google')
      setIsGoogleLoading(false)
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="app-shell flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/20 via-secondary/10 to-transparent rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-secondary/20 via-primary/10 to-transparent rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-4xl relative z-10"
      >
        {/* Logo & Brand */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 400 }}
            className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow-md"
          >
            <TrendingUp className="w-6 h-6 text-white" />
          </motion.div>
          <span className="text-2xl font-bold text-text-primary">SwingAI</span>
        </Link>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: step >= i ? 1 : 0.8 }}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-medium transition-all ${
                  step >= i
                    ? 'bg-gradient-primary text-white shadow-glow-sm'
                    : 'bg-background-elevated text-text-muted'
                }`}
              >
                {step > i ? <Check className="w-5 h-5" /> : i}
              </motion.div>
              {i < 3 && (
                <div
                  className={`w-16 h-1 rounded transition-all ${
                    step > i ? 'bg-gradient-primary' : 'bg-background-elevated'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Signup Card */}
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="app-panel p-8 shadow-2xl"
        >
          <AnimatePresence mode="wait">
            {/* Step 1: Account Details */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-bold text-text-primary mb-2">
                    Create Your Account
                  </h1>
                  <p className="text-text-secondary">
                    Join 5,000+ traders using AI-powered signals
                  </p>
                </div>

                {/* Google Signup */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleGoogleSignup}
                  disabled={isGoogleLoading}
                  className="w-full flex items-center justify-center gap-3 px-6 py-3 mb-6 bg-white text-text-primary rounded-xl font-medium hover:bg-background-elevated/60 transition-all disabled:opacity-50"
                >
                  {isGoogleLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Chrome className="w-5 h-5" />
                      Continue with Google
                    </>
                  )}
                </motion.button>

                {/* Divider */}
                <div className="relative mb-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/50" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-background-surface text-text-muted">
                      Or continue with email
                    </span>
                  </div>
                </div>

                {/* Signup Form */}
                <form onSubmit={handleSubmit(onAccountSubmit)} className="space-y-5">
                  {/* Full Name */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                      <input
                        {...register('full_name')}
                        type="text"
                        placeholder="John Doe"
                        className="w-full pl-12 pr-4 py-3 bg-background-elevated border border-border/50 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    {errors.full_name && (
                      <p className="text-danger text-sm mt-1">{errors.full_name.message}</p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                      <input
                        {...register('email')}
                        type="email"
                        placeholder="you@example.com"
                        className="w-full pl-12 pr-4 py-3 bg-background-elevated border border-border/50 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    {errors.email && (
                      <p className="text-danger text-sm mt-1">{errors.email.message}</p>
                    )}
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                      <input
                        {...register('password')}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-12 py-3 bg-background-elevated border border-border/50 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-danger text-sm mt-1">{errors.password.message}</p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                      <input
                        {...register('confirm_password')}
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        className="w-full pl-12 pr-12 py-3 bg-background-elevated border border-border/50 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {errors.confirm_password && (
                      <p className="text-danger text-sm mt-1">{errors.confirm_password.message}</p>
                    )}
                  </div>

                  {/* Terms */}
                  <div>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        {...register('terms')}
                        type="checkbox"
                        className="w-4 h-4 mt-1 rounded border-border/50 bg-background-elevated text-primary focus:ring-2 focus:ring-primary/20"
                      />
                      <span className="text-sm text-text-secondary">
                        I agree to the{' '}
                        <Link href="/terms" className="text-primary hover:underline">
                          Terms of Service
                        </Link>{' '}
                        and{' '}
                        <Link href="/privacy" className="text-primary hover:underline">
                          Privacy Policy
                        </Link>
                      </span>
                    </label>
                    {errors.terms && (
                      <p className="text-danger text-sm mt-1">{errors.terms.message}</p>
                    )}
                  </div>

                  {/* Submit */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-primary text-white rounded-xl font-medium shadow-glow-sm hover:shadow-glow-md transition-all"
                  >
                    Continue
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>
                </form>

                <p className="text-center text-sm text-text-secondary mt-6">
                  Already have an account?{' '}
                  <Link href="/login" className="text-primary hover:text-primary-dark font-medium">
                    Sign in
                  </Link>
                </p>
              </motion.div>
            )}

            {/* Step 2: Choose Plan */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-bold text-text-primary mb-2">
                    Choose Your Plan
                  </h1>
                  <p className="text-text-secondary">
                    Start with free, upgrade anytime
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {plans.map((plan) => {
                    const Icon = plan.icon
                    return (
                      <motion.button
                        key={plan.id}
                        whileHover={{ scale: 1.02, y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedPlan(plan.id)}
                        className={`relative p-6 rounded-xl border-2 text-left transition-all ${
                          selectedPlan === plan.id
                            ? 'border-primary bg-primary/10 shadow-glow-md'
                            : 'border-border/50 bg-background-elevated hover:border-border/50'
                        }`}
                      >
                        {plan.popular && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-primary text-white text-xs font-medium rounded-full">
                            Most Popular
                          </div>
                        )}
                        {plan.recommended && (
                          <div className="absolute -top-3 right-4 px-3 py-1 bg-success text-white text-xs font-medium rounded-full">
                            Recommended
                          </div>
                        )}

                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Icon className="w-5 h-5 text-primary" />
                              <h3 className="text-xl font-bold text-text-primary">{plan.name}</h3>
                            </div>
                            <p className="text-sm text-text-secondary">{plan.description}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-text-primary">
                              ₹{plan.price}
                            </div>
                            <div className="text-xs text-text-muted">/month</div>
                          </div>
                        </div>

                        <ul className="space-y-2">
                          {plan.features.map((feature, i) => (
                            <li key={i} className="flex items-center gap-2 text-sm text-text-secondary">
                              <Check className="w-4 h-4 text-success flex-shrink-0" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </motion.button>
                    )
                  })}
                </div>

                <div className="flex gap-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStep(1)}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-background-elevated text-text-primary rounded-xl font-medium border border-border/50 hover:border-border/50 transition-all"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    Back
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStep(3)}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-primary text-white rounded-xl font-medium shadow-glow-sm hover:shadow-glow-md transition-all"
                  >
                    Continue
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Confirmation */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-primary flex items-center justify-center">
                  <Check className="w-10 h-10 text-white" />
                </div>

                <h1 className="text-3xl font-bold text-text-primary mb-2">
                  You're All Set!
                </h1>
                <p className="text-text-secondary mb-8">
                  Click below to create your account and start trading with AI market intelligence
                </p>

                <div className="bg-background-elevated rounded-xl p-6 mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-text-secondary">Selected Plan:</span>
                    <span className="text-text-primary font-bold">
                      {plans.find(p => p.id === selectedPlan)?.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Price:</span>
                    <span className="text-text-primary font-bold">
                      ₹{plans.find(p => p.id === selectedPlan)?.price}/month
                    </span>
                  </div>
                </div>

                <div className="flex gap-4">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setStep(2)}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-background-elevated text-text-primary rounded-xl font-medium border border-border/50 hover:border-border/50 transition-all"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    Back
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleFinalSignup}
                    disabled={isLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-primary text-white rounded-xl font-medium shadow-glow-sm hover:shadow-glow-md transition-all disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Create Account
                        <Check className="w-5 h-5" />
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  )
}
