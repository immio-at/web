import type { Metadata } from 'next';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AuthProvider } from '@/context/AuthContext';
import { DM_Sans, DM_Mono } from 'next/font/google';
import '../globals.css';
import KeepAlive from '@/components/KeepAlive';
import { routing } from '@/i18n/routing';

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

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = await getMessages();

  return (
    <html lang={locale} className={`${dmSans.variable} ${dmMono.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F1F3D" />
      </head>
      <body className={`${dmSans.variable} ${dmMono.variable} font-sans`}>
        <NextIntlClientProvider messages={messages}>
          <AuthProvider>
            <KeepAlive />
            {children}
          </AuthProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
