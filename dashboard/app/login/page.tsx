'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ArrowRight, Lock, Mail, AlertCircle, CheckCircle2, RotateCw, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginFormContent() {
  const { signIn, resendConfirmationEmail, isConfigured, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const isConfirmed = searchParams?.get('confirmed') === 'true';

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !authLoading) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setResendStatus(null);
      const res = await signIn(email, password);
      if (res?.error) {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError('Please enter your email above to resend the confirmation link.');
      return;
    }
    try {
      setResendLoading(true);
      setResendStatus(null);
      const res = await resendConfirmationEmail(email);
      if (res?.error) {
        setResendStatus(`Error: ${res.error}`);
      } else {
        setResendStatus('Confirmation email sent! Please check your inbox and spam folder.');
      }
    } catch (err: any) {
      setResendStatus('Failed to resend confirmation email.');
    } finally {
      setResendLoading(false);
    }
  };

  const isEmailNotConfirmed = error?.toLowerCase().includes('email not confirmed');

  const handleDevBypass = () => {
    // In local development, bypass to home
    if (typeof window !== 'undefined') {
      localStorage.setItem('applyrecall_token', '00000000-0000-0000-0000-000000000001');
    }
    router.push('/');
  };

  return (
    <div className="w-full max-w-md bg-brand-surface border border-edge-default rounded-card shadow-card p-8 space-y-6">
      {/* Brand */}
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="w-12 h-12 rounded-xl bg-brand-blue flex items-center justify-center text-white shadow-subtle">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-ink-primary tracking-tight">
          Sign in to ApplyRecall
        </h1>
        <p className="text-xs text-ink-muted">
          Apply once. Remember everything. Stay in control.
        </p>
      </div>

      {isConfirmed && (
        <div className="flex items-center gap-2.5 p-3 rounded-btn bg-emerald-50 border border-emerald-200 text-status-success text-xs font-medium animate-fade">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Email verified successfully! You can now sign in with your credentials.</span>
        </div>
      )}

      {error && (
        <div className="space-y-2 animate-fade">
          <div className="flex items-center gap-2.5 p-3 rounded-btn bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>

          {isEmailNotConfirmed && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-btn text-xs text-amber-900 space-y-2">
              <p className="font-semibold text-[11px]">Need to confirm your email?</p>
              <p className="text-[11px] text-amber-800">
                Click below to dispatch a fresh verification link to your email address:
              </p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading}
                className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-btn flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RotateCw className={`w-3 h-3 ${resendLoading ? 'animate-spin' : ''}`} />
                <span>{resendLoading ? 'Sending...' : 'Resend Confirmation Email'}</span>
              </button>
              {resendStatus && (
                <p className="text-[11px] font-medium text-amber-900 pt-1">
                  {resendStatus}
                </p>
              )}
              <p className="text-[10px] text-amber-700 pt-1 border-t border-amber-200">
                Tip: You can also disable <em>"Confirm email"</em> in your Supabase Auth settings to log in immediately.
              </p>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-ink-secondary block">
            Student Email
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@university.edu"
              className="w-full pl-9 pr-3 py-2 text-sm bg-brand-surface border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue text-ink-primary transition-colors"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-ink-secondary block">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full pl-9 pr-3 py-2 text-sm bg-brand-surface border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue text-ink-primary transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-semibold rounded-btn shadow-subtle flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <span className="animate-pulse">Signing in...</span>
          ) : (
            <>
              <span>Sign In with Supabase</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {!isConfigured && (
        <div className="pt-2 border-t border-edge-default">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-btn text-xs text-amber-800 space-y-2">
            <p className="font-semibold">Local Development Mode</p>
            <p className="text-[11px] text-amber-700">
              Supabase credentials not configured in environment. You can enter the dashboard with the local dev profile.
            </p>
            <button
              type="button"
              onClick={handleDevBypass}
              className="w-full py-1.5 bg-white border border-amber-300 text-amber-900 font-semibold text-xs rounded-btn hover:bg-amber-100 transition-colors"
            >
              Continue with Local Dev Profile →
            </button>
          </div>
        </div>
      )}

      <div className="text-center text-xs text-ink-muted">
        <span>Don't have an account? </span>
        <Link href="/signup" className="text-brand-blue font-semibold hover:underline">
          Sign up
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-brand-soft flex flex-col justify-center items-center p-4">
      <Suspense fallback={
        <div className="w-full max-w-md bg-brand-surface border border-edge-default rounded-card shadow-card p-8 text-center space-y-4">
          <div className="flex justify-center">
            <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
          </div>
          <p className="text-xs text-ink-muted">Loading sign in...</p>
        </div>
      }>
        <LoginFormContent />
      </Suspense>
    </div>
  );
}
