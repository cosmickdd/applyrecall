'use client'

import { useId } from 'react'
import type { SVGProps } from 'react'
import FluxPay from '@/components/ui/fluxpay'
import type { FluxPayNavItem, FluxPayStat, FluxPayTransfer } from '@/components/ui/fluxpay'

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@500&family=Instrument+Serif:ital@1&family=Inter+Tight:wght@400..700&display=swap'

const NAV: FluxPayNavItem[] = [
  { label: 'Overview', href: '#overview', active: true },
  { label: 'Answer Library', href: '#answers' },
  { label: 'Extension', href: '#extension' },
  { label: 'Telegram Bot', href: '#telegram' },
  { label: 'Dashboard', href: '/' }
]

const STATS: FluxPayStat[] = [
  { value: 100, suffix: '%', label: 'encrypted private memory' },
  { value: 1.2, decimals: 1, suffix: 's', label: 'average ATS autofill speed' },
  { value: 10, suffix: 'x', label: 'faster job applications' }
]

const APPLICATION_TRANSFERS: FluxPayTransfer[] = [
  {
    route: 'LinkedIn → Greenhouse',
    from: { code: 'JOB', symbol: '💼', amount: 1 },
    to: { code: 'FIELDS', symbol: '⚡' },
    rate: 14,
    settled: 'Autofilled 14 fields in 0.9s'
  },
  {
    route: 'Handshake → Lever',
    from: { code: 'ROLE', symbol: '🎯', amount: 1 },
    to: { code: 'ANSW', symbol: '📚' },
    rate: 8,
    settled: 'Recalled 8 past answers in 0.8s'
  },
  {
    route: 'Job Portal → ApplyRecall',
    from: { code: 'SUBMIT', symbol: '🚀', amount: 1 },
    to: { code: 'RADAR', symbol: '🔔' },
    rate: 7,
    settled: 'Follow-up queued for 7 days'
  },
  {
    route: 'Company Mail → Telegram Bot',
    from: { code: 'ALERT', symbol: '✉️', amount: 1 },
    to: { code: 'PUSH', symbol: '📱' },
    rate: 1,
    settled: 'Instant mobile alert in 0.3s'
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

export default function LandingPage() {
  return (
    <div className="w-full min-h-screen bg-[#040c27]">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link rel="stylesheet" href={FONTS_URL} precedence="default" />
      <FluxPay
        brandName="ApplyRecall"
        logo={<ApplyRecallLogoMark />}
        badge="Personal Application Memory & Autonomous Job Copilot"
        titleLines={['Apply Once, *Remember Everything*,', 'Built For *Every Job You Chase*']}
        titleLinesPhone={['Apply Once,', '*Remember Everything*,', 'Built For *What’s Next*']}
        navItems={NAV}
        signUp={{ label: 'Sign Up', href: '/signup' }}
        primaryAction={{ label: 'Get Started Free', href: '/signup' }}
        secondaryAction={{ label: 'Open Dashboard', href: '/login' }}
        stats={STATS}
        transfers={APPLICATION_TRANSFERS}
        transferTitle="Live Application Pipeline"
        transferLabel="Real-time job application memory, answer recall, and automated follow-ups"
        transferSteps={['Captured', 'Autofilled', 'Remembered'] as const}
        sendLabel="Source"
        receiveLabel="Recalled"
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
    </div>
  )
}
