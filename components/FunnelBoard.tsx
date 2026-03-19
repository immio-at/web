'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Property, reportUnavailable, delistProperty } from '@/lib/api';
import { useProperties } from '@/hooks/useProperties';
import PropertyAnalysisModal from '@/components/PropertyAnalysisModal';
import { FUNNEL_STAGES_DISPLAY } from '@/lib/constants';

const NOT_RELEVANT = { key: 'not_relevant', label: 'Not Relevant' };

interface PendingMove {
  propertyId: string;
  propertyTitle: string;
}

interface PendingReport {
  propertyId: string;
  propertyTitle: string;
}

function formatPrice(n: number): string {
  return '€' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ─── Portal dropdown ──────────────────────────────────────────────────────────
// Renders into document.body so it is never clipped by a parent overflow:hidden

interface DropdownOption {
  key: string;
  label: string;
  variant?: 'default' | 'warning' | 'danger';
}

interface DropdownPortalProps {
  anchorRect: DOMRect;
  options: DropdownOption[];
  onSelect: (key: string) => void;
  onClose: () => void;
}

function DropdownPortal({ anchorRect, options, onSelect, onClose }: DropdownPortalProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handle, true);
    return () => document.removeEventListener('mousedown', handle, true);
  }, [onClose]);

  const top  = anchorRect.bottom + window.scrollY + 4;
  const left = anchorRect.left   + window.scrollX;
  const minW = Math.max(anchorRect.width, 200);

  function itemClass(variant: DropdownOption['variant'], index: number, total: number) {
    const base = 'w-full text-left text-xs px-3 py-2 hover:bg-gray-50 transition-colors';
    const border = index === total - 1 ? '' : '';

    // Warning options (report unavailable) get a divider above them
    const topBorder =
      variant === 'warning' || variant === 'danger' ? 'border-t border-gray-100' : '';

    const colour =
      variant === 'danger'  ? 'text-rose-500 font-medium' :
      variant === 'warning' ? 'text-amber-600 font-medium' :
      'text-gray-700';

    return [base, topBorder, colour, border].filter(Boolean).join(' ');
  }

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'absolute', top, left, minWidth: minW, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
    >
      {options.map((s, i) => (
        <button
          key={s.key}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(s.key);
          }}
          className={itemClass(s.variant, i, options.length)}
        >
          {s.key === 'not_relevant'       ? '✕ Not Relevant' :
           s.key === 'report_unavailable' ? '⚠ Report Unavailable' :
           s.key === 'delist'             ? '✕ Remove from View' :
           s.label}
        </button>
      ))}
    </div>,
    document.body
  );
}

// ─── Confirm modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  title,
  icon,
  heading,
  description,
  propertyTitle,
  footnote,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: {
  title?: string;
  icon: string;
  heading: string;
  description: string;
  propertyTitle: string;
  footnote?: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">{icon}</span>
          <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
        </div>
        <p className="text-sm text-gray-600 mb-1">{description}</p>
        <p className="text-sm font-medium text-gray-900 mb-5 line-clamp-2 bg-gray-50 rounded-lg px-3 py-2">
          {propertyTitle}
        </p>
        {footnote && (
          <p className="text-xs text-gray-400 mb-5">{footnote}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main board ───────────────────────────────────────────────────────────────

export default function FunnelBoard() {
  const { properties: all, loading, error, update, refresh } = useProperties();
  const [pendingMove, setPendingMove]     = useState<PendingMove | null>(null);
  const [pendingReport, setPendingReport] = useState<PendingReport | null>(null);
  const [analyseProperty, setAnalyseProperty] = useState<Property | null>(null);
  const draggedId = useRef<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Exclude new, not_relevant, and delisted from the funnel view.
  // 'delisted' is the terminal stage for expired listings the user has dismissed.
  const properties = all.filter(
    p => p.status !== 'new' && p.status !== 'not_relevant' && p.status !== 'delisted'
  );

  async function moveToStage(propertyId: string, newStatus: string) {
    try {
      await update(propertyId, {
        status: newStatus,
        movedToStageAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error('Failed to update status', e);
    }
  }

  function requestMove(propertyId: string, propertyTitle: string, newStatus: string) {
    if (newStatus === 'not_relevant') {
      setPendingMove({ propertyId, propertyTitle });
    } else if (newStatus === 'report_unavailable') {
      setPendingReport({ propertyId, propertyTitle });
    } else if (newStatus === 'delist') {
      handleDelist(propertyId);
    } else {
      moveToStage(propertyId, newStatus);
    }
  }

  async function confirmNotRelevant() {
    if (!pendingMove) return;
    await moveToStage(pendingMove.propertyId, 'not_relevant');
    setPendingMove(null);
  }

  async function confirmReportUnavailable() {
    if (!pendingReport) return;
    try {
      await reportUnavailable(pendingReport.propertyId);
      // Refresh so the expired badge appears immediately without a page reload
      await refresh();
    } catch (e) {
      console.error('Failed to report unavailable', e);
    }
    setPendingReport(null);
  }

  async function handleDelist(propertyId: string) {
    try {
      await delistProperty(propertyId);
      // Refresh so the card disappears from the funnel immediately
      await refresh();
    } catch (e) {
      console.error('Failed to delist property', e);
    }
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
          icon="❌"
          heading="Mark as Not Relevant?"
          description="This will hide the following property from your funnel:"
          propertyTitle={pendingMove.propertyTitle}
          footnote="You can still find it later via the Show hidden properties filter on the Dashboard."
          confirmLabel="Yes, hide it"
          confirmClass="bg-rose-500 hover:bg-rose-600"
          onConfirm={confirmNotRelevant}
          onCancel={() => setPendingMove(null)}
        />
      )}

      {pendingReport && (
        <ConfirmModal
          icon="⚠️"
          heading="Report as Unavailable?"
          description="This will flag the following property as no longer listed:"
          propertyTitle={pendingReport.propertyTitle}
          footnote="The property will stay in your funnel with a visual indicator. You can remove it from view at any time."
          confirmLabel="Yes, report it"
          confirmClass="bg-amber-500 hover:bg-amber-600"
          onConfirm={confirmReportUnavailable}
          onCancel={() => setPendingReport(null)}
        />
      )}

      {analyseProperty && (
        <PropertyAnalysisModal
          property={analyseProperty}
          onClose={() => setAnalyseProperty(null)}
        />
      )}

      <p className="text-sm text-gray-500 mb-4">{properties.length} properties in funnel</p>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {FUNNEL_STAGES_DISPLAY.map((stage) => {
          const stageProps = properties.filter(p => p.status === stage.key);
          const isOver = dragOverStage === stage.key;

          const prices = stageProps
            .map(p => p.price ? parseFloat(String(p.price)) : null)
            .filter((p): p is number => p !== null);
          const total = prices.reduce((sum, p) => sum + p, 0);
          const avg = prices.length > 0 ? total / prices.length : 0;
          const hasPrice = prices.length > 0;

          const isLight    = stage.parked || stage.key === 'investigating' || stage.key === 'interested';
          const labelStyle = isLight ? 'text-slate-600 font-semibold text-sm' : 'text-white font-semibold text-sm';
          const summaryStyle = isLight ? 'text-slate-500' : 'text-white opacity-80';

          return (
            <div
              key={stage.key}
              className="flex-shrink-0 w-60"
              onDragOver={(e) => handleDragOver(e, stage.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.key)}
            >
              <div className={`${stage.header} rounded-t-lg px-3 pt-2 pb-2`}>
                <span className={labelStyle}>{stage.label}</span>
                <div className={`flex gap-2 text-xs mt-1 ${summaryStyle}`}>
                  <span className="font-medium">#{stageProps.length}</span>
                  <span className="opacity-40">·</span>
                  <span>Ø {hasPrice ? formatPrice(avg) : '—'}</span>
                  <span className="opacity-40">·</span>
                  <span>Σ {hasPrice ? formatPrice(total) : '—'}</span>
                </div>
              </div>

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
                    stages={FUNNEL_STAGES_DISPLAY}
                    onMove={requestMove}
                    onAnalyse={setAnalyseProperty}
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
  onAnalyse,
  onDragStart,
  onDragEnd,
}: {
  property: Property;
  stages: typeof FUNNEL_STAGES_DISPLAY;
  onMove: (id: string, title: string, status: string) => void;
  onAnalyse: (p: Property) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const isExpired = property.listingStatus === 'expired';

  const rawPrice = property.price ? parseFloat(String(property.price)) : null;
  const priceText = rawPrice ? formatPrice(rawPrice) : null;

  // Build the Move dropdown options.
  // For expired properties: replace the standard stage options with just
  // "Remove from View" since moving an unavailable listing through the funnel
  // is misleading. Non-expired properties get the standard stage list plus
  // "Report Unavailable" and "Not Relevant" at the bottom.
  const moveOptions: { key: string; label: string; variant?: 'default' | 'warning' | 'danger' }[] =
    isExpired
      ? [
          { key: 'delist', label: 'Remove from View', variant: 'danger' },
        ]
      : [
          ...stages
            .filter(s => s.key !== property.status)
            .map(s => ({ key: s.key, label: s.label, variant: 'default' as const })),
          { key: 'report_unavailable', label: 'Report Unavailable', variant: 'warning' },
          { key: 'not_relevant',       label: 'Not Relevant',       variant: 'danger'  },
        ];

  const closeMenu = useCallback(() => setAnchorRect(null), []);

  function openMenu() {
    if (!btnRef.current) return;
    setAnchorRect(btnRef.current.getBoundingClientRect());
  }

  function handleSelect(key: string) {
    closeMenu();
    onMove(property.id, property.title ?? '', key);
  }

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
      className={[
        'bg-white rounded-lg shadow-sm border overflow-hidden cursor-grab active:cursor-grabbing transition-opacity duration-150',
        isDragging   ? 'opacity-40'          : 'opacity-100',
        // Expired cards get a muted border and slight opacity to signal
        // unavailability without being fully invisible
        isExpired    ? 'border-amber-200 opacity-60' : 'border-gray-200',
      ].join(' ')}
    >
      {/* Image + key info */}
      <div className="flex gap-2 p-2">
        <a
          href={property.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 rounded overflow-hidden bg-gray-100 relative"
          style={{ width: '64px', height: '64px' }}
          draggable={false}
        >
          {property.imageUrl ? (
            <img
              src={property.imageUrl}
              alt={property.title ?? ''}
              className={`w-full h-full object-cover hover:opacity-90 transition-opacity ${isExpired ? 'grayscale' : ''}`}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl text-gray-300">🏠</div>
          )}
        </a>

        <div className="flex-1 min-w-0 flex flex-col justify-center">
          {priceText && (
            <div className={`text-sm font-bold ${isExpired ? 'text-gray-400' : 'text-[#0F1F3D]'}`}>
              {priceText}
            </div>
          )}
          {property.location && (
            <div className="text-xs text-gray-500 truncate">{property.location}</div>
          )}
          <div className="flex gap-2 text-xs text-gray-400 mt-0.5">
            {property.sizeSqm && <span>{property.sizeSqm}m²</span>}
            {property.sizeSqm && property.rooms && <span>·</span>}
            {property.rooms && <span>{String(property.rooms)} Zi.</span>}
          </div>
        </div>
      </div>

      {/* Expired badge — only shown when listingStatus is 'expired' */}
      {isExpired && (
        <div className="mx-2 mb-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-medium flex items-center gap-1">
          <span>⚠</span>
          <span>Nicht mehr verfügbar</span>
        </div>
      )}

      {/* Title */}
      <div className="px-2 pb-2">
        <a
          href={property.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-xs font-medium line-clamp-2 block ${
            isExpired ? 'text-gray-400 hover:text-gray-500' : 'text-gray-700 hover:text-[#0F1F3D]'
          }`}
          draggable={false}
        >
          {property.title}
        </a>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1 px-2 pb-2 border-t border-gray-100 pt-2">
        <button
          ref={btnRef}
          onClick={openMenu}
          className="flex-1 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2 py-1 hover:bg-gray-50 transition-colors text-left"
        >
          {isExpired ? 'Optionen ▾' : 'Move ▾'}
        </button>

        <button
          onClick={() => onAnalyse(property)}
          title="Analyse this property"
          className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-amber-500 hover:border-amber-200 hover:bg-amber-50 transition-colors text-sm leading-none"
        >
          🔍
        </button>
      </div>

      {/* Portal dropdown — rendered on document.body, never clipped by card overflow */}
      {anchorRect && (
        <DropdownPortal
          anchorRect={anchorRect}
          options={moveOptions}
          onSelect={handleSelect}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
