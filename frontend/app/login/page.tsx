'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import AuthLayout from '@/components/auth/AuthLayout'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Chrome,
  ArrowRight,
  Loader2,
} from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  remember: z.boolean().optional(),
})

type LoginFormData = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const { signIn, signInWithGoogle } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    try {
      await signIn(data.email, data.password)
      toast.success('Welcome back!')
      router.push('/dashboard')
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign in')
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true)
    try {
      await signInWithGoogle()
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign in with Google')
      setIsGoogleLoading(false)
    }
  }

  return (
    <AuthLayout>
      <div className="animate-fade-in-up">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-l-text">Welcome back</h1>
          <p className="mt-2 text-sm text-l-text-secondary">
            Sign in to your trading workspace
          </p>
        </div>

        {/* Google Login */}
        <button
          onClick={handleGoogleLogin}
          disabled={isGoogleLoading}
          className="mb-6 flex w-full items-center justify-center gap-3 rounded-[6px] border border-l-border bg-white/[0.03] px-6 py-3 text-sm font-medium text-l-text shadow-glass transition-all hover:shadow-glass-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGoogleLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Chrome className="h-5 w-5" />
              Continue with Google
            </>
          )}
        </button>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-l-border" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-l-bg px-4 text-l-text-muted">or</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Email */}
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-l-text">
              Email Address
            </label>
            <div className="input-animated-wrapper relative">
              <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-l-text-muted" />
              <input
                {...register('email')}
                type="email"
                id="email"
                placeholder="you@example.com"
                className="w-full rounded-xl border border-l-border bg-l-bg-subtle py-3 pl-11 pr-4 text-sm text-l-text placeholder:text-l-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
            {errors.email && (
              <p className="mt-1 text-xs text-down">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-l-text">
              Password
            </label>
            <div className="input-animated-wrapper relative">
              <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-l-text-muted" />
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                id="password"
                placeholder="Enter your password"
                className="w-full rounded-xl border border-l-border bg-l-bg-subtle py-3 pl-11 pr-12 text-sm text-l-text placeholder:text-l-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-l-text-muted transition-colors hover:text-l-text"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-down">{errors.password.message}</p>
            )}
          </div>

          {/* Remember + Forgot */}
          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                {...register('remember')}
                type="checkbox"
                className="h-4 w-4 rounded border-l-border accent-primary"
              />
              <span className="text-sm text-l-text-secondary">Remember me</span>
            </label>
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-l-accent transition-colors hover:text-primary"
            >
              Forgot password?
            </Link>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-[6px] bg-primary px-6 py-3 text-sm font-bold text-[#0A0D14] transition-all hover:bg-primary-hover hover:shadow-glow-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                Sign In
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Sign Up Link */}
        <p className="mt-8 text-center text-sm text-l-text-secondary">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="font-medium text-l-accent transition-colors hover:text-primary"
          >
            Create one now
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
