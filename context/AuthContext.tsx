'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { setTokenGetter } from '@/lib/api';

// ─── App-specific fields Supabase doesn't know about ─────────────────────────

interface AppData {
  immioEmail: string | null;
  isAdmin: boolean;
  approved: boolean;
  userEmail: string | null;
}

// ─── Context type ─────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  immioEmail: string | null;
  isAdmin: boolean;
  approved: boolean;
  userEmail: string | null;
  setAppData: (data: AppData) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  immioEmail: null,
  isAdmin: false,
  approved: false,
  userEmail: null,
  setAppData: () => {},
  signOut: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // App-specific fields — seeded from localStorage on mount so values
  // survive page refresh, then kept in sync via setAppData() on login.
  const [immioEmail, setImmioEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [approved, setApproved] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    // Seed app-specific fields from localStorage on first load.
    // These were written there by SignInModal on login.
    setImmioEmail(localStorage.getItem('immioEmail'));
    setIsAdmin(localStorage.getItem('isAdmin') === 'true');
    setApproved(localStorage.getItem('approved') === 'true');
    setUserEmail(localStorage.getItem('userEmail'));

    // Get initial Supabase session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // If immioEmail is missing from localStorage but we have a session,
      // fetch it from the backend. This handles cases where localStorage
      // was cleared or the login flow didn't populate it.
      const cachedImmioEmail = localStorage.getItem('immioEmail');
      if (session?.access_token && !cachedImmioEmail) {
        try {
          const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-e03a.up.railway.app';
          const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.immioEmail) {
              setImmioEmail(data.immioEmail);
              localStorage.setItem('immioEmail', data.immioEmail);
            }
            if (data.email) {
              setUserEmail(data.email);
              localStorage.setItem('userEmail', data.email);
            }
          }
        } catch {
          // Silently ignore — immioEmail will remain empty
        }
      }
    });

    // Listen for all auth state changes (login, logout, token refresh).
    // Supabase automatically refreshes the access token before it expires —
    // this listener fires on each refresh, keeping session.access_token current.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Inject the token getter into api.ts so it can get a fresh token
    // on every API call without needing React context.
    // Returns session.access_token from Supabase, which is always current.
    setTokenGetter(async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    });

    return () => subscription.unsubscribe();
  }, []);

  // Called by SignInModal after a successful login to populate app-specific
  // fields. Also writes to localStorage so values survive page refresh.
  function setAppData(data: AppData) {
    setImmioEmail(data.immioEmail);
    setIsAdmin(data.isAdmin);
    setApproved(data.approved);
    setUserEmail(data.userEmail);

    // Keep localStorage in sync as a persistence cache
    localStorage.setItem('immioEmail', data.immioEmail ?? '');
    localStorage.setItem('isAdmin', String(data.isAdmin));
    localStorage.setItem('approved', String(data.approved));
    localStorage.setItem('userEmail', data.userEmail ?? '');
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    // Clear app-specific fields from both state and localStorage
    setImmioEmail(null);
    setIsAdmin(false);
    setApproved(false);
    setUserEmail(null);
    localStorage.removeItem('immioEmail');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('approved');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userId');
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      immioEmail,
      isAdmin,
      approved,
      userEmail,
      setAppData,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
