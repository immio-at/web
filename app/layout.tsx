import type { Metadata } from 'next';
import { AuthProvider } from '@/context/AuthContext';
import { DM_Sans, DM_Mono } from 'next/font/google';
import './globals.css';
import KeepAlive from '@/components/KeepAlive';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
});

export const metadata: Metadata = {
  title: 'IMMIO',
  description: 'Immobilien Marktanalyse mit Intelligenz',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className={`${dmSans.variable} ${dmMono.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F1F3D" />
      </head>
      <body className={`${dmSans.variable} ${dmMono.variable} font-sans`}>
        <AuthProvider>
          {/* KeepAlive pings Railway every 4 minutes to prevent cold starts.
              Placed here so it runs for ALL visitors — not just logged-in users.
              Previously this lived inside NavBar and only fired for authenticated pages. */}
          <KeepAlive />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
