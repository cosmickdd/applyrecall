/**
 * FluxPay demo. The copy, nav, stats and example transfers all live here and are passed in as props.
 * Requires the `motion` package (npm i motion). Fonts: the original look uses Inter Tight, Instrument Serif (italic) and
 * Geist Mono; the component falls back to the theme's --font-sans / --font-serif / --font-mono without them.
 */

'use client'

import { useId } from 'react'
import type { SVGProps } from 'react'

import FluxPay from '@/components/ui/fluxpay'
import type { FluxPayNavItem, FluxPayStat, FluxPayTransfer } from '@/components/ui/fluxpay'

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@500&family=Instrument+Serif:ital@1&family=Inter+Tight:wght@400..700&display=swap'

// Live controls: each value below becomes a knob in the preview. Keep them flat literals.
const settings = {
  badge: 'New: Real-time global payments platform',
  restColor: '#1f4a8e',
  litColor: '#65b5ff',
  glowStrength: 0.8,
  fieldColumns: 74,
  rippleEvery: 3,
  cursorRadius: 170,
  showTransfer: true,
  showStats: true
}

const NAV: FluxPayNavItem[] = [
  { label: 'Product', href: '#product', active: true },
  { label: 'Solutions', href: '#solutions' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Resources', href: '#resources' },
  { label: 'Company', href: '#company' }
]

const STATS: FluxPayStat[] = [
  { value: 50, suffix: 'K+', label: 'businesses on FluxPay' },
  { value: 100, prefix: '$', suffix: 'B+', label: 'annual payment volume' },
  { value: 99.99, decimals: 2, suffix: '%', label: 'uptime & bank-grade security' }
]

const TRANSFERS: FluxPayTransfer[] = [
  {
    route: 'New York → Berlin',
    from: { code: 'USD', symbol: '$', amount: 12480 },
    to: { code: 'EUR', symbol: '€' },
    rate: 0.9182,
    settled: 'Settled in 1.2s'
  },
  {
    route: 'London → Austin',
    from: { code: 'GBP', symbol: '£', amount: 8250 },
    to: { code: 'USD', symbol: '$' },
    rate: 1.2674,
    settled: 'Settled in 0.9s'
  },
  {
    route: 'Paris → Tokyo',
    from: { code: 'EUR', symbol: '€', amount: 5400 },
    to: { code: 'JPY', symbol: '¥', decimals: 0 },
    rate: 162.41,
    settled: 'Settled in 1.4s'
  },
  {
    route: 'Seattle → Mumbai',
    from: { code: 'USD', symbol: '$', amount: 3920 },
    to: { code: 'INR', symbol: '₹' },
    rate: 83.27,
    settled: 'Settled in 1.1s'
  }
]

// The logo: two stacked slashes, sky blue to pale
function LogoMark(props: SVGProps< SVGSVGElement >) {
  const gradient = useId()

  return (
    <svg viewBox='0 0 40 40' fill='none' aria-hidden='true' focusable='false' {...props}>
      <defs>
        <linearGradient id={gradient} x1='4' y1='36' x2='36' y2='4' gradientUnits='userSpaceOnUse'>
          <stop stopColor='#79bdff' />
          <stop offset='1' stopColor='#e4f4ff' />
        </linearGradient>
      </defs>
      <path d='M15.5 3h11.5L15 21H3.5z' fill={`url(#${gradient})`} />
      <path d='M25 19h11.5L24.5 37H13z' fill={`url(#${gradient})`} opacity='0.8' />
    </svg>
  )
}

export default function Demo(props: Partial< typeof settings >) {
  const s = { ...settings, ...props }

  return (
    <div className='w-full'>
      <link rel='preconnect' href='https://fonts.googleapis.com' />
      <link rel='preconnect' href='https://fonts.gstatic.com' crossOrigin='anonymous' />
      <link rel='stylesheet' href={FONTS_URL} precedence='default' />
      <FluxPay
        brandName='FluxPay'
        logo={<LogoMark />}
        badge={s.badge}
        titleLines={['Payments That *Move With Your*', '*Business*, Built for What’s Next']}
        titleLinesPhone={['Payments That *Move*', '*With Your Business*,', 'Built for What’s Next']}
        navItems={NAV}
        signUp={{ label: 'Sign up', href: '#sign-up' }}
        primaryAction={{ label: 'Get started', href: '#get-started' }}
        secondaryAction={{ label: 'Explore FluxPay', href: '#explore' }}
        stats={s.showStats ? STATS : []}
        transfers={s.showTransfer ? TRANSFERS : []}
        transferTitle='Live transfer'
        transferLabel='Example transfers moving between currencies and settling in real time'
        fonts={{
          sans: "'Inter Tight', var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
          serif: "'Instrument Serif', var(--font-serif, ui-serif, Georgia, serif)",
          mono: "'Geist Mono', var(--font-mono, ui-monospace, monospace)"
        }}
        palette={{ restColor: s.restColor, litColor: s.litColor }}
        glow={{ strength: s.glowStrength }}
        field={{ columns: s.fieldColumns }}
        ripple={{ every: s.rippleEvery }}
        cursor={{ radius: s.cursorRadius }}
      />
    </div>
  )
}
