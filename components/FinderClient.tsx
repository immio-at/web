'use client';

import { useState, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useProperties } from '@/hooks/useProperties';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { trackInteraction } from '@/hooks/useInteractionTracker';
import PresetFilters from '@/components/PresetFilters';
import { type PresetFilterKey, passesPresetFilters, passesSavedFilters } from '@/lib/preset-filters';
import Link from 'next/link';

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

export default function FinderClient({
  initialPresets,
  initialSavedFilterIds,
}: {
  initialPresets?: Set<PresetFilterKey>;
  initialSavedFilterIds?: Set<string>;
} = {}) {
  const t = useTranslations('finder');
  const { properties: all, loading, update } = useProperties();
  const { filters: savedFilters } = useSavedFilters();
  const [activePresets, setActivePresets] = useState<Set<PresetFilterKey>>(initialPresets ?? new Set());
  const [activeSavedFilterIds, setActiveSavedFilterIds] = useState<Set<string>>(initialSavedFilterIds ?? new Set());

  function toggleSavedFilter(id: string) {
    setActiveSavedFilterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Apply filters to 'new' properties client-side
  const properties = useMemo(() => {
    let filtered = all.filter(p => p.status === 'new');

    if (activePresets.size > 0) {
      filtered = filtered.filter(p => passesPresetFilters(p, activePresets));
    }

    if (activeSavedFilterIds.size > 0) {
      filtered = filtered.filter(p => passesSavedFilters(p, savedFilters, activeSavedFilterIds));
    }

    return filtered;
  }, [all, activePresets, activeSavedFilterIds, savedFilters]);

  const [current, setCurrent] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [showAnalyseModal, setShowAnalyseModal] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const property = properties[current];
  const total = properties.length;

  async function handleAction(action: string) {
    if (!property) return;

    if (action === 'open') {
      trackInteraction(property.id, 'url_click');
      window.open(property.sourceUrl, '_blank');
      setDragX(0);
      setDragY(0);
      return;
    }

    if (action === 'analyse') {
      trackInteraction(property.id, 'analysis');
      setShowAnalyseModal(true);
      setDragX(0);
      setDragY(0);
      return;
    }

    if (action !== 'not_relevant') {
      trackInteraction(property.id, 'status_change');
    }

    setLastAction(action);
    setCurrent(c => c + 1);
    setDragX(0);
    setDragY(0);
    setTimeout(() => setLastAction(null), 300);

    update(property.id, {
      status: action === 'interested' ? 'investigating' : action,
      movedToStageAt: new Date().toISOString(),
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    dragStart.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragStart.current || !isDragging) return;
    setDragX(e.clientX - dragStart.current.x);
    setDragY(e.clientY - dragStart.current.y);
  }

  async function onPointerUp() {
    const absX = Math.abs(dragX);
    const absY = Math.abs(dragY);

    if (absX > absY) {
      if (dragX > 100) await handleAction('investigating');
      else if (dragX < -100) await handleAction('not_relevant');
      else { setDragX(0); setDragY(0); }
    } else {
      if (dragY < -100) await handleAction('open');
      else if (dragY > 100) await handleAction('analyse');
      else { setDragX(0); setDragY(0); }
    }

    dragStart.current = null;
    setIsDragging(false);
  }

  const swipeIntent =
    Math.abs(dragX) > Math.abs(dragY)
      ? dragX > 50 ? 'investigating' : dragX < -50 ? 'not_relevant' : null
      : dragY < -50 ? 'open' : dragY > 50 ? 'analyse' : null;

  const overlayConfig: Record<string, { bg: string; label: string }> = {
    investigating:  { bg: 'bg-emerald-500', label: t('overlay.investigating') },
    not_relevant:   { bg: 'bg-rose-500',    label: t('overlay.notRelevant') },
    open:           { bg: 'bg-blue-500',    label: t('overlay.openListing') },
    analyse:        { bg: 'bg-amber-500',   label: t('overlay.analyse') },
  };

  const overlayOpacity = Math.min(
    Math.max(Math.abs(dragX), Math.abs(dragY)) / 150,
    0.85
  );

  const rawPrice = property?.price ? parseFloat(String(property.price)) : null;
  const priceText = rawPrice
    ? '€ ' + Math.round(rawPrice).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : '';

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-gray-400">{t('loading')}</p>
    </div>
  );

  if (current >= total) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('allCaughtUp.title')}</h2>
        <p className="text-gray-500 mb-8">{t('allCaughtUp.subtitle', { total })}</p>
        <Link
          href="/dashboard"
          className="bg-slate-700 text-white px-8 py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors"
        >
          {t('allCaughtUp.backToDashboard')}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-4 px-4 pb-8 w-full">

      {/* Preset + saved filter pills */}
      <PresetFilters
        active={activePresets}
        onChange={setActivePresets}
        savedFilters={savedFilters}
        activeSavedFilterIds={activeSavedFilterIds}
        onToggleSavedFilter={toggleSavedFilter}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-sm mx-auto cursor-grab active:cursor-grabbing select-none"
        style={{
          transform: `translateX(${dragX}px) translateY(${dragY}px) rotate(${dragX * 0.04}deg)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease',
          touchAction: 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Drag overlay */}
        {swipeIntent && (
          <div
            className={`absolute inset-0 z-10 rounded-2xl ${overlayConfig[swipeIntent].bg} flex items-center justify-center`}
            style={{ opacity: overlayOpacity }}
          >
            <span className="text-white text-2xl font-bold tracking-wide">
              {overlayConfig[swipeIntent].label}
            </span>
          </div>
        )}

        {/* Action flash */}
        {lastAction && overlayConfig[lastAction] && (
          <div className={`absolute inset-0 z-10 rounded-2xl flex items-center justify-center ${overlayConfig[lastAction].bg}`}>
            <span className="text-white text-2xl font-bold">{overlayConfig[lastAction].label}</span>
          </div>
        )}

        <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
          {/* Image */}
          <div className="relative w-full bg-gray-100" style={{ height: '288px' }}>
            {property.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={property.imageUrl}
                alt={property.title ?? ''}
                width={400}
                height={288}
                className="w-full h-full object-cover pointer-events-none"
                loading="eager"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-300 text-5xl">🏠</div>
            )}
          </div>

          {/* Details */}
          <div className="p-5">
            <h2 className="font-bold text-gray-900 text-lg mb-3 line-clamp-2">
              {property.title}
            </h2>
            <div className="space-y-1 text-sm text-gray-600">
              {priceText && (
                <div className="text-2xl font-bold text-blue-600 mb-1">{priceText}</div>
              )}
              {property.location && (
                <div className="text-gray-500">📍 {property.location}</div>
              )}
              <div className="flex gap-4 text-gray-500">
                {property.sizeSqm && <span>{property.sizeSqm} m²</span>}
                {property.rooms && <span>{property.rooms} {t('rooms')}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Buttons — order matches directions: left, up, down, right */}
      <div className="flex gap-4 mt-5">
        <button
          onClick={() => handleAction('not_relevant')}
          title={t('buttons.notRelevantTitle')}
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-rose-500 font-bold text-lg hover:bg-rose-50 hover:border-rose-300 transition-colors shadow-sm flex items-center justify-center"
        >
          ✕
        </button>
        <button
          onClick={() => handleAction('open')}
          title={t('buttons.openListingTitle')}
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-blue-500 font-bold text-lg hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-sm flex items-center justify-center"
        >
          ↗
        </button>
        <button
          onClick={() => handleAction('analyse')}
          title={t('buttons.analyseTitle')}
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-amber-500 font-bold text-lg hover:bg-amber-50 hover:border-amber-300 transition-colors shadow-sm flex items-center justify-center"
        >
          🔍
        </button>
        <button
          onClick={() => handleAction('investigating')}
          title={t('buttons.investigatingTitle')}
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-emerald-600 font-bold text-lg hover:bg-emerald-50 hover:border-emerald-300 transition-colors shadow-sm flex items-center justify-center"
        >
          ✓
        </button>
      </div>

      {/* Directions — below buttons */}
      <div className="flex gap-6 text-xs text-gray-400 text-center mt-3">
        <span>{t('directions.left')}</span>
        <span>{t('directions.up')}</span>
        <span>{t('directions.down')}</span>
        <span>{t('directions.right')}</span>
      </div>

      {/* Progress count */}
      <div className="text-gray-400 text-xs mt-2">{t('progress', { current, total })}</div>

      {/* Analyse modal */}
      {showAnalyseModal && property && (
        <PropertyAnalysisModal
          property={property}
          onClose={() => setShowAnalyseModal(false)}
        />
      )}

    </div>
  );
}
