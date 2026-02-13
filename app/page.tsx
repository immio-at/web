import { getProperties, Property } from '@/lib/api';
import DashboardClient from '@/components/DashboardClient';

export default async function Home() {
  let properties: Property[] = [];
  let error: string | null = null;

  try {
    properties = await getProperties();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load properties';
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">⚠️ {error}</p>
        </div>
      )}
      <DashboardClient properties={properties} />
    </div>
  );
}