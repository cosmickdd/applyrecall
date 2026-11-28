import './globals.css';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import AppShell from '@/components/AppShell';
import GoogleAnalytics from '@/components/GoogleAnalytics';

const SITE_URL = 'https://applyrecall.vercel.app';

export const viewport: Viewport = {
  themeColor: '#2142E7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'ApplyRecall — Job Application Autofill & Application Memory',
    template: '%s | ApplyRecall'
  },
  description:
    'ApplyRecall autofills repeating job applications across Greenhouse, Lever, Workday, Ashby and Handshake in under 1.5 seconds, remembers your approved essay answers, and queues 7-day recruiter follow-ups.',
  keywords: [
    'applyrecall',
    'job application autofill',
    'job application memory',
    'greenhouse autofill extension',
    'lever application copilot',
    'workday job autofill',
    'job search tracker',
    'essay answer library',
    'job application reminder radar',
    'ashby job autofill',
    'ats form autofill',
    'student job tracker',
    'recruiter follow up draft',
    'career vault',
    'chrome extension for job applications'
  ],
  authors: [{ name: 'ApplyRecall Team', url: SITE_URL }],
  creator: 'ApplyRecall',
  publisher: 'ApplyRecall',
  applicationName: 'ApplyRecall',
  category: 'Productivity',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'ApplyRecall',
    title: 'ApplyRecall — Job Application Autofill & Application Memory',
    description:
      'Apply once, remember everything. Autofill job applications across Greenhouse, Lever, Workday and Ashby in under 1.5s, with your own approved answer library kept private.',
    images: [
      {
        url: '/og-image.png',
        width: 1392,
        height: 752,
        alt: 'ApplyRecall — job application autofill and answer memory'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ApplyRecall — Job Application Autofill & Application Memory',
    description:
      'One-click ATS autofill and verified answer memory on Greenhouse, Lever, Workday and Ashby.',
    creator: '@applyrecall',
    images: ['/og-image.png']
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1
    }
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg'
  }
};

const jsonLdData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: 'ApplyRecall',
      alternateName: 'ApplyRecall job application autofill extension',
      operatingSystem: 'Windows, macOS, Linux, ChromeOS, Chromium Browsers',
      applicationCategory: 'BusinessApplication, ProductivityApplication',
      description:
        'Job application autofill and application memory that fills Greenhouse, Lever, Workday, Ashby and Handshake forms in under 1.5 seconds, recalls your approved essay answers, and organizes recruiter follow-ups.',
      url: SITE_URL,
      installUrl: `${SITE_URL}/extension`,
      offers: {
        '@type': 'Offer',
        price: '0.00',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock'
      }
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'ApplyRecall',
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.svg`,
      sameAs: ['https://github.com/cosmickdd/applyrecall']
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'ApplyRecall',
      description:
        'Job application autofill, an answer library, and a follow-up radar for students and job seekers.',
      publisher: {
        '@id': `${SITE_URL}/#organization`
      }
    },
    {
      '@type': 'FAQPage',
      '@id': `${SITE_URL}/#faq`,
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How does ApplyRecall autofill job applications?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'ApplyRecall pairs with an official Chrome & Chromium extension. When you land on an application page on Greenhouse, Lever, Workday, or Handshake, ApplyRecall automatically scans the form fields and fills in your verified contact details, education, resume links, and custom essay responses in under 1.5 seconds.'
          }
        },
        {
          '@type': 'Question',
          name: 'What is the Curated Answer Library?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Whenever you write a thoughtful answer to a common essay prompt (like "Why do you want to work here?" or "Describe your leadership style"), ApplyRecall saves it to your private library. When you encounter similar questions in the future, ApplyRecall automatically suggests your past approved answers so you never have to re-type them from scratch.'
          }
        },
        {
          '@type': 'Question',
          name: 'How does the automated recruiter follow-up radar work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'After you submit an application, ApplyRecall schedules a courteous 7-day follow-up reminder. If you have not heard back, it prepares a professionally pre-drafted check-in email ready to send with 1 click, keeping you top-of-mind with hiring teams.'
          }
        },
        {
          '@type': 'Question',
          name: 'Is my personal career data safe and private?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes, completely. ApplyRecall uses bank-grade AES-256 and SHA-256 encryption. We enforce zero keystroke logging, meaning the extension only inspects form fields when you open an application. We never sell your data or application history to recruiters, employers, or third-party brokers.'
          }
        },
        {
          '@type': 'Question',
          name: 'Is ApplyRecall free for students and job seekers?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes! ApplyRecall is 100% free to get started. You can track unlimited applications, store all your essay answers, and use the Chrome extension with no hidden paywalls.'
          }
        }
      ]
    }
  ]
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
        />
      </head>
      <body className="bg-brand-soft min-h-screen text-ink-primary antialiased">
        <GoogleAnalytics />
        <AuthProvider>
          <AppShell>
            {children}
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
