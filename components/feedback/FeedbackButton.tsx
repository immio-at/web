'use client';

/**
 * FeedbackButton (ADR-018 §1) — bottom-right floating action button
 * mounted at the authenticated layout level. Opens the right-side
 * FeedbackDrawer. Hidden under 600px viewport (mobile users reach
 * feedback via Settings → Send feedback per ADR §1.2).
 */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useAuth } from '@/context/AuthContext';

const FeedbackDrawer = dynamic(() => import('./FeedbackDrawer'), { ssr: false });

export default function FeedbackButton() {
  const t = useTranslations('feedback');
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    function handle() {
      setNarrow(window.innerWidth < 600);
    }
    handle();
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  if (!session?.user?.id) return null;
  if (narrow) return null;

  return (
    <>
      <button
        type="button"
        data-tour-id="feedback-button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 text-white shadow-lg transition-colors flex items-center justify-center"
        aria-label={t('button.label')}
        title={t('button.label')}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <line x1="9" y1="10" x2="15" y2="10" />
          <line x1="12" y1="7" x2="12" y2="13" />
        </svg>
      </button>
      {open && <FeedbackDrawer onClose={() => setOpen(false)} />}
    </>
  );
}
