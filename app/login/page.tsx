'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Show message if redirected here due to session expiry
    if (searchParams.get('reason') === 'session_expired') {
      setError('Your session expired. Please sign in again.');
    }
  }, [searchParams]);

  async function handleLogin() {
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Supabase handles token storage automatically
    // AuthContext will detect the new session via onAuthStateChange
    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-sm border p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          IM<span className="text-4xl">M</span>IO
        </h1>
        <p className="text-gray-600 mb-8">Sign in to your account</p>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full border rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>

        <p className="text-center text-sm text-gray-600 mt-6">
          Don't have an account?{' '}
          <Link href="/register" className="text-blue-600 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}