'use client';

/**
 * Extension auth callback page.
 *
 * The extension popup opens this page in a new tab when the user clicks
 * "Sign in to IMMIO". The page performs a standard Supabase OAuth sign-in
 * (Google), then communicates the resulting session tokens back to the
 * extension via chrome.runtime.sendMessage and closes the tab.
 *
 * If the user is already signed in (has a valid Supabase session), the
 * page sends the tokens immediately without prompting.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { oauthCallback } from '@/lib/api';

const EXTENSION_ID_KEY = 'immio_extension_id';

export default function ExtensionCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'signing-in' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleAuth();
  }, []);

  async function handleAuth() {
    try {
      // Check for existing session first
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // Already signed in — provision backend user and send tokens to extension
        await provisionAndSendTokens(session);
        return;
      }

      // No session — trigger Google OAuth.
      // After the OAuth redirect loop, this page reloads with session set.
      setStatus('signing-in');
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.href,
        },
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

  async function provisionAndSendTokens(session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: { email?: string };
  }) {
    // Provision/retrieve the backend user (same as regular OAuth callback)
    await oauthCallback(session.access_token);

    // Send tokens to the extension via a message to the service worker.
    // The extension must have declared this page's origin in host_permissions
    // or web_accessible_resources. We use postMessage to the extension.
    try {
      // Attempt to communicate via chrome.runtime.sendMessage.
      // `chrome` is only available when the page is loaded in Chrome with
      // the extension installed and externally_connectable configured.
      const cr = (globalThis as any).chrome;
      if (cr?.runtime?.sendMessage) {
        const extId = localStorage.getItem(EXTENSION_ID_KEY);
        if (extId) {
          await cr.runtime.sendMessage(extId, {
            type: 'SET_TOKENS',
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            expiresIn: session.expires_in,
          });
          await cr.runtime.sendMessage(extId, {
            type: 'SET_USER_EMAIL',
            email: session.user?.email,
          });
        }
      }
    } catch {
      // Extension not reachable — fall through to BroadcastChannel
    }

    // Also broadcast via BroadcastChannel so the extension's popup can
    // pick it up even without externally_connectable
    try {
      const bc = new BroadcastChannel('immio-extension-auth');
      bc.postMessage({
        type: 'AUTH_TOKENS',
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        expiresIn: session.expires_in,
        email: session.user?.email,
      });
      bc.close();
    } catch { /* BroadcastChannel not available */ }

    setStatus('success');

    // Auto-close the tab after a short delay
    setTimeout(() => window.close(), 2000);
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
              Dein IMMIO-Konto ist jetzt mit der Erweiterung verbunden.
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
