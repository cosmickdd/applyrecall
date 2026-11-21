'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Sidebar from '@/components/Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { token, loading, isConfigured } = useAuth();

  const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname?.startsWith('/auth/');

  useEffect(() => {
    if (!loading && isConfigured && !token && !isAuthPage) {
      router.push('/login');
    }
  }, [loading, isConfigured, token, isAuthPage, router]);

  if (isAuthPage) {
    return <main className="min-h-screen">{children}</main>;
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-brand-soft">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand-blue border-t-transparent animate-spin" />
          <span className="text-xs text-ink-muted font-medium">Loading ApplyRecall...</span>
        </div>
      </div>
    );
  }

  const isGlassyPage = pathname === '/glassy';

  return (
    <div className="flex min-h-screen w-full">
      {!isGlassyPage && <Sidebar />}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden relative">
        {isGlassyPage && (
          <div className="fixed top-3 left-4 z-50">
            <a
              href="/"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 hover:bg-black/85 text-white/90 text-xs font-semibold backdrop-blur-md shadow-lg transition-all border border-white/20"
            >
              ← Back to Overview
            </a>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
