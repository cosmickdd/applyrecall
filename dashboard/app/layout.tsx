import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'ApplyRecall — Personal Job Application Memory',
  description: 'Apply once. Remember everything. Stay in control.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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
