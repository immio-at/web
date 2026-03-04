'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface User {
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
  createdAt: string;
  usedAt: string | null;
  usedBy: string | null;
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newCode, setNewCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  function getToken(): string | null {
    return localStorage.getItem('accessToken');
  }

  async function fetchData() {
    const token = getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const [usersRes, codesRes] = await Promise.all([
        fetch(`${API_URL}/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/admin/invite-codes`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      // 403 means logged in but not admin — redirect away
      if (usersRes.status === 403) {
        router.push('/dashboard');
        return;
      }

      if (!usersRes.ok || !codesRes.ok) {
        setError('Failed to load admin data');
        return;
      }

      setUsers(await usersRes.json());
      setInviteCodes(await codesRes.json());
    } catch (e) {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  async function handleApprove(userId: string) {
    setActionLoading(userId);
    const token = getToken();
    try {
      await fetch(`${API_URL}/admin/users/${userId}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchData();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRevoke(userId: string) {
    setActionLoading(userId);
    const token = getToken();
    try {
      await fetch(`${API_URL}/admin/users/${userId}/revoke`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchData();
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCreateCode() {
    if (!newCode.trim()) return;
    setCreating(true);
    const token = getToken();
    try {
      const res = await fetch(`${API_URL}/admin/invite-codes`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: newCode.trim().toUpperCase() }),
      });
      if (res.ok) {
        setNewCode('');
        await fetchData();
      }
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const pendingUsers = users.filter((u) => !u.approved);
  const approvedUsers = users.filter((u) => u.approved);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">IMMIO Admin</h1>
            <p className="text-sm text-gray-500">{users.length} total users</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Pending Users */}
        {pendingUsers.length > 0 && (
          <div className="bg-white rounded-lg border border-amber-200 shadow-sm">
            <div className="px-6 py-4 border-b border-amber-100 bg-amber-50 rounded-t-lg">
              <h2 className="font-semibold text-amber-900">
                Pending Approval ({pendingUsers.length})
              </h2>
            </div>
            <div className="divide-y">
              {pendingUsers.map((user) => (
                <div key={user.id} className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{user.email}</p>
                    <p className="text-xs text-gray-500 font-mono">{user.immioEmail}</p>
                    <p className="text-xs text-gray-400">
                      Registered {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleApprove(user.id)}
                    disabled={actionLoading === user.id}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading === user.id ? 'Approving...' : 'Approve'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Approved Users */}
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-900">
              Approved Users ({approvedUsers.length})
            </h2>
          </div>
          <div className="divide-y">
            {approvedUsers.length === 0 && (
              <p className="px-6 py-4 text-sm text-gray-500">No approved users yet.</p>
            )}
            {approvedUsers.map((user) => (
              <div key={user.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{user.email}</p>
                  <p className="text-xs text-gray-500 font-mono">{user.immioEmail}</p>
                  <p className="text-xs text-gray-400">
                    Registered {new Date(user.createdAt).toLocaleDateString()}
                    {user.inviteCode && ` · Code: ${user.inviteCode}`}
                  </p>
                </div>
                <button
                  onClick={() => handleRevoke(user.id)}
                  disabled={actionLoading === user.id}
                  className="text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === user.id ? 'Revoking...' : 'Revoke'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Invite Codes */}
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold text-gray-900">Invite Codes</h2>
          </div>

          {/* Create new code */}
          <div className="px-6 py-4 border-b bg-gray-50">
            <div className="flex gap-3">
              <input
                type="text"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCode()}
                placeholder="IMMIO-BETA-002"
                className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleCreateCode}
                disabled={creating || !newCode.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating...' : 'Create Code'}
              </button>
            </div>
          </div>

          {/* Code list */}
          <div className="divide-y">
            {inviteCodes.length === 0 && (
              <p className="px-6 py-4 text-sm text-gray-500">No invite codes yet.</p>
            )}
            {inviteCodes.map((code) => (
              <div key={code.id} className="px-6 py-4 flex items-center justify-between">
                <p className="font-mono font-medium text-gray-900">{code.code}</p>
                <div className="text-right">
                  {code.usedAt ? (
                    <div>
                      <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
                        Used
                      </span>
                      <p className="text-xs text-gray-400 mt-1">{code.usedBy}</p>
                    </div>
                  ) : (
                    <span className="inline-block bg-emerald-100 text-emerald-700 text-xs px-2 py-1 rounded">
                      Available
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
