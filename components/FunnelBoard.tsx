'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Property, SavedFilter, reportUnavailable, delistProperty } from '@/lib/api';
import { useProperties } from '@/hooks/useProperties';
import { trackInteraction } from '@/hooks/useInteractionTracker';
import { type PresetFilterKey, passesPresetFilters, passesSavedFilters } from '@/lib/preset-filters';
import { FUNNEL_STAGES_DISPLAY } from '@/lib/constants';
import PropertyCard, { type CardActions, type CardProperty } from '@/components/PropertyCard';

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

export default function FunnelBoard({ activePresets, activeSavedFilterIds, savedFilters, headerAction }: {
  activePresets?: Set<PresetFilterKey>;
  activeSavedFilterIds?: Set<string>;
  savedFilters?: SavedFilter[];
  /**
   * Optional right-aligned action rendered inside the kanban's horizontal
   * scroll container so its right edge tracks the right edge of the
   * rightmost column (Won) even when the board scrolls.
   */
  headerAction?: React.ReactNode;
}) {
  const t = useTranslations('funnel');
  const { properties: all, loading, error, update, optimisticUpdate } = useProperties();
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [analyseProperty, setAnalyseProperty] = useState<Property | null>(null);
  const [zoomedStage, setZoomedStage] = useState<string | null>(null);
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

  // Heart stage-picker dropdown state (ADR-012 PC2, Funnel variant).
  // The PropertyCard's heart calls onMoveStage with its bounding rect;
  // we render a DropdownPortal anchored there with the available stages.
  const [heartMenu, setHeartMenu] = useState<{ propertyId: string; anchor: DOMRect } | null>(null);

  function propertyToCard(p: Property): CardProperty {
    return {
      id: p.id,
      title: p.title,
      price: p.price ? parseFloat(String(p.price)) : null,
      sizeSqm: p.sizeSqm ? parseFloat(String(p.sizeSqm)) : null,
      rooms: p.rooms ? parseFloat(String(p.rooms)) : null,
      location: p.location,
      zipCode: p.zipCode,
      imageUrl: p.imageUrl,
      sourceUrl: p.sourceUrl,
      platform: p.platform,
      status: p.status,
      listingStatus: p.listingStatus,
      source: 'own',
      emailReceivedAt: p.emailReceivedAt,
    };
  }

  const cardActions: CardActions = useMemo(() => ({
    onMoveStage: (item, anchor) => setHeartMenu({ propertyId: item.id, anchor }),
    onAnalyse: (item) => {
      trackInteraction(item.id, 'analysis');
      const prop = all.find(p => p.id === item.id);
      if (prop) setAnalyseProperty(prop);
    },
    onReportDead: (item) => handleReportUnavailable(item.id),
    onDismiss: (item) => {
      const prop = all.find(p => p.id === item.id);
      if (!prop) return;
      if (prop.listingStatus === 'expired') {
        handleDelist(item.id);
      } else {
        requestMove(item.id, prop.title ?? '', 'not_relevant');
      }
    },
    onUrlClick: (item) => trackInteraction(item.id, 'url_click'),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [all]);

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

      {heartMenu && (() => {
        const current = all.find(p => p.id === heartMenu.propertyId);
        const currentStage = current?.status;
        const options: DropdownOption[] = FUNNEL_STAGES_DISPLAY
          .filter(s => s.key !== currentStage)
          .map(s => ({
            key: s.key,
            label: t(`stages.${STAGE_I18N_KEY[s.key] ?? s.key}`),
            variant: 'default' as const,
          }));
        return (
          <DropdownPortal
            anchorRect={heartMenu.anchor}
            options={options}
            onSelect={(key) => {
              if (current) requestMove(heartMenu.propertyId, current.title ?? '', key);
              setHeartMenu(null);
            }}
            onClose={() => setHeartMenu(null)}
          />
        );
      })()}

      <p className="text-sm text-gray-500 mb-4">{t('propertyCount', { count: properties.length })}</p>

      {zoomedStage ? (
        <ZoomedStageView
          stage={FUNNEL_STAGES_DISPLAY.find(s => s.key === zoomedStage)!}
          stageProps={properties.filter(p => p.status === zoomedStage)}
          isDragOver={dragOverStage === zoomedStage}
          cardActions={cardActions}
          toCard={propertyToCard}
          onBack={() => setZoomedStage(null)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="w-max">
            {headerAction && (
              <div className="flex justify-end mb-2">
                {headerAction}
              </div>
            )}
            <div className="flex gap-4">
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
            const iconStyle = isLight ? 'text-slate-500' : 'text-white opacity-80';

            return (
              <div
                key={stage.key}
                className="flex-shrink-0 w-60"
                onDragOver={(e) => handleDragOver(e, stage.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.key)}
              >
                {/* Clickable column header — opens stage zoom (ADR-008 F2) */}
                <button
                  onClick={() => setZoomedStage(stage.key)}
                  title={t('focusStage')}
                  className={`${stage.header} rounded-t-lg px-3 pt-2 pb-2 w-full text-left group cursor-pointer hover:brightness-95 transition-all`}
                >
                  <div className="flex items-center justify-between">
                    <span className={labelStyle}>{t(`stages.${STAGE_I18N_KEY[stage.key] ?? stage.key}`)}</span>
                    <span className={`text-sm opacity-0 group-hover:opacity-70 transition-opacity ${iconStyle}`}>⤢</span>
                  </div>
                  <div className={`flex gap-2 text-xs mt-1 ${summaryStyle}`}>
                    <span className="font-medium">#{stageProps.length}</span>
                    <span className="opacity-40">·</span>
                    <span>Ø {hasPrice ? formatPrice(avg) : '—'}</span>
                    <span className="opacity-40">·</span>
                    <span>Σ {hasPrice ? formatPrice(total) : '—'}</span>
                  </div>
                </button>

                <div
                  className={`border border-t-0 rounded-b-lg min-h-32 p-2 space-y-2 transition-colors duration-150 ${
                    isOver
                      ? 'bg-blue-50 border-blue-300 border-2'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  {stageProps.map((prop) => (
                    <PropertyCard
                      key={prop.id}
                      item={propertyToCard(prop)}
                      actions={cardActions}
                      compact
                      fullWidth
                      draggable={{
                        onDragStart: (e) => {
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', prop.id);
                          handleDragStart(prop.id);
                        },
                        onDragEnd: handleDragEnd,
                      }}
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
        </div>
      )}
    </div>
  );
}

// ─── Zoomed single-stage view (ADR-008 F2) ────────────────────────────────────

function ZoomedStageView({
  stage,
  stageProps,
  isDragOver,
  cardActions,
  toCard,
  onBack,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  stage: typeof FUNNEL_STAGES_DISPLAY[number];
  stageProps: Property[];
  isDragOver: boolean;
  cardActions: CardActions;
  toCard: (p: Property) => CardProperty;
  onBack: () => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, stageKey: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, stageKey: string) => void;
}) {
  const t = useTranslations('funnel');

  // Escape closes the zoom (consistent with the rest of the app)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onBack();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);

  const prices = stageProps
    .map(p => p.price ? parseFloat(String(p.price)) : null)
    .filter((p): p is number => p !== null);
  const total = prices.reduce((sum, p) => sum + p, 0);
  const avg = prices.length > 0 ? total / prices.length : 0;
  const hasPrice = prices.length > 0;

  const isLight    = stage.parked || stage.key === 'investigating' || stage.key === 'interested';
  const labelStyle = isLight ? 'text-slate-700 font-semibold text-base' : 'text-white font-semibold text-base';
  const summaryStyle = isLight ? 'text-slate-500' : 'text-white opacity-80';
  const backStyle = isLight
    ? 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
    : 'text-white opacity-80 hover:opacity-100 hover:bg-white/10';

  return (
    <div
      onDragOver={(e) => onDragOver(e, stage.key)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, stage.key)}
    >
      <div className={`${stage.header} rounded-t-lg px-4 py-3 flex items-center gap-3`}>
        <button
          onClick={onBack}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${backStyle}`}
          title={t('backToFunnel')}
        >
          <span>←</span>
          <span>{t('backToFunnel')}</span>
        </button>
        <div className="flex-1" />
        <span className={labelStyle}>{t(`stages.${STAGE_I18N_KEY[stage.key] ?? stage.key}`)}</span>
        <div className={`flex gap-2 text-xs ${summaryStyle}`}>
          <span className="font-medium">#{stageProps.length}</span>
          <span className="opacity-40">·</span>
          <span>Ø {hasPrice ? formatPrice(avg) : '—'}</span>
          <span className="opacity-40">·</span>
          <span>Σ {hasPrice ? formatPrice(total) : '—'}</span>
        </div>
      </div>

      <div
        className={`border border-t-0 rounded-b-lg min-h-64 p-4 transition-colors duration-150 ${
          isDragOver
            ? 'bg-blue-50 border-blue-300 border-2'
            : 'bg-gray-50 border-gray-200'
        }`}
      >
        {stageProps.length === 0 ? (
          <p className={`text-sm text-center py-12 ${
            isDragOver ? 'text-blue-400' : 'text-gray-400'
          }`}>
            {isDragOver ? t('card.dropHere') : t('card.noProperties')}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {stageProps.map((prop) => (
              <PropertyCard
                key={prop.id}
                item={toCard(prop)}
                actions={cardActions}
                draggable={{
                  onDragStart: (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', prop.id);
                    onDragStart(prop.id);
                  },
                  onDragEnd,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

