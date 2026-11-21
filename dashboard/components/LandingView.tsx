'use client'

import { useState, useId } from 'react'
import type { SVGProps, MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, BookmarkCheck, Send, Clock, ShieldCheck, Layers } from 'lucide-react'
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

function ApplyRecallLogoMark(props: SVGProps<SVGSVGElement>) {
  const gradient = useId()

  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>
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
}

export default function LandingView({
  initialModalOpen = false,
  initialModalMode = 'signup'
}: LandingViewProps) {
  const router = useRouter()
  const [authModalOpen, setAuthModalOpen] = useState(initialModalOpen)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>(initialModalMode)

  const openSignUp = (e?: MouseEvent<HTMLAnchorElement>) => {
    if (e) e.preventDefault()
    setAuthMode('signup')
    setAuthModalOpen(true)
  }

  const openSignIn = (e?: MouseEvent<HTMLAnchorElement>) => {
    if (e) e.preventDefault()
    setAuthMode('signin')
    setAuthModalOpen(true)
  }

  const handleCloseModal = () => {
    setAuthModalOpen(false)
    if (typeof window !== 'undefined' && (window.location.pathname === '/login' || window.location.pathname === '/signup')) {
      window.history.pushState(null, '', '/')
    }
  }

  const navItems: FluxPayNavItem[] = [
    { label: 'Overview', href: '#overview', active: true },
    { label: 'Features', href: '#features' },
    { label: 'Answer Library', href: '#answers' },
    { label: 'Download Extension', href: '/extension' },
    { label: 'Telegram Bot', href: '#telegram' },
    { label: 'Sign In', href: '#signin', onClick: openSignIn },
    { label: 'Sign Up', href: '#signup', onClick: openSignUp },
    { label: 'Dashboard', href: '#dashboard', onClick: openSignIn }
  ]

  return (
    <div className="w-full min-h-screen bg-[#000000] relative">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS_URL} precedence="default" />
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
        secondaryAction={{ label: 'Download Extension', href: '/extension' }}
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

      {/* In-place Auth Modal overlaid directly upon the landing page */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={handleCloseModal}
        initialMode={authMode}
      />
    </div>
  )
}
