import type { Metadata } from 'next'
import LandingView from '@/components/LandingView'

export const metadata: Metadata = {
  title: {
    absolute: 'ApplyRecall — Job Application Autofill & Application Memory'
  },
  alternates: {
    canonical: '/'
  }
}

export default function HomePage() {
  return <LandingView />
}
