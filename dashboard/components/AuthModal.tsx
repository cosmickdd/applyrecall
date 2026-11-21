'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import {
  X,
  Mail,
  Lock,
  User,
  School,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  RotateCw,
  Sparkles
} from 'lucide-react'

export interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'signin' | 'signup'
  redirectTo?: string
  subtitleNote?: string
}

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = 'signup',
  redirectTo,
  subtitleNote
}: AuthModalProps) {
  const router = useRouter()
  const { signIn, signUp, resendConfirmationEmail, isConfigured } = useAuth()

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [college, setCollege] = useState('')
  const [gradYear, setGradYear] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [resendStatus, setResendStatus] = useState<string | null>(null)
  const [resendLoading, setResendLoading] = useState(false)

  // Sync mode with prop when opened
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode)
      setError(null)
      setSuccess(false)
      setResendStatus(null)
    }
  }, [isOpen, initialMode])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResendStatus(null)

    if (mode === 'signin') {
      if (!email || !password) {
        setError('Please enter your email and password.')
        return
      }
      try {
        setLoading(true)
        const res = await signIn(email, password)
        if (res?.error) {
          setError(res.error)
        } else {
          onClose()
          router.push(redirectTo || '/overview')
        }
      } catch (err: any) {
        setError(err.message || 'Failed to sign in. Please try again.')
      } finally {
        setLoading(false)
      }
    } else {
      if (!email || !password || !fullName) {
        setError('Full Name, Email, and Password are required.')
        return
      }
      try {
        setLoading(true)
        const res = await signUp(email, password, {
          full_name: fullName,
          college,
          graduation_year: gradYear
        })

        if (res?.error) {
          setError(res.error)
        } else {
          // If session is returned directly, navigate to dashboard immediately
          if (res?.session || !isConfigured) {
            onClose()
            router.push(redirectTo || '/overview')
          } else {
            setSuccess(true)
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to create account.')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleResend = async () => {
    if (!email) {
      setError('Please enter your email above to resend the confirmation link.')
      return
    }
    try {
      setResendLoading(true)
      const res = await resendConfirmationEmail(email)
      if (res?.error) {
        setResendStatus(`Error: ${res.error}`)
      } else {
        setResendStatus('Verification email dispatched! Please check your inbox and spam folder.')
      }
    } catch {
      setResendStatus('Failed to resend confirmation email.')
    } finally {
      setResendLoading(false)
    }
  }

  const isEmailNotConfirmed = error?.toLowerCase().includes('email not confirmed')

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md bg-[#0a1128]/95 border border-[#79bdff]/25 rounded-2xl shadow-[0_0_50px_-10px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-2xl p-6 sm:p-8 space-y-6 text-white overflow-hidden">
        {/* Subtle top glow highlight */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#8fcbff]/60 to-transparent" />

        {/* Close Button */}
        <button
          type="button"
          aria-label="Close modal"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header / Brand */}
        <div className="flex flex-col items-center text-center space-y-2 pt-2">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#79bdff] to-[#2563eb] flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 id="auth-modal-title" className="text-xl font-bold tracking-tight text-white">
            {mode === 'signin' ? 'Sign in to ApplyRecall' : 'Create your Student Account'}
          </h2>
          <p className="text-xs text-slate-300">
            Apply once. Remember everything. Stay in control.
          </p>
        </div>

        {/* Optional Context Note (e.g. extension download requirement) */}
        {subtitleNote && (
          <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-400/30 text-sky-200 text-xs flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-[#79bdff] flex-shrink-0" />
            <span className="leading-snug">{subtitleNote}</span>
          </div>
        )}

        {/* Mode Toggle Pills */}
        <div className="grid grid-cols-2 p-1 rounded-xl bg-black/40 border border-white/10 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('signin')
              setError(null)
              setSuccess(false)
            }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'signin'
                ? 'bg-white/15 text-white shadow-sm border border-white/15'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup')
              setError(null)
              setSuccess(false)
            }}
            className={`py-2 rounded-lg transition-all ${
              mode === 'signup'
                ? 'bg-white/15 text-white shadow-sm border border-white/15'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Success Banner */}
        {success && (
          <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 text-xs font-medium space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="font-semibold">Account created!</span>
            </div>
            <p className="text-[11.5px] text-emerald-300/90 pl-6">
              Please check your email to verify your address, or sign in below once confirmed.
            </p>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-200 text-xs font-medium">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>

            {isEmailNotConfirmed && (
              <div className="p-3 bg-amber-950/60 border border-amber-500/30 rounded-xl text-xs text-amber-200 space-y-2">
                <p className="font-semibold text-[11px]">Email confirmation required</p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading}
                  className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <RotateCw className={`w-3 h-3 ${resendLoading ? 'animate-spin' : ''}`} />
                  <span>{resendLoading ? 'Sending...' : 'Resend Confirmation Email'}</span>
                </button>
                {resendStatus && (
                  <p className="text-[11px] font-medium text-amber-300">{resendStatus}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Alex Rivera"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    className="w-full bg-black/40 border border-white/15 focus:border-[#79bdff] focus:outline-none rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                    College / Univ
                  </label>
                  <div className="relative">
                    <School className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="e.g. Stanford"
                      value={college}
                      onChange={e => setCollege(e.target.value)}
                      className="w-full bg-black/40 border border-white/15 focus:border-[#79bdff] focus:outline-none rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
                    Grad Year
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="2026"
                      value={gradYear}
                      onChange={e => setGradYear(e.target.value)}
                      className="w-full bg-black/40 border border-white/15 focus:border-[#79bdff] focus:outline-none rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
              Student Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                placeholder="you@university.edu"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-black/40 border border-white/15 focus:border-[#79bdff] focus:outline-none rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 transition-colors"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-black/40 border border-white/15 focus:border-[#79bdff] focus:outline-none rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 transition-colors"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-white hover:bg-slate-100 text-[#071029] shadow-[inset_0_1px_0_#fff,0_8px_24px_-8px_rgba(80,130,255,0.7)] flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>{mode === 'signin' ? 'Sign In to ApplyRecall' : 'Create Student Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
