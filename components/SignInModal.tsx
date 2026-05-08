'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useTranslations } from 'next-intl';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const SITE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://immio.at';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignInModal({ open, onClose }: SignInModalProps) {
  const router = useRouter();
  const { setAppData } = useAuth();
  const t = useTranslations('auth.signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
    [onClose],
  );
  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) { setEmail(''); setPassword(''); setError(''); setLoading(false); }
  }, [open]);

  async function handleLogin() {
    if (!email || !password) { setError(t('errorEmptyFields')); return; }
    setLoading(true);
    setError('');

    try {
      // 1. Call our backend login endpoint
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || t('errorLoginFailed'));
        return;
      }

      // 2. Hand the session to the frontend Supabase client.
      // This is the critical step — without it, the Supabase client has no
      // session and cannot refresh the access token automatically.
      // The backend authenticated server-side; we now sync that session to
      // the client so onAuthStateChange fires and AuthContext picks it up.
      await supabase.auth.setSession({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
      });

      // 3. Populate AuthContext with app-specific fields from the login response.
      // AuthContext handles writing these to localStorage for persistence.
      setAppData({
        immioEmail: data.immioEmail,
        isAdmin: data.isAdmin ?? false,
        approved: data.approved,
        userEmail: data.email,
        tier: data.tier,
      });

      // 4. Redirect based on approval status
      if (!data.approved) {
        router.push('/pending');
        return;
      }

      router.push('/dashboard');

    } catch {
      setError(t('errorConnection'));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${SITE_URL}/auth/callback`,
      },
    });
    if (error) setError(error.message);
  }

  async function handleAppleSignIn() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${SITE_URL}/auth/callback`,
      },
    });
    if (error) setError(error.message);
  }

  if (!open) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15, 31, 61, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      {/* Panel — stop propagation so clicks inside don't close */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors text-xl leading-none"
          aria-label={t('closeAriaLabel')}
        >
          ✕
        </button>

        {/* Header */}
        <div className="mb-6">
          <p className="text-[11px] font-mono uppercase tracking-widest text-teal-600 mb-1">IMMIO</p>
          <h2 className="text-xl font-semibold text-primary">{t('title')}</h2>
          <p className="text-sm text-gray-500 font-light mt-1">{t('sub')}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {t('emailLabel')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-primary bg-white outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {t('passwordLabel')}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder={t('passwordPlaceholder')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-primary bg-white outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-light disabled:opacity-50 text-white font-medium text-sm py-2.5 rounded-lg transition-colors mt-2"
          >
            {loading ? t('submitting') : t('submit')}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 border-t border-gray-200" />
          <span className="text-xs text-gray-400">{t('orContinueWith')}</span>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* Google Sign In */}
        <button
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors mb-2"
        >
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          {t('googleSignIn')}
        </button>

        {/* Apple Sign In */}
        <button
          onClick={handleAppleSignIn}
          className="w-full flex items-center justify-center gap-3 bg-black hover:bg-gray-900 rounded-lg py-2.5 text-sm font-medium text-white transition-colors"
        >
          <svg width="16" height="18" viewBox="0 0 16 18" fill="currentColor" aria-hidden>
            <path d="M13.16 9.58c-.02-2.05 1.68-3.04 1.76-3.09-.96-1.4-2.45-1.6-2.98-1.62-1.27-.13-2.48.75-3.13.75-.66 0-1.65-.73-2.71-.71-1.4.02-2.69.81-3.4 2.06-1.45 2.51-.37 6.21 1.04 8.25.69 1 1.51 2.12 2.58 2.08 1.04-.04 1.43-.67 2.69-.67 1.25 0 1.6.67 2.71.65 1.12-.02 1.83-1.01 2.51-2.02.79-1.16 1.12-2.29 1.13-2.35-.02-.01-2.17-.83-2.2-3.33zM11.05 3.6c.57-.69.96-1.65.85-2.6-.83.03-1.83.55-2.42 1.24-.53.61-1 1.59-.87 2.52.92.07 1.87-.47 2.44-1.16z"/>
          </svg>
          {t('appleSignIn')}
        </button>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          {t('noAccount')}{' '}
          <Link href="/register" className="text-teal-600 hover:underline font-medium">
            {t('register')}
          </Link>
        </p>
      </div>
    </div>
  );
}
