'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function PendingPage() {
  const router = useRouter();
  const t = useTranslations('auth.pending');

  function handleSignOut() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('immioEmail');
    router.push('/');
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
            {t('title')}
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            {t('description')}
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
            {t('whatNextTitle')}
          </p>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>{'\u2022'} {t('step1')}</li>
            <li>{'\u2022'} {t('step2')}</li>
            <li>{'\u2022'} {t('step3')}</li>
          </ul>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          {t('contact')}{' '}
          <a href="mailto:hello@immio.at" className="text-blue-600 hover:underline">
            hello@immio.at
          </a>
        </p>

        <button
          onClick={handleSignOut}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          {t('signOut')}
        </button>
      </div>
    </div>
  );
}
