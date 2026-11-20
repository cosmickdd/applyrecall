'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import AddApplicationModal from '@/components/AddApplicationModal';
import FollowUpModal from '@/components/FollowUpModal';
import { 
  Plus, 
  Search, 
  Filter, 
  Briefcase, 
  ExternalLink, 
  Mail, 
  Trash2, 
  Clock, 
  ChevronRight,
  X
} from 'lucide-react';
import { api } from '@/lib/api';

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedApp, setSelectedApp] = useState<any>(null);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [followupApp, setFollowupApp] = useState<any>(null);

  const loadApps = async () => {
    try {
      setLoading(true);
      const res = await api.getApplications({
        search: search.trim() || undefined,
        status: statusFilter || undefined
      });
      setApplications(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, [search, statusFilter]);

  const openDetail = async (app: any) => {
    setSelectedApp(app);
    setDetailLoading(true);
    try {
      const detail = await api.getApplication(app.id);
      setSelectedDetail(detail);
    } catch (e) {
      console.error('Detail error', e);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStatusChange = async (appId: string, newStatus: string) => {
    try {
      const updated = await api.updateApplication(appId, { status: newStatus });
      setApplications(prev => prev.map(a => a.id === appId ? updated : a));
      if (selectedApp?.id === appId) {
        setSelectedApp(updated);
        // refresh detail
        const detail = await api.getApplication(appId);
        setSelectedDetail(detail);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (appId: string) => {
    if (!confirm('Are you sure you want to delete this application?')) return;
    try {
      await api.deleteApplication(appId);
      setApplications(prev => prev.filter(a => a.id !== appId));
      setSelectedApp(null);
      setSelectedDetail(null);
    } catch (e) {
      console.error(e);
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'Saved': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'Applied': return 'bg-blue-50 text-brand-blue border-blue-200';
      case 'Assessment': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Interview': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Offer': return 'bg-emerald-50 text-status-success border-emerald-200';
      case 'Rejected': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Withdrawn': return 'bg-slate-100 text-slate-500 border-slate-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <>
      <TopBar title="Applications" />

      <main className="flex-1 p-8 max-w-[1304px] w-full mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Applications</h1>
            <p className="text-sm text-ink-secondary mt-1">Every opportunity you've saved, in one view.</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-btn text-xs font-semibold hover:bg-brand-deep transition-colors shadow-subtle shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Application</span>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-brand-surface p-3 rounded-card border border-edge-default shadow-subtle flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-ink-muted ml-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by company or role title..."
              className="w-full px-2 py-1 text-sm bg-transparent focus:outline-none placeholder:text-ink-muted"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-ink-muted hover:text-ink-primary p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs font-medium px-3 py-1.5 bg-brand-soft border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
            >
              <option value="">All Statuses</option>
              <option value="Saved">Saved</option>
              <option value="Applied">Applied</option>
              <option value="Assessment">Assessment</option>
              <option value="Interview">Interview</option>
              <option value="Offer">Offer</option>
              <option value="Rejected">Rejected</option>
              <option value="Withdrawn">Withdrawn</option>
            </select>
          </div>
        </div>

        {/* Applications Table */}
        <div className="bg-brand-surface rounded-card border border-edge-default shadow-subtle overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-sm text-ink-muted">Loading applications...</div>
          ) : applications.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <Briefcase className="w-8 h-8 text-ink-muted mx-auto" />
              <p className="text-sm font-semibold text-ink-primary">No applications found.</p>
              <p className="text-xs text-ink-muted max-w-sm mx-auto">
                Save your first opportunity using the ApplyRecall Chrome Extension or click Add Application above.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-edge-default bg-brand-soft text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                    <th className="py-3 px-6">Company</th>
                    <th className="py-3 px-6">Position</th>
                    <th className="py-3 px-6">Applied Date</th>
                    <th className="py-3 px-6">Source</th>
                    <th className="py-3 px-6">Status</th>
                    <th className="py-3 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge-default text-sm">
                  {applications.map((app) => (
                    <tr
                      key={app.id}
                      onClick={() => openDetail(app)}
                      className="hover:bg-brand-soft/70 transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-6 font-semibold text-ink-primary">
                        {app.company}
                      </td>
                      <td className="py-3.5 px-6 text-ink-secondary">
                        {app.position}
                      </td>
                      <td className="py-3.5 px-6 text-xs text-ink-muted tabular-nums">
                        {app.applied_at ? app.applied_at.substring(0, 10) : '—'}
                      </td>
                      <td className="py-3.5 px-6 text-xs text-ink-secondary">
                        <span className="bg-brand-subtle px-2 py-0.5 rounded-sm">
                          {app.source || 'Direct'}
                        </span>
                      </td>
                      <td className="py-3.5 px-6">
                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusBadgeClass(app.status)}`}>
                          {app.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setFollowupApp(app)}
                            className="px-2.5 py-1 text-xs font-semibold text-ink-secondary hover:text-ink-primary border border-edge-default rounded-btn hover:bg-white"
                          >
                            Follow-up
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Application Detail Slide-over / Modal */}
      {selectedApp && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-end">
          <div className="bg-brand-surface w-full max-w-xl h-full shadow-hover border-l border-edge-default p-6 overflow-y-auto flex flex-col justify-between animate-fade">
            <div>
              {/* Header */}
              <div className="flex items-start justify-between pb-4 border-b border-edge-default">
                <div>
                  <h2 className="text-xl font-bold text-ink-primary">{selectedApp.company}</h2>
                  <p className="text-sm font-medium text-ink-secondary mt-0.5">{selectedApp.position}</p>
                </div>
                <button
                  onClick={() => { setSelectedApp(null); setSelectedDetail(null); }}
                  className="text-ink-muted hover:text-ink-primary p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Selector */}
              <div className="my-5 p-4 bg-brand-soft border border-edge-default rounded-card">
                <label className="block text-xs font-bold text-ink-muted uppercase tracking-wider mb-2">
                  Update Application Status
                </label>
                <div className="flex flex-wrap gap-2">
                  {['Saved', 'Applied', 'Assessment', 'Interview', 'Offer', 'Rejected', 'Withdrawn'].map((st) => (
                    <button
                      key={st}
                      onClick={() => handleStatusChange(selectedApp.id, st)}
                      className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${
                        selectedApp.status === st
                          ? 'bg-brand-blue text-white border-brand-blue shadow-subtle'
                          : 'bg-white text-ink-secondary border-edge-default hover:border-edge-strong'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Details List */}
              <div className="space-y-4 text-sm">
                <div>
                  <span className="text-xs font-semibold text-ink-muted block">Applied Date</span>
                  <span className="text-ink-primary tabular-nums">
                    {selectedApp.applied_at ? selectedApp.applied_at.substring(0, 10) : 'Not recorded yet'}
                  </span>
                </div>

                {selectedApp.job_url && (
                  <div>
                    <span className="text-xs font-semibold text-ink-muted block">Job Listing</span>
                    <a
                      href={selectedApp.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-blue hover:underline flex items-center gap-1.5 text-xs font-medium"
                    >
                      <span>{selectedApp.job_url}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {selectedApp.hr_email && (
                  <div>
                    <span className="text-xs font-semibold text-ink-muted block">Recruiter Email</span>
                    <span className="text-ink-primary font-mono text-xs">{selectedApp.hr_email}</span>
                  </div>
                )}

                {selectedApp.notes && (
                  <div>
                    <span className="text-xs font-semibold text-ink-muted block">Notes</span>
                    <p className="text-xs text-ink-secondary mt-1 bg-brand-soft p-3 rounded-btn border border-edge-default">
                      {selectedApp.notes}
                    </p>
                  </div>
                )}

                {/* Timeline Events */}
                <div className="pt-4 border-t border-edge-default">
                  <span className="text-xs font-bold text-ink-muted uppercase tracking-wider block mb-3">
                    Application History &amp; Events
                  </span>
                  {detailLoading ? (
                    <div className="text-xs text-ink-muted">Loading timeline...</div>
                  ) : selectedDetail?.events?.length === 0 ? (
                    <div className="text-xs text-ink-muted">No status changes logged yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {selectedDetail?.events?.map((ev: any) => (
                        <div key={ev.id} className="flex items-start gap-2 text-xs">
                          <span className="w-2 h-2 rounded-full bg-brand-blue mt-1 shrink-0" />
                          <div>
                            <span className="font-semibold text-ink-primary">{ev.description}</span>
                            <span className="text-ink-muted ml-2 font-mono text-[10px]">
                              {ev.created_at ? ev.created_at.substring(0, 16).replace('T', ' ') : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Controls */}
            <div className="pt-6 border-t border-edge-default flex items-center justify-between">
              <button
                onClick={() => handleDelete(selectedApp.id)}
                className="flex items-center gap-1.5 text-xs font-semibold text-status-error hover:text-red-700 p-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Opportunity</span>
              </button>

              <button
                onClick={() => setFollowupApp(selectedApp)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-brand-blue text-white rounded-btn hover:bg-brand-deep transition-colors shadow-subtle"
              >
                <Mail className="w-4 h-4" />
                <span>Draft Follow-up</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddApplicationModal
          onClose={() => setShowAddModal(false)}
          onAdded={(newApp) => setApplications(prev => [newApp, ...prev])}
        />
      )}

      {/* Follow-up Draft Modal */}
      {followupApp && (
        <FollowUpModal
          application={followupApp}
          onClose={() => setFollowupApp(null)}
        />
      )}
    </>
  );
}
