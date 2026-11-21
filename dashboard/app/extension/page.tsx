'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Download,
  Puzzle,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  Laptop,
  Key,
  Sparkles,
  ArrowLeft,
  Lock,
  ExternalLink,
  Zap,
  CheckCircle2
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { api } from '@/lib/api'
import AuthModal from '@/components/AuthModal'

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@500&family=Instrument+Serif:ital@1&family=Inter+Tight:wght@400..700&display=swap'

export default function ExtensionDownloadPage() {
  const router = useRouter()
  const { user, profile, token } = useAuth()
  const isLoggedIn = Boolean(token || user)

  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [extCode, setExtCode] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  // Auto-generate pairing code if user is logged in
  useEffect(() => {
    if (isLoggedIn && !extCode) {
      setCodeLoading(true)
      api.generatePairingCode('extension')
        .then(res => setExtCode(res.code))
        .catch(() => {})
        .finally(() => setCodeLoading(false))
    }
  }, [isLoggedIn, extCode])

  const handleCopyChromeUrl = () => {
    navigator.clipboard.writeText('chrome://extensions')
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

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
      setExtCode(res.code)
    } catch (e) {
      console.error(e)
    } finally {
      setCodeLoading(false)
    }
  }

  return (
    <div className="w-full min-h-screen bg-[#040c27] text-white selection:bg-[#79bdff]/30">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS_URL} precedence="default" />

      {/* Top Navbar */}
      <header className="h-16 px-6 sm:px-10 border-b border-white/10 flex items-center justify-between bg-[#040c27]/80 backdrop-blur-xl sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 text-white hover:text-slate-200 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#79bdff] to-[#2563eb] flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span className="font-bold text-[17px] tracking-tight">ApplyRecall</span>
          </Link>
          <span className="text-slate-500 hidden sm:inline">/</span>
          <span className="text-xs font-semibold text-slate-400 hidden sm:inline">Chrome Extension</span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </Link>

          {isLoggedIn ? (
            <Link
              href="/overview"
              className="text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              Dashboard
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin')
                  setAuthModalOpen(true)
                }}
                className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg text-slate-300 hover:text-white transition-colors"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup')
                  setAuthModalOpen(true)
                }}
                className="text-xs font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-[#071029] transition-all"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-400/25 text-[#8fcbff] text-xs font-semibold tracking-wide uppercase">
            <Puzzle className="w-3.5 h-3.5 text-[#79bdff]" />
            <span>Official Chrome &amp; Chromium Extension</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Download ApplyRecall Extension
          </h1>

          <p className="text-sm text-slate-300 leading-relaxed">
            Autofill job applications in under 1.5 seconds, recall your approved essays across Lever, Greenhouse, and Workday, and track every application automatically.
          </p>
        </div>

        {/* Download Box */}
        <div className="p-6 sm:p-8 rounded-2xl bg-[#0a1128]/95 border border-[#79bdff]/30 shadow-[0_0_60px_-15px_rgba(31,74,142,0.4),0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#79bdff] to-[#2563eb] flex items-center justify-center text-white shadow-lg shadow-blue-500/25 flex-shrink-0">
                <Puzzle className="w-7 h-7" strokeWidth={2.2} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">ApplyRecall Extension Package</h2>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                  <span className="font-mono text-sky-300">applyrecall-extension.zip</span>
                  <span>•</span>
                  <span>Manifest V3</span>
                  <span>•</span>
                  <span>v1.1.0</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <a
                href="/applyrecall-extension.zip"
                download="applyrecall-extension.zip"
                className="py-3 px-6 rounded-xl font-bold text-xs uppercase tracking-wider bg-white hover:bg-slate-100 text-[#071029] shadow-[inset_0_1px_0_#fff,0_8px_24px_-8px_rgba(80,130,255,0.7)] flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              >
                <Download className="w-4 h-4 text-blue-600" />
                <span>Download Extension (.ZIP)</span>
              </a>
              <a
                href="/api/extension/download"
                download="applyrecall-extension.zip"
                className="py-3 px-4 rounded-xl font-medium text-xs bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 flex items-center justify-center gap-1.5 transition-colors"
                title="Direct mirror download link"
              >
                <span>Direct Mirror</span>
              </a>
            </div>
          </div>

          {/* Security & Login Requirement Alert */}
          <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200">
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-100 block">Website Login Required to Use Extension</span>
                <span className="text-[11.5px] text-amber-300/80 block mt-0.5">
                  To autofill application forms and recall saved answers, the extension verifies that you are logged into your ApplyRecall website account.
                </span>
              </div>
            </div>

            {!isLoggedIn ? (
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin')
                  setAuthModalOpen(true)
                }}
                className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 flex-shrink-0 transition-colors shadow-sm"
              >
                <span>Log In Now</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Logged In as {profile?.full_name || user?.email}</span>
              </div>
            )}
          </div>

          {/* Active Pairing Code (Shown when Logged In) */}
          {isLoggedIn && (
            <div className="p-4 rounded-xl bg-black/40 border border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <Key className="w-3.5 h-3.5 text-[#79bdff]" />
                  <span>Your Extension Pairing Code</span>
                </div>
                <div className="text-2xl font-mono font-bold text-sky-300 tracking-widest mt-1">
                  {codeLoading ? 'GENERATING...' : extCode || '••••••'}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Enter this 6-character code into the extension popup, or use 1-Click Sync.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {extCode && (
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 border border-white/15 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 transition-colors"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'Copied Code' : 'Copy Code'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRegenerateCode}
                  disabled={codeLoading}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {codeLoading ? 'Generating...' : 'New Code'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Complete Unpacked Folder Installation Guide */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <Laptop className="w-5 h-5 text-[#79bdff]" />
            <h2 className="text-xl font-bold tracking-tight text-white">
              How to Install Using "Load Unpacked" (Developer Mode)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Step 1 */}
            <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-[#8fcbff] font-bold text-xs flex items-center justify-center">
                1
              </div>
              <h3 className="font-bold text-sm text-white">Extract the downloaded ZIP</h3>
              <p className="text-slate-300 text-xs leading-relaxed">
                Download <code className="text-sky-300 bg-white/5 px-1.5 py-0.5 rounded">applyrecall-extension.zip</code> from the box above. Right-click the file and select <strong>"Extract All..."</strong> (or unzip) into a folder on your computer.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-[#8fcbff] font-bold text-xs flex items-center justify-center">
                2
              </div>
              <h3 className="font-bold text-sm text-white">Open Extensions in your Browser</h3>
              <p className="text-slate-300 text-xs leading-relaxed">
                Open a new tab in Chrome, Edge, Brave, or Arc, and navigate to:
              </p>
              <div className="flex items-center gap-2 pt-1">
                <code className="px-2.5 py-1 bg-black/70 border border-white/20 rounded font-mono text-sky-300 text-xs select-all">
                  chrome://extensions
                </code>
                <button
                  type="button"
                  onClick={handleCopyChromeUrl}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-[11px] font-semibold text-white flex items-center gap-1 transition-colors"
                >
                  {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-[#8fcbff] font-bold text-xs flex items-center justify-center">
                3
              </div>
              <h3 className="font-bold text-sm text-white">Enable "Developer mode"</h3>
              <p className="text-slate-300 text-xs leading-relaxed">
                In the top-right corner of the Extensions page, switch the <strong>"Developer mode"</strong> toggle to <strong>ON</strong>. This unlocks the unpacked developer options.
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-[#8fcbff] font-bold text-xs flex items-center justify-center">
                4
              </div>
              <h3 className="font-bold text-sm text-white">Click "Load unpacked" &amp; select folder</h3>
              <p className="text-slate-300 text-xs leading-relaxed">
                Click the <strong>"Load unpacked"</strong> button in the top-left corner. Browse to and select the extracted <code className="text-sky-300 bg-white/5 px-1 rounded">extension</code> folder. ApplyRecall will instantly appear in your extensions!
              </p>
            </div>
          </div>

          {/* Step 5 Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-950/60 to-black/60 border border-blue-500/30 flex items-start gap-4">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center flex-shrink-0 mt-0.5">
              5
            </div>
            <div className="space-y-1.5">
              <h3 className="font-bold text-sm text-white">Log in to ApplyRecall &amp; Sync</h3>
              <p className="text-slate-300 text-xs leading-relaxed">
                Pin ApplyRecall to your browser toolbar (📌). Open the extension popup: if you are logged in to this website tab, click <strong>"✨ Sync from Active Website Login"</strong>, or copy your 6-digit pairing code above into the popup!
              </p>
            </div>
          </div>
        </section>

        {/* Bottom Feature Badges */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/10 text-xs text-slate-300">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
            <Zap className="w-4 h-4 text-[#79bdff] flex-shrink-0" />
            <span>Autofill Greenhouse, Lever &amp; Workday in &lt; 1.5s</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Zero Third-Party Trackers &amp; Encrypted Memory</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
            <CheckCircle2 className="w-4 h-4 text-[#79bdff] flex-shrink-0" />
            <span>Compatible with Chrome, Edge, Brave &amp; Arc</span>
          </div>
        </section>
      </main>

      {/* Auth Modal for In-Place Sign In / Sign Up */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authMode}
      />
    </div>
  )
}
