'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { ArrowRight, Lock, Mail, User, School, Calendar, AlertCircle, CheckCircle2, RotateCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SignUpPage() {
  const { signUp, resendConfirmationEmail, isConfigured, user, loading: authLoading } = useAuth();
  const [fullName, setFullName] = useState('');
  const [college, setCollege] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !fullName) {
      setError('Full Name, Email, and Password are required.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await signUp(email, password, {
        full_name: fullName,
        college: college,
        graduation_year: gradYear,
      });

      if (res?.error) {
        setError(res.error);
      } else {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create account.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) return;
    try {
      setResendLoading(true);
      setResendStatus(null);
      const res = await resendConfirmationEmail(email);
      if (res?.error) {
        setResendStatus(`Error: ${res.error}`);
      } else {
        setResendStatus('A new confirmation email has been dispatched. Please check your inbox and spam folder.');
      }
    } catch (err: any) {
      setResendStatus('Failed to resend confirmation email.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-soft flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-brand-surface border border-edge-default rounded-card shadow-card p-8 space-y-6">
        {/* Brand */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-brand-blue flex items-center justify-center text-white shadow-subtle">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h1 className="text-xl font-bold text-ink-primary tracking-tight">
            Create your Student Account
          </h1>
          <p className="text-xs text-ink-muted">
            Apply once. Remember everything. Stay in control.
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2.5 p-3 rounded-btn bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium animate-fade">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="p-6 bg-brand-surface border border-brand-blue/20 rounded-card text-center space-y-4 animate-fade">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-brand-blue flex items-center justify-center mx-auto">
              <Mail className="w-6 h-6" />
            </div>
            
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-ink-primary">Verify your email address</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                We sent a confirmation link to <span className="font-semibold text-ink-primary">{email}</span>.
              </p>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-btn text-left text-xs text-amber-900 space-y-1.5">
              <p className="font-semibold text-[11px] uppercase tracking-wider text-amber-800">
                Important Setup Tip:
              </p>
              <p className="text-[11px] text-amber-800 leading-normal">
                If clicking the link in the email said <strong>"Site can't be reached"</strong>, your Supabase project's <em>Site URL</em> needs to point to your live frontend or dev URL.
              </p>
              <p className="text-[11px] text-amber-700">
                You can also disable <em>"Confirm email"</em> in your Supabase Dashboard to log in immediately without confirmation!
              </p>
            </div>

            {resendStatus && (
              <p className="text-xs p-2.5 bg-blue-50 border border-blue-200 text-brand-blue rounded-btn font-medium">
                {resendStatus}
              </p>
            )}

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading}
                className="w-full py-2 px-4 bg-brand-surface border border-edge-default hover:bg-brand-soft text-ink-primary text-xs font-semibold rounded-btn flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${resendLoading ? 'animate-spin' : ''}`} />
                <span>{resendLoading ? 'Resending email...' : 'Resend confirmation email'}</span>
              </button>

              <Link
                href="/login"
                className="block w-full py-2 px-4 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-semibold rounded-btn transition-colors"
              >
                Go to Sign In →
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-secondary block">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Morgan"
                  className="w-full pl-9 pr-3 py-2 text-sm bg-brand-surface border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue text-ink-primary transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-secondary block">
                  College / Univ
                </label>
                <div className="relative">
                  <School className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                    placeholder="Stanford"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-brand-surface border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue text-ink-primary transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-secondary block">
                  Grad Year
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={gradYear}
                    onChange={(e) => setGradYear(e.target.value)}
                    placeholder="2026"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-brand-surface border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue text-ink-primary transition-colors"
                  />
                </div>
              </div>
            </div>

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
                  placeholder="alex.morgan@stanford.edu"
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
                <span className="animate-pulse">Creating account...</span>
              ) : (
                <>
                  <span>Create Student Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        <div className="text-center text-xs text-ink-muted">
          <span>Already have an account? </span>
          <Link href="/login" className="text-brand-blue font-semibold hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
