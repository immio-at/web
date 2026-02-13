import { getProperties, Property } from '@/lib/api';
import PropertyCard from '@/components/PropertyCard';

export default async function Home() {
  let properties: Property[] = [];
  let error: string | null = null;

  try {
    properties = await getProperties();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load properties';
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">⚠️ {error}</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border mb-6 p-6">
        <h2 className="text-xl font-semibold mb-2">Latest Properties</h2>
        <p className="text-gray-600">{properties.length} properties found</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {properties.map(function(prop) {
          return <PropertyCard key={prop.id} property={prop} />;
        })}
      </div>

      {properties.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No properties yet</p>
          <p className="text-gray-400 mt-2">Properties will appear when emails arrive</p>
        </div>
      )}
    </div>
  );
}