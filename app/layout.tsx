import type { Metadata } from 'next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/hooks/use-auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Yuk Main — Platform Game Tongkrongan Indonesia',
  description:
    'Hidupkan tongkronganmu bareng Yuk Main: 4 permainan grup interaktif (Yang Bener Yang Mana, Kata-Kata Hari Ini, Satu Frekuensi, dan Fakta Hari Ini) yang 100% gratis dan open-source langsung dari browser.',
  openGraph: {
    title: 'Yuk Main — Platform Game Tongkrongan Indonesia',
    description:
      '4 permainan grup interaktif berbahasa Indonesia untuk mengasah otak dan skill sosial di tongkrongan—100% gratis dan open-source langsung dari browser.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Yuk Main — Platform Game Tongkrongan Indonesia',
    description:
      '4 permainan grup interaktif berbahasa Indonesia untuk mengasah otak dan skill sosial di tongkrongan—100% gratis dan open-source.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
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
