'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import AddAnswerModal from '@/components/AddAnswerModal';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Clock, 
  Edit3, 
  Trash2, 
  Tag, 
  Building2,
  X
} from 'lucide-react';
import { api } from '@/lib/api';

export default function AnswersPage() {
  const [answers, setAnswers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAnswer, setEditingAnswer] = useState<any>(null);

  const loadAnswers = async () => {
    try {
      setLoading(true);
      const res = await api.getAnswers({
        search: search.trim() || undefined,
        scope: scopeFilter || undefined
      });
      setAnswers(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnswers();
  }, [search, scopeFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this answer from your library?')) return;
    try {
      await api.deleteAnswer(id);
      setAnswers(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const getScopeBadge = (scope: string, company?: string) => {
    switch (scope) {
      case 'general':
        return (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-brand-blue border border-blue-200">
            Universal
          </span>
        );
      case 'company':
        return (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            <span>{company || 'Company'}</span>
          </span>
        );
      case 'application':
        return (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            Application
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <TopBar title="Answer Library" />

      <main className="flex-1 p-8 max-w-[1304px] w-full mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Your Answer Library</h1>
            <p className="text-sm text-ink-secondary mt-1">Your best answers, ready for the next application.</p>
          </div>
          <button
            onClick={() => { setEditingAnswer(null); setShowAddModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-btn text-xs font-semibold hover:bg-brand-deep transition-colors shadow-subtle shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Answer</span>
          </button>
        </div>

        {/* Filter bar */}
        <div className="bg-brand-surface p-3 rounded-card border border-edge-default shadow-subtle flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-ink-muted ml-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search approved questions, answers or tags..."
              className="w-full px-2 py-1 text-sm bg-transparent focus:outline-none placeholder:text-ink-muted"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-ink-muted hover:text-ink-primary p-1">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {[
              { label: 'All', value: '' },
              { label: 'Universal', value: 'general' },
              { label: 'Company-specific', value: 'company' },
              { label: 'Application-specific', value: 'application' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => setScopeFilter(tab.value)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-btn border transition-colors ${
                  scopeFilter === tab.value
                    ? 'bg-brand-blue text-white border-brand-blue shadow-subtle'
                    : 'bg-white text-ink-secondary border-edge-default hover:border-edge-strong'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Answer Cards Grid */}
        {loading ? (
          <div className="p-12 text-center text-sm text-ink-muted">Loading approved answers...</div>
        ) : answers.length === 0 ? (
          <div className="bg-brand-surface p-12 text-center rounded-card border border-edge-default shadow-subtle space-y-3">
            <BookOpen className="w-8 h-8 text-ink-muted mx-auto" />
            <p className="text-sm font-semibold text-ink-primary">Your answer library is empty.</p>
            <p className="text-xs text-ink-muted max-w-sm mx-auto">
              Your saved answers will appear here. Add one above or save responses on the go via the ApplyRecall extension!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {answers.map((item) => (
              <div
                key={item.id}
                className="bg-brand-surface p-5 rounded-card border border-edge-default shadow-subtle flex flex-col justify-between hover:border-edge-strong transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-semibold text-sm text-ink-primary leading-snug">
                      {item.question}
                    </h3>
                    {getScopeBadge(item.scope, item.company)}
                  </div>

                  <p className="text-xs text-ink-secondary line-clamp-3 leading-relaxed mt-2 bg-brand-soft p-3 rounded-btn border border-edge-default">
                    {item.answer}
                  </p>
                </div>

                <div className="pt-4 mt-4 border-t border-edge-default flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-ink-muted">
                    {item.tags && (
                      <span className="flex items-center gap-1 text-[11px] bg-slate-100 px-2 py-0.5 rounded-sm">
                        <Tag className="w-3 h-3 text-ink-muted" />
                        <span>{item.tags}</span>
                      </span>
                    )}
                    <span className="text-[11px] tabular-nums">
                      {item.last_used_at ? `Used ${item.last_used_at.substring(0, 10)}` : 'Ready'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setEditingAnswer(item); setShowAddModal(true); }}
                      className="p-1.5 text-ink-muted hover:text-ink-primary rounded-sm hover:bg-brand-subtle"
                      title="Edit Answer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1.5 text-ink-muted hover:text-status-error rounded-sm hover:bg-brand-subtle"
                      title="Delete Answer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add / Edit Answer Modal */}
      {showAddModal && (
        <AddAnswerModal
          existingAnswer={editingAnswer}
          onClose={() => { setShowAddModal(false); setEditingAnswer(null); }}
          onAdded={() => loadAnswers()}
        />
      )}
    </>
  );
}
