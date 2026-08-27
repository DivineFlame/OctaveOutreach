import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Outreach Agent — Campaign Studio',
  description: 'Analyse offers, prepare pitches, research leads and review channel-ready outreach drafts.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
