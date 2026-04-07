'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { oauthCallback } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function AuthCallbackPage() {
  const router = useRouter();
  const { setAppData } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        // Supabase handles the OAuth token exchange via the URL hash/params.
        // After signInWithOAuth redirects back, the session is automatically set.
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.');
          return;
        }

        // Provision/retrieve the user in our backend
        const appData = await oauthCallback(session.access_token);

        // Set app-specific fields in AuthContext
        setAppData({
          immioEmail: appData.immioEmail,
          isAdmin: appData.isAdmin,
          approved: appData.approved,
          userEmail: appData.email,
          tier: appData.tier,
        });

        // Redirect to dashboard
        router.push('/dashboard');
      } catch (e) {
        console.error('OAuth callback error:', e);
        setError('Fehler bei der Anmeldung. Bitte erneut versuchen.');
      }
    }

    handleCallback();
  }, [router, setAppData]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <a href="/" className="text-teal-600 hover:underline text-sm">Zurück zur Startseite</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-teal-600 rounded-full mx-auto mb-4" />
        <p className="text-gray-500 text-sm">Anmeldung wird abgeschlossen...</p>
      </div>
    </div>
  );
}
