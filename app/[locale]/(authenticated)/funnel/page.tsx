'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { SavedFilter } from '@/lib/api';
import FunnelBoard from '@/components/FunnelBoard';

export default function FunnelPage() {
  const t = useTranslations('funnel');
  const { filters: savedFilters } = useSavedFilters();
  const [selectedFilter, setSelectedFilter] = useState<SavedFilter | null>(null);

  return (
    <div className="max-w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('title')}</h2>
          <p className="text-gray-600 mt-1">{t('subtitle')}</p>
        </div>

        {/* Filter selector */}
        <div className="flex items-center gap-2">
          {selectedFilter ? (
            <>
              <span className="text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-200">
                {selectedFilter.name}
              </span>
              <button
                onClick={() => setSelectedFilter(null)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                {t('filter.clear')}
              </button>
            </>
          ) : savedFilters.length > 0 ? (
            <select
              value=""
              onChange={(e) => {
                const sf = savedFilters.find(f => f.id === e.target.value);
                if (sf) setSelectedFilter(sf);
              }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">{t('filter.selectFilter')}</option>
              {savedFilters.map(sf => (
                <option key={sf.id} value={sf.id}>{sf.name}</option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
      <FunnelBoard savedFilter={selectedFilter} />
    </div>
  );
}
