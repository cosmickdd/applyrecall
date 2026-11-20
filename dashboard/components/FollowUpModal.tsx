'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Mail, ExternalLink, Check } from 'lucide-react';
import { api } from '@/lib/api';

interface FollowUpModalProps {
  application: any;
  onClose: () => void;
}

export default function FollowUpModal({ application, onClose }: FollowUpModalProps) {
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [hrEmail, setHrEmail] = useState(application?.hr_email || '');
  const [mailtoUrl, setMailtoUrl] = useState('');
  const [gmailUrl, setGmailUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!application?.id) return;
    setLoading(true);
    api.getFollowUpDraft(application.id, { hr_email: hrEmail })
      .then((draft) => {
        setSubject(draft.subject);
        setBody(draft.body);
        setMailtoUrl(draft.mailto_url);
        setGmailUrl(draft.gmail_url);
      })
      .catch((err) => {
        console.error('Draft error:', err);
      })
      .finally(() => setLoading(false));
  }, [application?.id, hrEmail]);

  const handleCopy = () => {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-brand-surface w-full max-w-xl rounded-card border border-edge-default shadow-hover overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-edge-default flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink-primary">
              Follow-up Assistant — {application?.company}
            </h2>
            <p className="text-xs text-ink-muted">
              Role: {application?.position} • Applied: {application?.applied_at ? application.applied_at.substring(0, 10) : 'Recent'}
            </p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary p-1 rounded-sm">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1">
              Recruiter / HR Email (Optional)
            </label>
            <input
              type="email"
              value={hrEmail}
              onChange={(e) => setHrEmail(e.target.value)}
              placeholder="e.g. talent@company.com"
              className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
            />
            <span className="text-[11px] text-ink-muted mt-0.5 block">
              Never automatically sent. You maintain complete control over communications.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1">
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1">
              Email Message
            </label>
            <textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue font-sans resize-none leading-relaxed"
            />
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="px-6 py-3.5 bg-brand-soft border-t border-edge-default flex items-center justify-between">
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-ink-secondary hover:text-ink-primary border border-edge-default rounded-btn bg-white transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied' : 'Copy Text'}</span>
          </button>

          <div className="flex items-center gap-2">
            <a
              href={mailtoUrl}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-ink-primary bg-white border border-edge-default rounded-btn hover:bg-brand-subtle transition-colors"
            >
              <Mail className="w-4 h-4 text-ink-muted" />
              <span>Open Mail App</span>
            </a>

            <a
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-blue rounded-btn hover:bg-brand-deep transition-colors shadow-subtle"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Compose in Gmail</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
