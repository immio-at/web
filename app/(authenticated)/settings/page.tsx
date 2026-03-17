'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

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
function PlaceholderSection({ title, description }: { title: string; description: string }) {
  return (
    <Section title={title}>
      <p className="text-sm text-gray-400 italic">{description}</p>
    </Section>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { immioEmail, userEmail } = useAuth();
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
      setPwError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match.');
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

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      {/* ── IMMIO Email ─────────────────────────────────────────────────────── */}
      <Section title="Your IMMIO Email Address">
        <p className="text-sm text-gray-500 mb-3">
          Use this address when subscribing to search agents on Willhaben, Immoscout24, and other platforms.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-mono text-gray-800 select-all">
            {immioEmail ?? <span className="text-gray-400">Loading...</span>}
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
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        {userEmail && (
          <p className="text-xs text-gray-400 mt-2">Account: {userEmail}</p>
        )}
      </Section>

      {/* ── Change Password ──────────────────────────────────────────────────── */}
      <Section title="Change Password">
        <div className="space-y-3 max-w-sm">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => { setNewPassword(e.target.value); setPwError(null); setPwSuccess(false); }}
              placeholder="Min. 8 characters"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setPwError(null); setPwSuccess(false); }}
              placeholder="Repeat new password"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          {pwError && <p className="text-xs text-rose-600">{pwError}</p>}
          {pwSuccess && <p className="text-xs text-emerald-600">Password updated successfully.</p>}

          <button
            onClick={handlePasswordChange}
            disabled={pwLoading || !newPassword || !confirmPassword}
            className="bg-slate-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            {pwLoading ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </Section>

      {/* ── Placeholders ────────────────────────────────────────────────────── */}
      <PlaceholderSection
        title="Subscription"
        description="Subscription management coming soon — upgrade, downgrade, and billing will be available here."
      />
      <PlaceholderSection
        title="Notifications"
        description="Notification preferences coming soon — configure push notifications and email digests here."
      />
      <PlaceholderSection
        title="GDPR & Privacy"
        description="Data export, right to erasure, and privacy controls coming soon."
      />

    </div>
  );
}
