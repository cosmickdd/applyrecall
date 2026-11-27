'use client'

import { useState, useEffect } from 'react'
import TopBar from '@/components/TopBar'
import {
  Download,
  Copy,
  Check,
  Key,
  RefreshCw,
  Laptop,
  ChevronDown,
  ChevronUp,
  FolderArchive,
  Globe
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

type BrowserType = 'chrome' | 'edge' | 'brave' | 'arc'

interface BrowserInfo {
  name: string
  url: string
  toggleLocation: string
}

const BROWSER_CONFIGS: Record<BrowserType, BrowserInfo> = {
  chrome: {
    name: 'Google Chrome',
    url: 'chrome://extensions',
    toggleLocation: 'top-right corner'
  },
  edge: {
    name: 'Microsoft Edge',
    url: 'edge://extensions',
    toggleLocation: 'left sidebar'
  },
  brave: {
    name: 'Brave Browser',
    url: 'brave://extensions',
    toggleLocation: 'top-right corner'
  },
  arc: {
    name: 'Arc Browser',
    url: 'arc://extensions',
    toggleLocation: 'extensions settings panel'
  }
}

export default function ExtensionPage() {
  const { user, profile } = useAuth()
  const [extCode, setExtCode] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [selectedBrowser, setSelectedBrowser] = useState<BrowserType>('chrome')
  const [showHelp, setShowHelp] = useState(false)

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

  const handleCopyBrowserUrl = (url: string) => {
    navigator.clipboard.writeText(url)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  const displayEmail = profile?.email || user?.email || ''
  const activeBrowserConfig = BROWSER_CONFIGS[selectedBrowser]
  const codeChars = (extCode || '').split('')

  const installSteps: { title: string; body: React.ReactNode }[] = [
    {
      title: 'Download & extract the ZIP',
      body: (
        <>
          Right-click the downloaded file and pick{' '}
          <strong className="text-ink-primary">&quot;Extract All…&quot;</strong> so you end up with a normal folder.
        </>
      )
    },
    {
      title: 'Open your extensions manager',
      body: (
        <>
          Paste{' '}
          <code className="rounded border border-edge-default bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] text-brand-blue">
            {activeBrowserConfig.url}
          </code>{' '}
          into a new tab and press Enter.
        </>
      )
    },
    {
      title: 'Turn Developer mode ON',
      body: (
        <>
          Switch on <strong className="text-ink-primary">Developer mode</strong> in the{' '}
          {activeBrowserConfig.toggleLocation} of that page.
        </>
      )
    },
    {
      title: 'Click "Load unpacked" and pick the folder',
      body: (
        <>
          Choose the extracted folder named{' '}
          <code className="rounded border border-edge-default bg-brand-soft px-1.5 py-0.5 font-mono text-[11px] text-brand-blue">
            extension
          </code>{' '}
          — the one that contains <span className="font-mono text-[11px] text-ink-muted">manifest.json</span>.
        </>
      )
    }
  ]

  return (
    <>
      <TopBar title="Chrome Extension" />

      <main className="flex-1 w-full max-w-[1100px] mx-auto px-5 sm:px-8 py-7 space-y-6">
        {/* ------------------------------------------------ Hero + download */}
        <section className="rounded-container border border-edge-default bg-brand-surface p-6 shadow-subtle sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-center">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold leading-tight tracking-tight text-ink-primary sm:text-[28px]">
                Autofill job applications
              </h1>
              <p className="max-w-lg text-sm leading-relaxed text-ink-secondary">
                Fill ATS forms from your ApplyRecall profile, then pair the extension with your account below.
              </p>
            </div>

            <div className="rounded-card border border-edge-default bg-brand-soft p-4 space-y-3">
              <p className="font-mono text-[11px] text-ink-muted">applyrecall-extension.zip</p>
              <a
                href="/applyrecall-extension.zip"
                download="applyrecall-extension.zip"
                className="flex w-full items-center justify-center gap-2 rounded-btn bg-brand-blue px-4 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-subtle transition-colors hover:bg-brand-deep active:scale-[0.99]"
              >
                <Download className="h-4 w-4" />
                Download Extension
              </a>
              <p className="text-center text-[11px] text-ink-muted">Chrome · Edge · Brave · Arc</p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Pairing */}
        <section className="space-y-4">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-btn bg-brand-light text-brand-blue">
              <Key className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink-primary">Pair the extension with your account</h2>
              {displayEmail && (
                <p className="text-xs text-ink-secondary">
                  Signed in as <span className="font-medium text-ink-primary">{displayEmail}</span>
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Automatic */}
            <div className="flex flex-col gap-3 rounded-card border border-brand-blue/25 bg-brand-light/50 p-5">
              <h3 className="text-sm font-bold text-ink-primary">Sync from your signed-in tab</h3>
              <ol className="space-y-2 text-xs text-ink-secondary">
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

            {/* Manual code */}
            <div className="flex flex-col gap-3 rounded-card border border-edge-default bg-brand-surface p-5 shadow-subtle">
              <h3 className="text-sm font-bold text-ink-primary">Or enter your 6-character pairing code</h3>

              <div className="flex items-center gap-1.5 py-1">
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

              <div className="flex gap-2">
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
                  <span>{copiedCode ? 'Copied' : 'Copy code'}</span>
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

              <p className="mt-auto text-[11px] leading-relaxed text-ink-muted">
                In the popup, open <span className="font-medium text-ink-secondary">Have a pairing code instead?</span>{' '}
                and enter the code.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Installation */}
        <section className="rounded-card border border-edge-default bg-brand-surface shadow-subtle">
          <div className="flex flex-col gap-4 border-b border-edge-default px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-btn bg-brand-light text-brand-blue">
                <Laptop className="h-4 w-4" />
              </span>
              <h2 className="mt-1 text-base font-bold text-ink-primary">Install with “Load unpacked”</h2>
            </div>

            <div
              role="tablist"
              aria-label="Browser"
              className="flex items-center gap-1 self-start rounded-btn border border-edge-default bg-brand-soft p-1 sm:self-auto"
            >
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

          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1fr]">
            <ol className="space-y-0">
              {installSteps.map((step, index) => (
                <li key={step.title} className="flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-light text-[11px] font-bold text-brand-blue ring-1 ring-brand-blue/20">
                      {index + 1}
                    </span>
                    {index < installSteps.length - 1 && <span className="w-px flex-1 bg-edge-default" />}
                  </div>
                  <div className={`min-w-0 ${index < installSteps.length - 1 ? 'pb-5' : ''}`}>
                    <h3 className="text-xs font-bold text-ink-primary">{step.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="space-y-3 rounded-btn border border-edge-default bg-brand-soft p-4">
              <p className="text-[11px] font-semibold text-ink-primary">{activeBrowserConfig.name}</p>

              <div className="flex items-center gap-2 rounded-btn border border-edge-default bg-brand-surface px-3 py-2 shadow-subtle">
                <Globe className="h-3.5 w-3.5 flex-shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold text-brand-blue">
                  {activeBrowserConfig.url}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyBrowserUrl(activeBrowserConfig.url)}
                  className="flex flex-shrink-0 items-center gap-1 rounded-md border border-edge-default px-2 py-1 text-[10.5px] font-semibold text-ink-secondary transition-colors hover:text-ink-primary"
                >
                  {copiedUrl ? (
                    <Check className="h-3 w-3 text-status-success" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="space-y-2.5 rounded-btn border border-edge-default bg-brand-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge-default pb-2.5">
                  <span className="text-[11px] font-bold text-ink-primary">Extensions</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/20 bg-brand-light px-2 py-0.5 text-[10px] font-semibold text-brand-blue">
                    Developer mode
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    ON
                  </span>
                </div>

                <span className="flex items-center gap-1.5 rounded-btn bg-brand-blue px-3 py-1.5 text-[11px] font-bold text-white shadow-subtle ring-2 ring-brand-blue/25">
                  <FolderArchive className="h-3.5 w-3.5" />
                  Load unpacked
                </span>
              </div>
            </div>
          </div>

          <div className="mx-5 mb-5 flex items-start gap-3 rounded-btn border border-brand-blue/20 bg-brand-light px-4 py-3.5 sm:mx-6 sm:mb-6">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-blue text-[11px] font-bold text-white">
              5
            </span>
            <div>
              <h3 className="text-xs font-bold text-ink-primary">Pin it, then sync once</h3>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-secondary">
                Pin ApplyRecall from the puzzle icon, open the popup, and connect with either option above.
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Help */}
        <section className="rounded-card border border-edge-default bg-brand-surface shadow-subtle">
          <button
            type="button"
            onClick={() => setShowHelp(v => !v)}
            aria-expanded={showHelp}
            aria-controls="extension-help"
            className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-brand-soft sm:px-6"
          >
            <span className="text-xs font-semibold text-ink-primary">
              Troubleshooting: which folder do I select, and do I repeat this?
            </span>
            {showHelp ? (
              <ChevronUp className="h-4 w-4 flex-shrink-0 text-ink-muted" />
            ) : (
              <ChevronDown className="h-4 w-4 flex-shrink-0 text-ink-muted" />
            )}
          </button>

          {showHelp && (
            <div id="extension-help" className="space-y-2 px-5 pb-4 text-xs leading-relaxed text-ink-secondary sm:px-6">
              <p>
                Select the extracted folder named <span className="font-mono text-[11px]">extension</span> — the one
                that contains manifest.json — not the zip file itself.
              </p>
              <p>
                You only install once. Chromium keeps the unpacked extension active until you remove it; if you are not
                signed in, use the pairing options above again.
              </p>
            </div>
          )}
        </section>
      </main>
    </>
  )
}
