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
  }, [authLoading, session, getRecentlyViewed]);

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Skeleton matching dashboard layout — visible immediately */}
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:auto-rows-fr gap-4 mb-8">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
              <div className="space-y-3">
                <div className="h-3 bg-gray-100 rounded w-2/3" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
                <div className="h-3 bg-gray-100 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
        {/* Carousel skeleton */}
        <div className="mb-6">
          <div className="h-4 bg-gray-100 rounded w-32 mb-3 animate-pulse" />
          <div className="flex gap-3">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex-shrink-0 w-48 bg-white rounded-lg border border-gray-200 overflow-hidden animate-pulse">
                <div className="h-28 bg-gray-100" />
                <div className="p-2 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      <DashboardClient
        properties={properties}
        recentlyViewed={recentlyViewed}
        immioEmail={immioEmail}
        savedFilters={filters}
      />
    </div>
  );
}
