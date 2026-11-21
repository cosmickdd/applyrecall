'use client'

import { useState, useEffect } from 'react'
import TopBar from '@/components/TopBar'
import {
  Download,
  Puzzle,
  Copy,
  Check,
  Key,
  RefreshCw,
  Laptop,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Layers,
  Zap
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

export default function ExtensionPage() {
  const { user, profile } = useAuth()
  const [extCode, setExtCode] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)

  // Auto-fetch or generate pairing code for extension
  useEffect(() => {
    let isMounted = true
    setCodeLoading(true)
    api.generatePairingCode('extension')
      .then(res => {
        if (isMounted && res?.code) {
          setExtCode(res.code)
        }
      })
      .catch(err => {
        console.error('Failed to generate extension code:', err)
      })
      .finally(() => {
        if (isMounted) setCodeLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const handleCopyCode = () => {
    if (extCode) {
      navigator.clipboard.writeText(extCode)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    }
  }

  const handleRegenerateCode = async () => {
    try {
      setCodeLoading(true)
      const res = await api.generatePairingCode('extension')
      if (res?.code) {
        setExtCode(res.code)
      }
    } catch (e) {
      console.error('Failed to regenerate extension code:', e)
    } finally {
      setCodeLoading(false)
    }
  }

  const handleCopyChromeUrl = () => {
    navigator.clipboard.writeText('chrome://extensions')
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Student'
  const displayEmail = profile?.email || user?.email || 'your-account@applyrecall.com'

  return (
    <>
      <TopBar title="Chrome Extension" />

      <main className="flex-1 p-8 max-w-[1304px] w-full mx-auto space-y-8">
        {/* Page Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-light text-brand-blue border border-brand-blue/20">
                <Puzzle className="w-3.5 h-3.5 text-brand-blue" />
                <span>Chromium Extension • Manifest V3</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-status-success border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Authenticated</span>
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-ink-primary">
              Chrome Extension &amp; Setup Guide
            </h1>
            <p className="text-sm text-ink-secondary mt-1">
              Download the extension package, generate your pairing code, and install via Chrome Developer Mode.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="/applyrecall-extension.zip"
              download="applyrecall-extension.zip"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-btn bg-brand-blue text-white text-xs font-semibold hover:bg-brand-deep transition-all shadow-subtle active:scale-[0.98]"
            >
              <Download className="w-4 h-4" />
              <span>Download Extension (.ZIP)</span>
            </a>
            <a
              href="/api/extension/download"
              download="applyrecall-extension.zip"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-btn border border-edge-default bg-brand-surface hover:bg-brand-subtle text-ink-secondary hover:text-ink-primary text-xs font-semibold transition-colors"
              title="Direct server download mirror"
            >
              <span>Mirror Link</span>
            </a>
          </div>
        </div>

        {/* Card 1: Package Overview & Pairing Code */}
        <div className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-edge-default">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-light text-brand-blue border border-brand-blue/20 flex items-center justify-center shadow-subtle flex-shrink-0">
                <Puzzle className="w-6 h-6" strokeWidth={2.2} />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink-primary">ApplyRecall Extension Package</h2>
                <div className="flex items-center gap-2.5 text-xs text-ink-muted mt-0.5">
                  <span className="font-mono text-brand-blue font-medium">applyrecall-extension.zip</span>
                  <span>•</span>
                  <span>v1.1.0</span>
                  <span>•</span>
                  <span>Ready for Developer Mode</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-emerald-50 text-status-success border border-emerald-200 px-3.5 py-2 rounded-btn text-xs font-semibold self-start sm:self-auto">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Verified Account: {displayName}</span>
            </div>
          </div>

          {/* Active Pairing Code Box */}
          <div className="p-5 rounded-btn bg-brand-soft border border-edge-default flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary">
                <Key className="w-3.5 h-3.5 text-brand-blue" />
                <span>Your Active Extension Pairing Code</span>
              </div>
              <div className="text-2xl font-mono font-bold tracking-widest text-brand-blue">
                {codeLoading ? 'GENERATING...' : extCode || '••••••'}
              </div>
              <p className="text-xs text-ink-muted leading-relaxed">
                Enter this 6-character code in the extension popup under &quot;Manual 6-Digit Code&quot;, or click <strong>&quot;✨ Sync from Active Website Login&quot;</strong> in the popup to pair automatically.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {extCode && (
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-3.5 py-2 bg-brand-surface hover:bg-brand-subtle border border-edge-default rounded-btn text-xs font-semibold text-ink-primary flex items-center gap-1.5 transition-colors shadow-subtle"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-status-success" /> : <Copy className="w-3.5 h-3.5 text-ink-secondary" />}
                  <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleRegenerateCode}
                disabled={codeLoading}
                className="px-3.5 py-2 bg-brand-light hover:bg-brand-blue hover:text-white border border-brand-blue/20 rounded-btn text-xs font-semibold text-brand-blue flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${codeLoading ? 'animate-spin' : ''}`} />
                <span>{codeLoading ? 'Generating...' : 'New Code'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Card 2: Step-by-Step Installation Guide */}
        <section className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-6 space-y-6">
          <div className="flex items-center gap-2.5 pb-2 border-b border-edge-default">
            <Laptop className="w-5 h-5 text-brand-blue" />
            <div>
              <h2 className="text-base font-bold text-ink-primary">
                How to Install Using &quot;Load Unpacked&quot; (Developer Mode)
              </h2>
              <p className="text-xs text-ink-secondary mt-0.5">
                Standard installation for Chromium browsers (Chrome, Edge, Brave, Arc)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step 1 */}
            <div className="p-4 rounded-btn bg-brand-soft border border-edge-default space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <h3 className="text-xs font-bold text-ink-primary">Download and Extract ZIP</h3>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed pl-8">
                Click <strong>&quot;Download Extension (.ZIP)&quot;</strong> above. Once downloaded, right-click <code className="bg-brand-surface px-1.5 py-0.5 rounded border border-edge-default text-brand-blue text-[11px]">applyrecall-extension.zip</code> and choose <strong>&quot;Extract All...&quot;</strong> to unpack the files.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 rounded-btn bg-brand-soft border border-edge-default space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <h3 className="text-xs font-bold text-ink-primary">Open Extension Manager</h3>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed pl-8">
                Open a new browser tab and navigate to:
              </p>
              <div className="pl-8 flex items-center gap-2 pt-1">
                <code className="px-2.5 py-1 bg-brand-surface border border-edge-default rounded-btn font-mono text-brand-blue text-xs select-all">
                  chrome://extensions
                </code>
                <button
                  type="button"
                  onClick={handleCopyChromeUrl}
                  className="px-2.5 py-1 bg-brand-surface hover:bg-brand-subtle border border-edge-default rounded-btn text-[11px] font-semibold text-ink-primary flex items-center gap-1 transition-colors shadow-subtle"
                >
                  {copiedUrl ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3 text-ink-secondary" />}
                  <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-4 rounded-btn bg-brand-soft border border-edge-default space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center">
                  3
                </span>
                <h3 className="text-xs font-bold text-ink-primary">Enable &quot;Developer mode&quot;</h3>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed pl-8">
                In the top-right corner of the Extensions page, switch the <strong>&quot;Developer mode&quot;</strong> toggle to <strong>ON</strong>. This reveals the unpacked installation buttons.
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-4 rounded-btn bg-brand-soft border border-edge-default space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center">
                  4
                </span>
                <h3 className="text-xs font-bold text-ink-primary">Click &quot;Load unpacked&quot;</h3>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed pl-8">
                Click <strong>&quot;Load unpacked&quot;</strong> in the top-left corner. Select the extracted <code className="bg-brand-surface px-1.5 py-0.5 rounded border border-edge-default text-brand-blue text-[11px]">extension</code> folder containing <code className="text-ink-muted text-[11px]">manifest.json</code>.
              </p>
            </div>
          </div>

          {/* Step 5 Banner */}
          <div className="p-4 rounded-btn bg-brand-light border border-brand-blue/20 flex items-start gap-3">
            <span className="w-6 h-6 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
              5
            </span>
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-brand-blue">
                Pin Extension &amp; Click &quot;✨ Sync from Active Website Login&quot;
              </h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Pin ApplyRecall to your browser toolbar (📌). Open the extension popup while keeping ApplyRecall open in any tab, then click <strong>&quot;✨ Sync from Active Website Login&quot;</strong>. The extension automatically detects your session and connects immediately!
              </p>
            </div>
          </div>
        </section>

        {/* Card 3: Supported Environments & Compatibility */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-5 space-y-3">
            <div className="flex items-center gap-2 text-ink-primary font-bold text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Supported Chromium Browsers</span>
            </div>
            <p className="text-xs text-ink-secondary">
              The ApplyRecall extension runs natively on all major Chromium browsers:
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs text-ink-primary font-medium">
              <div className="flex items-center gap-2 p-2 rounded-btn bg-brand-soft border border-edge-default">
                <Check className="w-3.5 h-3.5 text-status-success" />
                <span>Google Chrome</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-btn bg-brand-soft border border-edge-default">
                <Check className="w-3.5 h-3.5 text-status-success" />
                <span>Microsoft Edge</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-btn bg-brand-soft border border-edge-default">
                <Check className="w-3.5 h-3.5 text-status-success" />
                <span>Brave Browser</span>
              </div>
              <div className="flex items-center gap-2 p-2 rounded-btn bg-brand-soft border border-edge-default">
                <Check className="w-3.5 h-3.5 text-status-success" />
                <span>Arc Browser</span>
              </div>
            </div>
          </div>

          <div className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-5 space-y-3">
            <div className="flex items-center gap-2 text-ink-primary font-bold text-sm">
              <Layers className="w-4 h-4 text-brand-blue" />
              <span>Supported ATS &amp; Job Portals</span>
            </div>
            <p className="text-xs text-ink-secondary">
              Automatically autofills application fields and recalls your past essay answers across:
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1 text-xs">
              {['Greenhouse', 'Lever', 'Workday', 'Ashby', 'Taleo', 'LinkedIn Easy Apply', 'Handshake', 'Custom Careers Portals'].map(ats => (
                <span
                  key={ats}
                  className="px-2.5 py-1 rounded-btn bg-brand-soft border border-edge-default text-ink-primary font-medium text-[11px]"
                >
                  {ats}
                </span>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
