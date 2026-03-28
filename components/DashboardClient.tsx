'use client';

import { useState, useMemo, useRef } from 'react';
import { Property, reportUnavailable } from '@/lib/api';
import PropertyAnalysisModal from '@/components/PropertyAnalysisModal';
import { FUNNEL_STAGES } from '@/lib/constants';

type InteractionFn = (id: string) => void;

type ViewMode = 'tiles' | 'table';

// Left-border accent colour per stage for tile cards
const STATUS_BORDER: Record<string, string> = {
  investigating: 'border-l-4 border-l-slate-400',
  interested:    'border-l-4 border-l-slate-500',
  visit_booked:  'border-l-4 border-l-slate-600',
  visited:       'border-l-4 border-l-slate-600',
  offer_made:    'border-l-4 border-l-teal-500',
  parked:        'border-l-4 border-l-slate-300',
  won:           'border-l-4 border-l-teal-600',
  not_relevant:  'border-l-4 border-l-rose-300 opacity-50',
};

// Dot colour in the tile card status strip
const STATUS_DOT: Record<string, string> = {
  investigating: 'bg-slate-400',
  interested:    'bg-slate-500',
  visit_booked:  'bg-slate-600',
  visited:       'bg-slate-600',
  offer_made:    'bg-teal-500',
  parked:        'bg-slate-300',
  won:           'bg-teal-600',
  not_relevant:  'bg-rose-300',
};

// Badge colour in the table view
const STATUS_BADGE: Record<string, string> = {
  new:           'bg-gray-100 text-gray-600',
  investigating: 'bg-slate-100 text-slate-600',
  interested:    'bg-slate-200 text-slate-700',
  visit_booked:  'bg-slate-300 text-slate-700',
  visited:       'bg-slate-300 text-slate-700',
  offer_made:    'bg-teal-100 text-teal-700',
  parked:        'bg-gray-100 text-gray-500',
  won:           'bg-teal-200 text-teal-800',
  not_relevant:  'bg-rose-100 text-rose-700',
};

interface Filters {
  search: string;
  priceMin: string;
  priceMax: string;
  sizeMin: string;
  sizeMax: string;
  postcode: string;
  showHidden: boolean;
}

const defaultFilters: Filters = {
  search: '',
  priceMin: '',
  priceMax: '',
  sizeMin: '',
  sizeMax: '',
  postcode: '',
  showHidden: false,
};

type UpdateFn = (id: string, data: { status?: string; notes?: string; movedToStageAt?: string }) => Promise<void>;
type OptimisticUpdateFn = (id: string, data: Partial<Property>) => void;

export default function DashboardClient({
  properties,
  onUpdate,
  onOptimisticUpdate,
  onInteraction,
  recentIds,
  frequentIds,
}: {
  properties: Property[];
  onUpdate: UpdateFn;
  onOptimisticUpdate: OptimisticUpdateFn;
  onInteraction?: InteractionFn;
  recentIds?: string[];
  frequentIds?: string[];
}) {
  const [view, setView] = useState<ViewMode>('tiles');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('newest');
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [analyseProperty, setAnalyseProperty] = useState<Property | null>(null);

  // Build carousel data from property IDs
  const propMap = useMemo(() => {
    const m = new Map<string, Property>();
    properties.forEach(p => m.set(p.id, p));
    return m;
  }, [properties]);

  const recentProperties = useMemo(
    () => (recentIds ?? []).map(id => propMap.get(id)).filter((p): p is Property => !!p),
    [recentIds, propMap],
  );
  const frequentProperties = useMemo(
    () => (frequentIds ?? []).map(id => propMap.get(id)).filter((p): p is Property => !!p),
    [frequentIds, propMap],
  );

  function handleAnalyse(p: Property) {
    onInteraction?.(p.id);
    setAnalyseProperty(p);
  }

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  const filtered = useMemo(() => {
    return properties.filter(p => {
      if (p.status === 'not_relevant' && !filters.showHidden) return false;
      if (p.status === 'delisted') return false;

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
        case 'status':     return (a.status || '').localeCompare(b.status || '');
        case 'price_asc':  return aPrice - bPrice;
        case 'price_desc': return bPrice - aPrice;
        case 'size_asc':   return aSize - bSize;
        case 'size_desc':  return bSize - aSize;
        case 'oldest':     return new Date(a.emailReceivedAt).getTime() - new Date(b.emailReceivedAt).getTime();
        default:           return new Date(b.emailReceivedAt).getTime() - new Date(a.emailReceivedAt).getTime();
      }
    });
  }, [properties, filters, sortBy]);

  const activeFilterCount = ['priceMin', 'priceMax', 'sizeMin', 'sizeMax', 'postcode']
    .filter(k => filters[k as keyof Filters] !== '').length
    + (filters.showHidden ? 1 : 0);

  return (
    <div>
      {/* Carousels */}
      {recentProperties.length > 0 && (
        <PropertyCarousel
          title="Zuletzt angesehen"
          properties={recentProperties}
          onInteraction={onInteraction}
          onAnalyse={handleAnalyse}
        />
      )}
      {frequentProperties.length > 0 && (
        <PropertyCarousel
          title="Am häufigsten angesehen"
          properties={frequentProperties}
          onInteraction={onInteraction}
          onAnalyse={handleAnalyse}
        />
      )}

      {/* Sub-nav */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {(['tiles', 'table'] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                  view === v
                    ? 'bg-slate-700 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {v === 'tiles' ? '⊞ Tiles' : '☰ Table'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="status">Status</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="size_asc">Size: Small to Large</option>
              <option value="size_desc">Size: Large to Small</option>
            </select>
            <span className="text-sm text-gray-500">{filtered.length} properties</span>
          </div>
        </div>

        {/* Search + filter toggle */}
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

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Filters</h3>
              <button
                onClick={() => setFilters(defaultFilters)}
                className="text-xs text-gray-500 hover:text-gray-900"
              >
                Clear all
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Min Price (€)</label>
                <input type="number" placeholder="0" value={filters.priceMin}
                  onChange={e => updateFilter('priceMin', e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max Price (€)</label>
                <input type="number" placeholder="Any" value={filters.priceMax}
                  onChange={e => updateFilter('priceMax', e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Min Size (m²)</label>
                <input type="number" placeholder="0" value={filters.sizeMin}
                  onChange={e => updateFilter('sizeMin', e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Max Size (m²)</label>
                <input type="number" placeholder="Any" value={filters.sizeMax}
                  onChange={e => updateFilter('sizeMax', e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Postcode</label>
                <input type="text" placeholder="e.g. 1010" value={filters.postcode}
                  onChange={e => updateFilter('postcode', e.target.value)}
                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={filters.showHidden}
                    onChange={e => updateFilter('showHidden', e.target.checked)}
                    className="rounded border-gray-300 text-slate-700 focus:ring-slate-300" />
                  <span className="text-xs font-medium text-gray-700">Show hidden properties</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Views */}
      {view === 'tiles' && (
        <TilesView
          properties={filtered}
          onUpdate={onUpdate}
          onOptimisticUpdate={onOptimisticUpdate}
          onAnalyse={handleAnalyse}
          onInteraction={onInteraction}
        />
      )}
      {view === 'table' && (
        <TableView
          properties={filtered}
          onUpdate={onUpdate}
          onOptimisticUpdate={onOptimisticUpdate}
          onAnalyse={handleAnalyse}
          onInteraction={onInteraction}
        />
      )}

      {analyseProperty && (
        <PropertyAnalysisModal
          property={analyseProperty}
          onClose={() => setAnalyseProperty(null)}
        />
      )}
    </div>
  );
}

// ─── Tile card grid ───────────────────────────────────────────────────────────

function TilesView({ properties, onUpdate, onOptimisticUpdate, onAnalyse, onInteraction }: {
  properties: Property[];
  onUpdate: UpdateFn;
  onOptimisticUpdate: OptimisticUpdateFn;
  onAnalyse: (p: Property) => void;
  onInteraction?: InteractionFn;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {properties.map(prop => (
        <TileCard
          key={prop.id}
          property={prop}
          onUpdate={onUpdate}
          onOptimisticUpdate={onOptimisticUpdate}
          onAnalyse={onAnalyse}
          onInteraction={onInteraction}
        />
      ))}
      {properties.length === 0 && (
        <div className="col-span-3 text-center py-12 text-gray-500">
          No properties match your filters
        </div>
      )}
    </div>
  );
}

function TileCard({ property, onUpdate, onOptimisticUpdate, onAnalyse, onInteraction }: {
  property: Property;
  onUpdate: UpdateFn;
  onOptimisticUpdate: OptimisticUpdateFn;
  onAnalyse: (p: Property) => void;
  onInteraction?: InteractionFn;
}) {
  const [loading, setLoading] = useState(false);

  const status = property.status || 'new';
  const isExpired = property.listingStatus === 'expired';

  const rawPrice = property.price ? parseFloat(String(property.price)) : null;
  const priceText = rawPrice
    ? '€ ' + Math.round(rawPrice).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : '';

  const stageLabel = FUNNEL_STAGES.find(s => s.key === status)?.label ?? 'New';

  async function handleStatusChange(newStatus: string) {
    if (newStatus !== 'not_relevant') onInteraction?.(property.id);
    setLoading(true);
    await onUpdate(property.id, {
      status: newStatus,
      movedToStageAt: new Date().toISOString(),
    });
    setLoading(false);
  }

  async function handleReportUnavailable() {
    onOptimisticUpdate(property.id, { listingStatus: 'expired' });
    try {
      await reportUnavailable(property.id);
    } catch (e) {
      console.error('Failed to report unavailable', e);
    }
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 transition-all duration-300 ${STATUS_BORDER[status] ?? ''} ${isExpired ? 'opacity-70' : ''}`}>
      {/* Status strip — hidden when new */}
      {status !== 'new' && (
        <div className="px-3 py-1.5 border-b border-gray-100 flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full ${STATUS_DOT[status] ?? 'bg-gray-400'}`} />
          <span className="text-xs text-gray-500 font-medium">{stageLabel}</span>
        </div>
      )}

      {/* Image */}
      <a href={property.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={() => onInteraction?.(property.id)}>
        <div className="relative overflow-hidden bg-gray-200 rounded-t-lg" style={{ height: '192px' }}>
          {property.imageUrl ? (
            <img
              src={property.imageUrl}
              alt={property.title ?? ''}
              className={`w-full h-full object-cover hover:scale-105 transition-transform duration-300 ${isExpired ? 'grayscale' : ''}`}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML =
                  '<div class="flex items-center justify-center h-full"><span class="text-4xl text-gray-400">🏠</span></div>';
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-4xl text-gray-400">🏠</span>
            </div>
          )}
        </div>
      </a>

      {/* Expired badge */}
      {isExpired && (
        <div className="mx-4 mt-3 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-medium flex items-center gap-1">
          <span>⚠</span>
          <span>Nicht mehr verfügbar</span>
        </div>
      )}

      {/* Details */}
      <div className="p-4">
        <a href={property.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={() => onInteraction?.(property.id)}>
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

        {/* Funnel stage dropdown + report unavailable + analyse + dismiss */}
        <div className="flex gap-2 items-center">
          <select
            value={status}
            disabled={loading}
            onChange={e => handleStatusChange(e.target.value)}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white disabled:opacity-50"
          >
            {FUNNEL_STAGES.filter(s => s.key !== 'not_relevant').map(stage => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => onAnalyse(property)}
            title="Analyse this property"
            className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors"
          >
            🔍
          </button>
          {!isExpired && (
            <button
              onClick={handleReportUnavailable}
              disabled={loading}
              title="Report as unavailable"
              className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200 transition-colors disabled:opacity-30"
            >
              ⚠
            </button>
          )}
          <button
            onClick={() => handleStatusChange('not_relevant')}
            disabled={loading || status === 'not_relevant'}
            title="Dismiss — hide this property"
            className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors disabled:opacity-30"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Table view ───────────────────────────────────────────────────────────────

function TableView({ properties, onUpdate, onOptimisticUpdate, onAnalyse, onInteraction }: {
  properties: Property[];
  onUpdate: UpdateFn;
  onOptimisticUpdate: OptimisticUpdateFn;
  onAnalyse: (p: Property) => void;
  onInteraction?: InteractionFn;
}) {
  async function handleReportUnavailable(propertyId: string) {
    onOptimisticUpdate(propertyId, { listingStatus: 'expired' });
    try {
      await reportUnavailable(propertyId);
    } catch (e) {
      console.error('Failed to report unavailable', e);
    }
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
              <th className="text-left px-4 py-3 font-medium text-gray-700 w-20"></th>
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
              const isExpired = prop.listingStatus === 'expired';

              return (
                <tr
                  key={prop.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'} ${isExpired ? 'opacity-60' : ''}`}
                >
                  <td className="px-4 py-2">
                    <a href={prop.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={() => onInteraction?.(prop.id)}>
                      <div className="relative rounded overflow-hidden bg-gray-100 hover:opacity-80 transition-opacity cursor-pointer" style={{ width: '48px', height: '48px' }}>
                        {prop.imageUrl ? (
                          <img src={prop.imageUrl} alt={prop.title ?? ''}
                            className={`w-full h-full object-cover ${isExpired ? 'grayscale' : ''}`}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        ) : (
                          <span className="text-xl flex items-center justify-center h-full">🏠</span>
                        )}
                      </div>
                    </a>
                  </td>
                  <td className="px-4 py-2 max-w-xs">
                    <a href={prop.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={() => onInteraction?.(prop.id)}
                      className="text-gray-900 hover:text-blue-600 font-medium line-clamp-2">
                      {prop.title}
                    </a>
                    {/* Expired badge inline under title */}
                    {isExpired && (
                      <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-medium">
                        ⚠ Nicht mehr verfügbar
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-semibold text-blue-600 whitespace-nowrap">{priceText}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{prop.sizeSqm ? `${prop.sizeSqm}m²` : '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{prop.rooms || '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{prop.location || '—'}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-500">{pricePerSqm}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <select
                        defaultValue={prop.status ?? 'new'}
                        onChange={e => { if (e.target.value !== 'not_relevant') onInteraction?.(prop.id); onUpdate(prop.id, { status: e.target.value, movedToStageAt: new Date().toISOString() }); }}
                        className={`text-xs font-medium px-2 py-1 rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-300 ${STATUS_BADGE[prop.status ?? ''] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {FUNNEL_STAGES.filter(s => s.key !== 'not_relevant').map(stage => (
                          <option key={stage.key} value={stage.key}>{stage.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => onUpdate(prop.id, { status: 'not_relevant', movedToStageAt: new Date().toISOString() })}
                        disabled={prop.status === 'not_relevant'}
                        title="Dismiss"
                        className="text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded px-1 py-0.5 text-xs font-bold leading-none transition-colors disabled:opacity-20"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{dateText}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onAnalyse(prop)}
                        title="Analyse this property"
                        className="text-gray-300 hover:text-amber-500 hover:bg-amber-50 rounded p-1 transition-colors"
                      >
                        🔍
                      </button>
                      {!isExpired && (
                        <button
                          onClick={() => handleReportUnavailable(prop.id)}
                          title="Report as unavailable"
                          className="text-gray-300 hover:text-amber-500 hover:bg-amber-50 rounded p-1 transition-colors text-xs"
                        >
                          ⚠
                        </button>
                      )}
                    </div>
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

// ─── Property Carousel ───────────────────────────────────────────────────────

function PropertyCarousel({ title, properties, onInteraction, onAnalyse }: {
  title: string;
  properties: Property[];
  onInteraction?: InteractionFn;
  onAnalyse: (p: Property) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(direction: 'left' | 'right') {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <div className="flex gap-1">
          <button onClick={() => scroll('left')} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-xs">←</button>
          <button onClick={() => scroll('right')} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-xs">→</button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {properties.map(p => (
          <CarouselCard key={p.id} property={p} onInteraction={onInteraction} onAnalyse={onAnalyse} />
        ))}
      </div>
    </div>
  );
}

function CarouselCard({ property, onInteraction, onAnalyse }: {
  property: Property;
  onInteraction?: InteractionFn;
  onAnalyse: (p: Property) => void;
}) {
  const rawPrice = property.price ? parseFloat(String(property.price)) : null;
  const priceText = rawPrice
    ? '€ ' + Math.round(rawPrice).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : '';
  const isExpired = property.listingStatus === 'expired';

  return (
    <div className="flex-shrink-0 w-48 bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      <a
        href={property.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onInteraction?.(property.id)}
      >
        <div className="relative h-28 bg-gray-100">
          {property.imageUrl ? (
            <img
              src={property.imageUrl}
              alt={property.title ?? ''}
              className={`w-full h-full object-cover ${isExpired ? 'grayscale' : ''}`}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-2xl text-gray-300">🏠</div>
          )}
        </div>
      </a>
      <div className="p-2">
        <p className="text-xs font-medium text-gray-900 line-clamp-1">{property.title ?? '—'}</p>
        {priceText && <p className="text-xs font-semibold text-blue-600 mt-0.5">{priceText}</p>}
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
          {property.sizeSqm && <span>{property.sizeSqm}m²</span>}
          {property.rooms && <span>{property.rooms} Zi.</span>}
          {property.zipCode && <span>{property.zipCode}</span>}
        </div>
        <button
          onClick={() => onAnalyse(property)}
          className="mt-1.5 w-full text-[10px] text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded py-1 transition-colors"
        >
          🔍 Analyse
        </button>
      </div>
    </div>
  );
}
