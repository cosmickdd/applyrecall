'use client'

import React, { useState, useEffect } from 'react'
import {
  X,
  Download,
  Puzzle,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  FolderArchive,
  ArrowRight,
  Terminal,
  Laptop
} from 'lucide-react'

export interface ExtensionModalProps {
  isOpen: boolean
  onClose: () => void
  onOpenAuth?: (mode: 'signin' | 'signup') => void
  isLoggedIn?: boolean
}

export default function ExtensionModal({
  isOpen,
  onClose,
  onOpenAuth,
  isLoggedIn = false
}: ExtensionModalProps) {
  const [copiedUrl, setCopiedUrl] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleCopyChromeUrl = () => {
    navigator.clipboard.writeText('chrome://extensions')
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="extension-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-xl bg-[#0a1128]/95 border border-[#79bdff]/30 rounded-2xl shadow-[0_0_60px_-15px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.08)] backdrop-blur-2xl p-6 sm:p-8 space-y-6 text-white overflow-hidden my-8">
        {/* Subtle top glow highlight */}
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#8fcbff]/60 to-transparent" />

        {/* Close Button */}
        <button
          type="button"
          aria-label="Close modal"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-4 pt-1">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#79bdff] to-[#2563eb] flex items-center justify-center text-white shadow-lg shadow-blue-500/25 flex-shrink-0">
            <Puzzle className="w-6 h-6" strokeWidth={2.2} />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-400/20 text-[#8fcbff] text-[11px] font-semibold tracking-wide uppercase mb-1">
              <span>Manifest V3 • Chromium Extension</span>
            </div>
            <h2 id="extension-modal-title" className="text-xl font-bold tracking-tight text-white">
              Install ApplyRecall Extension
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              1-Click ATS Form Autofill, Answer Recall, and Live Application Tracking.
            </p>
          </div>
        </div>

        {/* Primary Download Button */}
        <div className="p-4 rounded-xl bg-gradient-to-b from-blue-950/40 to-black/60 border border-blue-500/25 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">Extension Package</span>
            <span className="text-[11px] font-mono text-slate-400">applyrecall-extension.zip</span>
          </div>

          <a
            href="/applyrecall-extension.zip"
            download="applyrecall-extension.zip"
            className="w-full py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-white hover:bg-slate-100 text-[#071029] shadow-[inset_0_1px_0_#fff,0_8px_24px_-8px_rgba(80,130,255,0.7)] flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Download Extension ZIP</span>
          </a>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Safe &amp; Private • Encrypted On-Device Memory</span>
            </div>
            <span>Chrome, Edge, Brave &amp; Arc</span>
          </div>
        </div>

        {/* Step-by-Step Installation Guide (Unpacked Method) */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#8fcbff] flex items-center gap-1.5">
            <Laptop className="w-3.5 h-3.5" />
            <span>How to install using "Load Unpacked" (Developer Mode)</span>
          </h3>

          <div className="space-y-2.5 text-xs text-slate-300">
            {/* Step 1 */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-500/20 text-[#8fcbff] font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                1
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-white">Extract the downloaded ZIP folder</p>
                <p className="text-[11.5px] text-slate-400 leading-relaxed">
                  Click the button above to download <code className="text-sky-300 bg-white/5 px-1 rounded">applyrecall-extension.zip</code>. Right-click and choose <strong>"Extract All"</strong> to unpack it.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-500/20 text-[#8fcbff] font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                2
              </div>
              <div className="space-y-1.5 flex-1">
                <p className="font-semibold text-white">Open Extensions Manager in your browser</p>
                <p className="text-[11.5px] text-slate-400 leading-relaxed">
                  Open a new browser tab and navigate to:
                </p>
                <div className="flex items-center gap-2">
                  <code className="px-2 py-1 bg-black/60 border border-white/15 rounded text-[11px] font-mono text-sky-300 select-all">
                    chrome://extensions
                  </code>
                  <button
                    type="button"
                    onClick={handleCopyChromeUrl}
                    className="p-1 px-2 text-[10.5px] rounded bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedUrl ? 'Copied' : 'Copy'}</span>
                  </button>
                  <span className="text-[10px] text-slate-500">(or <code className="text-slate-400">edge://extensions</code> in Edge)</span>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-500/20 text-[#8fcbff] font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                3
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-white">Enable Developer mode</p>
                <p className="text-[11.5px] text-slate-400 leading-relaxed">
                  In the top-right corner of the Extensions page, switch the <strong>"Developer mode"</strong> toggle to <strong>ON</strong>.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-500/20 text-[#8fcbff] font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                4
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-white">Click "Load unpacked" &amp; select folder</p>
                <p className="text-[11.5px] text-slate-400 leading-relaxed">
                  Click the <strong>"Load unpacked"</strong> button in the top-left toolbar, then select the extracted extension folder.
                </p>
              </div>
            </div>

            {/* Step 5 */}
            <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-blue-500/30 text-white font-bold text-[11px] flex items-center justify-center flex-shrink-0 mt-0.5">
                5
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-[#8fcbff]">Log in to ApplyRecall &amp; Sync</p>
                <p className="text-[11.5px] text-slate-300 leading-relaxed">
                  Make sure you are logged into your ApplyRecall website account. Open the extension popup from your toolbar (pin it 📌) and click <strong>"✨ Sync from Active Website Login"</strong>, or copy your pairing code from Settings!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Website Login Notice Banner */}
        <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-500/30 text-xs text-amber-200 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="font-semibold text-amber-100 block">Website Login Required</span>
            <span className="text-[11px] text-amber-300/80 block">
              The extension connects with your logged-in ApplyRecall account to retrieve your approved essays.
            </span>
          </div>

          {!isLoggedIn && onOpenAuth ? (
            <button
              type="button"
              onClick={() => {
                onClose()
                onOpenAuth('signin')
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] flex items-center gap-1 flex-shrink-0 transition-colors"
            >
              <span>Sign In Now</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          ) : (
            <a
              href="/settings"
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-[11px] flex items-center gap-1 flex-shrink-0 transition-colors"
            >
              <span>View Settings</span>
              <ArrowRight className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
