export const dynamic = 'force-dynamic';

import { getProperties, Property } from '@/lib/api';
import FinderClient from '@/components/FinderClient';
import Link from 'next/link';

export default async function FinderPage() {
  let properties: Property[] = [];

  try {
    const all = await getProperties();
    properties = all.filter(p => p.status === 'new');
  } catch (e) {
    console.error(e);
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <h1 className="text-2xl font-bold text-white">
          IM<span className="text-3xl">M</span>IO <span className="text-gray-400 text-lg font-normal">Finder</span>
        </h1>
        <Link href="/" className="text-gray-400 hover:text-white text-sm transition-colors">
          ← Back to list
        </Link>
      </header>

      <FinderClient properties={properties} />
    </div>
  );
}
