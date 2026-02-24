'use client';

import { useState } from 'react';
import { Property, updateProperty } from '@/lib/api';
import { useProperties } from '@/hooks/useProperties';

const STAGES = [
  { key: 'investigating', label: 'Investigating', color: 'bg-gray-50 border-gray-200', header: 'bg-slate-500' },
  { key: 'interested',    label: 'Interested',    color: 'bg-gray-50 border-gray-200', header: 'bg-slate-600' },
  { key: 'visited',       label: 'Visited',       color: 'bg-gray-50 border-gray-200', header: 'bg-slate-600' },
  { key: 'offer_made',    label: 'Offer Made',    color: 'bg-gray-50 border-gray-200', header: 'bg-slate-700' },
  { key: 'parked',        label: 'Parked',        color: 'bg-gray-50 border-gray-200', header: 'bg-amber-700' },
  { key: 'won',           label: 'Won',           color: 'bg-gray-50 border-gray-200', header: 'bg-emerald-700' },
];

// Not shown as a column but available as a move destination
const NOT_RELEVANT = { key: 'not_relevant', label: 'Not Relevant' };

interface PendingMove {
  propertyId: string;
  propertyTitle: string;
}

function ConfirmModal({
  propertyTitle,
  onConfirm,
  onCancel,
}: {
  propertyTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-40"
        onClick={onCancel}
      />
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">❌</span>
          <h2 className="text-lg font-semibold text-gray-900">Mark as Not Relevant?</h2>
        </div>
        <p className="text-sm text-gray-600 mb-1">
          This will hide the following property from your funnel:
        </p>
        <p className="text-sm font-medium text-gray-900 mb-5 line-clamp-2 bg-gray-50 rounded-lg px-3 py-2">
          {propertyTitle}
        </p>
        <p className="text-xs text-gray-400 mb-5">
          You can still find it later via the "Show hidden properties" filter on the Dashboard.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
          >
            Yes, hide it
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FunnelBoard() {
  const { properties: all, loading, error } = useProperties();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

  const properties = all
    .filter(p => p.status !== 'new' && p.status !== 'not_relevant')
    .map(p => overrides[p.id] ? { ...p, status: overrides[p.id] } : p);

  async function moveToStage(propertyId: string, newStatus: string) {
    try {
      await updateProperty(propertyId, { status: newStatus });
      setOverrides(prev => ({ ...prev, [propertyId]: newStatus }));
    } catch (e) {
      console.error('Failed to update status', e);
    }
  }

  function requestMove(propertyId: string, propertyTitle: string, newStatus: string) {
    if (newStatus === 'not_relevant') {
      // Require confirmation before hiding
      setPendingMove({ propertyId, propertyTitle });
    } else {
      moveToStage(propertyId, newStatus);
    }
  }

  async function confirmNotRelevant() {
    if (!pendingMove) return;
    await moveToStage(pendingMove.propertyId, 'not_relevant');
    setPendingMove(null);
  }

  if (loading) return <div className="text-gray-500 py-12 text-center">Loading funnel...</div>;
  if (error) return <div className="text-red-500 py-12 text-center">{error}</div>;

  return (
    <div>
      {/* Confirmation modal — renders over everything when a not_relevant move is requested */}
      {pendingMove && (
        <ConfirmModal
          propertyTitle={pendingMove.propertyTitle}
          onConfirm={confirmNotRelevant}
          onCancel={() => setPendingMove(null)}
        />
      )}

      <p className="text-sm text-gray-500 mb-4">{properties.length} properties in funnel</p>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const stageProps = properties.filter(p => p.status === stage.key);
          return (
            <div key={stage.key} className="flex-shrink-0 w-64">
              <div className={`${stage.header} text-white rounded-t-lg px-3 py-2 flex items-center justify-between`}>
                <span className="font-semibold text-sm">{stage.label}</span>
                <span className="bg-white bg-opacity-30 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {stageProps.length}
                </span>
              </div>
              <div className={`${stage.color} border border-t-0 rounded-b-lg min-h-32 p-2 space-y-2`}>
                {stageProps.map((prop) => (
                  <FunnelCard
                    key={prop.id}
                    property={prop}
                    stages={STAGES}
                    onMove={requestMove}
                  />
                ))}
                {stageProps.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">No properties</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FunnelCard({
  property,
  stages,
  onMove,
}: {
  property: Property;
  stages: typeof STAGES;
  onMove: (id: string, title: string, status: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const rawPrice = property.price ? parseFloat(String(property.price)) : null;
  const priceText = rawPrice
    ? '€ ' + Math.round(rawPrice).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : '';

  // All stage destinations + Not Relevant at the bottom
  const moveOptions = [
    ...stages.filter(s => s.key !== property.status),
    NOT_RELEVANT,
  ];

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {property.imageUrl && (
        <div className="w-full bg-gray-100 overflow-hidden" style={{ height: '96px' }}>
          <img
            src={property.imageUrl}
            alt={property.title}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
      )}
      <div className="p-2">
        <a
          href={property.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-gray-900 hover:text-blue-600 line-clamp-2 block mb-1"
        >
          {property.title}
        </a>
        <div className="space-y-0.5 mb-2">
          {priceText && (
            <div className="text-sm font-bold text-blue-600">{priceText}</div>
          )}
          {property.location && (
            <div className="text-xs text-gray-500">📍 {property.location}</div>
          )}
          <div className="flex gap-2 text-xs text-gray-500">
            {property.sizeSqm && <span>{property.sizeSqm}m²</span>}
            {property.rooms && <span>{property.rooms} Zi.</span>}
          </div>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-full text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 transition-colors"
          >
            Move to stage ▾
          </button>
          {showMenu && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
              {moveOptions.map((s, i) => (
                <button
                  key={s.key}
                  onClick={() => {
                    onMove(property.id, property.title, s.key);
                    setShowMenu(false);
                  }}
                  className={`w-full text-left text-xs px-3 py-2 hover:bg-gray-50 transition-colors ${
                    s.key === 'not_relevant'
                      ? 'text-red-500 border-t border-gray-100 font-medium'
                      : 'text-gray-700'
                  } ${i === moveOptions.length - 2 ? 'border-b border-gray-100' : ''}`}
                >
                  {s.key === 'not_relevant' ? '❌ Not Relevant' : s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}