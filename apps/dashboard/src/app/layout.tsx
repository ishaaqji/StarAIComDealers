import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Star AI Platform',
  description: 'AI operating layer for local electronics dealers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
