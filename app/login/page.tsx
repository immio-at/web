'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchParams.get('registered') === 'true') {
      setSuccess('Account created! Please check your email to confirm, then sign in.');
    }
    if (searchParams.get('reason') === 'session_expired') {
      setError('Your session expired. Please sign in again.');
    }
  }, [searchParams]);

  async function handleLogin() {
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
        setError(data.message || 'Login failed');
        return;
      }

      // Store token and user info for use across the app
      localStorage.setItem('accessToken', data.session.access_token);
      localStorage.setItem('userEmail', data.user.email);
      localStorage.setItem('immioEmail', data.immioEmail);

      // Gate on approval status before allowing access to the app
      if (!data.approved) {
        router.push('/pending');
        return;
      }

      router.push('/dashboard');

    } catch (e) {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-8 w-full max-w-md">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">
        IM<span className="text-4xl">M</span>IO
      </h1>
      <p className="text-gray-600 mb-8">Sign in to your account</p>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded p-3 mb-4">
          <p className="text-green-800 text-sm">{success}</p>
        </div>
      )}

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
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Suspense fallback={<div className="text-gray-500">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
