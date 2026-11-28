'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Sidebar from '@/components/Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { token, loading, isConfigured } = useAuth();

  const isAuthOrLanding = pathname === '/' || pathname === '/login' || pathname === '/signup' || pathname === '/landing' || pathname?.startsWith('/auth/');
  // /extension is a public install page, so signed-out visitors and crawlers can read it
  const isPublicPage = isAuthOrLanding || pathname === '/extension';

  useEffect(() => {
    if (!loading && isConfigured && !token && !isPublicPage) {
      router.push('/');
    }
  }, [loading, isConfigured, token, isPublicPage, pathname, router]);

  if (isAuthOrLanding) {
    return <main className="min-h-screen">{children}</main>;
  }

  if (loading && !isPublicPage) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-brand-soft">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand-blue border-t-transparent animate-spin" />
          <span className="text-xs text-ink-muted font-medium">Loading ApplyRecall...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-brand-soft">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden bg-brand-soft">
        {children}
      </div>
    </div>
  );
}
