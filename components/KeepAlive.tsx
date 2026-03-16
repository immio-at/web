'use client';

// Thin client component that exists solely to call useKeepAlive in a
// server-component layout. Renders nothing — side-effect only.
// This pattern is necessary because React hooks cannot run in Server Components.

import { useKeepAlive } from '@/hooks/useKeepAlive';

export default function KeepAlive() {
  useKeepAlive();
  return null;
}
