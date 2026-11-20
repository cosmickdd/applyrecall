'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';

interface AddAnswerModalProps {
  onClose: () => void;
  onAdded: (answer: any) => void;
  existingAnswer?: any;
}

export default function AddAnswerModal({ onClose, onAdded, existingAnswer }: AddAnswerModalProps) {
  const [question, setQuestion] = useState(existingAnswer?.question || '');
  const [answer, setAnswer] = useState(existingAnswer?.answer || '');
  const [scope, setScope] = useState(existingAnswer?.scope || 'general');
  const [company, setCompany] = useState(existingAnswer?.company || '');
  const [tags, setTags] = useState(existingAnswer?.tags || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) {
      setError('Both question prompt and approved answer are required.');
      return;
    }

    if (scope === 'company' && !company.trim()) {
      setError('Company name is required for company-scoped answers.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      let res;
      if (existingAnswer?.id) {
        res = await api.updateAnswer(existingAnswer.id, {
          question: question.trim(),
          answer: answer.trim(),
          scope: scope,
          company: scope === 'company' ? company.trim() : null,
          tags: tags.trim() || null
        });
      } else {
        res = await api.createAnswer({
          question: question.trim(),
          answer: answer.trim(),
          scope: scope,
          company: scope === 'company' ? company.trim() : null,
          tags: tags.trim() || null
        });
      }

      onAdded(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save answer');
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
            <h2 className="text-base font-semibold text-ink-primary">
              {existingAnswer ? 'Edit Answer' : 'Add to Answer Library'}
            </h2>
            <p className="text-xs text-ink-muted">
              Intelligent memory for recurring application questions
            </p>
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

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1">
              Question Prompt *
            </label>
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Tell us about a challenge you overcame."
              className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1">
              Your Approved Answer *
            </label>
            <textarea
              rows={6}
              required
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Write your polished, approved answer here..."
              className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue resize-none leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">
                Save Scope
              </label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue bg-white"
              >
                <option value="general">Universal (All companies)</option>
                <option value="company">Company-Specific</option>
                <option value="application">Application-Specific</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">
                Tags (Comma-separated)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g. leadership, challenge"
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>

          {scope === 'company' && (
            <div>
              <label className="block text-xs font-semibold text-ink-secondary mb-1">
                Target Company *
              </label>
              <input
                type="text"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Acme"
                className="w-full px-3 py-2 text-sm border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue"
              />
              <span className="text-[11px] text-ink-muted mt-1 block">
                Rule: Company-specific answers are never suggested for unrelated companies.
              </span>
            </div>
          )}

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
              {loading ? 'Saving...' : existingAnswer ? 'Update Answer' : 'Save to Library'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
