'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { setTokenGetter, clearAnalysesCache } from '@/lib/api';
import { prefetchProperties, clearPropertiesCache } from '@/hooks/useProperties';
import { prefetchSavedFilters, clearSavedFiltersCache } from '@/hooks/useSavedFilters';
import { clearAnalyticsCache } from '@/app/[locale]/(authenticated)/dashboard/components/AnalyticsSnapshotTile';
import { clearRecommendedCache } from '@/app/[locale]/(authenticated)/dashboard/components/RecommendedCarousel';

/**
 * Wipe every module-level cache that holds user-scoped data. Called on
 * sign-out and on any session userId change. CRITICAL for security:
 * without this, the previous user's properties / filters / analytics
 * remain in memory after sign-out and leak to the next user when they
 * sign in on the same tab.
 */
function clearAllUserCaches(): void {
  clearPropertiesCache();
  clearSavedFiltersCache();
  clearAnalyticsCache();
  clearRecommendedCache();
  clearAnalysesCache();
}

// ─── App-specific fields Supabase doesn't know about ─────────────────────────

interface AppData {
  immioEmail: string | null;
  isAdmin: boolean;
  approved: boolean;
  userEmail: string | null;
  tier?: string;
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
  tier: string;
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
  tier: 'free',
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
  const [tier, setTier] = useState<string>('free');

  useEffect(() => {
    // Seed app-specific fields from localStorage on first load.
    // These were written there by SignInModal on login.
    setImmioEmail(localStorage.getItem('immioEmail'));
    setIsAdmin(localStorage.getItem('isAdmin') === 'true');
    setApproved(localStorage.getItem('approved') === 'true');
    setUserEmail(localStorage.getItem('userEmail'));
    setTier(localStorage.getItem('tier') || 'free');

    // Get initial Supabase session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);

      // If any app-specific field is missing from localStorage but we have a
      // session, fetch them from the backend. This handles cases where
      // localStorage was cleared or the login flow didn't populate everything
      // (e.g. OAuth callback predating a field being persisted).
      const cachedImmioEmail = localStorage.getItem('immioEmail');
      const cachedTier = localStorage.getItem('tier');
      const cachedIsAdmin = localStorage.getItem('isAdmin');
      const cachedApproved = localStorage.getItem('approved');
      if (
        session?.access_token &&
        (!cachedImmioEmail || !cachedTier || cachedIsAdmin === null || cachedApproved === null)
      ) {
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
            if (typeof data.isAdmin === 'boolean') {
              setIsAdmin(data.isAdmin);
              localStorage.setItem('isAdmin', String(data.isAdmin));
            }
            if (typeof data.approved === 'boolean') {
              setApproved(data.approved);
              localStorage.setItem('approved', String(data.approved));
            }
            if (data.tier) {
              setTier(data.tier);
              localStorage.setItem('tier', data.tier);
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

    // Prefetch core data as soon as token is available — starts loading
    // before any page component mounts, so caches are warm by the time
    // useProperties/useSavedFilters first read them.
    if (session?.access_token) {
      prefetchProperties();
      prefetchSavedFilters();
    }

    return () => subscription.unsubscribe();
  }, []);

  // Called by SignInModal after a successful login to populate app-specific
  // fields. Also writes to localStorage so values survive page refresh.
  function setAppData(data: AppData) {
    setImmioEmail(data.immioEmail);
    setIsAdmin(data.isAdmin);
    setApproved(data.approved);
    setUserEmail(data.userEmail);
    if (data.tier) setTier(data.tier);

    // Keep localStorage in sync as a persistence cache
    localStorage.setItem('immioEmail', data.immioEmail ?? '');
    localStorage.setItem('isAdmin', String(data.isAdmin));
    localStorage.setItem('approved', String(data.approved));
    localStorage.setItem('userEmail', data.userEmail ?? '');
    if (data.tier) localStorage.setItem('tier', data.tier);
  }

  const signOut = async () => {
    // Wipe in-memory caches BEFORE Supabase fires its event so any
    // listening components don't briefly read stale data.
    clearAllUserCaches();

    await supabase.auth.signOut();
    // Clear app-specific fields from both state and localStorage
    setImmioEmail(null);
    setIsAdmin(false);
    setApproved(false);
    setUserEmail(null);
    setTier('free');
    localStorage.removeItem('immioEmail');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('approved');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('tier');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userId');
  };

  // ── Defense in depth: clear caches on any userId change ────────────────
  // Catches paths that don't go through signOut() — e.g. session expiry +
  // re-login, OAuth callback for a different user, manual session swap.
  // First mount transitions undefined → first userId, which is a no-op
  // (caches are already empty in a fresh process).
  const lastUserIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const currentUserId = session?.user?.id ?? null;
    const prev = lastUserIdRef.current;
    if (prev !== undefined && prev !== currentUserId) {
      clearAllUserCaches();
    }
    lastUserIdRef.current = currentUserId;
  }, [session?.user?.id]);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      immioEmail,
      isAdmin,
      approved,
      userEmail,
      tier,
      setAppData,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
