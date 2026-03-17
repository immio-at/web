'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  return approved
    ? <span className="text-xs font-mono bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded-full">Aktiv</span>
    : <span className="text-xs font-mono bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Ausstehend</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading, session } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newCode, setNewCode] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
      const [usersRes, codesRes] = await Promise.all([
        fetch(`${API_URL}/admin/users`, { headers: authHeaders() }),
        fetch(`${API_URL}/admin/invite-codes`, { headers: authHeaders() }),
      ]);

      if (!usersRes.ok || !codesRes.ok) {
        setError('Fehler beim Laden der Daten.');
        return;
      }

      setUsers(await usersRes.json());
      setInviteCodes(await codesRes.json());
    } catch {
      setError('Verbindung zum Server fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }, [session]);

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

  // ── Derived data ───────────────────────────────────────────────────────────
  const pending = users.filter(u => !u.approved);
  const unusedCodes = inviteCodes.filter(c => !c.usedAt);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-400 font-mono">Laden…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-10">
          <p className="text-[11px] font-mono uppercase tracking-widest text-amber-600 mb-1">Admin</p>
          <h1 className="text-3xl font-light text-primary tracking-tight">Verwaltung</h1>
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* ── Summary stats ── */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { label: 'Nutzer gesamt', value: users.length },
            { label: 'Ausstehend', value: pending.length },
            { label: 'Einladungscodes verfügbar', value: unusedCodes.length },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-2">{stat.label}</p>
              <p className="text-3xl font-light text-primary">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* ── Pending approvals ── */}
        {pending.length > 0 && (
          <div className="bg-white border border-amber-200 rounded-xl p-6 shadow-sm mb-6">
            <SectionHeader title="Ausstehende Freischaltungen" count={pending.length} />
            <div className="space-y-3">
              {pending.map(user => (
                <div
                  key={user.id}
                  className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-primary">{user.email}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">
                      Registriert {formatDate(user.createdAt)}
                      {user.inviteCode && ` · Code: ${user.inviteCode}`}
                    </p>
                  </div>
                  <button
                    onClick={() => approveUser(user.id)}
                    disabled={actionLoading === user.id}
                    className="text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
                  >
                    {actionLoading === user.id ? '…' : 'Freischalten'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── All users ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm mb-6">
          <SectionHeader title="Alle Nutzer" count={users.length} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-100">
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal pr-4">Email</th>
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal pr-4">IMMIO Email</th>
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal pr-4">Registriert</th>
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal pr-4">Status</th>
                  <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal">Aktion</th>
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
                          {actionLoading === user.id ? '…' : 'Sperren'}
                        </button>
                      ) : (
                        <button
                          onClick={() => approveUser(user.id)}
                          disabled={actionLoading === user.id}
                          className="text-xs text-teal-600 hover:text-teal-800 disabled:opacity-50 transition-colors"
                        >
                          {actionLoading === user.id ? '…' : 'Freischalten'}
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
          <SectionHeader title="Einladungscodes" count={inviteCodes.length} />

          {/* Create new code */}
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={newCode}
              onChange={e => setNewCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && createInviteCode()}
              placeholder="IMMIO-XXXX-XXX"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono text-primary outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all tracking-widest"
            />
            <button
              onClick={createInviteCode}
              disabled={!newCode.trim() || actionLoading === 'invite'}
              className="bg-primary hover:bg-primary-light disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {actionLoading === 'invite' ? '…' : 'Erstellen'}
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
                    ? `Verwendet von ${code.usedBy} · ${formatDate(code.usedAt)}`
                    : 'Verfügbar'
                  }
                </span>
              </div>
            ))}
            {inviteCodes.length === 0 && (
              <p className="text-sm text-gray-400 font-light text-center py-4">
                Noch keine Einladungscodes erstellt.
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
