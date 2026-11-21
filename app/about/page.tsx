import type { Metadata } from 'next';
import { AboutCreatorView } from '@/components/about/AboutCreatorView';

export const metadata: Metadata = {
  title: 'Tentang Kreator — Yuk Main (Ilham Liorahmat)',
  description:
    'Kenali Ilham Liorahmat (Liorahmat), kreator Yuk Main—platform permainan pesta Indonesia 100% Source Available di bawah PolyForm Noncommercial License 1.0.0.',
};

export default function AboutPage() {
  return <AboutCreatorView />;
}
