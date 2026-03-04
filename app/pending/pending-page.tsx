'use client';

import { useRouter } from 'next/navigation';

export default function PendingPage() {
  const router = useRouter();

  function handleSignOut() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('immioEmail');
    router.push('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-sm border p-8 w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          IM<span className="text-4xl">M</span>IO
        </h1>

        <div className="mt-8 mb-6">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Your account is pending approval
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Thanks for registering. We review each account personally before granting access.
            You'll receive an email once your account is approved — usually within 24 hours.
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            What happens next
          </p>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• We review your registration</li>
            <li>• You receive an approval email</li>
            <li>• Sign back in to access IMMIO</li>
          </ul>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Questions? Contact us at{' '}
          <a href="mailto:hello@immio.at" className="text-blue-600 hover:underline">
            hello@immio.at
          </a>
        </p>

        <button
          onClick={handleSignOut}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
