import type { Metadata } from 'next'
import LandingView from '@/components/LandingView'

export const metadata: Metadata = {
  title: {
    absolute: 'Create your ApplyRecall account'
  },
  description:
    'Create a free ApplyRecall account to autofill job applications, save your essay answers once, and track every application you send.',
  alternates: {
    canonical: '/signup'
  },
  robots: {
    index: false,
    follow: true
  }
}

export default function SignUpPage() {
  return <LandingView initialModalOpen={true} initialModalMode="signup" />
}
