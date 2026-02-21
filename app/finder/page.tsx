import FinderClient from '@/components/FinderClient';

export default function FinderPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Finder</h2>
        <p className="text-gray-600 mt-1">Swipe through new properties</p>
      </div>
      <FinderClient />
    </div>
  );
}