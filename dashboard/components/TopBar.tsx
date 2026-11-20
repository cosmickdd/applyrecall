'use client';

import { Bell, RefreshCw, Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/api';

interface TopBarProps {
  title?: string;
  onSearch?: (term: string) => void;
}

export default function TopBar({ title, onSearch }: TopBarProps) {
  const [checking, setChecking] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const handleCheckReminders = async () => {
    try {
      setChecking(true);
      const res = await api.checkRemindersNow();
      setNotification(`Processed ${res.processed} pending reminders.`);
      setTimeout(() => setNotification(null), 3500);
    } catch (e) {
      setNotification('Reminder check failed.');
      setTimeout(() => setNotification(null), 3500);
    } finally {
      setChecking(false);
    }
  };

  return (
    <header className="h-16 bg-brand-surface border-b border-edge-default px-8 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <h1 className="text-[17px] font-semibold text-ink-primary tracking-tight">
          {title || 'Overview'}
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {notification && (
          <div className="text-xs font-medium px-3 py-1 bg-emerald-50 text-status-success border border-emerald-200 rounded-btn animate-fade">
            {notification}
          </div>
        )}

        <button
          onClick={handleCheckReminders}
          disabled={checking}
          className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-btn border border-edge-default hover:bg-brand-subtle text-ink-secondary transition-colors"
          title="Trigger Python reminder worker verification immediately"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin text-brand-blue' : ''}`} />
          <span>Worker Check</span>
        </button>

        <div className="h-4 w-px bg-edge-default" />

        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Backend Connected</span>
        </div>
      </div>
    </header>
  );
}
