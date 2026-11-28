import type { Metadata } from 'next'
import LandingView from '@/components/LandingView'

export const metadata: Metadata = {
  title: {
    absolute: 'Sign in to ApplyRecall — Job Application Autofill Dashboard'
  },
  description:
    'Sign in to your ApplyRecall account to autofill job applications, access your answer library, and manage recruiter follow-up reminders.',
  alternates: {
    canonical: '/login'
  },
  robots: {
    index: true,
    follow: true
  }
}

export default function LoginPage() {
  return <LandingView initialModalOpen={true} initialModalMode="signin" />
}
