'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppUser {
  id: string;
  email: string;
  immioEmail: string;
  approved: boolean;
  inviteCode: string | null;
  createdAt: string;
}

interface InviteCode {
  id: string;
  code: string;
  usedAt: string | null;
  usedBy: string | null;
  createdAt: string;
}

interface ScraperHealth {
  platform: string;
  displayName: string;
  enabled: boolean;
  disabledAt: string | null;
  disabledReason: string | null;
  lastRun: {
    status: string;
    runAt: string;
    probeCount: number | null;
    httpStatus: number | null;
    responseTimeMs: number | null;
    errorMessage: string | null;
  } | null;
}

interface HealthRun {
  id: string;
  platform: string;
  runAt: string;
  status: string;
  probeCount: number | null;
  expectedMin: number | null;
  selectorMatch: boolean | null;
  httpStatus: number | null;
  responseTimeMs: number | null;
  errorMessage: string | null;
  alertSent: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-sm font-mono uppercase tracking-widest text-gray-400">{title}</h2>
      {count !== undefined && (
        <span className="text-xs font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ approved }: { approved: boolean }) {
  const t = useTranslations('admin');
  return approved
    ? <span className="text-xs font-mono bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">{t('allUsers.statusActive')}</span>
    : <span className="text-xs font-mono bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">{t('allUsers.statusPending')}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const t = useTranslations('admin');
  const router = useRouter();
  const { isAdmin, loading: authLoading, session } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newCode, setNewCode] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Scraper health
  const [scrapers, setScrapers] = useState<ScraperHealth[]>([]);
  const [selectedScraper, setSelectedScraper] = useState<string | null>(null);
  const [healthHistory, setHealthHistory] = useState<HealthRun[]>([]);

  // ── Guard: redirect non-admins ─────────────────────────────────────────────
  // Wait for AuthContext to finish loading before checking — avoids false
  // redirects while the context is still seeding from localStorage on mount.
  useEffect(() => {
    if (authLoading) return;
    if (!session || !isAdmin) {
      router.push('/dashboard');
    }
  }, [authLoading, session, isAdmin, router]);

  // ── Auth headers using live Supabase session token ─────────────────────────
  function authHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
    };
  }

  // ── Data fetching ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError('');
    try {
      const [usersRes, codesRes, scrapersRes] = await Promise.all([
        fetch(`${API_URL}/admin/users`, { headers: authHeaders() }),
        fetch(`${API_URL}/admin/invite-codes`, { headers: authHeaders() }),
        fetch(`${API_URL}/admin/scrapers/health`, { headers: authHeaders() }),
      ]);

      if (!usersRes.ok || !codesRes.ok) {
        setError(t('errorLoading'));
        return;
      }

      setUsers(await usersRes.json());
      setInviteCodes(await codesRes.json());
      if (scrapersRes.ok) setScrapers(await scrapersRes.json());
    } catch {
      setError(t('errorConnection'));
    } finally {
      setLoading(false);
    }
  }, [session, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Actions ────────────────────────────────────────────────────────────────
  async function approveUser(userId: string) {
    setActionLoading(userId);
    try {
      await fetch(`${API_URL}/admin/users/${userId}/approve`, {
        method: 'PATCH', headers: authHeaders(),
      });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, approved: true } : u));
    } finally {
      setActionLoading(null);
    }
  }

  async function revokeUser(userId: string) {
    setActionLoading(userId);
    try {
      await fetch(`${API_URL}/admin/users/${userId}/revoke`, {
        method: 'PATCH', headers: authHeaders(),
      });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, approved: false } : u));
    } finally {
      setActionLoading(null);
    }
  }

  async function createInviteCode() {
    if (!newCode.trim()) return;
    setActionLoading('invite');
    try {
      const res = await fetch(`${API_URL}/admin/invite-codes`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ code: newCode.trim().toUpperCase() }),
      });
      if (res.ok) {
        setNewCode('');
        await fetchData();
      }
    } finally {
      setActionLoading(null);
    }
  }

  // ── Scraper actions ────────────────────────────────────────────────────────
  async function toggleScraper(platform: string, enable: boolean) {
    setActionLoading(`scraper-${platform}`);
    try {
      await fetch(`${API_URL}/admin/scrapers/${platform}/${enable ? 'enable' : 'disable'}`, {
        method: 'PATCH', headers: authHeaders(),
      });
      setScrapers(prev => prev.map(s =>
        s.platform === platform ? { ...s, enabled: enable, disabledAt: enable ? null : new Date().toISOString(), disabledReason: enable ? null : 'Manually disabled' } : s
      ));
    } finally {
      setActionLoading(null);
    }
  }

  async function triggerHealthCheck() {
    setActionLoading('health-check');
    try {
      await fetch(`${API_URL}/admin/scrapers/trigger-check`, { headers: authHeaders() });
      await fetchData();
    } finally {
      setActionLoading(null);
    }
  }

  async function loadHistory(platform: string) {
    if (selectedScraper === platform) { setSelectedScraper(null); return; }
    setSelectedScraper(platform);
    try {
      const res = await fetch(`${API_URL}/admin/scrapers/health/${platform}`, { headers: authHeaders() });
      if (res.ok) setHealthHistory(await res.json());
    } catch { /* ignore */ }
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const pending = users.filter(u => !u.approved);
  const unusedCodes = inviteCodes.filter(c => !c.usedAt);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-400 font-mono">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-10">
          <p className="text-[11px] font-mono uppercase tracking-widest text-amber-600 mb-1">{t('label')}</p>
          <h1 className="text-3xl font-light text-primary tracking-tight">{t('title')}</h1>
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* ── Summary stats ── */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { label: t('stats.totalUsers'), value: users.length },
            { label: t('stats.pending'), value: pending.length },
            { label: t('stats.inviteCodesAvailable'), value: unusedCodes.length },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-2">{stat.label}</p>
              <p className="text-3xl font-light text-primary">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* ── Scraper Health ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <SectionHeader title={t('scrapers.title')} count={scrapers.length} />
            <button
              onClick={triggerHealthCheck}
              disabled={actionLoading === 'health-check'}
              className="text-xs font-medium bg-slate-100 hover:bg-slate-200 text-gray-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {actionLoading === 'health-check' ? '…' : t('scrapers.triggerCheck')}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal pr-4">{t('scrapers.source')}</th>
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal pr-4">{t('scrapers.status')}</th>
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal pr-4">{t('scrapers.lastRun')}</th>
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal pr-4">{t('scrapers.listings')}</th>
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal">{t('scrapers.action')}</th>
                </tr>
              </thead>
              <tbody>
                {scrapers.map(s => (
                  <>
                    <tr
                      key={s.platform}
                      className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50"
                      onClick={() => loadHistory(s.platform)}
                    >
                      <td className="py-3 pr-4 font-medium text-primary">{s.displayName}</td>
                      <td className="py-3 pr-4">
                        {!s.enabled ? (
                          <span className="text-xs font-mono bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">{t('scrapers.disabled')}</span>
                        ) : !s.lastRun ? (
                          <span className="text-xs font-mono bg-gray-50 text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">{t('scrapers.noData')}</span>
                        ) : s.lastRun.status === 'healthy' ? (
                          <span className="text-xs font-mono bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">✅ {t('scrapers.healthy')}</span>
                        ) : s.lastRun.status === 'degraded' ? (
                          <span className="text-xs font-mono bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">🟡 {t('scrapers.degraded')}</span>
                        ) : (
                          <span className="text-xs font-mono bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full">🔴 {s.lastRun.status}</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-xs text-gray-500">
                        {s.lastRun ? new Date(s.lastRun.runAt).toLocaleString('de-AT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—'}
                      </td>
                      <td className="py-3 pr-4 text-xs font-mono text-gray-600">
                        {s.lastRun?.probeCount ?? '—'}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={e => { e.stopPropagation(); toggleScraper(s.platform, !s.enabled); }}
                          disabled={actionLoading === `scraper-${s.platform}`}
                          className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                            s.enabled
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-teal-600 hover:bg-teal-50'
                          }`}
                        >
                          {actionLoading === `scraper-${s.platform}` ? '…' : s.enabled ? t('scrapers.disable') : t('scrapers.enable')}
                        </button>
                      </td>
                    </tr>
                    {/* Health history (expanded) */}
                    {selectedScraper === s.platform && (
                      <tr key={`${s.platform}-history`}>
                        <td colSpan={5} className="py-3 px-4 bg-gray-50">
                          <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-2">{t('scrapers.history')}</p>
                          {healthHistory.length === 0 ? (
                            <p className="text-xs text-gray-400">{t('scrapers.noHistory')}</p>
                          ) : (
                            <div className="space-y-1">
                              {healthHistory.map(run => (
                                <div key={run.id} className="flex items-center gap-4 text-xs">
                                  <span className="text-gray-500 w-28">{new Date(run.runAt).toLocaleString('de-AT', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>
                                  <span className={`font-mono px-1.5 py-0.5 rounded ${
                                    run.status === 'healthy' ? 'bg-teal-50 text-teal-700' :
                                    run.status === 'degraded' ? 'bg-amber-50 text-amber-700' :
                                    'bg-red-50 text-red-700'
                                  }`}>{run.status}</span>
                                  <span className="text-gray-600">{run.probeCount ?? 0} / {run.expectedMin ?? '?'}</span>
                                  <span className="text-gray-400">{run.responseTimeMs}ms</span>
                                  {run.errorMessage && <span className="text-red-500 truncate max-w-xs">{run.errorMessage}</span>}
                                  {run.alertSent && <span className="text-amber-600">📧</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Pending approvals ── */}
        {pending.length > 0 && (
          <div className="bg-white border border-amber-200 rounded-xl p-6 shadow-sm mb-6">
            <SectionHeader title={t('pendingApprovals.title')} count={pending.length} />
            <div className="space-y-3">
              {pending.map(user => (
                <div
                  key={user.id}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-primary">{user.email}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">
                      {t('pendingApprovals.registered', { date: formatDate(user.createdAt) })}
                      {user.inviteCode && ` · ${t('pendingApprovals.code', { code: user.inviteCode })}`}
                    </p>
                  </div>
                  <button
                    onClick={() => approveUser(user.id)}
                    disabled={actionLoading === user.id}
                    className="text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {actionLoading === user.id ? '…' : t('pendingApprovals.approve')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── All users ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
          <SectionHeader title={t('allUsers.title')} count={users.length} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal pr-4">{t('allUsers.headerEmail')}</th>
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal pr-4">{t('allUsers.headerImmioEmail')}</th>
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal pr-4">{t('allUsers.headerRegistered')}</th>
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal pr-4">{t('allUsers.headerStatus')}</th>
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal">{t('allUsers.headerAction')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-3 pr-4 text-primary font-medium">{user.email}</td>
                    <td className="py-3 pr-4 text-gray-400 font-mono text-xs">{user.immioEmail}</td>
                    <td className="py-3 pr-4 text-gray-500 text-xs">{formatDate(user.createdAt)}</td>
                    <td className="py-3 pr-4"><StatusBadge approved={user.approved} /></td>
                    <td className="py-3">
                      {user.approved ? (
                        <button
                          onClick={() => revokeUser(user.id)}
                          disabled={actionLoading === user.id}
                          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === user.id ? '…' : t('allUsers.revoke')}
                        </button>
                      ) : (
                        <button
                          onClick={() => approveUser(user.id)}
                          disabled={actionLoading === user.id}
                          className="text-xs text-teal-600 hover:text-teal-800 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === user.id ? '…' : t('allUsers.approve')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Invite codes ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <SectionHeader title={t('inviteCodes.title')} count={inviteCodes.length} />

          {/* Create new code */}
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={newCode}
              onChange={e => setNewCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && createInviteCode()}
              placeholder={t('inviteCodes.placeholder')}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-primary outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all tracking-widest"
            />
            <button
              onClick={createInviteCode}
              disabled={!newCode.trim() || actionLoading === 'invite'}
              className="bg-primary hover:bg-primary-light disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {actionLoading === 'invite' ? '…' : t('inviteCodes.create')}
            </button>
          </div>

          {/* Code list */}
          <div className="space-y-2">
            {inviteCodes.map(code => (
              <div
                key={code.id}
                className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${
                  code.usedAt ? 'bg-gray-50' : 'bg-teal-50 border border-teal-100'
                }`}
              >
                <span className={`font-mono text-sm tracking-widest ${
                  code.usedAt ? 'text-gray-400 line-through' : 'text-teal-700'
                }`}>
                  {code.code}
                </span>
                <span className="text-xs text-gray-400 font-mono">
                  {code.usedAt
                    ? t('inviteCodes.usedBy', { email: code.usedBy ?? '', date: formatDate(code.usedAt) })
                    : t('inviteCodes.available')
                  }
                </span>
              </div>
            ))}
            {inviteCodes.length === 0 && (
              <p className="text-sm text-gray-400 font-light text-center py-4">
                {t('inviteCodes.empty')}
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
