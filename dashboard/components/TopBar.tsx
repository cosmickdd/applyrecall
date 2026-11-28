'use client';

import { Bell, RefreshCw, Search, Puzzle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';

interface TopBarProps {
  title?: string;
  onSearch?: (term: string) => void;
  /** Use 2 when the page body renders its own <h1> so the document keeps a single top-level heading. */
  headingLevel?: 1 | 2;
}

export default function TopBar({ title, onSearch, headingLevel = 1 }: TopBarProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h1';
  const [checking, setChecking] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const handleCheckReminders = async () => {
    try {
      setChecking(true);
      const res = await api.checkRemindersNow();
      if (res && res.processed > 0) {
        setNotification(`${res.processed} follow-up reminder${res.processed > 1 ? 's' : ''} updated!`);
      } else {
        setNotification('All follow-up reminders are up to date.');
      }
      setTimeout(() => setNotification(null), 3500);
    } catch (e) {
      setNotification('Could not sync reminders. Please try again.');
      setTimeout(() => setNotification(null), 3500);
    } finally {
      setChecking(false);
    }
  };

  return (
    <header className="h-16 bg-brand-surface border-b border-edge-default px-8 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <Heading className="text-[17px] font-semibold text-ink-primary tracking-tight">
          {title || 'Overview'}
        </Heading>
      </div>

      <div className="flex items-center gap-4">
        {notification && (
          <div className="text-xs font-medium px-3 py-1 bg-emerald-50 text-status-success border border-emerald-200 rounded-btn animate-fade">
            {notification}
          </div>
        )}

        <Link
          href="/extension"
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-btn bg-brand-light text-brand-blue border border-brand-blue/20 hover:bg-brand-blue hover:text-white transition-all shadow-subtle"
          title="Download Chrome Extension & view setup guide"
        >
          <Puzzle className="w-3.5 h-3.5" />
          <span>Download Extension</span>
        </Link>

        <button
          onClick={handleCheckReminders}
          disabled={checking}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-btn border border-edge-default hover:bg-brand-subtle text-ink-primary transition-colors disabled:opacity-50"
          title="Check for due application follow-ups"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin text-brand-blue' : 'text-ink-secondary'}`} />
          <span>{checking ? 'Syncing...' : 'Sync Reminders'}</span>
        </button>

        <div className="h-4 w-px bg-edge-default" />

        <div className="flex items-center gap-1.5 text-xs text-ink-secondary" title="Real-time encrypted cloud sync active">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="font-medium">Cloud Synced</span>
        </div>
      </div>
    </header>
  );
}
