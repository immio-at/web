'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useProperties } from '@/hooks/useProperties';
import { Property, RecentlyViewedItem } from '@/lib/api';
import { useInteractionTracker } from '@/hooks/useInteractionTracker';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { useAuth } from '@/context/AuthContext';
import DashboardClient from '@/components/DashboardClient';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { properties, loading, error } = useProperties();
  const { getRecentlyViewed } = useInteractionTracker();
  const { filters } = useSavedFilters();
  const { immioEmail, session, loading: authLoading } = useAuth();

  // Recently viewed listings — mixed feed of own + scraped, keyed off the
  // backend's GROUP BY MAX(createdAt) over property_interactions.
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedItem[]>([]);
  const recentlyViewedFetched = useRef(false);

  useEffect(() => {
    if (authLoading || !session) return;
    if (recentlyViewedFetched.current) return;
    recentlyViewedFetched.current = true;
    getRecentlyViewed(20).then(setRecentlyViewed);
    // session?.user?.id stable across token refresh.
  }, [authLoading, session?.user?.id, getRecentlyViewed]);

  // The page no longer blocks the whole dashboard behind the /properties
  // fetch. DashboardClient mounts immediately so its self-fetching tiles
  // (Analytics snapshot, Analysis tile) start their requests in parallel
  // with /properties instead of waiting for it. The carousels — which
  // genuinely need the property list — self-skeleton via `propertiesLoading`.
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <DashboardClient
        properties={properties}
        propertiesLoading={loading}
        recentlyViewed={recentlyViewed}
        immioEmail={immioEmail}
        savedFilters={filters}
      />
    </div>
  );
}
