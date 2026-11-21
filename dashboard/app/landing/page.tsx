'use client'

import { useId } from 'react'
import type { SVGProps } from 'react'
import FluxPay from '@/components/ui/fluxpay'
import type { FluxPayFeature, FluxPayNavItem, FluxPayStat } from '@/components/ui/fluxpay'

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
  { value: 50, suffix: 'K+', label: 'applications & answers stored' },
  { value: 100, suffix: '%', label: 'private encrypted memory' },
  { value: 99.99, decimals: 2, suffix: '%', label: 'uptime & bank-grade security' }
]

const FEATURES: FluxPayFeature[] = [
  {
    icon: '⚡',
    tag: 'ATS AUTOFILL',
    title: 'Instant ATS Auto-Fill',
    description: 'Auto-detects & fills Workday, Greenhouse & Lever job forms in < 1.5s'
  },
  {
    icon: '🎯',
    tag: 'ANSWER MEMORY',
    title: 'Approved Answer Library',
    description: 'Recalls exact past responses for behavioral & technical essays'
  },
  {
    icon: '📱',
    tag: 'TELEGRAM RADAR',
    title: 'Autonomous Mobile Copilot',
    description: 'Delivers daily morning digests, recruiter alerts & instant mobile actions'
  },
  {
    icon: '⏱️',
    tag: 'SMART RADAR',
    title: '7-Day Follow-Up Radar',
    description: 'Automatically drafts recruiter check-in emails when application replies stall'
  },
  {
    icon: '🛡️',
    tag: '100% PRIVATE',
    title: 'Zero-Knowledge Encrypted Memory',
    description: 'Your career credentials remain locally encrypted on your device'
  },
  {
    icon: '📊',
    tag: 'LIVE PIPELINE',
    title: 'Real-Time Application Kanban',
    description: 'Organizes every applied role across Saved, Applied, Interview & Offer'
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
    <div className="w-full min-h-screen bg-[#000000]">
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
        navStyle="menu"
        signUp={{ label: 'Sign Up', href: '/signup' }}
        primaryAction={{ label: 'Get Started Free', href: '/signup' }}
        secondaryAction={{ label: 'Open Dashboard', href: '/login' }}
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
    </div>
  )
}
