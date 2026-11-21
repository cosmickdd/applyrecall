'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import FollowUpModal from '@/components/FollowUpModal';
import { 
  Bell, 
  Calendar, 
  CheckCircle, 
  Clock, 
  Mail, 
  Trash2, 
  RefreshCw,
  Plus
} from 'lucide-react';
import { api } from '@/lib/api';

export default function RemindersPage() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'snoozed' | 'completed'>('today');
  const [selectedAppForFollowup, setSelectedAppForFollowup] = useState<any>(null);
  const [workerMessage, setWorkerMessage] = useState<string | null>(null);

  const loadReminders = async () => {
    try {
      setLoading(true);
      const res = await api.getReminders({ tab: activeTab });
      setReminders(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReminders();
  }, [activeTab]);

  const handleComplete = async (id: string) => {
    try {
      await api.updateReminder(id, { status: 'completed' });
      setReminders(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSnooze = async (id: string) => {
    try {
      await api.snoozeReminder(id, 1);
      setReminders(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this reminder?')) return;
    try {
      await api.deleteReminder(id);
      setReminders(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleTriggerWorker = async () => {
    try {
      const res = await api.checkRemindersNow();
      if (res && res.processed > 0) {
        setWorkerMessage(`${res.processed} follow-up reminder${res.processed > 1 ? 's' : ''} updated!`);
      } else {
        setWorkerMessage('All reminders are up to date.');
      }
      setTimeout(() => setWorkerMessage(null), 3000);
      loadReminders();
    } catch (e) {
      setWorkerMessage('Could not sync reminders. Please try again.');
    }
  };

  return (
    <>
      <TopBar title="Reminders" />

      <main className="flex-1 p-8 max-w-[1304px] w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Reminders</h1>
            <p className="text-sm text-ink-secondary mt-1">
              Automated 7-day follow-up radar to keep you on recruiter shortlists.
            </p>
          </div>
          <button
            onClick={handleTriggerWorker}
            className="flex items-center gap-2 px-3.5 py-2 bg-brand-surface text-ink-primary border border-edge-default rounded-btn text-xs font-semibold hover:bg-brand-subtle transition-colors shadow-subtle shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 text-brand-blue" />
            <span>Check Due Follow-ups</span>
          </button>
        </div>

        {workerMessage && (
          <div className="p-3 text-xs font-medium bg-emerald-50 text-status-success border border-emerald-200 rounded-btn">
            {workerMessage}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-edge-default pb-3">
          {[
            { id: 'today', label: 'Due Today / Overdue' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'snoozed', label: 'Snoozed' },
            { id: 'completed', label: 'Completed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-btn transition-colors ${
                activeTab === tab.id
                  ? 'bg-brand-blue text-white shadow-subtle'
                  : 'bg-white text-ink-secondary border border-edge-default hover:text-ink-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Reminders List */}
        {loading ? (
          <div className="p-12 text-center text-sm text-ink-muted">Checking scheduled reminders...</div>
        ) : reminders.length === 0 ? (
          <div className="bg-brand-surface p-12 text-center rounded-card border border-edge-default shadow-subtle space-y-3">
            <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="text-sm font-semibold text-ink-primary">Nothing needs your attention right now.</p>
            <p className="text-xs text-ink-muted max-w-sm mx-auto">
              Follow-up reminders automatically appear here when 7 days elapse after applying, or when you set one via Telegram.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map((rem) => (
              <div
                key={rem.id}
                className="bg-brand-surface p-5 rounded-card border border-edge-default shadow-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-ink-primary">{rem.company}</span>
                    <span className="text-xs text-ink-secondary">({rem.position})</span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-brand-blue border border-blue-200">
                      {rem.type || 'follow_up'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-ink-muted mt-1.5">
                    <span className="flex items-center gap-1 tabular-nums">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Due: {rem.reminder_at.substring(0, 16).replace('T', ' ')}</span>
                    </span>
                    <span>•</span>
                    <span className="capitalize">{rem.status}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedAppForFollowup({ id: rem.application_id, company: rem.company, position: rem.position })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-edge-default rounded-btn text-ink-primary hover:bg-brand-subtle"
                  >
                    <Mail className="w-3.5 h-3.5 text-brand-blue" />
                    <span>Draft Email</span>
                  </button>

                  {rem.status !== 'completed' && (
                    <>
                      <button
                        onClick={() => handleSnooze(rem.id)}
                        className="px-3 py-1.5 text-xs font-semibold bg-white border border-edge-default rounded-btn text-ink-secondary hover:text-ink-primary"
                      >
                        Snooze 1d
                      </button>
                      <button
                        onClick={() => handleComplete(rem.id)}
                        className="px-3 py-1.5 text-xs font-semibold bg-brand-blue text-white rounded-btn hover:bg-brand-deep shadow-subtle"
                      >
                        Complete
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => handleDelete(rem.id)}
                    className="p-1.5 text-ink-muted hover:text-status-error"
                    title="Delete reminder"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Follow-up modal */}
      {selectedAppForFollowup && (
        <FollowUpModal
          application={selectedAppForFollowup}
          onClose={() => setSelectedAppForFollowup(null)}
        />
      )}
    </>
  );
}
