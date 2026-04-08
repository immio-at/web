'use client';

import { useSearchParams } from 'next/navigation';
import FinderClient from '@/components/FinderClient';
import { type PresetFilterKey } from '@/lib/preset-filters';

export default function FinderPage() {
  const searchParams = useSearchParams();

  // Read preset + saved filter selections from URL (passed from Dashboard)
  const initialPresets = searchParams.get('presets');
  const initialSavedFilterIds = searchParams.get('savedFilterIds');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <FinderClient
        initialPresets={initialPresets ? new Set(initialPresets.split(',') as PresetFilterKey[]) : undefined}
        initialSavedFilterIds={initialSavedFilterIds ? new Set(initialSavedFilterIds.split(',')) : undefined}
      />
    </div>
  );
}
