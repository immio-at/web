'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ─── Copy type ────────────────────────────────────────────────────────────────

export interface RegisterModalCopy {
  regTitle: string;
  regSub: string;
  regEmail: string;
  regPassword: string;
  regInvite: string;
  regInvitePlaceholder: string;
  regInviteHint: string;
  regSubmit: string;
  regSubmitting: string;
  regHaveAccount: string;
  regSignIn: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface RegisterModalProps {
  open: boolean;
  onClose: () => void;
  initialEmail: string;
  t: RegisterModalCopy;
  onSwitchToSignIn: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RegisterModal({
  open,
  onClose,
  initialEmail,
  t,
  onSwitchToSignIn,
}: RegisterModalProps) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
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

  // Sync initialEmail when it changes (e.g. passed from hero form)
  useEffect(() => {
    if (open) { setEmail(initialEmail); setPassword(''); setInviteCode(''); setError(''); }
  }, [open, initialEmail]);

  async function handleRegister() {
    if (!email || !password) { setError('Bitte Email und Passwort eingeben.'); return; }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, inviteCode: inviteCode || undefined }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.message || 'Registrierung fehlgeschlagen'); return; }

      // Invite code = auto-approved → open sign-in modal
      // No invite code = pending approval → redirect to /pending
      if (inviteCode) {
        onClose();
        onSwitchToSignIn();
      } else {
        router.push('/pending');
      }
    } catch {
      setError('Verbindung zum Server fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15, 31, 61, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
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
          <h2 className="text-xl font-semibold text-primary">{t.regTitle}</h2>
          <p className="text-sm text-gray-500 font-light mt-1">{t.regSub}</p>
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
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{t.regEmail}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-primary bg-white outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{t.regPassword}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-primary bg-white outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">{t.regInvite}</label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              placeholder={t.regInvitePlaceholder}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-primary bg-white outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all font-mono tracking-widest"
            />
            <p className="text-xs text-gray-400 mt-1.5 font-light">{t.regInviteHint}</p>
          </div>
          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-light disabled:opacity-50 text-primary font-semibold text-sm py-2.5 rounded-lg transition-colors mt-2"
          >
            {loading ? t.regSubmitting : t.regSubmit}
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          {t.regHaveAccount}{' '}
          <button
            onClick={() => { onClose(); onSwitchToSignIn(); }}
            className="text-teal-600 hover:underline font-medium"
          >
            {t.regSignIn}
          </button>
        </p>
      </div>
    </div>
  );
}
