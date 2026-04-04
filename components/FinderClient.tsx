'use client';

import { useState, useRef, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useProperties } from '@/hooks/useProperties';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { SavedFilter } from '@/lib/api';
import { savedFilterToValues, resolvePostcodes } from '@/components/FilterBar';
import Link from 'next/link';
import PropertyAnalysisModal from '@/components/PropertyAnalysisModal';

export default function FinderClient() {
  const t = useTranslations('finder');
  const { properties: all, loading, update } = useProperties();
  const { filters: savedFilters } = useSavedFilters();
  const [selectedFilter, setSelectedFilter] = useState<SavedFilter | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(true);

  // Apply saved filter to 'new' properties client-side
  const properties = useMemo(() => {
    let filtered = all.filter(p => p.status === 'new');
    if (!selectedFilter) return filtered;

    const v = savedFilterToValues(selectedFilter);
    return filtered.filter(p => {
      const price = p.price ? parseFloat(String(p.price)) : null;
      const size = p.sizeSqm ?? null;
      const rooms = p.rooms ? parseFloat(String(p.rooms)) : null;

      if (v.minPrice && price != null && price < parseFloat(v.minPrice)) return false;
      if (v.maxPrice && price != null && price > parseFloat(v.maxPrice)) return false;
      if (v.minSize && size != null && size < parseFloat(v.minSize)) return false;
      if (v.maxSize && size != null && size > parseFloat(v.maxSize)) return false;
      if (v.minRooms && rooms != null && rooms < parseFloat(v.minRooms)) return false;
      if (v.maxRooms && rooms != null && rooms > parseFloat(v.maxRooms)) return false;
      const postcodes = resolvePostcodes(v.location);
      if (postcodes.length > 0 && (!p.zipCode || !postcodes.includes(p.zipCode))) return false;
      return true;
    });
  }, [all, selectedFilter]);

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
      window.open(property.sourceUrl, '_blank');
      setDragX(0);
      setDragY(0);
      return;
    }

    if (action === 'analyse') {
      setShowAnalyseModal(true);
      setDragX(0);
      setDragY(0);
      return;
    }

    setLastAction(action);
    setCurrent(c => c + 1);
    setDragX(0);
    setDragY(0);
    setTimeout(() => setLastAction(null), 300);

    // Persist in the background
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
      // Horizontal swipe dominates
      if (dragX > 100) await handleAction('investigating');
      else if (dragX < -100) await handleAction('not_relevant');
      else { setDragX(0); setDragY(0); }
    } else {
      // Vertical swipe dominates
      if (dragY < -100) await handleAction('open');
      else if (dragY > 100) await handleAction('analyse');
      else { setDragX(0); setDragY(0); }
    }

    dragStart.current = null;
    setIsDragging(false);
  }

  // Overlay feedback during drag
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

  // Filter selection modal — shown on first open when saved filters exist
  if (showFilterModal && savedFilters.length > 0 && current === 0) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 max-w-sm w-full mx-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('filterModal.title')}</h2>
        <p className="text-sm text-gray-500 mb-5">
          {t('filterModal.subtitle')}
        </p>
        <div className="space-y-2 mb-5 max-h-48 overflow-y-auto">
          {savedFilters.map(sf => (
            <button
              key={sf.id}
              onClick={() => { setSelectedFilter(sf); setShowFilterModal(false); }}
              className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                selectedFilter?.id === sf.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-700'
              }`}
            >
              {sf.name}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setSelectedFilter(null); setShowFilterModal(false); }}
            className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {t('filterModal.iFeelLucky')}
          </button>
          {selectedFilter && (
            <button
              onClick={() => setShowFilterModal(false)}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {t('filterModal.applyFilter')}
            </button>
          )}
        </div>
      </div>
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

      {/* Active filter indicator */}
      {selectedFilter && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
            {selectedFilter.name}
          </span>
          <button
            onClick={() => { setSelectedFilter(null); setShowFilterModal(true); setCurrent(0); }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            {t('filterModal.changeFilter')}
          </button>
        </div>
      )}

      {/* Directions — single line at top */}
      <div className="flex gap-6 text-xs text-gray-400 text-center mb-4">
        <span>{t('directions.left')}</span>
        <span>{t('directions.up')}</span>
        <span>{t('directions.down')}</span>
        <span>{t('directions.right')}</span>
      </div>

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
              <img
                src={property.imageUrl}
                alt={property.title ?? ''}
                className="w-full h-full object-cover pointer-events-none"
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

      {/* Buttons */}
      <div className="flex gap-4 mt-5">
        <button
          onClick={() => handleAction('not_relevant')}
          title={t('buttons.notRelevantTitle')}
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-rose-500 font-bold text-lg hover:bg-rose-50 hover:border-rose-300 transition-colors shadow-sm flex items-center justify-center"
        >
          ✕
        </button>
        <button
          onClick={() => handleAction('analyse')}
          title={t('buttons.analyseTitle')}
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-amber-500 font-bold text-lg hover:bg-amber-50 hover:border-amber-300 transition-colors shadow-sm flex items-center justify-center"
        >
          🔍
        </button>
        <button
          onClick={() => handleAction('open')}
          title={t('buttons.openListingTitle')}
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-blue-500 font-bold text-lg hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-sm flex items-center justify-center"
        >
          ↗
        </button>
        <button
          onClick={() => handleAction('investigating')}
          title={t('buttons.investigatingTitle')}
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-emerald-600 font-bold text-lg hover:bg-emerald-50 hover:border-emerald-300 transition-colors shadow-sm flex items-center justify-center"
        >
          ✓
        </button>
      </div>

      {/* Progress count */}
      <div className="text-gray-400 text-xs mt-4">{t('progress', { current, total })}</div>

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
