'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopBar from '@/components/TopBar';
import FollowUpModal from '@/components/FollowUpModal';
import GlassyDashboard from '@/components/ui/glassy-dashboard';
import { 
  Briefcase, 
  Clock, 
  Award, 
  AlertCircle, 
  ArrowRight, 
  CheckCircle2, 
  ExternalLink,
  Mail,
  Send,
  Puzzle,
  Calendar,
  Sparkles
} from 'lucide-react';
import { api } from '@/lib/api';

export default function OverviewPage() {
  const [viewMode, setViewMode] = useState<'glassy' | 'classic'>('glassy');
  const [summary, setSummary] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppForFollowup, setSelectedAppForFollowup] = useState<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('applyrecall_overview_mode');
    if (saved === 'classic' || saved === 'glassy') {
      setViewMode(saved);
    }
  }, []);

  const switchMode = (mode: 'glassy' | 'classic') => {
    setViewMode(mode);
    localStorage.setItem('applyrecall_overview_mode', mode);
  };

  useEffect(() => {
    if (viewMode === 'classic') {
      const loadData = async () => {
        try {
          setLoading(true);
          const [sumRes, appsRes, remsRes, actRes] = await Promise.all([
            api.getSummary(),
            api.getApplications({ sort: 'newest' }),
            api.getReminders({ tab: 'today' }),
            api.getActivity()
          ]);
          setSummary(sumRes);
          setApplications(appsRes);
          setReminders(remsRes);
          setActivity(actRes);
        } catch (e) {
          console.error('Overview load error:', e);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
  }, [viewMode]);

  // If in Glassy View Mode, render the tuned Spatial Glassy Dashboard
  if (viewMode === 'glassy') {
    return (
      <div className="w-full min-h-screen">
        <GlassyDashboard onSwitchToClassic={() => switchMode('classic')} />
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    Saved: 'bg-slate-100 text-slate-700 border-slate-200',
    Applied: 'bg-blue-50 text-brand-blue border-blue-200',
    Assessment: 'bg-purple-50 text-purple-700 border-purple-200',
    Interview: 'bg-amber-50 text-amber-700 border-amber-200',
    Offer: 'bg-emerald-50 text-status-success border-emerald-200',
    Rejected: 'bg-rose-50 text-rose-700 border-rose-200',
    Withdrawn: 'bg-slate-100 text-slate-500 border-slate-200',
  };

  return (
    <>
      <TopBar title="Overview" />

      <main className="flex-1 p-8 max-w-[1304px] w-full mx-auto space-y-8">
        {/* Page Title & Switch Banner */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">
              Your applications, in one place.
            </h1>
            <p className="text-sm text-ink-secondary mt-1">
              Keep track of where you've applied and what needs your attention.
            </p>
          </div>
          <button
            onClick={() => switchMode('glassy')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold rounded-btn shadow-subtle transition-all"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Switch to Spatial Glassy View</span>
          </button>
        </div>

        {/* 4 Metric Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total applications */}
          <div className="bg-brand-surface p-5 rounded-card border border-edge-default shadow-subtle flex flex-col justify-between">
            <div className="flex items-center justify-between text-ink-muted mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Tracked</span>
              <Briefcase className="w-4 h-4 text-brand-blue" strokeWidth={2} />
            </div>
            <div className="text-3xl font-bold text-ink-primary tabular-nums">
              {loading ? '—' : summary?.total_applications ?? 0}
            </div>
            <span className="text-xs text-ink-muted mt-2 block">
              Active student opportunities
            </span>
          </div>

          {/* Awaiting response */}
          <div className="bg-brand-surface p-5 rounded-card border border-edge-default shadow-subtle flex flex-col justify-between">
            <div className="flex items-center justify-between text-ink-muted mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Awaiting Response</span>
              <Clock className="w-4 h-4 text-sky-600" strokeWidth={2} />
            </div>
            <div className="text-3xl font-bold text-ink-primary tabular-nums">
              {loading ? '—' : summary?.awaiting_response ?? 0}
            </div>
            <span className="text-xs text-ink-muted mt-2 block">
              Submitted applications
            </span>
          </div>

          {/* Interviews */}
          <div className="bg-brand-surface p-5 rounded-card border border-edge-default shadow-subtle flex flex-col justify-between">
            <div className="flex items-center justify-between text-ink-muted mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Interviews</span>
              <Award className="w-4 h-4 text-amber-600" strokeWidth={2} />
            </div>
            <div className="text-3xl font-bold text-ink-primary tabular-nums text-amber-700">
              {loading ? '—' : summary?.interviews ?? 0}
            </div>
            <span className="text-xs text-ink-muted mt-2 block">
              In technical &amp; behavioral loops
            </span>
          </div>

          {/* Follow-ups due */}
          <div className="bg-brand-surface p-5 rounded-card border border-edge-default shadow-subtle flex flex-col justify-between">
            <div className="flex items-center justify-between text-ink-muted mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Follow-ups Due</span>
              <AlertCircle className="w-4 h-4 text-brand-blue" strokeWidth={2} />
            </div>
            <div className={`text-3xl font-bold tabular-nums ${summary?.follow_ups_due > 0 ? 'text-brand-blue' : 'text-ink-primary'}`}>
              {loading ? '—' : summary?.follow_ups_due ?? 0}
            </div>
            <span className="text-xs text-ink-muted mt-2 block">
              {summary?.follow_ups_due > 0 ? 'Action suggested today' : 'All up to date'}
            </span>
          </div>
        </section>

        {/* Section A: Next Actions / Overdue Follow-ups */}
        <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-blue" />
              <h2 className="text-base font-semibold text-ink-primary">Next Actions &amp; Reminders</h2>
            </div>
            <Link href="/reminders" className="text-xs font-semibold text-brand-blue hover:text-brand-deep flex items-center gap-1">
              <span>View all reminders</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {reminders.length === 0 ? (
            <div className="py-6 text-center bg-brand-soft rounded-card border border-dashed border-edge-default">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-ink-primary">Nothing needs your attention right now.</p>
              <p className="text-xs text-ink-muted mt-0.5">
                When you submit an application, ApplyRecall automatically suggests follow-ups when due.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reminders.map((rem) => (
                <div key={rem.id} className="p-4 bg-brand-soft rounded-btn border border-edge-default flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-brand-blue uppercase tracking-wider block">Follow-up suggested</span>
                    <span className="text-sm font-semibold text-ink-primary">{rem.company}</span>
                    <span className="text-xs text-ink-secondary ml-2">({rem.position})</span>
                    <p className="text-xs text-ink-muted mt-0.5">Scheduled for follow-up review.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedAppForFollowup({ id: rem.application_id, company: rem.company, position: rem.position })}
                      className="px-3 py-1.5 text-xs font-semibold bg-white border border-edge-default rounded-btn text-ink-primary hover:bg-brand-subtle flex items-center gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5 text-brand-blue" />
                      <span>Draft Email</span>
                    </button>
                    <button
                      onClick={async () => {
                        await api.snoozeReminder(rem.id, 1);
                        const updated = await api.getReminders({ tab: 'today' });
                        setReminders(updated);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold bg-white border border-edge-default rounded-btn text-ink-secondary hover:text-ink-primary"
                    >
                      Snooze 1d
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section B: Recent Applications & Pipeline */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Latest 5 Applications */}
          <section className="lg:col-span-2 bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-ink-primary">Recent Applications</h2>
                <Link href="/applications" className="text-xs font-semibold text-brand-blue hover:text-brand-deep flex items-center gap-1">
                  <span>View all</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {applications.length === 0 ? (
                <div className="py-10 text-center text-ink-muted text-sm">
                  No applications saved yet. Open a job in Chrome or add one manually!
                </div>
              ) : (
                <div className="divide-y divide-edge-default">
                  {applications.slice(0, 5).map((app) => (
                    <div key={app.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-ink-primary">{app.company}</span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${statusColors[app.status] || 'bg-slate-100 text-slate-700'}`}>
                            {app.status}
                          </span>
                        </div>
                        <div className="text-xs text-ink-secondary mt-0.5">
                          {app.position} • <span className="text-ink-muted">{app.applied_at ? `Applied ${app.applied_at.substring(0, 10)}` : 'Draft'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedAppForFollowup(app)}
                          className="px-2.5 py-1 text-xs font-medium text-ink-secondary hover:text-ink-primary border border-edge-default rounded-btn hover:bg-brand-subtle"
                        >
                          Follow-up
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Section C: Pipeline Distribution */}
          <div className="space-y-6">
            <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle">
              <h2 className="text-base font-semibold text-ink-primary mb-4">Pipeline Distribution</h2>
              {summary?.pipeline ? (
                <div className="space-y-2.5">
                  {Object.entries(summary.pipeline as Record<string, number>).map(([st, cnt]) => {
                    const total = summary.total_applications || 1;
                    const pct = Math.round((cnt / total) * 100);
                    return (
                      <div key={st}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-ink-secondary">{st}</span>
                          <span className="font-bold text-ink-primary tabular-nums">{cnt} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-brand-subtle h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-brand-blue h-full rounded-full transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-ink-muted">Loading pipeline...</div>
              )}
            </section>

            {/* Connected Tools Card */}
            <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle">
              <h2 className="text-base font-semibold text-ink-primary mb-3">Connected Surfaces</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-btn bg-brand-soft border border-edge-default">
                  <div className="flex items-center gap-2.5">
                    <Puzzle className="w-4 h-4 text-brand-blue" />
                    <div>
                      <span className="text-xs font-semibold text-ink-primary block leading-tight">Chrome Extension</span>
                      <span className="text-[11px] text-ink-muted">Autofill &amp; job detection</span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    summary?.extension_connected ? 'bg-emerald-100 text-status-success' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {summary?.extension_connected ? 'Ready' : 'Link via Code'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-btn bg-brand-soft border border-edge-default">
                  <div className="flex items-center gap-2.5">
                    <Send className="w-4 h-4 text-sky-600" />
                    <div>
                      <span className="text-xs font-semibold text-ink-primary block leading-tight">Telegram Bot</span>
                      <span className="text-[11px] text-ink-muted">Mobile queries &amp; reminders</span>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    summary?.telegram_connected ? 'bg-emerald-100 text-status-success' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {summary?.telegram_connected ? 'Ready' : 'Link in Settings'}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Section D: Recent Activity Log */}
        <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle">
          <h2 className="text-base font-semibold text-ink-primary mb-4">Application Activity Log</h2>
          {activity.length === 0 ? (
            <p className="text-xs text-ink-muted">No activity events recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {activity.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 text-xs">
                  <div className="w-2 h-2 rounded-full bg-brand-blue mt-1.5 shrink-0" />
                  <div className="flex-1">
                    <span className="font-semibold text-ink-primary">{ev.company}</span>
                    <span className="text-ink-secondary"> — {ev.description}</span>
                    <span className="text-ink-muted ml-2 font-mono text-[10px]">
                      {ev.created_at ? ev.created_at.substring(0, 16).replace('T', ' ') : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Follow-up Email Composer Modal */}
      {selectedAppForFollowup && (
        <FollowUpModal
          application={selectedAppForFollowup}
          onClose={() => setSelectedAppForFollowup(null)}
        />
      )}
    </>
  );
}
