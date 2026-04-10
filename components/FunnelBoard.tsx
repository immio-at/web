'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Property, SavedFilter, reportUnavailable, delistProperty } from '@/lib/api';
import { useProperties } from '@/hooks/useProperties';
import { trackInteraction } from '@/hooks/useInteractionTracker';
import { type PresetFilterKey, passesPresetFilters, passesSavedFilters } from '@/lib/preset-filters';
import { FUNNEL_STAGES_DISPLAY } from '@/lib/constants';

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

// Map snake_case stage keys to camelCase translation keys
const STAGE_I18N_KEY: Record<string, string> = {
  new: 'new', investigating: 'investigating', interested: 'interested',
  due_diligence_completed: 'dueDiligenceCompleted', visited: 'visited', offer_made: 'offerMade',
  parked: 'parked', won: 'won', not_relevant: 'notRelevant',
};

interface PendingMove {
  propertyId: string;
  propertyTitle: string;
}

function formatPrice(n: number): string {
  return '€' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ─── Portal dropdown ──────────────────────────────────────────────────────────

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
  const t = useTranslations('funnel');
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

  // Always at least 220px wide, but never narrower than the anchor button
  const minW = Math.max(anchorRect.width, 220);

  function itemClass(option: DropdownOption, index: number) {
    const base = 'w-full text-left text-xs px-3 py-2 hover:bg-gray-50 transition-colors';

    // Divider above warning and danger options to separate destructive actions
    const topBorder =
      option.variant === 'warning' || option.variant === 'danger'
        ? 'border-t border-gray-100'
        : '';

    const colour =
      option.variant === 'danger'  ? 'text-rose-500 font-medium' :
      option.variant === 'warning' ? 'text-amber-600 font-medium' :
      'text-gray-700';

    return [base, topBorder, colour].filter(Boolean).join(' ');
  }

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'absolute', top, left, minWidth: minW, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
    >
      {options.map((opt, i) => (
        <button
          key={opt.key}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(opt.key);
          }}
          className={itemClass(opt, i)}
        >
          {opt.key === 'not_relevant'       ? t('card.notRelevant') :
           opt.key === 'report_unavailable' ? t('card.reportUnavailable') :
           opt.key === 'delist'             ? t('card.removeFromView') :
           opt.label}
        </button>
      ))}
    </div>,
    document.body
  );
}

// ─── Confirm modal — used only for Not Relevant ───────────────────────────────

function ConfirmNotRelevantModal({
  propertyTitle,
  onConfirm,
  onCancel,
}: {
  propertyTitle: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('funnel');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black bg-opacity-40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">❌</span>
          <h2 className="text-lg font-semibold text-gray-900">{t('confirmNotRelevant.title')}</h2>
        </div>
        <p className="text-sm text-gray-600 mb-1">
          {t('confirmNotRelevant.description')}
        </p>
        <p className="text-sm font-medium text-gray-900 mb-5 line-clamp-2 bg-gray-50 rounded-lg px-3 py-2">
          {propertyTitle}
        </p>
        <p className="text-xs text-gray-400 mb-5">
          {t('confirmNotRelevant.hint')}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {t('confirmNotRelevant.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 rounded-lg bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 transition-colors"
          >
            {t('confirmNotRelevant.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main board ───────────────────────────────────────────────────────────────

export default function FunnelBoard({ activePresets, activeSavedFilterIds, savedFilters }: {
  activePresets?: Set<PresetFilterKey>;
  activeSavedFilterIds?: Set<string>;
  savedFilters?: SavedFilter[];
}) {
  const t = useTranslations('funnel');
  const { properties: all, loading, error, update, optimisticUpdate } = useProperties();
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [analyseProperty, setAnalyseProperty] = useState<Property | null>(null);
  const draggedId = useRef<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // Exclude new, not_relevant, and delisted from the funnel view.
  // Then apply preset and saved filter pills if active.
  const properties = useMemo(() => {
    let filtered = all.filter(
      p => p.status !== 'new' && p.status !== 'not_relevant' && p.status !== 'delisted'
    );

    if (activePresets && activePresets.size > 0) {
      filtered = filtered.filter(p => passesPresetFilters(p, activePresets));
    }

    if (activeSavedFilterIds && activeSavedFilterIds.size > 0 && savedFilters) {
      filtered = filtered.filter(p => passesSavedFilters(p, savedFilters, activeSavedFilterIds));
    }

    return filtered;
  }, [all, activePresets, activeSavedFilterIds, savedFilters]);

  async function moveToStage(propertyId: string, newStatus: string) {
    if (newStatus !== 'not_relevant') {
      trackInteraction(propertyId, 'status_change');
    }
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
      // Not Relevant is the only action that keeps a confirm modal —
      // it's irreversible from the funnel so worth the extra friction.
      setPendingMove({ propertyId, propertyTitle });
    } else if (newStatus === 'report_unavailable') {
      handleReportUnavailable(propertyId);
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

  // Optimistic: update local state immediately, fire API call in background.
  // If the API call fails, the next refresh will correct the state.
  async function handleReportUnavailable(propertyId: string) {
    optimisticUpdate(propertyId, { listingStatus: 'expired' });
    try {
      await reportUnavailable(propertyId);
    } catch (e) {
      console.error('Failed to report unavailable', e);
    }
  }

  // Optimistic: hide the card immediately by marking as delisted locally,
  // then confirm with the backend in the background.
  async function handleDelist(propertyId: string) {
    optimisticUpdate(propertyId, { status: 'delisted' });
    try {
      await delistProperty(propertyId);
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

  if (loading) return (
    <div className="flex gap-3 overflow-x-auto py-4">
      {[0,1,2,3,4].map(i => (
        <div key={i} className="flex-shrink-0 w-64 bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
          <div className="h-4 bg-gray-100 rounded w-1/2 mb-4" />
          <div className="space-y-3">
            <div className="h-16 bg-gray-100 rounded" />
            <div className="h-16 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
  if (error)   return <div className="text-red-500 py-12 text-center">{error}</div>;

  return (
    <div>
      {pendingMove && (
        <ConfirmNotRelevantModal
          propertyTitle={pendingMove.propertyTitle}
          onConfirm={confirmNotRelevant}
          onCancel={() => setPendingMove(null)}
        />
      )}

      {analyseProperty && (
        <PropertyAnalysisModal
          property={analyseProperty}
          onClose={() => setAnalyseProperty(null)}
        />
      )}

      <p className="text-sm text-gray-500 mb-4">{t('propertyCount', { count: properties.length })}</p>

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
                <span className={labelStyle}>{t(`stages.${STAGE_I18N_KEY[stage.key] ?? stage.key}`)}</span>
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
                    onAnalyse={(p) => { trackInteraction(p.id, 'analysis'); setAnalyseProperty(p); }}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                ))}
                {stageProps.length === 0 && (
                  <p className={`text-xs text-center py-4 transition-colors ${
                    isOver ? 'text-blue-400' : 'text-gray-400'
                  }`}>
                    {isOver ? t('card.dropHere') : t('card.noProperties')}
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
  const t = useTranslations('funnel');
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const isExpired = property.listingStatus === 'expired';

  const rawPrice = property.price ? parseFloat(String(property.price)) : null;
  const priceText = rawPrice ? formatPrice(rawPrice) : null;

  const NOT_RELEVANT = { key: 'not_relevant', label: t('card.notRelevant'), variant: 'danger' as const };
  const REPORT_UNAVAILABLE = { key: 'report_unavailable', label: t('card.reportUnavailable'), variant: 'warning' as const };
  const REMOVE_FROM_VIEW = { key: 'delist', label: t('card.removeFromView'), variant: 'danger' as const };

  // All cards get the full stage list so the user can move an expired property
  // to any stage (e.g. they may still want to pursue it despite it being delisted).
  // Expired cards additionally show Remove from View at the bottom.
  // All cards show Report Unavailable (unless already expired) and Not Relevant.
  const moveOptions: DropdownOption[] = [
    ...stages
      .filter(s => s.key !== property.status)
      .map(s => ({ key: s.key, label: t(`stages.${STAGE_I18N_KEY[s.key] ?? s.key}`), variant: 'default' as const })),
    ...(isExpired
      ? [REMOVE_FROM_VIEW]
      : [REPORT_UNAVAILABLE]
    ),
    NOT_RELEVANT,
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
        'bg-white rounded-lg shadow-sm border overflow-hidden cursor-grab active:cursor-grabbing transition-all duration-150',
        isDragging ? 'opacity-40' : 'opacity-100',
        isExpired  ? 'border-amber-200 opacity-60' : 'border-gray-200',
      ].join(' ')}
    >
      {/* Image + key info */}
      <div className="flex gap-2 p-2">
        <a
          href={property.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackInteraction(property.id, 'url_click')}
          className="flex-shrink-0 rounded overflow-hidden bg-gray-100"
          style={{ width: '64px', height: '64px' }}
          draggable={false}
        >
          {property.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={property.imageUrl}
              alt={property.title ?? ''}
              width={64}
              height={64}
              className={`w-full h-full object-cover hover:opacity-90 transition-opacity ${isExpired ? 'grayscale' : ''}`}
              loading="lazy"
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
            {property.rooms && <span>{String(property.rooms)} {t('card.rooms')}</span>}
          </div>
        </div>
      </div>

      {/* Expired badge */}
      {isExpired && (
        <div className="mx-2 mb-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 font-medium flex items-center gap-1">
          <span>⚠</span>
          <span>{t('card.expired')}</span>
        </div>
      )}

      {/* Title */}
      <div className="px-2 pb-2">
        <a
          href={property.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackInteraction(property.id, 'url_click')}
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
          {isExpired ? t('card.optionsButton') : t('card.moveButton')}
        </button>

        <button
          onClick={() => onAnalyse(property)}
          title={t('card.analyseTitle')}
          className="p-1.5 rounded border border-gray-200 text-gray-400 hover:text-amber-500 hover:border-amber-200 hover:bg-amber-50 transition-colors text-sm leading-none"
        >
          🔍
        </button>
      </div>

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
