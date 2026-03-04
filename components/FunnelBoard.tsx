'use client';

import { useState, useRef } from 'react';
import { Property, updateProperty } from '@/lib/api';
import { useProperties } from '@/hooks/useProperties';

// ─── Stage definitions ────────────────────────────────────────────────────────
// Subtle 6-step progression from neutral grey through to muted teal-green.
// Parked sits entirely outside the gradient as a light neutral.
//
// slate-400 → slate-500 → slate-600 → teal-400 → teal-500 → teal-600
// Investigating  Interested  Visit Booked  Visited  Offer Made   Won

const STAGES = [
  { key: 'investigating', label: 'Investigating', header: 'bg-slate-400', parked: false },
  { key: 'interested',    label: 'Interested',    header: 'bg-slate-450',  parked: false },
  { key: 'visit_booked',  label: 'Visit Booked',  header: 'bg-slate-500',  parked: false },
  { key: 'visited',       label: 'Visited',       header: 'bg-slate-550',  parked: false },
  { key: 'offer_made',    label: 'Offer Made',    header: 'bg-slate-6000',  parked: false },
  { key: 'parked',        label: 'Parked',        header: 'bg-slate-200',  parked: true  },
  { key: 'won',           label: 'Won',           header: 'bg-teal-500',  parked: false },
];

const NOT_RELEVANT = { key: 'not_relevant', label: 'Not Relevant' };

interface PendingMove {
  propertyId: string;
  propertyTitle: string;
}

function formatPrice(n: number): string {
  return '€' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ─── Confirm modal ────────────────────────────────────────────────────────────

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
      <div className="absolute inset-0 bg-black bg-opacity-40" onClick={onCancel} />
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
            className="flex-1 px-4 py-2 rounded-lg bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 transition-colors"
          >
            Yes, hide it
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main board ───────────────────────────────────────────────────────────────

export default function FunnelBoard() {
  const { properties: all, loading, error } = useProperties();
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const draggedId = useRef<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const properties = all
    .filter(p => p.status !== 'new' && p.status !== 'not_relevant')
    .map(p => overrides[p.id] ? { ...p, status: overrides[p.id] } : p);

  async function moveToStage(propertyId: string, newStatus: string) {
    try {
      await updateProperty(propertyId, {
        status: newStatus,
        movedToStageAt: new Date().toISOString(),
      });
      setOverrides(prev => ({ ...prev, [propertyId]: newStatus }));
    } catch (e) {
      console.error('Failed to update status', e);
    }
  }

  function requestMove(propertyId: string, propertyTitle: string, newStatus: string) {
    if (newStatus === 'not_relevant') {
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

  function handleDragStart(propertyId: string) {
    draggedId.current = propertyId;
  }

  function handleDragOver(e: React.DragEvent, stageKey: string) {
    e.preventDefault();
    setDragOverStage(stageKey);
  }

  function handleDragLeave() {
    setDragOverStage(null);
  }

  function handleDrop(e: React.DragEvent, stageKey: string) {
    e.preventDefault();
    setDragOverStage(null);
    const id = draggedId.current;
    if (!id) return;
    draggedId.current = null;
    const property = properties.find(p => p.id === id);
    if (!property || property.status === stageKey) return;
    requestMove(id, property.title ?? '', stageKey);
  }

  function handleDragEnd() {
    draggedId.current = null;
    setDragOverStage(null);
  }

  if (loading) return <div className="text-gray-500 py-12 text-center">Loading funnel...</div>;
  if (error)   return <div className="text-red-500 py-12 text-center">{error}</div>;

  return (
    <div>
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
          const isOver = dragOverStage === stage.key;

          // Price calculations
          const prices = stageProps
            .map(p => p.price ? parseFloat(String(p.price)) : null)
            .filter((p): p is number => p !== null);
          const total = prices.reduce((sum, p) => sum + p, 0);
          const avg = prices.length > 0 ? total / prices.length : 0;
          const hasPrice = prices.length > 0;

          // Light backgrounds (parked, teal-200, teal-300) need dark text
          const isLight      = stage.parked || stage.key === 'visited' || stage.key === 'offer_made';
          const labelStyle   = isLight ? 'text-slate-600 font-semibold text-sm' : 'text-white font-semibold text-sm';
          const summaryStyle = isLight ? 'text-slate-500' : 'text-white opacity-80';

          return (
            <div
              key={stage.key}
              className="flex-shrink-0 w-64"
              onDragOver={(e) => handleDragOver(e, stage.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.key)}
            >
              {/* Column header */}
              <div className={`${stage.header} rounded-t-lg px-3 pt-2 pb-2`}>
                {/* Stage name — full width, no badge */}
                <span className={labelStyle}>{stage.label}</span>

                {/* Count + price summary on one line */}
                <div className={`flex gap-2 text-xs mt-1 ${summaryStyle}`}>
                  <span className="font-medium">#{stageProps.length}</span>
                  <span className="opacity-40">·</span>
                  <span>Ø {hasPrice ? formatPrice(avg) : '—'}</span>
                  <span className="opacity-40">·</span>
                  <span>Σ {hasPrice ? formatPrice(total) : '—'}</span>
                </div>
              </div>

              {/* Column body */}
              <div
                className={`border border-t-0 rounded-b-lg min-h-32 p-2 space-y-2 transition-colors duration-150 ${
                  isOver
                    ? 'bg-blue-50 border-blue-300 border-2'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                {stageProps.map((prop) => (
                  <FunnelCard
                    key={prop.id}
                    property={prop}
                    stages={STAGES}
                    onMove={requestMove}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                ))}
                {stageProps.length === 0 && (
                  <p className={`text-xs text-center py-4 transition-colors ${
                    isOver ? 'text-blue-400' : 'text-gray-400'
                  }`}>
                    {isOver ? 'Drop here' : 'No properties'}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Property card ────────────────────────────────────────────────────────────

function FunnelCard({
  property,
  stages,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  property: Property;
  stages: typeof STAGES;
  onMove: (id: string, title: string, status: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const rawPrice = property.price ? parseFloat(String(property.price)) : null;
  const priceText = rawPrice ? formatPrice(rawPrice) : '';

  const moveOptions = [
    ...stages.filter(s => s.key !== property.status),
    NOT_RELEVANT,
  ];

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', property.id);
    setIsDragging(true);
    onDragStart(property.id);
  }

  function handleDragEnd() {
    setIsDragging(false);
    onDragEnd();
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden cursor-grab active:cursor-grabbing transition-opacity duration-150 ${
        isDragging ? 'opacity-40' : 'opacity-100'
      }`}
    >
      {/* Image — clicking opens original listing */}
      {property.imageUrl && (
        <a
          href={property.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-gray-100 overflow-hidden"
          style={{ height: '96px' }}
          draggable={false}
        >
          <img
            src={property.imageUrl}
            alt={property.title ?? ''}
            className="w-full h-full object-cover hover:opacity-90 transition-opacity"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            draggable={false}
          />
        </a>
      )}

      <div className="p-2">
        {/* Title — clicking opens original listing */}
        <a
          href={property.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-gray-900 hover:text-blue-600 line-clamp-2 block mb-1"
          draggable={false}
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

        {/* Move to stage dropdown */}
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
                    onMove(property.id, property.title ?? '', s.key);
                    setShowMenu(false);
                  }}
                  className={`w-full text-left text-xs px-3 py-2 hover:bg-gray-50 transition-colors ${
                    s.key === 'not_relevant'
                      ? 'text-rose-500 border-t border-gray-100 font-medium'
                      : 'text-gray-700'
                  } ${i === moveOptions.length - 2 ? 'border-b border-gray-100' : ''}`}
                >
                  {s.key === 'not_relevant' ? '✕ Not Relevant' : s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
