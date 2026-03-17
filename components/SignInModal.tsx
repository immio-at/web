'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ─── Copy type ────────────────────────────────────────────────────────────────

export interface SignInModalCopy {
  modalTitle: string;
  modalSub: string;
  modalEmail: string;
  modalPassword: string;
  modalEmailPlaceholder: string;
  modalPasswordPlaceholder: string;
  modalSubmit: string;
  modalSubmitting: string;
  modalNoAccount: string;
  modalRegister: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
  t: SignInModalCopy;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SignInModal({ open, onClose, t }: SignInModalProps) {
  const router = useRouter();
  const { setAppData } = useAuth();
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
    if (!email || !password) { setError('Bitte Email und Passwort eingeben.'); return; }
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Login fehlgeschlagen');
        return;
      }

      // Populate AuthContext with app-specific fields from the login response.
      // AuthContext handles writing these to localStorage for persistence.
      // The Supabase session (for token refresh) is managed separately by
      // AuthContext's onAuthStateChange listener — it picks up the session
      // automatically when Supabase's signInWithPassword is called server-side.
      setAppData({
        immioEmail: data.immioEmail,
        isAdmin: data.isAdmin ?? false,
        approved: data.approved,
        userEmail: data.email,
      });

      // Also store accessToken for legacy fallback during transition period
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('userId', data.userId);

      if (!data.approved) {
        router.push('/pending');
        return;
      }

      router.push('/dashboard');

    } catch {
      setError('Verbindung zum Server fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
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
          aria-label="Schließen"
        >
          ✕
        </button>

        {/* Header */}
        <div className="mb-6">
          <p className="text-[11px] font-mono uppercase tracking-widest text-teal-600 mb-1">IMMIO</p>
          <h2 className="text-xl font-semibold text-primary">{t.modalTitle}</h2>
          <p className="text-sm text-gray-500 font-light mt-1">{t.modalSub}</p>
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
              {t.modalEmail}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.modalEmailPlaceholder}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-primary bg-white outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {t.modalPassword}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder={t.modalPasswordPlaceholder}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-primary bg-white outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-light disabled:opacity-50 text-white font-medium text-sm py-2.5 rounded-lg transition-colors mt-2"
          >
            {loading ? t.modalSubmitting : t.modalSubmit}
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          {t.modalNoAccount}{' '}
          <Link href="/register" className="text-teal-600 hover:underline font-medium">
            {t.modalRegister}
          </Link>
        </p>
      </div>
    </div>
  );
}
