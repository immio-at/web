import { getProperties, Property } from '@/lib/api';
import Image from 'next/image';

export default async function Home() {
  let properties: Property[] = [];
  let error: string | null = null;
  
  try {
    properties = await getProperties();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load properties';
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">
            IM<span className="text-4xl">M</span>IO
          </h1>
          <p className="text-gray-600 mt-1">Your property investment tracker</p>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm border mb-6 p-6">
          <h2 className="text-xl font-semibold mb-2">Properties</h2>
          <p className="text-gray-600">{properties.length} properties found</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map(function(prop) {
            const priceText = prop.price ? '€ ' + Math.round(prop.price).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'): '';;
            const dateText = new Date(prop.emailReceivedAt).toLocaleDateString('de-AT');
            
            return (
              <a key={prop.id} href={prop.sourceUrl} target="_blank" rel="noopener noreferrer" className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow block">
                <div className="relative h-48 rounded-t-lg overflow-hidden bg-gray-200">
                  {prop.imageUrl ? (
                    <Image 
                      src={prop.imageUrl} 
                      alt={prop.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <span className="text-gray-400 text-4xl">🏠</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">{prop.title}</h3>
                  <div className="space-y-1 text-sm text-gray-600">
                    {priceText && <div className="font-semibold text-lg text-blue-600">{priceText}</div>}
                    {prop.location && <div>📍 {prop.location}</div>}
                    <div className="flex items-center gap-4">
                      {prop.sizeSqm && <span>📏 {prop.sizeSqm}m²</span>}
                      {prop.rooms && <span>🏠 {prop.rooms} Zimmer</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-2">{dateText}</div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
        
        {properties.length === 0 && <div className="text-center py-12"><p className="text-gray-500 text-lg">No properties yet</p></div>}
      </main>
    </div>
  );
}