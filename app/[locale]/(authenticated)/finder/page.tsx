'use client';

import { useSearchParams } from 'next/navigation';
import FinderClient from '@/components/FinderClient';

export default function FinderPage() {
  const searchParams = useSearchParams();
  const skipModal = searchParams.get('skipModal') === 'true';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <FinderClient skipFilterModal={skipModal} />
    </div>
  );
}
