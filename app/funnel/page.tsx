import { getProperties, Property } from '@/lib/api';
import FunnelBoard from '@/components/FunnelBoard';

export default async function FunnelPage() {
  let properties: Property[] = [];

  try {
    properties = await getProperties();
  } catch (e) {
    console.error(e);
  }

  return (
    <div className="max-w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Buy Funnel</h2>
        <p className="text-gray-600 mt-1">Track your properties through the acquisition process</p>
      </div>
      <FunnelBoard properties={properties} />
    </div>
  );
}