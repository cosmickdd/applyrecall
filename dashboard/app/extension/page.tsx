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
  Zap,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  FolderArchive,
  Compass,
  FileCheck,
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

  return (
    <>
      <TopBar title="Chrome Extension" />

      <main className="flex-1 p-6 sm:p-8 max-w-[1304px] w-full mx-auto space-y-8">
        {/* Header Banner */}
        <div className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand-light text-brand-blue border border-brand-blue/20">
                <Puzzle className="w-3.5 h-3.5 text-brand-blue" />
                <span>Chromium Extension • Manifest V3</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-status-success border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Account Verified: {displayName}</span>
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-primary">
              ApplyRecall Chrome Extension
            </h1>
            <p className="text-sm text-ink-secondary leading-relaxed">
              Autofill repetitive job forms in under 1.5 seconds, remember past approved essays across Lever, Greenhouse, and Workday, and track every application automatically.
            </p>
          </div>

          {/* Quick Primary Actions */}
          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-stretch sm:items-center gap-3 flex-shrink-0">
            <a
              href="/applyrecall-extension.zip"
              download="applyrecall-extension.zip"
              className="px-5 py-3 rounded-btn bg-brand-blue text-white text-xs font-bold uppercase tracking-wider hover:bg-brand-deep transition-all shadow-subtle flex items-center justify-center gap-2.5 active:scale-[0.98]"
            >
              <Download className="w-4 h-4 text-white" />
              <span>Download Extension (.ZIP)</span>
            </a>
            <a
              href="/api/extension/download"
              download="applyrecall-extension.zip"
              className="px-4 py-3 rounded-btn border border-edge-default bg-brand-surface hover:bg-brand-subtle text-ink-secondary hover:text-ink-primary text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              title="Direct server download mirror"
            >
              <span>Server Mirror</span>
            </a>
          </div>
        </div>

        {/* 4-Step Visual Installation Stepper */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-5 space-y-2 relative">
            <div className="w-8 h-8 rounded-full bg-brand-light text-brand-blue font-bold text-xs flex items-center justify-center border border-brand-blue/20">
              1
            </div>
            <h3 className="font-bold text-sm text-ink-primary">Download Zip</h3>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Grab <span className="font-mono text-brand-blue font-medium">applyrecall-extension.zip</span> from the download button above.
            </p>
          </div>

          <div className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-5 space-y-2 relative">
            <div className="w-8 h-8 rounded-full bg-brand-light text-brand-blue font-bold text-xs flex items-center justify-center border border-brand-blue/20">
              2
            </div>
            <h3 className="font-bold text-sm text-ink-primary">Unzip Folder</h3>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Right-click the zip file, choose <strong>&quot;Extract All...&quot;</strong> to unpack into a regular folder.
            </p>
          </div>

          <div className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-5 space-y-2 relative">
            <div className="w-8 h-8 rounded-full bg-brand-light text-brand-blue font-bold text-xs flex items-center justify-center border border-brand-blue/20">
              3
            </div>
            <h3 className="font-bold text-sm text-ink-primary">Load Unpacked</h3>
            <p className="text-xs text-ink-secondary leading-relaxed">
              In <code className="text-brand-blue bg-brand-soft px-1 rounded text-[11px]">chrome://extensions</code>, turn on Developer mode and pick the folder.
            </p>
          </div>

          <div className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-5 space-y-2 relative">
            <div className="w-8 h-8 rounded-full bg-emerald-50 text-status-success font-bold text-xs flex items-center justify-center border border-emerald-200">
              4
            </div>
            <h3 className="font-bold text-sm text-ink-primary">1-Click Sync</h3>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Pin the extension (📌), open it, and tap <strong>&quot;✨ Sync from Active Website Login&quot;</strong>.
            </p>
          </div>
        </div>

        {/* Pairing Code & Authentication Sync Card */}
        <div className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-edge-default">
            <div>
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-brand-blue" />
                <h2 className="text-base font-bold text-ink-primary">Extension Account Pairing</h2>
              </div>
              <p className="text-xs text-ink-secondary mt-0.5">
                Two seamless ways to connect your extension to your verified account ({displayEmail})
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-btn self-start sm:self-auto">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Ready to Sync</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Method A: 1-Click Active Website Sync (Recommended) */}
            <div className="p-5 rounded-btn bg-brand-light/60 border border-brand-blue/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-blue px-2.5 py-0.5 rounded-full bg-brand-light border border-brand-blue/30">
                  Option A • Fastest &amp; Automatic
                </span>
                <Sparkles className="w-4 h-4 text-brand-blue" />
              </div>
              <h3 className="font-bold text-sm text-ink-primary">1-Click Sync from Website</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                With this dashboard open in your browser, simply click the ApplyRecall extension icon in your toolbar and press:
              </p>
              <div className="p-3 bg-brand-surface rounded-btn border border-brand-blue/30 text-xs font-semibold text-brand-blue flex items-center justify-center gap-2 shadow-subtle">
                <Sparkles className="w-4 h-4 text-brand-blue" />
                <span>✨ Sync from Active Website Login</span>
              </div>
              <p className="text-[11.5px] text-ink-muted">
                The extension reads your active login token and connects instantly—no manual typing required.
              </p>
            </div>

            {/* Method B: 6-Digit Pairing Code */}
            <div className="p-5 rounded-btn bg-brand-soft border border-edge-default space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary px-2.5 py-0.5 rounded-full bg-brand-surface border border-edge-default">
                  Option B • Manual Code
                </span>
                <Key className="w-4 h-4 text-ink-secondary" />
              </div>
              <h3 className="font-bold text-sm text-ink-primary">Your 6-Character Pairing Code</h3>
              <div className="flex items-center justify-between gap-3 p-3 bg-brand-surface rounded-btn border border-edge-default shadow-subtle">
                <div className="text-2xl font-mono font-bold tracking-[0.25em] text-brand-blue pl-2">
                  {codeLoading ? '••••••' : extCode || '••••••'}
                </div>

                <div className="flex items-center gap-1.5">
                  {extCode && (
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="px-3 py-1.5 bg-brand-soft hover:bg-brand-subtle border border-edge-default rounded-btn text-xs font-semibold text-ink-primary flex items-center gap-1.5 transition-colors"
                      title="Copy code to clipboard"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-status-success" /> : <Copy className="w-3.5 h-3.5 text-ink-secondary" />}
                      <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRegenerateCode}
                    disabled={codeLoading}
                    className="p-1.5 bg-brand-soft hover:bg-brand-subtle border border-edge-default rounded-btn text-ink-secondary hover:text-ink-primary transition-colors disabled:opacity-50"
                    title="Generate a new pairing code"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${codeLoading ? 'animate-spin text-brand-blue' : ''}`} />
                  </button>
                </div>
              </div>
              <p className="text-[11.5px] text-ink-muted">
                Type this code into the extension popup under &quot;Manual 6-Digit Code&quot; and click Connect.
              </p>
            </div>
          </div>
        </div>

        {/* Interactive Step-by-Step Installation Guide */}
        <section className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-edge-default">
            <div className="flex items-center gap-2.5">
              <Laptop className="w-5 h-5 text-brand-blue" />
              <div>
                <h2 className="text-base font-bold text-ink-primary">
                  Step-by-Step Installation Guide (Load Unpacked)
                </h2>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Select your browser below for customized step-by-step instructions:
                </p>
              </div>
            </div>

            {/* Browser Selector Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-brand-soft border border-edge-default rounded-btn self-start sm:self-auto">
              {(['chrome', 'edge', 'brave', 'arc'] as BrowserType[]).map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSelectedBrowser(b)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                    selectedBrowser === b
                      ? 'bg-brand-surface text-brand-blue shadow-subtle border border-edge-default'
                      : 'text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Visual Browser Mockup & Action Bar */}
          <div className="p-4 sm:p-5 rounded-card bg-brand-soft border border-edge-default space-y-4">
            <div className="flex items-center justify-between text-xs text-ink-muted pb-3 border-b border-edge-default">
              <span className="font-semibold text-ink-primary flex items-center gap-2">
                <Compass className="w-4 h-4 text-brand-blue" />
                <span>{activeBrowserConfig.name} Setup Panel</span>
              </span>
              <span>{activeBrowserConfig.notes}</span>
            </div>

            {/* Interactive Browser Address Bar Mockup */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-brand-surface border border-edge-default rounded-btn shadow-subtle">
                <span className="text-xs text-ink-muted font-mono select-none">🌐</span>
                <span className="font-mono text-xs text-brand-blue font-semibold select-all">
                  {activeBrowserConfig.url}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyBrowserUrl(activeBrowserConfig.url)}
                className="px-4 py-2 bg-brand-surface hover:bg-brand-subtle border border-edge-default rounded-btn text-xs font-semibold text-ink-primary flex items-center justify-center gap-1.5 transition-colors shadow-subtle flex-shrink-0"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-status-success" /> : <Copy className="w-3.5 h-3.5 text-ink-secondary" />}
                <span>{copiedUrl ? 'Copied URL!' : 'Copy URL to Clipboard'}</span>
              </button>
            </div>

            {/* Visual Diagram of Chrome Extensions Page */}
            <div className="p-4 rounded-btn bg-brand-surface border border-edge-default shadow-subtle space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs pb-3 border-b border-edge-default">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink-primary">Extensions Manager</span>
                  <span className="text-[11px] text-ink-muted">({activeBrowserConfig.url})</span>
                </div>
                <div className="flex items-center gap-2 bg-brand-light px-2.5 py-1 rounded-full border border-brand-blue/20">
                  <span className="text-[11px] font-semibold text-brand-blue">Developer mode:</span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>ON</span>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <div className="px-3 py-1.5 rounded-btn bg-brand-blue text-white text-xs font-bold flex items-center gap-1.5 shadow-subtle ring-2 ring-brand-blue/30">
                  <FolderArchive className="w-3.5 h-3.5" />
                  <span>Load unpacked</span>
                </div>
                <div className="px-3 py-1.5 rounded-btn bg-brand-soft text-ink-muted text-xs font-medium border border-edge-default opacity-60">
                  Pack extension
                </div>
                <div className="px-3 py-1.5 rounded-btn bg-brand-soft text-ink-muted text-xs font-medium border border-edge-default opacity-60">
                  Update
                </div>
                <span className="text-xs text-brand-blue font-medium ml-2">
                  ← Click this button in your browser
                </span>
              </div>
            </div>
          </div>

          {/* 4 Step Cards with Detailed Explanations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step 1 */}
            <div className="p-5 rounded-btn bg-brand-soft border border-edge-default space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  1
                </span>
                <h3 className="text-xs font-bold text-ink-primary">Download &amp; Extract the ZIP</h3>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed pl-9">
                Click <strong>&quot;Download Extension (.ZIP)&quot;</strong> above. Once downloaded to your computer, right-click <code className="bg-brand-surface px-1.5 py-0.5 rounded border border-edge-default text-brand-blue text-[11px]">applyrecall-extension.zip</code> and select <strong>&quot;Extract All...&quot;</strong>.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-5 rounded-btn bg-brand-soft border border-edge-default space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  2
                </span>
                <h3 className="text-xs font-bold text-ink-primary">Navigate to Extensions</h3>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed pl-9">
                Open a new tab, copy and paste <code className="bg-brand-surface px-1.5 py-0.5 rounded border border-edge-default text-brand-blue text-[11px] font-mono">{activeBrowserConfig.url}</code> into your address bar, and press Enter.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-5 rounded-btn bg-brand-soft border border-edge-default space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  3
                </span>
                <h3 className="text-xs font-bold text-ink-primary">Toggle &quot;Developer mode&quot; ON</h3>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed pl-9">
                Look for the <strong>&quot;Developer mode&quot;</strong> toggle in {activeBrowserConfig.toggleLocation.toLowerCase()}. Switch it to <strong>ON</strong> to reveal the unpacked loading toolbar.
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-5 rounded-btn bg-brand-soft border border-edge-default space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  4
                </span>
                <h3 className="text-xs font-bold text-ink-primary">Select the &quot;extension&quot; Folder</h3>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed pl-9">
                Click <strong>&quot;Load unpacked&quot;</strong>, browse into your unzipped directory, and select the folder named <code className="bg-brand-surface px-1.5 py-0.5 rounded border border-edge-default text-brand-blue text-[11px]">extension</code> (the one that contains <code className="text-ink-muted text-[11px]">manifest.json</code>).
              </p>
            </div>
          </div>

          {/* Step 5 Banner: Pin & Sync */}
          <div className="p-5 rounded-card bg-brand-light border border-brand-blue/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <span className="w-8 h-8 rounded-full bg-brand-blue text-white text-sm font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                5
              </span>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-brand-blue">
                  Pin to Toolbar &amp; 1-Click Sync
                </h3>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Click the browser puzzle piece icon (🧩) and pin ApplyRecall (📌) so it stays visible. Open the extension popup while keeping this website tab open and tap <strong>&quot;✨ Sync from Active Website Login&quot;</strong>!
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
              <div className="px-3.5 py-2 bg-brand-surface border border-brand-blue/30 rounded-btn text-xs font-semibold text-brand-blue flex items-center gap-2 shadow-subtle">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Ready to Autofill</span>
              </div>
            </div>
          </div>
        </section>

        {/* ATS & Job Board Detection Capability Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-6 space-y-4">
            <div className="flex items-center gap-2 text-ink-primary font-bold text-sm">
              <Zap className="w-4 h-4 text-brand-blue" />
              <span>Automatic Form Detection Across Job Platforms</span>
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              When you open an application on any supported ATS, the extension automatically inspects fields and surfaces your approved profile and essays:
            </p>
            <div className="flex flex-wrap gap-2 pt-1 text-xs">
              {[
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
              ].map(ats => (
                <span
                  key={ats}
                  className="px-3 py-1.5 rounded-btn bg-brand-soft border border-edge-default text-ink-primary font-medium text-xs flex items-center gap-1.5 shadow-subtle"
                >
                  <Check className="w-3 h-3 text-status-success" />
                  <span>{ats}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-6 space-y-4">
            <div className="flex items-center gap-2 text-ink-primary font-bold text-sm">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Privacy &amp; On-Device Memory Security</span>
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Your career documents, personal history, and past written answers are stored securely under bank-grade encryption:
            </p>
            <div className="space-y-2.5 text-xs text-ink-secondary pt-1">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span><strong>No keystroke logging:</strong> Only scans input fields when application forms are active.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span><strong>Zero advertising trackers:</strong> We never sell application data or history to third parties.</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span><strong>Device token authentication:</strong> Revoke or regenerate your extension connection at any time.</span>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ & Troubleshooting Accordion */}
        <section className="bg-brand-surface rounded-card border border-edge-default shadow-subtle p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-edge-default">
            <HelpCircle className="w-5 h-5 text-brand-blue" />
            <div>
              <h2 className="text-base font-bold text-ink-primary">Frequently Asked Questions</h2>
              <p className="text-xs text-ink-secondary mt-0.5">Quick answers to common extension questions</p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx
              return (
                <div
                  key={faq.question}
                  className="rounded-btn border border-edge-default bg-brand-soft overflow-hidden transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    className="w-full px-4 py-3.5 text-left text-xs font-bold text-ink-primary flex items-center justify-between gap-4 hover:bg-brand-subtle transition-colors"
                  >
                    <span>{faq.question}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-ink-muted flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-ink-muted flex-shrink-0" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 text-xs text-ink-secondary leading-relaxed border-t border-edge-default/60 bg-brand-surface">
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
