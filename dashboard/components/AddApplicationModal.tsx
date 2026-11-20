'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';

interface AddApplicationModalProps {
  onClose: () => void;
  onAdded: (app: any) => void;
}

export default function AddApplicationModal({ onClose, onAdded }: AddApplicationModalProps) {
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [source, setSource] = useState('Direct');
  const [status, setStatus] = useState('Applied');
  const [location, setLocation] = useState('');
  const [hrEmail, setHrEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim() || !position.trim()) {
      setError('Company name and position title are required.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const newApp = await api.createApplication({
        company: company.trim(),
        position: position.trim(),
        job_url: jobUrl.trim() || null,
        source: source.trim() || null,
        status: status,
        location: location.trim() || null,
        hr_email: hrEmail.trim() || null,
        notes: notes.trim() || null,
        applied_at: status === 'Applied' ? new Date().toISOString() : null
      });

      onAdded(newApp);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save application');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-brand-surface w-full max-w-lg rounded-card border border-edge-default shadow-hover overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-edge-default flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink-primary">Add Application</h2>
            <p className="text-xs text-ink-muted">Add a job opportunity to your tracking dashboard</p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary p-1 rounded-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-2.5 text-xs bg-red-50 text-status-error border border-red-200 rounded-btn">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Company *</label>
              <input
                type="text"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Position / Role *</label>
              <input
                type="text"
                required
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="e.g. Frontend Engineer"
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue bg-white"
              >
                <option value="Saved">Saved</option>
                <option value="Applied">Applied / Awaiting</option>
                <option value="Assessment">Assessment</option>
                <option value="Interview">Interview</option>
                <option value="Offer">Offer</option>
                <option value="Rejected">Rejected</option>
                <option value="Withdrawn">Withdrawn</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Source</label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. LinkedIn, Referral"
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Job Link (URL)</label>
              <input
                type="url"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. San Francisco / Remote"
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1">HR / Recruiter Email</label>
            <input
              type="email"
              value={hrEmail}
              onChange={(e) => setHrEmail(e.target.value)}
              placeholder="e.g. recruiter@acme.com"
              className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Key notes, interview stages, or referral contact..."
              className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue resize-none"
            />
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t border-edge-default flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-ink-secondary border border-edge-default rounded-btn hover:bg-brand-subtle"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-white bg-brand-blue rounded-btn hover:bg-brand-deep disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Opportunity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
