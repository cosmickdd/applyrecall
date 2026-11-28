import type { Metadata } from 'next'
import LandingView from '@/components/LandingView'

export const metadata: Metadata = {
  title: {
    absolute: 'Sign in to ApplyRecall'
  },
  description:
    'Sign in to your ApplyRecall account to see your application tracker, answer library and follow-up reminders.',
  alternates: {
    canonical: '/login'
  },
  robots: {
    index: false,
    follow: true
  }
}

export default function LoginPage() {
  return <LandingView initialModalOpen={true} initialModalMode="signin" />
}
