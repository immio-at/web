'use client';

import { useProperties } from '@/hooks/useProperties';
import DashboardClient from '@/components/DashboardClient';

export default function DashboardPage() {
  const { properties, loading, error, update } = useProperties();

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <p className="text-gray-600">Loading properties...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">⚠️ {error}</p>
        </div>
      )}
      <DashboardClient properties={properties} onUpdate={update} />
    </div>
  );
}
