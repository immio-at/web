'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import dynamic from 'next/dynamic';

const FeedbackDrawer = dynamic(() => import('@/components/feedback/FeedbackDrawer'), { ssr: false });

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ─── Placeholder section ──────────────────────────────────────────────────────
function FeedbackSection() {
  const tFb = useTranslations('feedback');
  const [open, setOpen] = useState(false);
  return (
    <Section title={tFb('button.label')}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {tFb('button.label')}
      </button>
      {open && <FeedbackDrawer onClose={() => setOpen(false)} />}
    </Section>
  );
}

function PlaceholderSection({ title, description }: { title: string; description: string }) {
  return (
    <Section title={title}>
      <p className="text-sm text-gray-400 italic">{description}</p>
    </Section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const t = useTranslations('settings');
  const { immioEmail, userEmail } = useAuth();
  const { filters: savedFilters } = useSavedFilters();
  const [copied, setCopied] = useState(false);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  async function copyImmioEmail() {
    if (!immioEmail) return;
    await navigator.clipboard.writeText(immioEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handlePasswordChange() {
    setPwError(null);
    setPwSuccess(false);

    if (!newPassword || newPassword.length < 8) {
      setPwError(t('password.errorMinLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError(t('password.errorMismatch'));
      return;
    }

    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);

    if (error) {
      setPwError(error.message);
    } else {
      setPwSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-4">

      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('title')}</h1>

      {/* ── IMMIO Email ─────────────────────────────────────────────────────── */}
      <Section title={t('immioEmail.title')}>
        <p className="text-sm text-gray-500 mb-3">
          {t('immioEmail.description')}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-800 select-all">
            {immioEmail ?? <span className="text-gray-400">{t('immioEmail.loading')}</span>}
          </div>
          <button
            onClick={copyImmioEmail}
            disabled={!immioEmail}
            className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors border ${
              copied
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            } disabled:opacity-40`}
          >
            {copied ? t('immioEmail.copied') : t('immioEmail.copy')}
          </button>
        </div>
        {userEmail && (
          <p className="text-xs text-gray-400 mt-2">{t('immioEmail.account', { email: userEmail })}</p>
        )}
      </Section>

      {/* ── Change Password ──────────────────────────────────────────────────── */}
      <Section title={t('password.title')}>
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('password.newPasswordLabel')}</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => { setNewPassword(e.target.value); setPwError(null); setPwSuccess(false); }}
              placeholder={t('password.newPasswordPlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('password.confirmPasswordLabel')}</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setPwError(null); setPwSuccess(false); }}
              placeholder={t('password.confirmPasswordPlaceholder')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          {pwError && <p className="text-xs text-rose-600">{pwError}</p>}
          {pwSuccess && <p className="text-xs text-emerald-600">{t('password.success')}</p>}

          <button
            onClick={handlePasswordChange}
            disabled={pwLoading || !newPassword || !confirmPassword}
            className="bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            {pwLoading ? t('password.updating') : t('password.submit')}
          </button>
        </div>
      </Section>

      {/* ── Feedback (mobile fallback for the floating button) ──────────────── */}
      <FeedbackSection />

      {/* ── Saved Filters link ──────────────────────────────────────────────── */}
      <Section title={t('filters.title')}>
        <p className="text-sm text-gray-500 mb-3">{t('filters.description')}</p>
        <Link
          href="/settings/filters"
          className="inline-flex items-center justify-between gap-3 px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium">{t('filters.manageLink')}</span>
          <span className="text-xs text-gray-400">{savedFilters.length} {t('filters.count')} →</span>
        </Link>
      </Section>

      {/* ── Placeholders ────────────────────────────────────────────────────── */}
      <PlaceholderSection
        title={t('subscription.title')}
        description={t('subscription.description')}
      />
      <PlaceholderSection
        title={t('notifications.title')}
        description={t('notifications.description')}
      />
      <PlaceholderSection
        title={t('gdpr.title')}
        description={t('gdpr.description')}
      />

    </div>
  );
}
