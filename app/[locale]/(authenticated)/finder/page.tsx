'use client';

import { useSearchParams } from 'next/navigation';
import FinderClient from '@/components/FinderClient';

export default function FinderPage() {
  const searchParams = useSearchParams();
  const skipModal = searchParams.get('skipModal') === 'true';

  // Extract filter params from URL (passed from Dashboard Discover tile)
  const hasFilterParams = !!(
    searchParams.get('keyword') || searchParams.get('postcodes') ||
    searchParams.get('minPrice') || searchParams.get('maxPrice') ||
    searchParams.get('minSize') || searchParams.get('maxSize') ||
    searchParams.get('minRooms') || searchParams.get('maxRooms')
  );

  const filterFromUrl = hasFilterParams ? {
    keyword: searchParams.get('keyword') ?? '',
    postcodes: searchParams.get('postcodes') ?? '',
    minPrice: searchParams.get('minPrice') ?? '',
    maxPrice: searchParams.get('maxPrice') ?? '',
    minSize: searchParams.get('minSize') ?? '',
    maxSize: searchParams.get('maxSize') ?? '',
    minRooms: searchParams.get('minRooms') ?? '',
    maxRooms: searchParams.get('maxRooms') ?? '',
  } : undefined;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <FinderClient skipFilterModal={skipModal} filterFromDashboard={filterFromUrl} />
    </div>
  );
}
