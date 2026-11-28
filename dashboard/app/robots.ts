import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/extension', '/login', '/signup'],
        disallow: [
          '/landing',
          '/overview',
          '/applications',
          '/answers',
          '/reminders',
          '/profile',
          '/settings',
          '/auth/',
          '/api/',
        ],
      },
    ],
    sitemap: 'https://applyrecall.vercel.app/sitemap.xml',
    host: 'https://applyrecall.vercel.app',
  };
}
