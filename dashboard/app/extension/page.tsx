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
  Zap,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  FolderArchive,
  Compass,
  Globe,
  Clock,
  MousePointerClick,
  FileText,
  CheckCircle
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'

type BrowserType = 'chrome' | 'edge' | 'brave' | 'arc'

interface BrowserInfo {
  name: string
  url: string
  toggleLocation: string
  notes: string
}

const BROWSER_CONFIGS: Record<BrowserType, BrowserInfo> = {
  chrome: {
    name: 'Google Chrome',
    url: 'chrome://extensions',
    toggleLocation: 'Top-right corner toggle',
    notes: 'Standard Chromium experience with instant 1-click sync'
  },
  edge: {
    name: 'Microsoft Edge',
    url: 'edge://extensions',
    toggleLocation: 'Left sidebar toggle',
    notes: 'Fully compatible with all Manifest V3 autofill capabilities'
  },
  brave: {
    name: 'Brave Browser',
    url: 'brave://extensions',
    toggleLocation: 'Top-right corner toggle',
    notes: 'Works seamlessly with Brave Shields enabled'
  },
  arc: {
    name: 'Arc Browser',
    url: 'arc://extensions',
    toggleLocation: 'Extensions settings panel',
    notes: 'Hit ⌘T / Ctrl+T and type "Extensions" to access'
  }
}

const FAQS = [
  {
    question: 'How do I know which folder to select in "Load unpacked"?',
    answer: 'After unzipping applyrecall-extension.zip, look inside. Select the folder named "extension" that directly contains manifest.json and background.js. Do not select the raw zip file.'
  },
  {
    question: 'Do I need to repeat this installation every time I open my browser?',
    answer: 'No! Chromium browsers keep your unpacked extension permanently installed and active until you choose to remove it. You only need to do this once.'
  },
  {
    question: 'How does the extension autofill my applications on job sites?',
    answer: 'When you open an application on Greenhouse, Lever, Workday, or Handshake, the extension automatically detects the fields. Click the floating ApplyRecall widget or extension popup to autofill your verified information in under 1.5 seconds.'
  },
  {
    question: 'What is the fastest way to pair the extension with my account?',
    answer: 'Simply keep this website open in any tab! Open the extension popup in your browser toolbar and click "✨ Sync from Active Website Login". It detects your active login session instantly without needing to type anything.'
  },
  {
    question: 'How do I update the extension when a new version comes out?',
    answer: 'Download the new zip package, overwrite your existing extension folder, and click the circular reload icon (🔄) next to ApplyRecall on your chrome://extensions page.'
  }
]

const PLATFORMS = [
  'Greenhouse ATS',
  'Lever.co',
  'Workday Jobs',
  'AshbyHQ',
  'Taleo Oracle',
  'LinkedIn Easy Apply',
  'Handshake Jobs',
  'SmartRecruiters',
  'iCIMS',
  'Custom Career Portals'
]

const QUICK_STEPS = ['Download', 'Extract', 'Load unpacked', 'Sync']

export default function ExtensionPage() {
  const { user, profile } = useAuth()
  const [extCode, setExtCode] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [selectedBrowser, setSelectedBrowser] = useState<BrowserType>('chrome')
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0)

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

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Student'
  const displayEmail = profile?.email || user?.email || 'your-account@applyrecall.com'

  const activeBrowserConfig = BROWSER_CONFIGS[selectedBrowser]
  const codeChars = (extCode || '').split('')

  const installSteps: { title: string; body: React.ReactNode }[] = [
    {
      title: 'Download & extract the ZIP',
      body: (
        <>
          Use <strong className="text-ink-primary">Download Extension</strong> above, then right-click the file and pick{' '}
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
          Find the <strong className="text-ink-primary">Developer mode</strong> toggle in the{' '}
          {activeBrowserConfig.toggleLocation.toLowerCase()} of that page and switch it on.
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

      <main className="flex-1 w-full max-w-[1304px] mx-auto px-5 sm:px-8 py-7 space-y-6">
        {/* ------------------------------------------------ Hero */}
        <section className="relative overflow-hidden rounded-container border border-edge-default bg-brand-surface shadow-subtle">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-light via-brand-surface to-brand-surface" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-blue/[0.06] blur-2xl" />

          <div className="relative grid gap-7 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/20 bg-brand-surface/80 px-3 py-1 text-[11px] font-semibold text-brand-blue">
                  <Puzzle className="h-3.5 w-3.5" />
                  Manifest V3 · Chromium
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-status-success">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {displayName}
                </span>
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold leading-tight tracking-tight text-ink-primary sm:text-[30px]">
                  Autofill job applications,
                  <br className="hidden sm:block" /> remember every answer.
                </h1>
                <p className="max-w-xl text-sm leading-relaxed text-ink-secondary">
                  Fill repetitive ATS forms in seconds and reuse essays you have already approved — on Lever,
                  Greenhouse, Workday and more.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-brand-blue" />
                  <span className="text-xs font-semibold text-ink-primary">Under 1.5s</span>
                  <span className="text-[11px] text-ink-muted">per form</span>
                </div>
                <span className="hidden h-4 w-px bg-edge-default sm:block" />
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-brand-blue" />
                  <span className="text-xs font-semibold text-ink-primary">{PLATFORMS.length}+</span>
                  <span className="text-[11px] text-ink-muted">job platforms</span>
                </div>
                <span className="hidden h-4 w-px bg-edge-default sm:block" />
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-brand-blue" />
                  <span className="text-xs font-semibold text-ink-primary">Answer library</span>
                  <span className="text-[11px] text-ink-muted">reused everywhere</span>
                </div>
              </div>
            </div>

            {/* Download panel */}
            <div className="rounded-card border border-edge-default bg-brand-surface/95 p-4 shadow-subtle backdrop-blur-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Extension package
                </span>
                <span className="rounded-full border border-edge-default bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-ink-secondary">
                  .ZIP
                </span>
              </div>

              <p className="font-mono text-[11px] text-ink-muted">applyrecall-extension.zip</p>

              <a
                href="/applyrecall-extension.zip"
                download="applyrecall-extension.zip"
                className="flex w-full items-center justify-center gap-2 rounded-btn bg-brand-blue px-4 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-subtle transition-colors hover:bg-brand-deep active:scale-[0.99]"
              >
                <Download className="h-4 w-4" />
                Download Extension
              </a>

              <a
                href="/api/extension/download"
                download="applyrecall-extension.zip"
                className="flex w-full items-center justify-center gap-1.5 rounded-btn border border-edge-default bg-brand-surface px-4 py-2.5 text-[11.5px] font-semibold text-ink-secondary transition-colors hover:border-edge-strong hover:text-ink-primary"
                title="Direct server download mirror"
              >
                Server mirror
              </a>

              <p className="flex items-center justify-center gap-1.5 text-[10.5px] text-ink-muted">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Chrome · Edge · Brave · Arc
              </p>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Quick steps rail */}
        <section className="rounded-card border border-edge-default bg-brand-surface px-5 py-4 shadow-subtle">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted sm:mr-2">
              Setup
            </span>
            <ol className="flex flex-1 flex-wrap items-center gap-y-2">
              {QUICK_STEPS.map((label, index) => (
                <li key={label} className="flex items-center">
                  <span className="flex items-center gap-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                        index === QUICK_STEPS.length - 1
                          ? 'bg-emerald-50 text-status-success ring-1 ring-emerald-200'
                          : 'bg-brand-light text-brand-blue ring-1 ring-brand-blue/20'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="text-xs font-semibold text-ink-primary">{label}</span>
                  </span>
                  {index < QUICK_STEPS.length - 1 && (
                    <span className="mx-2.5 h-px w-6 bg-edge-default sm:w-10" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ol>
            <span className="text-[11px] text-ink-muted">One-time setup, ~2 minutes</span>
          </div>
        </section>

        {/* ------------------------------------------------ Pairing */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-btn bg-brand-light text-brand-blue">
                <Key className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-bold text-ink-primary">Pair the extension with your account</h2>
                <p className="text-xs text-ink-secondary">
                  Signed in as <span className="font-medium text-ink-primary">{displayEmail}</span>
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-status-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Ready to sync
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Automatic */}
            <div className="relative flex flex-col gap-3 rounded-card border border-brand-blue/25 bg-brand-light/50 p-5">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-brand-blue px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                  Recommended
                </span>
                <Sparkles className="h-4 w-4 text-brand-blue" />
              </div>

              <h3 className="text-sm font-bold text-ink-primary">Sync from your signed-in tab</h3>
              <p className="text-xs leading-relaxed text-ink-secondary">
                No codes to type. Keep this dashboard open and the extension picks up your session.
              </p>

              <ol className="space-y-2 text-xs text-ink-secondary">
                {[
                  'Keep this dashboard open in any tab.',
                  'Open the ApplyRecall popup from your toolbar.',
                  'Hit “Sync from website login”.'
                ].map((step, index) => (
                  <li key={step} className="flex gap-2.5">
                    <span className="mt-px flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand-surface text-[9.5px] font-bold text-brand-blue ring-1 ring-brand-blue/25">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-auto flex items-center justify-between gap-2 rounded-btn border border-brand-blue/25 bg-brand-surface px-3 py-2.5">
                <span className="flex items-center gap-2 text-[11.5px] font-semibold text-brand-blue">
                  <Sparkles className="h-3.5 w-3.5" />
                  Sync from website login
                </span>
                <MousePointerClick className="h-3.5 w-3.5 text-brand-blue/60" />
              </div>
            </div>

            {/* Manual code */}
            <div className="flex flex-col gap-3 rounded-card border border-edge-default bg-brand-surface p-5 shadow-subtle">
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-edge-default bg-brand-soft px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-secondary">
                  Manual code
                </span>
                <Key className="h-4 w-4 text-ink-muted" />
              </div>

              <h3 className="text-sm font-bold text-ink-primary">Your 6-character pairing code</h3>

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
                  title="Copy code to clipboard"
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
                  title="Generate a new pairing code"
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

        {/* ------------------------------------------------ Installation guide */}
        <section className="rounded-card border border-edge-default bg-brand-surface shadow-subtle">
          <div className="flex flex-col gap-4 border-b border-edge-default px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-btn bg-brand-light text-brand-blue">
                <Laptop className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-bold text-ink-primary">Install with “Load unpacked”</h2>
                <p className="text-xs text-ink-secondary">Pick your browser for the exact steps.</p>
              </div>
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
            {/* Steps */}
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

            {/* Mockup */}
            <div className="space-y-3 rounded-btn border border-edge-default bg-brand-soft p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge-default pb-3">
                <span className="flex items-center gap-2 text-[11px] font-semibold text-ink-primary">
                  <Compass className="h-3.5 w-3.5 text-brand-blue" />
                  {activeBrowserConfig.name}
                </span>
                <span className="text-[10.5px] text-ink-muted">{activeBrowserConfig.notes}</span>
              </div>

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

              <div className="space-y-3 rounded-btn border border-edge-default bg-brand-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge-default pb-2.5">
                  <span className="text-[11px] font-bold text-ink-primary">Extensions</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/20 bg-brand-light px-2 py-0.5 text-[10px] font-semibold text-brand-blue">
                    Developer mode
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    ON
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-btn bg-brand-blue px-3 py-1.5 text-[11px] font-bold text-white shadow-subtle ring-2 ring-brand-blue/25">
                    <FolderArchive className="h-3.5 w-3.5" />
                    Load unpacked
                  </span>
                  <span className="rounded-btn border border-edge-default bg-brand-soft px-2.5 py-1.5 text-[11px] font-medium text-ink-disabled">
                    Pack extension
                  </span>
                  <span className="rounded-btn border border-edge-default bg-brand-soft px-2.5 py-1.5 text-[11px] font-medium text-ink-disabled">
                    Update
                  </span>
                </div>

                <p className="text-[10.5px] text-ink-muted">
                  This is where “Load unpacked” appears once Developer mode is on.
                </p>
              </div>
            </div>
          </div>

          {/* Final step banner */}
          <div className="mx-5 mb-5 flex flex-col gap-3 rounded-btn border border-brand-blue/20 bg-brand-light px-4 py-3.5 sm:mx-6 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-blue text-[11px] font-bold text-white">
                5
              </span>
              <div>
                <h3 className="text-xs font-bold text-ink-primary">Pin it, then sync once</h3>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-secondary">
                  Use the puzzle icon to pin ApplyRecall, open the popup, and connect with the option above.
                </p>
              </div>
            </div>
            <span className="inline-flex flex-shrink-0 items-center gap-1.5 self-start rounded-btn border border-brand-blue/25 bg-brand-surface px-3 py-1.5 text-[11px] font-semibold text-brand-blue sm:self-auto">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Ready to autofill
            </span>
          </div>
        </section>

        {/* ------------------------------------------------ Capabilities */}
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-card border border-edge-default bg-brand-surface p-5 shadow-subtle">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-brand-blue" />
              <h2 className="text-sm font-bold text-ink-primary">Works across job platforms</h2>
            </div>
            <p className="text-xs leading-relaxed text-ink-secondary">
              The extension inspects the form wherever you are and fills it with your approved profile and essays.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map(platform => (
                <span
                  key={platform}
                  className="inline-flex items-center gap-1.5 rounded-full border border-edge-default bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-ink-primary"
                >
                  <Check className="h-3 w-3 text-status-success" />
                  {platform}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-card border border-edge-default bg-brand-surface p-5 shadow-subtle">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-ink-primary">Privacy by default</h2>
            </div>
            <p className="text-xs leading-relaxed text-ink-secondary">
              Your history and written answers stay tied to your account and your device token.
            </p>
            <ul className="space-y-2 pt-0.5">
              {[
                ['No keystroke logging', 'Fields are only read while an application form is on the page.'],
                ['No ad trackers', 'Your application data is never sold or shared with third parties.'],
                ['Revocable access', 'Regenerate your device connection at any time.']
              ].map(([title, copy]) => (
                <li key={title} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-px h-3.5 w-3.5 flex-shrink-0 text-emerald-600" />
                  <span className="text-xs leading-relaxed text-ink-secondary">
                    <strong className="text-ink-primary">{title}</strong> — {copy}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------ FAQ */}
        <section className="rounded-card border border-edge-default bg-brand-surface shadow-subtle">
          <div className="flex items-start gap-2.5 border-b border-edge-default px-5 py-4 sm:px-6">
            <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-btn bg-brand-light text-brand-blue">
              <HelpCircle className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink-primary">Questions &amp; troubleshooting</h2>
              <p className="text-xs text-ink-secondary">The things people ask most after installing.</p>
            </div>
          </div>

          <div className="divide-y divide-edge-default">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx
              return (
                <div key={faq.question}>
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${idx}`}
                    className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-brand-soft sm:px-6"
                  >
                    <span className="text-xs font-semibold text-ink-primary">{faq.question}</span>
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 flex-shrink-0 text-ink-muted" />
                    ) : (
                      <ChevronDown className="h-4 w-4 flex-shrink-0 text-ink-muted" />
                    )}
                  </button>

                  {isOpen && (
                    <div
                      id={`faq-panel-${idx}`}
                      className="px-5 pb-4 text-xs leading-relaxed text-ink-secondary sm:px-6"
                    >
                      {faq.answer}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </main>
    </>
  )
}
