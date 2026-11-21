'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { CheckCircle2, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import Link from 'next/link';

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshProfile } = useAuth();
  
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function handleAuthCallback() {
      if (!isSupabaseConfigured) {
        setStatus('error');
        setErrorMessage('Supabase is not configured.');
        return;
      }

      try {
        // 1. Check for error params passed directly by Supabase in query or hash
        const queryError = searchParams?.get('error');
        const queryErrorDesc = searchParams?.get('error_description');
        if (queryError || queryErrorDesc) {
          setStatus('error');
          setErrorMessage(queryErrorDesc || queryError || 'Email confirmation failed.');
          return;
        }

        // 2. Check for PKCE authorization code in query
        const code = searchParams?.get('code');
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setStatus('error');
            setErrorMessage(error.message);
            return;
          }
          if (data.session) {
            if (typeof window !== 'undefined') {
              localStorage.setItem('applyrecall_token', data.session.access_token);
            }
            await refreshProfile();
            setStatus('success');
            setTimeout(() => {
              router.push('/overview');
            }, 1500);
            return;
          }
        }

        // 3. Fallback: check session (handles hash fragments like #access_token=... parsed by detectSessionInUrl)
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          setStatus('error');
          setErrorMessage(sessionError.message);
          return;
        }

        if (session) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('applyrecall_token', session.access_token);
          }
          await refreshProfile();
          setStatus('success');
          setTimeout(() => {
            router.push('/overview');
          }, 1500);
          return;
        }

        // If no code and no session found yet, wait for onAuthStateChange
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (newSession) {
            if (typeof window !== 'undefined') {
              localStorage.setItem('applyrecall_token', newSession.access_token);
            }
            await refreshProfile();
            setStatus('success');
            setTimeout(() => {
              router.push('/overview');
            }, 1500);
          }
        });

        // Timeout safety fallback
        const timeout = setTimeout(() => {
          if (status === 'verifying') {
            setStatus('success');
            setTimeout(() => {
              router.push('/login?confirmed=true');
            }, 1000);
          }
        }, 4000);

        return () => {
          subscription.unsubscribe();
          clearTimeout(timeout);
        };
      } catch (err: any) {
        setStatus('error');
        setErrorMessage(err.message || 'Failed to verify email confirmation.');
      }
    }

    handleAuthCallback();
  }, [router, searchParams, refreshProfile]);

  return (
    <div className="w-full max-w-md bg-brand-surface border border-edge-default rounded-card shadow-card p-8 space-y-6 text-center">
      {/* Logo / Badge */}
      <div className="w-14 h-14 rounded-2xl bg-brand-blue flex items-center justify-center text-white mx-auto shadow-subtle">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>

      {status === 'verifying' && (
        <div className="space-y-4 animate-fade">
          <div className="flex justify-center">
            <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
          </div>
          <h1 className="text-lg font-bold text-ink-primary">
            Verifying your email...
          </h1>
          <p className="text-xs text-ink-secondary leading-relaxed">
            Confirming your account with ApplyRecall. This takes just a moment.
          </p>
        </div>
      )}

      {status === 'success' && (
        <div className="space-y-4 animate-fade">
          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-ink-primary">
            Email Confirmed!
          </h1>
          <p className="text-xs text-ink-secondary leading-relaxed">
            Your ApplyRecall student account has been successfully verified. Setting up your workspace...
          </p>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 py-2 px-4 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-semibold rounded-btn shadow-subtle transition-colors w-full"
            >
              <span>Continue to Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-4 animate-fade">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h1 className="text-lg font-bold text-rose-900">
            Verification Failed
          </h1>
          <p className="text-xs text-rose-700 leading-relaxed bg-rose-50 border border-rose-200 p-3 rounded-btn">
            {errorMessage || 'The confirmation link may have expired, already been used, or is invalid.'}
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 py-2 px-4 bg-brand-blue hover:bg-brand-blue/90 text-white text-xs font-semibold rounded-btn shadow-subtle transition-colors w-full"
            >
              <span>Go to Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/signup"
              className="text-xs text-ink-muted hover:text-brand-blue transition-colors font-medium"
            >
              Need a new account? Sign up again
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <div className="min-h-screen bg-brand-soft flex flex-col justify-center items-center p-4">
      <Suspense fallback={
        <div className="w-full max-w-md bg-brand-surface border border-edge-default rounded-card shadow-card p-8 text-center space-y-4">
          <div className="flex justify-center">
            <Loader2 className="w-8 h-8 text-brand-blue animate-spin" />
          </div>
          <p className="text-xs text-ink-muted">Loading authentication details...</p>
        </div>
      }>
        <AuthCallbackContent />
      </Suspense>
    </div>
  );
}

