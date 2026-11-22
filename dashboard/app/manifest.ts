import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ApplyRecall — Autonomous Job Application Memory & Copilot',
    short_name: 'ApplyRecall',
    description: 'Apply once, remember everything. Instant ATS autofill, curated answer library, and follow-up radar.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2142E7',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
