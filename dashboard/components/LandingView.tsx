'use client'

import { useState, useId, useEffect } from 'react'
import type { SVGProps, MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Zap,
  BookmarkCheck,
  Send,
  Clock,
  ShieldCheck,
  Layers,
  ChevronDown,
  ChevronUp,
  Check,
  Lock,
  Laptop,
  Sparkles,
  ArrowRight,
  Puzzle,
  Download,
  CheckCircle2,
  HelpCircle,
  FileText
} from 'lucide-react'
import FluxPay from '@/components/ui/fluxpay'
import type { FluxPayFeature, FluxPayNavItem, FluxPayStat } from '@/components/ui/fluxpay'
import AuthModal from '@/components/AuthModal'

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@500&family=Instrument+Serif:ital@1&family=Inter+Tight:wght@400..700&display=swap'

const STATS: FluxPayStat[] = [
  {
    prefix: '< ',
    value: 1.5,
    decimals: 1,
    suffix: 's',
    label: 'average ATS form autofill speed'
  },
  {
    prefix: '~',
    value: 15,
    decimals: 0,
    suffix: ' min',
    label: 'saved on every job application'
  },
  {
    value: 100,
    decimals: 0,
    suffix: '%',
    label: 'private on-device memory encryption'
  }
]

const FEATURES: FluxPayFeature[] = [
  {
    icon: <Zap className="w-3.5 h-3.5 text-[#79bdff]" strokeWidth={2.2} />,
    tag: 'Extension',
    title: '1-Click Application Autofill',
    description: 'Instantly completes repetitive application forms across Greenhouse, Lever, and Workday'
  },
  {
    icon: <BookmarkCheck className="w-3.5 h-3.5 text-[#79bdff]" strokeWidth={2.2} />,
    tag: 'Memory',
    title: 'Curated Answer Library',
    description: 'Remembers past approved responses to complex essays and adapts them to new roles'
  },
  {
    icon: <Send className="w-3.5 h-3.5 text-[#79bdff]" strokeWidth={2.2} />,
    tag: 'Mobile Bot',
    title: 'Telegram Follow-Up Assistant',
    description: 'Sends morning application summaries, interview reminders, and instant status updates'
  },
  {
    icon: <Clock className="w-3.5 h-3.5 text-[#79bdff]" strokeWidth={2.2} />,
    tag: 'Radar',
    title: '7-Day Follow-Up Alerts',
    description: 'Pre-drafts polite check-in emails when recruiters have not responded in over a week'
  },
  {
    icon: <ShieldCheck className="w-3.5 h-3.5 text-[#79bdff]" strokeWidth={2.2} />,
    tag: 'Privacy',
    title: 'Encrypted Career Vault',
    description: 'Stored safely on your computer. Your application data remains confidential and private'
  },
  {
    icon: <Layers className="w-3.5 h-3.5 text-[#79bdff]" strokeWidth={2.2} />,
    tag: 'Pipeline',
    title: 'Live Application Tracker',
    description: 'Automatically organizes every applied role across Saved, Applied, Interview, and Offer'
  }
]

const LANDING_FAQS = [
  {
    q: 'How does ApplyRecall autofill job applications?',
    a: 'ApplyRecall pairs with an official Chrome & Chromium extension. When you land on an application page on Greenhouse, Lever, Workday, or Handshake, ApplyRecall automatically scans the form fields and fills in your verified contact details, education, resume links, and custom essay responses in under 1.5 seconds.'
  },
  {
    q: 'What is the Curated Answer Library?',
    a: 'Whenever you write a thoughtful answer to a common essay prompt (like "Why do you want to work here?" or "Describe your leadership style"), ApplyRecall saves it to your private library. When you encounter similar questions in the future, ApplyRecall automatically suggests your past approved answers so you never have to re-type them from scratch.'
  },
  {
    q: 'How does the automated recruiter follow-up radar work?',
    a: 'After you submit an application, ApplyRecall schedules a courteous 7-day follow-up reminder. If you haven\'t heard back, it prepares a professionally pre-drafted check-in email ready to send with 1 click, keeping you top-of-mind with hiring teams.'
  },
  {
    q: 'Is my personal career data safe and private?',
    a: 'Yes, completely. ApplyRecall uses bank-grade AES-256 and SHA-256 encryption. We enforce zero keystroke logging, meaning the extension only inspects form fields when you open an application. We never sell your data or application history to recruiters, employers, or third-party brokers.'
  },
  {
    q: 'Is ApplyRecall free for students and job seekers?',
    a: 'Yes! ApplyRecall is 100% free to get started. You can track unlimited applications, store all your essay answers, and use the Chrome extension with no hidden paywalls.'
  }
]

function ApplyRecallLogoMark(props: SVGProps<SVGSVGElement>) {
  const gradient = useId()

  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
      <defs>
        <linearGradient id={gradient} x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#79bdff" />
          <stop offset="1" stopColor="#e4f4ff" />
        </linearGradient>
      </defs>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" fill={`url(#${gradient})`} stroke="url(#${gradient})" />
    </svg>
  )
}

export interface LandingViewProps {
  initialModalOpen?: boolean
  initialModalMode?: 'signin' | 'signup'
  initialRedirect?: string
}

export default function LandingView({
  initialModalOpen = false,
  initialModalMode = 'signup',
  initialRedirect
}: LandingViewProps) {
  const router = useRouter()
  const [authModalOpen, setAuthModalOpen] = useState(initialModalOpen)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>(initialModalMode)
  const [redirectTo, setRedirectTo] = useState<string | undefined>(initialRedirect)
  const [modalSubtitleNote, setModalSubtitleNote] = useState<string | undefined>(undefined)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  // Listen to search params for direct redirects like /?auth=signin&redirect=/extension
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search)
      const auth = searchParams.get('auth')
      const redirect = searchParams.get('redirect')

      if (auth === 'signin' || redirect === '/extension') {
        setAuthMode('signin')
        setRedirectTo(redirect || '/extension')
        setModalSubtitleNote('Sign in to your account to download the ApplyRecall Chrome Extension.')
        setAuthModalOpen(true)
      } else if (auth === 'signup') {
        setAuthMode('signup')
        setRedirectTo(redirect || undefined)
        setAuthModalOpen(true)
      }
    }
  }, [])

  const openSignUp = (e?: MouseEvent<HTMLAnchorElement>) => {
    if (e) e.preventDefault()
    setAuthMode('signup')
    setRedirectTo(undefined)
    setModalSubtitleNote(undefined)
    setAuthModalOpen(true)
  }

  const openSignIn = (e?: MouseEvent<HTMLAnchorElement>) => {
    if (e) e.preventDefault()
    setAuthMode('signin')
    setRedirectTo(undefined)
    setModalSubtitleNote(undefined)
    setAuthModalOpen(true)
  }

  const openExtensionAuth = (e?: MouseEvent<HTMLAnchorElement>) => {
    if (e) e.preventDefault()
    setAuthMode('signin')
    setRedirectTo('/extension')
    setModalSubtitleNote('Sign in to your account to download the ApplyRecall Chrome Extension.')
    setAuthModalOpen(true)
  }

  const handleCloseModal = () => {
    setAuthModalOpen(false)
    if (typeof window !== 'undefined' && (window.location.pathname === '/login' || window.location.pathname === '/signup' || window.location.search.includes('auth='))) {
      window.history.pushState(null, '', '/')
    }
  }

  const navItems: FluxPayNavItem[] = [
    { label: 'Overview', href: '#overview', active: true },
    { label: 'Features', href: '#features' },
    { label: 'Answer Library', href: '#answers' },
    { label: 'Download Extension', href: '#extension', onClick: openExtensionAuth },
    { label: 'Security', href: '#security' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Sign In', href: '#signin', onClick: openSignIn },
    { label: 'Sign Up', href: '#signup', onClick: openSignUp },
    { label: 'Dashboard', href: '#dashboard', onClick: openSignIn }
  ]

  return (
    <div className="w-full min-h-screen bg-[#000000] text-white selection:bg-[#79bdff]/30 relative">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS_URL} precedence="default" />

      {/* Hero Section Powered by FluxPay */}
      <section id="overview" aria-label="Hero Overview">
        <FluxPay
          brandName="ApplyRecall"
          logo={<ApplyRecallLogoMark />}
          badge="Personal Application Memory & Autonomous Job Copilot"
          titleLines={['Apply Once, *Remember Everything*,', 'Built For *Every Job You Chase*']}
          titleLinesPhone={['Apply Once,', '*Remember Everything*,', 'Built For *What’s Next*']}
          navItems={navItems}
          navStyle="menu"
          signIn={{ label: 'Sign In', href: '#signin', onClick: openSignIn }}
          signUp={{ label: 'Sign Up', href: '#signup', onClick: openSignUp }}
          primaryAction={{ label: 'Get Started Free', href: '#signup', onClick: openSignUp }}
          secondaryAction={{ label: 'Download Extension', href: '#extension', onClick: openExtensionAuth }}
          stats={STATS}
          features={FEATURES}
          fonts={{
            sans: "'Inter Tight', var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
            serif: "'Instrument Serif', var(--font-serif, ui-serif, Georgia, serif)",
            mono: "'Geist Mono', var(--font-mono, ui-monospace, monospace)"
          }}
          palette={{
            night: '#040c27',
            ink: '#f5f8ff',
            restColor: '#1f4a8e',
            litColor: '#65b5ff',
            paleColor: '#d4ecff',
            rippleColor: '#4f9cf0',
            rippleWhite: '#f0f8ff',
            glowCore: '#e4f4ff',
            glowMid: '#79bdff',
            glowWash: '#2a6cd6'
          }}
          glow={{ strength: 0.8 }}
          field={{ columns: 74 }}
          ripple={{ every: 3 }}
          cursor={{ radius: 170 }}
        />
      </section>

      {/* Structured Semantic Body for Visitors & Search Crawlers */}
      <div className="w-full bg-[#040c27] border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 space-y-24">
          
          {/* Section 1: How It Works */}
          <section id="features" className="space-y-12">
            <div className="text-center space-y-4 max-w-2xl mx-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-[#8fcbff] border border-blue-400/25 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-[#79bdff]" />
                <span>How ApplyRecall Works</span>
              </span>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
                Three Simple Steps to Effortless Applications
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Stop filling out the same graduation date, phone number, and essay questions 50 times. ApplyRecall automates the boring work so you can focus on interviews.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <article className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4 hover:border-[#79bdff]/40 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#79bdff] to-[#2563eb] flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-500/20">
                  1
                </div>
                <h3 className="text-lg font-bold text-white">Curate Your Answers Once</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Write thoughtful responses to key essay prompts—like <em>&quot;Why this role?&quot;</em> or <em>&quot;Greatest technical accomplishment&quot;</em>. ApplyRecall encrypts and stores them in your career vault.
                </p>
              </article>

              <article className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4 hover:border-[#79bdff]/40 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#79bdff] to-[#2563eb] flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-500/20">
                  2
                </div>
                <h3 className="text-lg font-bold text-white">Autofill in &lt; 1.5 Seconds</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Navigate to any application on Greenhouse, Lever, Workday, or Handshake. The Chrome extension detects all inputs and auto-completes the application with your approved answers.
                </p>
              </article>

              <article className="p-6 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4 hover:border-[#79bdff]/40 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#79bdff] to-[#2563eb] flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-500/20">
                  3
                </div>
                <h3 className="text-lg font-bold text-white">Follow-Up Radar Alerts</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  ApplyRecall logs every submitted job to your tracker. After 7 days of recruiter silence, it cues an automatic check-in notification with a pre-written polite follow-up email.
                </p>
              </article>
            </div>
          </section>

          {/* Section 2: Supported ATS Platforms */}
          <section id="answers" className="p-8 sm:p-10 rounded-3xl bg-gradient-to-b from-white/[0.04] to-transparent border border-white/10 space-y-8">
            <div className="text-center space-y-3 max-w-xl mx-auto">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
                Universal ATS Compatibility
              </span>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Works Everywhere You Apply
              </h2>
              <p className="text-xs text-slate-300">
                ApplyRecall integrates natively with all major hiring portals and career websites:
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-medium text-slate-200">
              {[
                { name: 'Greenhouse ATS', desc: '1-click field autofill' },
                { name: 'Lever.co', desc: 'Custom essay recall' },
                { name: 'Workday Jobs', desc: 'Multi-step form support' },
                { name: 'AshbyHQ', desc: 'Instant profile population' },
                { name: 'Taleo Oracle', desc: 'Full profile sync' },
                { name: 'LinkedIn Easy Apply', desc: 'Smart answer prompts' },
                { name: 'Handshake Jobs', desc: 'Student resume match' },
                { name: 'Direct Portals', desc: 'Universal field detection' }
              ].map(ats => (
                <div key={ats.name} className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-1">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#79bdff]" />
                    <span className="font-bold text-white text-xs">{ats.name}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 pl-5.5">{ats.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Section 3: Bank-Grade Security Pledge */}
          <section id="security" className="space-y-10">
            <div className="text-center space-y-3 max-w-2xl mx-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-400/25 uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero Compromises on Security</span>
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Your Career Vault, Strictly Encrypted
              </h2>
              <p className="text-sm text-slate-300">
                We believe your application history, salary expectations, and written answers belong to you alone.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <Lock className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">256-Bit Cryptography</h3>
                <p className="text-slate-300 leading-relaxed text-xs">
                  Device pairing uses SHA-256 hashed keys and 256-bit cryptographically secure random tokens.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">Zero Keystroke Logging</h3>
                <p className="text-slate-300 leading-relaxed text-xs">
                  The extension never monitors your keyboard or browsing. It only scans form elements when prompted.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <Laptop className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">Private Memory</h3>
                <p className="text-slate-300 leading-relaxed text-xs">
                  Your essay answers are stored on-device and in your private authenticated database account.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-white">No Third-Party Brokers</h3>
                <p className="text-slate-300 leading-relaxed text-xs">
                  We never sell application lists, contact data, or writing samples to advertisers or recruiters.
                </p>
              </div>
            </div>
          </section>

          {/* Section 4: Interactive FAQ Section */}
          <section id="faq" className="space-y-8 max-w-3xl mx-auto">
            <div className="text-center space-y-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-[#8fcbff] border border-blue-400/25 uppercase tracking-wider">
                <HelpCircle className="w-3.5 h-3.5 text-[#79bdff]" />
                <span>Frequently Asked Questions</span>
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Everything You Need to Know
              </h2>
            </div>

            <div className="space-y-3 pt-2">
              {LANDING_FAQS.map((faq, idx) => {
                const isOpen = openFaq === idx
                return (
                  <div
                    key={faq.q}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full p-4 sm:p-5 text-left text-xs sm:text-sm font-bold text-white flex items-center justify-between gap-4 hover:bg-white/[0.04] transition-colors"
                    >
                      <span>{faq.q}</span>
                      {isOpen ? (
                        <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="px-4 sm:px-5 pb-5 text-xs text-slate-300 leading-relaxed border-t border-white/5 pt-3">
                        {faq.a}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          {/* Section 5: Bottom CTA Banner */}
          <section className="p-8 sm:p-12 rounded-3xl bg-gradient-to-r from-blue-900/40 via-[#0a1128] to-blue-950/40 border border-[#79bdff]/30 text-center space-y-6 shadow-[0_0_80px_-20px_rgba(37,99,235,0.3)]">
            <div className="space-y-3 max-w-xl mx-auto">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Ready to Supercharge Your Job Search?
              </h2>
              <p className="text-xs sm:text-sm text-slate-300">
                Join thousands of students and job seekers saving hours every week with ApplyRecall.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <a
                href="#signup"
                onClick={openSignUp}
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-white hover:bg-slate-100 text-[#071029] font-bold text-xs uppercase tracking-wider shadow-lg shadow-white/10 transition-all flex items-center justify-center gap-2"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="#extension"
                onClick={openExtensionAuth}
                className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs border border-white/15 transition-colors flex items-center justify-center gap-2"
              >
                <Puzzle className="w-4 h-4 text-[#79bdff]" />
                <span>Download Chrome Extension</span>
              </a>
            </div>
          </section>

          {/* Semantic Footer */}
          <footer className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span className="font-bold text-white">ApplyRecall</span>
              <span>— Autonomous Job Application Memory</span>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <a href="#features" className="hover:text-white transition-colors">Features</a>
              <a href="#security" className="hover:text-white transition-colors">Security</a>
              <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
              <a href="#extension" onClick={openExtensionAuth} className="hover:text-white transition-colors">Extension</a>
              <a href="#signin" onClick={openSignIn} className="hover:text-white transition-colors">Sign In</a>
            </div>

            <p className="text-[11px] text-slate-500">
              &copy; {new Date().getFullYear()} ApplyRecall. All rights reserved.
            </p>
          </footer>
        </div>
      </div>

      {/* In-place Auth Modal overlaid directly upon the landing page */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={handleCloseModal}
        initialMode={authMode}
        redirectTo={redirectTo}
        subtitleNote={modalSubtitleNote}
      />
    </div>
  )
}
