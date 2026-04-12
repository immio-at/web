'use client';

import { useSSEInvalidation } from '@/hooks/useSSEInvalidation';

/**
 * Thin client component that establishes the SSE connection for
 * real-time cache invalidation. Mounted in the authenticated layout
 * (which is a server component and can't call hooks directly).
 */
export default function SSEProvider() {
  useSSEInvalidation();
  return null;
}
