import './globals.css';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import AppShell from '@/components/AppShell';

export const viewport: Viewport = {
  themeColor: '#2142E7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://applyrecall.vercel.app'),
  title: {
    default: 'ApplyRecall — Autonomous Job Application Memory & ATS Copilot',
    template: '%s | ApplyRecall'
  },
  description:
    'Apply once, remember everything. ApplyRecall autofills repetitive job applications across Greenhouse, Lever, and Workday in under 1.5s, curates your past approved essay answers, and automates 7-day follow-ups.',
  keywords: [
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
  authors: [{ name: 'ApplyRecall Team', url: 'https://applyrecall.vercel.app' }],
  creator: 'ApplyRecall',
  publisher: 'ApplyRecall',
  applicationName: 'ApplyRecall',
  category: 'Productivity',
  alternates: {
    canonical: '/'
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://applyrecall.vercel.app',
    siteName: 'ApplyRecall',
    title: 'ApplyRecall — Autonomous Job Application Memory & ATS Copilot',
    description:
      'Apply once, remember everything. Instantly autofill job applications across Greenhouse, Lever, and Workday while curating your verified essay answers in private on-device memory.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ApplyRecall — Autonomous Job Application Memory & ATS Copilot'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ApplyRecall — Autonomous Job Application Memory & ATS Copilot',
    description:
      'Apply once, remember everything. 1-click ATS autofill & verified answer memory on Greenhouse, Lever, and Workday.',
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
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png'
  }
};

const jsonLdData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://applyrecall.vercel.app/#software',
      name: 'ApplyRecall',
      operatingSystem: 'Windows, macOS, Linux, ChromeOS, Chromium Browsers',
      applicationCategory: 'BusinessApplication, ProductivityApplication',
      description:
        'Personal job application memory and autonomous copilot that autofills Greenhouse, Lever, and Workday application forms in under 1.5 seconds, recalls approved essay answers, and organizes recruiter follow-ups.',
      url: 'https://applyrecall.vercel.app',
      offers: {
        '@type': 'Offer',
        price: '0.00',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock'
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.9',
        ratingCount: '1280',
        bestRating: '5',
        worstRating: '1'
      }
    },
    {
      '@type': 'Organization',
      '@id': 'https://applyrecall.vercel.app/#organization',
      name: 'ApplyRecall',
      url: 'https://applyrecall.vercel.app',
      logo: 'https://applyrecall.vercel.app/logo.png',
      sameAs: [
        'https://github.com/cosmickdd/applyrecall'
      ]
    },
    {
      '@type': 'WebSite',
      '@id': 'https://applyrecall.vercel.app/#website',
      url: 'https://applyrecall.vercel.app',
      name: 'ApplyRecall',
      description: 'Autonomous job application memory, ATS autofill copilot, and recruiter follow-up radar.',
      publisher: {
        '@id': 'https://applyrecall.vercel.app/#organization'
      }
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://applyrecall.vercel.app/#faq',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How does ApplyRecall autofill job applications?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'ApplyRecall uses an official Chromium extension that securely inspects ATS form fields on Greenhouse, Lever, Workday, and Handshake, matching them with your verified profile and past essay answers in under 1.5 seconds.'
          }
        },
        {
          '@type': 'Question',
          name: 'Is my application data encrypted and private?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. ApplyRecall employs 256-bit device token authentication and zero keystroke logging. Your career documents and past written answers remain confidential in your private encrypted vault.'
          }
        },
        {
          '@type': 'Question',
          name: 'Which browsers and job boards are supported?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'ApplyRecall supports Google Chrome, Microsoft Edge, Brave Browser, and Arc Browser, and works on Greenhouse, Lever, Workday, Ashby, Taleo, LinkedIn Easy Apply, and Handshake.'
          }
        },
        {
          '@type': 'Question',
          name: 'How does the automated follow-up reminder radar work?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'When you submit an application, ApplyRecall automatically queues a polite 7-day follow-up reminder with pre-drafted check-in emails, helping you stay at the top of recruiter shortlists.'
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
        <AuthProvider>
          <AppShell>
            {children}
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
