'use client';

/**
 * Extension auth callback page.
 *
 * Flow:
 * 1. Extension popup opens this page in a tab.
 * 2. Page checks for an existing Supabase session. If none, triggers
 *    Google OAuth (redirects to Google → back here with session).
 * 3. On success, provisions the backend user via POST /auth/oauth-callback.
 * 4. Encodes the session tokens in the URL hash:
 *    #immio-ext-auth=BASE64({accessToken, refreshToken, expiresIn, email})
 * 5. The extension's service worker watches for this hash via
 *    chrome.tabs.onUpdated, extracts tokens, stores them, and closes the tab.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { oauthCallback } from '@/lib/api';

export default function ExtensionCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'signing-in' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleAuth();
  }, []);

  async function handleAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        await provisionAndSignal(session);
        return;
      }

      setStatus('signing-in');
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.href.split('#')[0] },
      });

      if (oauthError) {
        setError(oauthError.message);
        setStatus('error');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  }

  async function provisionAndSignal(session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: { email?: string };
  }) {
    await oauthCallback(session.access_token);

    // Encode tokens in the URL hash. The extension's service worker
    // detects #immio-ext-auth=... via chrome.tabs.onUpdated.
    const payload = {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      email: session.user?.email,
    };
    window.location.hash = 'immio-ext-auth=' + btoa(JSON.stringify(payload));
    setStatus('success');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-sm mx-auto px-4">
        <p className="text-[11px] font-mono uppercase tracking-widest text-teal-600 mb-2">IMMIO</p>

        {status === 'loading' && (
          <>
            <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-teal-600 rounded-full mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Anmeldung wird vorbereitet…</p>
          </>
        )}

        {status === 'signing-in' && (
          <>
            <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-teal-600 rounded-full mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Weiterleitung zu Google…</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-4xl mb-4">✓</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Verbunden!</h2>
            <p className="text-gray-500 text-sm">
              Dein IMMIO-Konto ist mit der Erweiterung verbunden.
              Dieses Fenster schließt sich gleich…
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="text-red-600 mb-4">{error ?? 'Anmeldung fehlgeschlagen'}</p>
            <button
              onClick={() => { setStatus('loading'); handleAuth(); }}
              className="text-teal-600 hover:underline text-sm"
            >
              Erneut versuchen
            </button>
          </>
        )}
      </div>
    </div>
  );
}
