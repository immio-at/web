'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { sendContactMessage } from '@/lib/api';

type Status = 'idle' | 'sending' | 'success' | 'error';

export default function KontaktPage() {
  const tLegal = useTranslations('legal');
  const t = useTranslations('legal.kontakt');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === 'sending') return;
    setError(null);

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError(t('errors.missingFields'));
      return;
    }

    setStatus('sending');
    try {
      await sendContactMessage({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        message: message.trim(),
        honeypot,
      });
      setStatus('success');
      setName(''); setEmail(''); setPhone(''); setMessage('');
    } catch (err: any) {
      setStatus('error');
      const code: string = err?.code ?? 'UNKNOWN';
      if (code === 'INVALID_EMAIL') setError(t('errors.invalidEmail'));
      else if (code === 'MISSING_FIELDS') setError(t('errors.missingFields'));
      else setError(t('errors.sendFailed'));
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-2xl text-gray-900 flex-shrink-0">
          IM<span className="text-3xl">M</span>IO
        </Link>
        <Link href="/" className="text-sm text-gray-500 hover:text-primary transition-colors">
          {tLegal('back')}
        </Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-light text-primary tracking-tight mb-2">{t('title')}</h1>
        <p className="text-sm text-gray-400 font-mono mb-12">{t('subtitle')}</p>

        {status === 'success' ? (
          <div className="rounded-lg border border-teal-200 bg-teal-50 px-6 py-10 text-center">
            <p className="text-teal-700 font-light">{t('success')}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Honeypot — hidden from humans, bots fill it and get silently dropped */}
            <div className="hidden" aria-hidden="true">
              <label>
                Website
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </label>
            </div>

            <Field label={t('labelName')} required>
              <input
                type="text"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 font-light focus:border-teal-500 focus:outline-none"
              />
            </Field>

            <Field label={t('labelEmail')} required>
              <input
                type="email"
                required
                maxLength={200}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 font-light focus:border-teal-500 focus:outline-none"
              />
            </Field>

            <Field label={t('labelPhone')}>
              <input
                type="tel"
                maxLength={50}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 font-light focus:border-teal-500 focus:outline-none"
              />
            </Field>

            <Field label={t('labelMessage')} required>
              <textarea
                required
                rows={6}
                maxLength={5000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 font-light focus:border-teal-500 focus:outline-none resize-none"
              />
            </Field>

            {error && <p className="text-sm text-red-600 font-light">{error}</p>}

            <div className="pt-2">
              <button
                type="submit"
                disabled={status === 'sending'}
                className="inline-flex items-center px-6 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {status === 'sending' ? t('sending') : t('send')}
              </button>
            </div>
          </form>
        )}

        <div className="mt-12 pt-8 border-t border-gray-200 text-xs text-gray-400 font-light">
          {t('altEmail')}{' '}
          <a href="mailto:hello@immio.at" className="text-teal-600 hover:underline">hello@immio.at</a>
        </div>
      </main>
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm text-gray-500 font-light mb-2 block">
        {label}{required && <span className="text-gray-400"> *</span>}
      </span>
      {children}
    </label>
  );
}
