'use client';

import { useState, useMemo } from 'react';
import { Property } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

type ViewMode = 'tiles' | 'table' | 'map';

interface Filters {
  search: string;
  priceMin: string;
  priceMax: string;
  sizeMin: string;
  sizeMax: string;
  postcode: string;
}

const defaultFilters: Filters = {
  search: '',
  priceMin: '',
  priceMax: '',
  sizeMin: '',
  sizeMax: '',
  postcode: '',
};

export default function DashboardClient({ properties: initial }: { properties: Property[] }) {
  const [view, setView] = useState<ViewMode>('tiles');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [properties, setProperties] = useState(initial);

  function updateFilter(key: keyof Filters, value: string) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  async function updateProperty(id: string, data: { status?: string; notes?: string }) {
    try {
      await fetch(`${API_URL}/properties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      setProperties(prev =>
        prev.map(p => p.id === id ? { ...p, ...data } : p)
      );
    } catch (e) {
      console.error('Failed to update property', e);
    }
  }

  const filtered = useMemo(() => {
    return properties.filter(p => {
      const price = p.price ? parseFloat(String(p.price)) : null;
      const size = p.sizeSqm ?? null;

      if (filters.search) {
        const s = filters.search.toLowerCase();
        if (!p.title?.toLowerCase().includes(s) &&
            !p.location?.toLowerCase().includes(s)) return false;
      }
      if (filters.priceMin && price && price < parseFloat(filters.priceMin)) return false;
      if (filters.priceMax && price && price > parseFloat(filters.priceMax)) return false;
      if (filters.sizeMin && size && size < parseFloat(filters.sizeMin)) return false;
      if (filters.sizeMax && size && size > parseFloat(filters.sizeMax)) return false;
      if (filters.postcode && !p.zipCode?.startsWith(filters.postcode)) return false;
      return true;
    }).sort((a, b) => {
      const aPrice = a.price ? parseFloat(String(a.price)) : 0;
      const bPrice = b.price ? parseFloat(String(b.price)) : 0;
      const aSize = a.sizeSqm ?? 0;
      const bSize = b.sizeSqm ?? 0;
      switch (sortBy) {
        case 'status': return (a.status || '').localeCompare(b.status || '');
        case 'price_asc': return aPrice - bPrice;
        case 'price_desc': return bPrice - aPrice;
        case 'size_asc': return aSize - bSize;
        case 'size_desc': return bSize - aSize;
        case 'oldest': return new Date(a.emailReceivedAt).getTime() - new Date(b.emailReceivedAt).getTime();
        default: return new Date(b.emailReceivedAt).getTime() - new Date(a.emailReceivedAt).getTime();
      }
    });
  }, [properties, filters, sortBy]);

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  return (
    <div>
      {/* Sub-nav + search bar */}
      <div className="flex flex-col gap-3 mb-6">
        {/* Sub-nav */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {(['tiles', 'table', 'map'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                  view === v
                    ? 'bg-slate-700 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {v === 'tiles' ? '⊞ Tiles' : v === 'table' ? '☰ Table' : '🗺 Map'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
            >
              <option value="status">Status</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="size_asc">Size: Small to Large</option>
              <option value="size_desc">Size: Large to Small</option>
            </select>
            <span className="text-sm text-gray-500">{filtered.length} properties</span>
          </div>
        </div>

        {/* Search + filter */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search by location, title..."
            value={filters.search}
            onChange={e => updateFilter('search', e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${
              activeFilterCount > 0
                ? 'bg-slate-700 text-white border-slate-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            ⚙ Filters
            {activeFilterCount > 0 && (
              <span className="bg-white text-slate-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filter popup */}
        {showFilters && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Filters</h3>
              <button
                onClick={() => { setFilters(defaultFilters); }}
                className="text-xs text-gray-500 hover:text-gray-900"
              >
                Clear all
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Min Price (€)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={filters.priceMin}
                  onChange={e => updateFilter('priceMin', e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max Price (€)</label>
                <input
                  type="number"
                  placeholder="Any"
                  value={filters.priceMax}
                  onChange={e => updateFilter('priceMax', e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Min Size (m²)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={filters.sizeMin}
                  onChange={e => updateFilter('sizeMin', e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max Size (m²)</label>
                <input
                  type="number"
                  placeholder="Any"
                  value={filters.sizeMax}
                  onChange={e => updateFilter('sizeMax', e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Postcode</label>
                <input
                  type="text"
                  placeholder="e.g. 1100"
                  value={filters.postcode}
                  onChange={e => updateFilter('postcode', e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Views */}
      {view === 'tiles' && (
        <TilesView properties={filtered} onUpdate={updateProperty} />
      )}
      {view === 'table' && (
        <TableView properties={filtered} onUpdate={updateProperty} />
      )}
      {view === 'map' && (
        <div className="text-center py-24 bg-white rounded-lg border border-gray-200">
          <div className="text-4xl mb-3">🗺</div>
          <h3 className="text-lg font-semibold text-gray-900">Map View Coming Soon</h3>
          <p className="text-gray-500 mt-1">We're working on an interactive map view</p>
        </div>
      )}
    </div>
  );
}

function TilesView({ properties, onUpdate }: {
  properties: Property[];
  onUpdate: (id: string, data: any) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {properties.map(prop => (
        <TileCard key={prop.id} property={prop} onUpdate={onUpdate} />
      ))}
      {properties.length === 0 && (
        <div className="col-span-3 text-center py-12 text-gray-500">
          No properties match your filters
        </div>
      )}
    </div>
  );
}

function TileCard({ property, onUpdate }: {
  property: Property;
  onUpdate: (id: string, data: any) => void;
}) {
  const [status, setStatus] = useState(property.status);
  const [loading, setLoading] = useState(false);

  const rawPrice = property.price ? parseFloat(String(property.price)) : null;
  const priceText = rawPrice
    ? '€ ' + Math.round(rawPrice).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : '';

  const borderColor = {
    interested: 'border-green-400',
    maybe: 'border-yellow-400',
    not_relevant: 'border-red-400',
  }[status] || 'border-transparent';

  async function handleStatus(newStatus: string) {
    setLoading(true);
    await onUpdate(property.id, { status: newStatus });
    setStatus(newStatus);
    setLoading(false);
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 transition-all duration-300 ${
      status === 'interested' ? 'border-l-4 border-l-emerald-600' :
      status === 'maybe' ? 'border-l-4 border-l-amber-500' :
      status === 'not_relevant' ? 'border-l-4 border-l-rose-400 opacity-50' :
      ''
    }`}>
      {status !== 'new' && (
        <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${
            status === 'interested' ? 'bg-emerald-600' :
            status === 'maybe' ? 'bg-amber-500' :
            'bg-rose-400'
          }`} />
          <span className="text-xs text-gray-500 font-medium">
            {status === 'interested' ? 'Interested' :
             status === 'maybe' ? 'Maybe' : 'Not Relevant'}
          </span>
        </div>
      )}
      <a href={property.sourceUrl} target="_blank" rel="noopener noreferrer">
        <div className="relative overflow-hidden bg-gray-200 rounded-t-lg" style={{ height: '192px' }}>
          {property.imageUrl ? (
            <img
              src={property.imageUrl}
              alt={property.title}
              className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = '<div class="flex items-center justify-center h-full"><span class="text-4xl text-gray-400">🏠</span></div>';
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-4xl text-gray-400">🏠</span>
            </div>
          )}
        </div>
      </a>
      <div className="p-4">
        <a href={property.sourceUrl} target="_blank" rel="noopener noreferrer">
          <h3 className="font-semibold text-gray-900 mb-2 hover:text-blue-600 transition-colors line-clamp-2">
            {property.title}
          </h3>
        </a>
        <div className="space-y-1 text-sm text-gray-600 mb-4">
          {priceText && <div className="font-bold text-lg text-blue-600">{priceText}</div>}
          {property.location && <div>📍 {property.location}</div>}
          <div className="flex gap-4">
            {property.sizeSqm && <span>📏 {property.sizeSqm}m²</span>}
            {property.rooms && <span>🏠 {property.rooms} Zi.</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {['interested', 'maybe', 'not_relevant'].map(s => (
            <button
              key={s}
              onClick={() => handleStatus(s)}
              disabled={loading}
              className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                status === s
                  ? s === 'interested' ? 'bg-green-500 text-white'
                    : s === 'maybe' ? 'bg-yellow-400 text-white'
                    : 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s === 'interested' ? '✅' : s === 'maybe' ? '🤷‍♀️' : '❌'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TableView({ properties, onUpdate }: {
  properties: Property[];
  onUpdate: (id: string, data: any) => void;
}) {
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [noteValues, setNoteValues] = useState<Record<string, string>>(
    Object.fromEntries(properties.map(p => [p.id, p.notes || '']))
  );

  async function saveNotes(id: string) {
    await onUpdate(id, { notes: noteValues[id] });
    setEditingNotes(null);
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-700 w-16">Image</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Title</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Price</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">m²</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Rooms</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Location</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">€/m²</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700 w-48">Notes</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((prop, i) => {
              const rawPrice = prop.price ? parseFloat(String(prop.price)) : null;
              const priceText = rawPrice
                ? '€ ' + Math.round(rawPrice).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
                : '—';
              const pricePerSqm = rawPrice && prop.sizeSqm
                ? '€ ' + Math.round(rawPrice / prop.sizeSqm).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
                : '—';
              const dateText = new Date(prop.emailReceivedAt).toLocaleDateString('de-AT');

              return (
                <tr key={prop.id} className={`border-b border-gray-100 hover:bg-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-2">
                    <div className="relative rounded overflow-hidden bg-gray-100" style={{ width: '48px', height: '48px' }}>
                      {prop.imageUrl ? (
                        <img
                          src={prop.imageUrl}
                          alt={prop.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <span className="text-xl flex items-center justify-center h-full">🏠</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 max-w-xs">
                    <a href={prop.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="text-gray-900 hover:text-blue-600 font-medium line-clamp-2">
                      {prop.title}
                    </a>
                  </td>
                  <td className="px-4 py-2 font-semibold text-blue-600 whitespace-nowrap">{priceText}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{prop.sizeSqm ? `${prop.sizeSqm}m²` : '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{prop.rooms || '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{prop.location || '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500">{pricePerSqm}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      prop.status === 'interested' ? 'bg-green-100 text-green-700' :
                      prop.status === 'maybe' ? 'bg-yellow-100 text-yellow-700' :
                      prop.status === 'not_relevant' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {prop.status || 'new'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{dateText}</td>
                  <td className="px-4 py-2">
                    {editingNotes === prop.id ? (
                      <div className="flex flex-col gap-1">
                        <textarea
                          value={noteValues[prop.id]}
                          onChange={e => setNoteValues(prev => ({ ...prev, [prop.id]: e.target.value }))}
                          className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-slate-300 resize-none"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <button onClick={() => saveNotes(prop.id)}
                            className="flex-1 bg-slate-700 text-white text-xs py-1 rounded hover:bg-slate-800">
                            Save
                          </button>
                          <button onClick={() => setEditingNotes(null)}
                            className="flex-1 bg-gray-100 text-gray-600 text-xs py-1 rounded hover:bg-gray-200">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingNotes(prop.id)}
                        className="w-full text-left text-xs text-gray-500 hover:text-gray-900 min-h-8"
                      >
                        {noteValues[prop.id] || (
                          <span className="text-gray-300 italic">Add note...</span>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {properties.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No properties match your filters
          </div>
        )}
      </div>
    </div>
  );
}