import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { getAcademySettings } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  const academy = await getAcademySettings();
  return {
    title: {
      default: `${academy.name} — ${academy.tagline}`,
      template: `%s · ${academy.name}`,
    },
    description: `${academy.tagline} for ${academy.name}, ${academy.address}. Student records, examinations, roll numbers, results, report cards and merit lists.`,
    applicationName: academy.name,
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f2547',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
