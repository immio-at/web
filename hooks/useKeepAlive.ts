import { useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-e03a.up.railway.app';
const PING_INTERVAL_MS = 4 * 60 * 1000; // every 4 minutes (Railway sleeps after 5 min idle)

// ─── useKeepAlive ─────────────────────────────────────────────────────────────
// Pings the backend health endpoint on mount and every 4 minutes thereafter.
// Prevents Railway from spinning down the container between user interactions,
// eliminating the 15-30 second cold start penalty on page load.
//
// Usage: call once at the app layout level (e.g. in NavBar or a root layout).
// Does nothing if the ping fails — silent, non-blocking.

export function useKeepAlive() {
  useEffect(() => {
    async function ping() {
      try {
        await fetch(`${API_URL}/health`, {
          method: 'GET',
          cache: 'no-store',
        });
      } catch {
        // Silently ignore — keep-alive failures should never surface to the user
      }
    }

    // Ping immediately on mount, then on interval
    ping();
    const interval = setInterval(ping, PING_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);
}
