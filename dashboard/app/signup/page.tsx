import type { Metadata } from 'next'
import LandingView from '@/components/LandingView'

export const metadata: Metadata = {
  title: {
    absolute: 'Create your ApplyRecall account — Free Job Application Autofill'
  },
  description:
    'Create a free ApplyRecall account to autofill job applications on Greenhouse, Lever, Workday and Ashby, save your essay answers, and track every application.',
  alternates: {
    canonical: '/signup'
  },
  robots: {
    index: true,
    follow: true
  }
}

export default function SignUpPage() {
  return <LandingView initialModalOpen={true} initialModalMode="signup" />
}
