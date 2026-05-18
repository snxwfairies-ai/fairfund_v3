import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: "FairFund · India's MSME Investment Exchange",
  description: 'SEBI-aligned private placement platform connecting investors with India\'s best MSMEs.',
  openGraph: {
    title: "FairFund · India's MSME Investment Exchange",
    description: 'Invest in verified, high-growth Indian MSMEs. Escrow-protected, eSign-backed, fully compliant.',
    type: 'website',
  },
};
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
