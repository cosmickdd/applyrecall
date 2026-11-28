import type { Metadata } from 'next'

const SITE_URL = 'https://applyrecall.vercel.app'

export const metadata: Metadata = {
  title: {
    absolute: 'ApplyRecall Extension — Install & Pair Autofill for Greenhouse, Lever & Workday'
  },
  description:
    'Install the ApplyRecall browser extension in Chrome, Edge, Brave or Arc: download the ZIP, load it unpacked, and pair it with your ApplyRecall dashboard in one step so job applications autofill themselves.',
  keywords: [
    'applyrecall extension',
    'chrome extension for job applications',
    'greenhouse autofill extension',
    'lever autofill',
    'workday autofill',
    'load unpacked extension',
    'job application autofill'
  ],
  alternates: {
    canonical: '/extension'
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: `${SITE_URL}/extension`,
    siteName: 'ApplyRecall',
    title: 'ApplyRecall Extension — Install & Pair Autofill',
    description:
      'Download, load unpacked, and pair the ApplyRecall extension to autofill job applications on Greenhouse, Lever, Workday and Ashby.',
    images: [
      {
        url: '/og-image.png',
        width: 1392,
        height: 752,
        alt: 'Install the ApplyRecall browser extension'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ApplyRecall Extension — Install & Pair Autofill',
    description:
      'Download, load unpacked, and pair the ApplyRecall extension to autofill job applications on Greenhouse, Lever, Workday and Ashby.',
    images: ['/og-image.png']
  }
}

export default function ExtensionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
