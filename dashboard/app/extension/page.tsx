'use client'

import { useState, useEffect } from 'react'
import TopBar from '@/components/TopBar'
import { Download, Copy, Check, Key, RefreshCw, Laptop, Globe } from 'lucide-react'
import { api } from '@/lib/api'

type BrowserType = 'chrome' | 'edge' | 'brave' | 'arc'

const BROWSERS: Record<BrowserType, { url: string; toggleLocation: string }> = {
  chrome: { url: 'chrome://extensions', toggleLocation: 'top-right corner' },
  edge: { url: 'edge://extensions', toggleLocation: 'left sidebar' },
  brave: { url: 'brave://extensions', toggleLocation: 'top-right corner' },
  arc: { url: 'arc://extensions', toggleLocation: 'extensions settings panel' }
}

export default function ExtensionPage() {
  const [extCode, setExtCode] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [selectedBrowser, setSelectedBrowser] = useState<BrowserType>('chrome')

  useEffect(() => {
    let isMounted = true
    setCodeLoading(true)
    api.generatePairingCode('extension')
      .then(res => {
        if (isMounted && res?.code) setExtCode(res.code)
      })
      .catch(err => console.error('Failed to generate extension code:', err))
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
      if (res?.code) setExtCode(res.code)
    } catch (e) {
      console.error('Failed to regenerate extension code:', e)
    } finally {
      setCodeLoading(false)
    }
  }

  const handleCopyBrowserUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const browser = BROWSERS[selectedBrowser]
  const codeChars = (extCode || '').split('')

  const installSteps: React.ReactNode[] = [
    <>
      Right-click the downloaded file and pick <strong className="text-ink-primary">&quot;Extract All…&quot;</strong>.
    </>,
    <>
      Paste{' '}
      <code className="rounded border border-edge-default bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] text-brand-blue">
        {browser.url}
      </code>{' '}
      into a new tab and press Enter.
    </>,
    <>
      Turn on <strong className="text-ink-primary">Developer mode</strong> in the {browser.toggleLocation}.
    </>,
    <>
      Click <strong className="text-ink-primary">Load unpacked</strong> and select the extracted{' '}
      <code className="rounded border border-edge-default bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] text-brand-blue">
        extension
      </code>{' '}
      folder.
    </>
  ]

  return (
    <>
      <TopBar title="Chrome Extension" headingLevel={2} />

      <main className="flex-1 w-full max-w-[880px] mx-auto px-5 sm:px-8 py-7 space-y-6">
        <section className="flex flex-col gap-4 rounded-container border border-edge-default bg-brand-surface p-6 shadow-subtle sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Autofill job applications</h1>
          <a
            href="/applyrecall-extension.zip"
            download="applyrecall-extension.zip"
            className="flex flex-shrink-0 items-center justify-center gap-2 rounded-btn bg-brand-blue px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-subtle transition-colors hover:bg-brand-deep active:scale-[0.99]"
          >
            <Download className="h-4 w-4" />
            Download Extension
          </a>
        </section>

        {/* Pairing */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Key className="h-4 w-4 text-brand-blue" />
            <h2 className="text-base font-bold text-ink-primary">Pair the extension</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-card border border-brand-blue/25 bg-brand-light/50 p-5">
              <h3 className="text-sm font-bold text-ink-primary">Sync from this tab</h3>
              <ol className="mt-2 space-y-2 text-xs text-ink-secondary">
                {[
                  'Keep this dashboard open in any tab.',
                  'Open the ApplyRecall popup from your toolbar.',
                  'Click “Sync from website login”.'
                ].map((step, index) => (
                  <li key={step} className="flex gap-2.5">
                    <span className="mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand-surface text-[9.5px] font-bold text-brand-blue ring-1 ring-brand-blue/25">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-card border border-edge-default bg-brand-surface p-5 shadow-subtle">
              <h3 className="text-sm font-bold text-ink-primary">Or enter a pairing code</h3>

              <div className="mt-2 flex items-center gap-1.5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <span
                    key={index}
                    className="flex h-11 flex-1 items-center justify-center rounded-lg border border-edge-default bg-brand-soft font-mono text-lg font-bold uppercase text-ink-primary"
                  >
                    {codeLoading ? (
                      <span className="h-1.5 w-3 animate-pulse rounded-full bg-edge-strong" />
                    ) : (
                      codeChars[index] || '·'
                    )}
                  </span>
                ))}
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  disabled={!extCode || codeLoading}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-btn border border-edge-default bg-brand-surface px-3 py-2 text-[11.5px] font-semibold text-ink-primary transition-colors hover:border-edge-strong disabled:opacity-50"
                >
                  {copiedCode ? (
                    <Check className="h-3.5 w-3.5 text-status-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-ink-secondary" />
                  )}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleRegenerateCode}
                  disabled={codeLoading}
                  className="flex items-center justify-center gap-1.5 rounded-btn border border-edge-default bg-brand-surface px-3 py-2 text-[11.5px] font-semibold text-ink-secondary transition-colors hover:border-edge-strong hover:text-ink-primary disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${codeLoading ? 'animate-spin text-brand-blue' : ''}`} />
                  <span>New</span>
                </button>
              </div>

              <p className="mt-3 text-[11px] text-ink-muted">
                In the popup, use “Have a pairing code instead?”.
              </p>
            </div>
          </div>
        </section>

        {/* Install */}
        <section className="rounded-card border border-edge-default bg-brand-surface shadow-subtle">
          <div className="flex flex-col gap-3 border-b border-edge-default px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <Laptop className="h-4 w-4 text-brand-blue" />
              <h2 className="text-base font-bold text-ink-primary">Install with “Load unpacked”</h2>
            </div>

            <div role="tablist" aria-label="Browser" className="flex items-center gap-1 rounded-btn border border-edge-default bg-brand-soft p-1">
              {(['chrome', 'edge', 'brave', 'arc'] as BrowserType[]).map(b => (
                <button
                  key={b}
                  type="button"
                  role="tab"
                  aria-selected={selectedBrowser === b}
                  onClick={() => setSelectedBrowser(b)}
                  className={`rounded-[9px] px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                    selectedBrowser === b
                      ? 'border border-edge-default bg-brand-surface text-brand-blue shadow-subtle'
                      : 'border border-transparent text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <ol className="space-y-3">
              {installSteps.map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-[11px] font-bold text-brand-blue ring-1 ring-brand-blue/20">
                    {index + 1}
                  </span>
                  <p className="text-xs leading-relaxed text-ink-secondary">{step}</p>
                </li>
              ))}
              <li className="flex gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-[11px] font-bold text-brand-blue ring-1 ring-brand-blue/20">
                  5
                </span>
                <p className="text-xs leading-relaxed text-ink-secondary">
                  Pin the extension, open its popup and pair with either option above.
                </p>
              </li>
            </ol>

            <div className="flex items-center gap-2 self-start rounded-btn border border-edge-default bg-brand-soft px-3 py-2">
              <Globe className="h-3.5 w-3.5 flex-shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-brand-blue">
                {browser.url}
              </span>
              <button
                type="button"
                onClick={() => handleCopyBrowserUrl(browser.url)}
                className="flex flex-shrink-0 items-center gap-1 rounded-md border border-edge-default bg-brand-surface px-2 py-1 text-[10.5px] font-semibold text-ink-secondary transition-colors hover:text-ink-primary"
              >
                {copiedUrl ? <Check className="h-3 w-3 text-status-success" /> : <Copy className="h-3 w-3" />}
                <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
