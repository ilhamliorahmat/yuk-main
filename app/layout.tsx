import type { Metadata, Viewport } from 'next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PwaRegistrar } from '@/components/pwa/PwaRegistrar';
import { AuthProvider } from '@/hooks/use-auth';
import './globals.css';

export const viewport: Viewport = {
  themeColor: '#0B1018',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Yuk Main — Platform Game Tongkrongan Indonesia',
  description:
    'Hidupkan tongkronganmu bareng Yuk Main: permainan grup interaktif berbahasa Indonesia yang 100% Source Available dan siap dimainkan Online maupun LAN Party tanpa internet.',
  openGraph: {
    title: 'Yuk Main — Platform Game Tongkrongan Indonesia',
    description:
      'Permainan grup interaktif berbahasa Indonesia untuk mengasah otak dan skill sosial di tongkrongan—100% Source Available, Online & LAN Party tanpa internet.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Yuk Main — Platform Game Tongkrongan Indonesia',
    description:
      '8 permainan grup interaktif berbahasa Indonesia—Online maupun LAN Party lewat Wi-Fi tanpa kuota internet.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="scroll-smooth">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/pwa-192x192.png" sizes="192x192" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Yuk Main" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=JetBrains+Mono:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body suppressHydrationWarning className="min-h-screen bg-[#0B1018] text-slate-100 antialiased">
        <PwaRegistrar />
        <ErrorBoundary>
          <AuthProvider>{children}</AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
