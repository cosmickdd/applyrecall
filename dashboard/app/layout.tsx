import './globals.css';
import Sidebar from '@/components/Sidebar';

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
      <body className="bg-brand-soft min-h-screen text-ink-primary antialiased flex">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
          {children}
        </div>
      </body>
    </html>
  );
}
