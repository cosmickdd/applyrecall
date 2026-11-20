'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/TopBar';
import { 
  Settings as SettingsIcon, 
  Send, 
  Puzzle, 
  Key, 
  Copy, 
  Check, 
  Download, 
  Trash2, 
  MessageSquare,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const [extCode, setExtCode] = useState<string | null>(null);
  const [extLoading, setExtLoading] = useState(false);
  const [tgCode, setTgCode] = useState<string | null>(null);
  const [tgLoading, setTgLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Telegram simulator state
  const [simChatId, setSimChatId] = useState('simulated_student_1');
  const [simInput, setSimInput] = useState('/summary');
  const [simHistory, setSimHistory] = useState<Array<{ sender: 'user' | 'bot'; text: string }>>([
    { sender: 'bot', text: '👋 <b>Welcome to ApplyRecall Telegram Assistant!</b>\nSend <code>/help</code> or ask <i>"What\'s happening with my applications?"</i>' }
  ]);
  const [simLoading, setSimLoading] = useState(false);

  const generateExtensionCode = async () => {
    try {
      setExtLoading(true);
      const res = await api.generatePairingCode('extension');
      setExtCode(res.code);
    } catch (e) {
      console.error(e);
    } finally {
      setExtLoading(false);
    }
  };

  const generateTelegramCode = async () => {
    try {
      setTgLoading(true);
      const res = await api.generatePairingCode('telegram');
      setTgCode(res.code);
    } catch (e) {
      console.error(e);
    } finally {
      setTgLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSimulateSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!simInput.trim() || simLoading) return;

    const query = simInput.trim();
    setSimInput('');
    setSimHistory(prev => [...prev, { sender: 'user', text: query }]);
    setSimLoading(true);

    try {
      const res = await api.simulateTelegram(query, simChatId);
      setSimHistory(prev => [...prev, { sender: 'bot', text: res.reply }]);
    } catch (err: any) {
      setSimHistory(prev => [...prev, { sender: 'bot', text: `⚠️ Error: ${err.message}` }]);
    } finally {
      setSimLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `applyrecall-export-${new Date().toISOString().substring(0, 10)}.json`;
      a.click();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <TopBar title="Settings &amp; Connections" />

      <main className="flex-1 p-8 max-w-[1304px] w-full mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Settings &amp; Surface Connections</h1>
          <p className="text-sm text-ink-secondary mt-1">
            Pair your Chrome extension and Telegram assistant using secure one-time pairing codes.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chrome Extension Pairing */}
          <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-edge-default">
              <Puzzle className="w-5 h-5 text-brand-blue" />
              <div>
                <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">Chrome Extension Pairing</h2>
                <span className="text-xs text-ink-muted">Connect your browser extension to this account</span>
              </div>
            </div>

            <p className="text-xs text-ink-secondary leading-relaxed">
              Generate a temporary 6-character code and enter it into the ApplyRecall extension popup. Valid for 15 minutes.
            </p>

            <div className="p-4 bg-brand-soft rounded-btn border border-edge-default flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-ink-muted block uppercase tracking-wider">Extension Pairing Code</span>
                <span className="text-xl font-mono font-bold text-brand-blue tracking-widest mt-0.5 block">
                  {extCode || '••••••'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {extCode && (
                  <button
                    onClick={() => copyToClipboard(extCode, 'ext')}
                    className="p-2 bg-white border border-edge-default rounded-btn text-ink-secondary hover:text-ink-primary"
                    title="Copy code"
                  >
                    {copiedKey === 'ext' ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
                <button
                  onClick={generateExtensionCode}
                  disabled={extLoading}
                  className="px-4 py-2 text-xs font-semibold bg-brand-blue text-white rounded-btn hover:bg-brand-deep disabled:opacity-50 shadow-subtle"
                >
                  {extLoading ? 'Generating...' : extCode ? 'Regenerate Code' : 'Generate Code'}
                </button>
              </div>
            </div>
          </section>

          {/* Telegram Pairing */}
          <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-edge-default">
              <Send className="w-5 h-5 text-sky-600" />
              <div>
                <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">Telegram Assistant Linking</h2>
                <span className="text-xs text-ink-muted">Connect your phone to manage applications on the go</span>
              </div>
            </div>

            <p className="text-xs text-ink-secondary leading-relaxed">
              Generate a code, open Telegram, and send: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-brand-blue font-mono font-bold">/link YOUR_CODE</code>
            </p>

            <div className="p-4 bg-brand-soft rounded-btn border border-edge-default flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-ink-muted block uppercase tracking-wider">Telegram Pairing Code</span>
                <span className="text-xl font-mono font-bold text-sky-600 tracking-widest mt-0.5 block">
                  {tgCode || '••••••'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {tgCode && (
                  <button
                    onClick={() => copyToClipboard(tgCode, 'tg')}
                    className="p-2 bg-white border border-edge-default rounded-btn text-ink-secondary hover:text-ink-primary"
                    title="Copy code"
                  >
                    {copiedKey === 'tg' ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
                <button
                  onClick={generateTelegramCode}
                  disabled={tgLoading}
                  className="px-4 py-2 text-xs font-semibold bg-sky-600 text-white rounded-btn hover:bg-sky-700 disabled:opacity-50 shadow-subtle"
                >
                  {tgLoading ? 'Generating...' : tgCode ? 'Regenerate Code' : 'Generate Code'}
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Telegram Interactive Simulator */}
        <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-edge-default">
            <div className="flex items-center gap-2.5">
              <MessageSquare className="w-5 h-5 text-brand-blue" />
              <div>
                <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">Telegram Assistant Interactive Simulator</h2>
                <span className="text-xs text-ink-muted">Test real Telegram commands and conversational AI workflows</span>
              </div>
            </div>
            <span className="text-[11px] bg-blue-50 text-brand-blue font-semibold px-2 py-0.5 rounded-full border border-blue-200">
              Live Python Handler
            </span>
          </div>

          <div className="bg-brand-soft border border-edge-default rounded-card p-4 h-64 overflow-y-auto space-y-3 font-sans">
            {simHistory.map((msg, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-card text-xs leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-brand-blue text-white rounded-tr-none'
                      : 'bg-white text-ink-primary border border-edge-default rounded-tl-none shadow-subtle'
                  }`}
                  dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br/>') }}
                />
              </div>
            ))}
            {simLoading && (
              <div className="text-xs text-ink-muted animate-pulse">ApplyRecall Assistant is typing...</div>
            )}
          </div>

          {/* Quick Command Suggestions */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="text-ink-muted py-1">Quick prompts:</span>
            {[
              '/summary',
              'Any update from Acme?',
              'Update Acme to Interview',
              'Draft a follow-up for Acme',
              'Show my interviews',
              '/applications'
            ].map((cmd) => (
              <button
                key={cmd}
                onClick={() => { setSimInput(cmd); }}
                className="px-2.5 py-1 bg-white border border-edge-default rounded-btn hover:border-edge-strong text-ink-secondary text-[11px] font-medium"
              >
                {cmd}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <form onSubmit={handleSimulateSend} className="flex gap-2">
            <input
              type="text"
              value={simInput}
              onChange={(e) => setSimInput(e.target.value)}
              placeholder="Ask a question or enter a Telegram command (e.g. /summary, Update Acme to Interview)..."
              className="flex-1 px-3 py-2 text-xs border border-edge-default rounded-btn focus:outline-none focus:border-brand-blue bg-white"
            />
            <button
              type="submit"
              disabled={simLoading || !simInput.trim()}
              className="px-4 py-2 bg-brand-blue text-white text-xs font-semibold rounded-btn hover:bg-brand-deep disabled:opacity-50 shadow-subtle"
            >
              Send Message
            </button>
          </form>
        </section>

        {/* Data Privacy & Export */}
        <section className="bg-brand-surface p-6 rounded-card border border-edge-default shadow-subtle space-y-4">
          <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide pb-3 border-b border-edge-default">
            Privacy &amp; Data Control
          </h2>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-ink-primary block">Export Complete Application Archive</span>
              <span className="text-xs text-ink-muted">Download a complete JSON backup of your profile, answer library, applications, and history.</span>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-white border border-edge-default rounded-btn hover:bg-brand-subtle text-ink-primary"
            >
              <Download className="w-4 h-4 text-ink-muted" />
              <span>Export JSON</span>
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
