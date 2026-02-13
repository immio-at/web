import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import NavBar from '@/components/NavBar';

const geist = Geist({ subsets: ['latin'] });

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
    <html lang="de">
      <body className={geist.className}>
        <div className="min-h-screen bg-gray-50">
          <NavBar />
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}