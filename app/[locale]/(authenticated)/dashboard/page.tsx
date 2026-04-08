'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useProperties } from '@/hooks/useProperties';
import { Property } from '@/lib/api';
import { useInteractionTracker } from '@/hooks/useInteractionTracker';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { useAuth } from '@/context/AuthContext';
import DashboardClient from '@/components/DashboardClient';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { properties, loading, error } = useProperties();
  const { track, getRecentlyViewed } = useInteractionTracker();
  const { filters } = useSavedFilters();
  const { immioEmail, session, loading: authLoading } = useAuth();

  // Recently viewed properties from backend
  const [recentlyViewed, setRecentlyViewed] = useState<Property[]>([]);
  const recentlyViewedFetched = useRef(false);

  // Fetch recently viewed once after auth is ready
  useEffect(() => {
    if (authLoading || !session) return;
    if (recentlyViewedFetched.current) return;
    recentlyViewedFetched.current = true;
    getRecentlyViewed(20).then(setRecentlyViewed);
  }, [authLoading, session, getRecentlyViewed]);

  const handleInteraction = useCallback((id: string, type?: 'view' | 'analysis' | 'url_click' | 'status_change') => {
    track(id, type ?? 'view');
    // Refresh recently viewed after a short delay to pick up the new interaction
    setTimeout(() => getRecentlyViewed(20).then(setRecentlyViewed), 500);
  }, [track, getRecentlyViewed]);

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-gray-600">{t('loading')}</p>
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
        onInteraction={handleInteraction}
        recentlyViewed={recentlyViewed}
        immioEmail={immioEmail}
        savedFilters={filters}
      />
    </div>
  );
}
