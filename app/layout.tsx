import type { Metadata } from 'next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/hooks/use-auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Yuk Main — Platform Game Pesta Indonesia',
  description:
    'Platform permainan pesta multipemain berbahasa Indonesia: Game #1 Yang Bener Yang Mana & Game #2 Kata-Kata Hari Ini, lengkap dengan obrolan waktu nyata dan pembuat konten kustom.',
  openGraph: {
    title: 'Yuk Main — Platform Game Pesta Indonesia',
    description:
      'Mainkan Yang Bener Yang Mana dan Kata-Kata Hari Ini bersama teman secara waktu nyata langsung dari ponsel atau desktop.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Yuk Main — Platform Game Pesta Indonesia',
    description:
      'Mainkan Yang Bener Yang Mana dan Kata-Kata Hari Ini bersama teman secara waktu nyata langsung dari ponsel atau desktop.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body suppressHydrationWarning className="min-h-screen bg-[#0B1018] text-slate-100 antialiased">
        <ErrorBoundary>
          <AuthProvider>{children}</AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
