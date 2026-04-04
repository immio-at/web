'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Wrapped in its own component because useSearchParams requires a Suspense boundary.

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('auth.register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Pre-fill email if passed from the landing page hero form
  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) setEmail(emailParam);
  }, [searchParams]);

  async function handleRegister() {
    if (!email || !password) { setError(t('errorEmptyFields')); return; }
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, inviteCode: inviteCode || undefined }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || t('errorRegisterFailed'));
        return;
      }

      if (inviteCode) {
        // Invite code = auto-approved → go to landing page and open sign-in modal
        router.push('/?signin=true');
      } else {
        // No invite code = pending admin approval
        router.push('/pending');
      }

    } catch {
      setError(t('errorConnection'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm">

        {/* Logo */}
        <Link href="/" className="text-2xl text-gray-900 flex-shrink-0 block mb-6">
          IM<span className="text-3xl">M</span>IO
        </Link>

        <h1 className="text-xl font-semibold text-primary mb-1">{t('title')}</h1>
        <p className="text-sm text-gray-500 font-light mb-6">{t('sub')}</p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('emailLabel')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus={!email}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-primary bg-white outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all"
              placeholder={t('emailPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{t('passwordLabel')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-primary bg-white outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all"
              placeholder={t('passwordPlaceholder')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {t('inviteLabel')} <span className="text-gray-400 font-normal">({t('inviteOptional')})</span>
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-primary bg-white outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all font-mono tracking-widest"
              placeholder={t('invitePlaceholder')}
            />
            <p className="text-xs text-gray-400 mt-1.5 font-light">
              {t('inviteHint')}
            </p>
          </div>

          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-light disabled:opacity-50 text-primary font-semibold text-sm py-2.5 rounded-lg transition-colors mt-2"
          >
            {loading ? t('submitting') : t('submit')}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          {t('haveAccount')}{' '}
          <Link href="/?signin=true" className="text-teal-600 hover:underline font-medium">
            {t('signIn')}
          </Link>
        </p>

      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">{'\u00A0'}</p>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}
