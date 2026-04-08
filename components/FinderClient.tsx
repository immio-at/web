'use client';

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useProperties, invalidateCache } from '@/hooks/useProperties';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { Property, getScrapedListings, saveScrapedListing, ScrapedListing } from '@/lib/api';
import { trackInteraction } from '@/hooks/useInteractionTracker';
import { useAuth } from '@/context/AuthContext';
import PresetFilters from '@/components/PresetFilters';
import { type PresetFilterKey, passesPresetFilters, passesSavedFilters } from '@/lib/preset-filters';
import { type BundeslandAbbreviation, getPostcodesByBundesland } from '@/lib/austria-plz-bundesland';
import Link from 'next/link';

const PropertyAnalysisModal = dynamic(
  () => import('@/components/PropertyAnalysisModal'),
  { ssr: false },
);

// ─── Unified card type for Finder ────────────────────────────────────────────

interface FinderCard {
  id: string;
  title: string | null;
  price: number | null;
  sizeSqm: number | null;
  rooms: number | null;
  location: string | null;
  zipCode: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  platform: string;
  source: 'own' | 'scraped';
  // For own properties — needed for update/track
  propertyId?: string;
  // For scraped — needed for save
  scrapedListingId?: string;
  // For preset filters
  emailReceivedAt?: string | null;
  createdAt?: string;
  firstSeenAt?: string;
}

function propertyToCard(p: Property): FinderCard {
  return {
    id: `prop-${p.id}`,
    title: p.title,
    price: p.price,
    sizeSqm: p.sizeSqm,
    rooms: p.rooms ? parseFloat(String(p.rooms)) : null,
    location: p.location,
    zipCode: p.zipCode,
    imageUrl: p.imageUrl,
    sourceUrl: p.sourceUrl,
    platform: p.platform,
    source: 'own',
    propertyId: p.id,
    emailReceivedAt: p.emailReceivedAt,
    createdAt: p.createdAt,
  };
}

function scrapedToCard(s: ScrapedListing): FinderCard {
  return {
    id: `scraped-${s.id}`,
    title: s.title,
    price: s.price ? parseFloat(String(s.price)) : null,
    sizeSqm: s.sizeSqm ? parseFloat(String(s.sizeSqm)) : null,
    rooms: s.rooms ? parseFloat(String(s.rooms)) : null,
    location: s.location,
    zipCode: s.zipCode,
    imageUrl: s.imageUrl,
    sourceUrl: s.sourceUrl,
    platform: s.platform,
    source: 'scraped',
    scrapedListingId: s.id,
    firstSeenAt: s.firstSeenAt,
  };
}

// Platform display names
const PLATFORM_LABELS: Record<string, string> = {
  willhaben: 'Willhaben', immoscout24: 'ImmoScout24', immowelt: 'Immowelt',
  bazar: 'Bazar.at', immmo: 'immmo.at', raiffeisen: 'Raiffeisen',
  sreal: 's REAL', oerag: 'ÖRAG', remax: 'RE/MAX',
};

// ─── Component ───────────────────────────────────────────────────────────────

const STATE_KEYS: BundeslandAbbreviation[] = ['W', 'NÖ', 'OÖ', 'ST', 'K', 'S', 'T', 'V', 'B'];

export default function FinderClient({
  initialPresets,
  initialSavedFilterIds,
}: {
  initialPresets?: Set<PresetFilterKey>;
  initialSavedFilterIds?: Set<string>;
} = {}) {
  const t = useTranslations('finder');
  const { session, loading: authLoading } = useAuth();
  const { properties: allOwn, loading: propsLoading, update } = useProperties();
  const { filters: savedFilters } = useSavedFilters();
  const [activePresets, setActivePresets] = useState<Set<PresetFilterKey>>(initialPresets ?? new Set());
  const [activeSavedFilterIds, setActiveSavedFilterIds] = useState<Set<string>>(initialSavedFilterIds ?? new Set());

  // Scraped listings state
  const [scrapedCards, setScrapedCards] = useState<FinderCard[]>([]);
  const [scrapedLoading, setScrapedLoading] = useState(true);

  function toggleSavedFilter(id: string) {
    setActiveSavedFilterIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Resolve state presets to postcodes for server-side filtering
  const presetPostcodes = useMemo(() => {
    const activeStates = STATE_KEYS.filter(k => activePresets.has(k));
    if (activeStates.length === 0) return [];
    return activeStates.flatMap(abbr => getPostcodesByBundesland(abbr) ?? []);
  }, [activePresets]);

  // Fetch scraped listings — re-fetches when state presets change
  const fetchScraped = useCallback(async () => {
    if (authLoading || !session) return;
    try {
      setScrapedLoading(true);
      const params: Record<string, unknown> = { page: 1, hideNullPrice: true };
      if (presetPostcodes.length > 0) {
        params.postcodes = presetPostcodes;
      }
      // Fetch multiple pages to have a decent card stack
      const data = await getScrapedListings(params as any);
      setScrapedCards(data.data.map(scrapedToCard));
    } catch {
      setScrapedCards([]);
    } finally {
      setScrapedLoading(false);
    }
  }, [authLoading, session, presetPostcodes]);

  useEffect(() => { fetchScraped(); }, [fetchScraped]);

  // Track which scraped cards the user has dismissed or saved (by id)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  // Merge own properties (status new) + scraped listings, apply filters
  const cards = useMemo(() => {
    // Own properties with status 'new'
    const ownCards = allOwn
      .filter(p => p.status === 'new')
      .map(propertyToCard);

    // Exclude scraped listings already saved by user (by sourceUrl)
    const ownSourceUrls = new Set(allOwn.map(p => p.sourceUrl));
    const filteredScraped = scrapedCards.filter(
      s => !ownSourceUrls.has(s.sourceUrl) && !dismissedIds.has(s.id)
    );

    // Own cards first, then scraped
    let merged = [...ownCards, ...filteredScraped];

    // Apply preset filters (client-side: searchAgents, time)
    if (activePresets.size > 0) {
      merged = merged.filter(c => passesPresetFilters(c, activePresets));
    }

    // Apply saved filter pills
    if (activeSavedFilterIds.size > 0) {
      merged = merged.filter(c => passesSavedFilters(c, savedFilters, activeSavedFilterIds));
    }

    return merged;
  }, [allOwn, scrapedCards, dismissedIds, activePresets, activeSavedFilterIds, savedFilters]);

  const [current, setCurrent] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [showAnalyseModal, setShowAnalyseModal] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  // Reset card index when filters change
  useEffect(() => { setCurrent(0); }, [activePresets, activeSavedFilterIds]);

  const card = cards[current];
  const total = cards.length;

  async function handleAction(action: string) {
    if (!card) return;

    if (action === 'open') {
      if (card.propertyId) trackInteraction(card.propertyId, 'url_click');
      window.open(card.sourceUrl, '_blank');
      setDragX(0);
      setDragY(0);
      return;
    }

    if (action === 'analyse') {
      if (card.propertyId) trackInteraction(card.propertyId, 'analysis');
      setShowAnalyseModal(true);
      setDragX(0);
      setDragY(0);
      return;
    }

    // Swipe right (investigating) or left (not_relevant)
    setLastAction(action);
    setDragX(0);
    setDragY(0);
    setTimeout(() => setLastAction(null), 300);

    if (card.source === 'own' && card.propertyId) {
      // Own property — update status
      if (action !== 'not_relevant') trackInteraction(card.propertyId, 'status_change');
      setCurrent(c => c + 1);
      update(card.propertyId, {
        status: action === 'interested' ? 'investigating' : action,
        movedToStageAt: new Date().toISOString(),
      });
    } else if (card.source === 'scraped' && card.scrapedListingId) {
      if (action === 'investigating') {
        // Scraped — save to funnel
        setCurrent(c => c + 1);
        try {
          await saveScrapedListing(card.scrapedListingId);
          invalidateCache();
        } catch {
          // 409 = already saved, ignore
        }
      } else {
        // Scraped — dismiss (skip, don't save)
        setDismissedIds(prev => new Set(prev).add(card.id));
        setCurrent(c => c + 1);
      }
    }
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
    investigating:  { bg: 'bg-emerald-500', label: card?.source === 'scraped' ? t('overlay.save') : t('overlay.investigating') },
    not_relevant:   { bg: 'bg-rose-500',    label: card?.source === 'scraped' ? t('overlay.skip') : t('overlay.notRelevant') },
    open:           { bg: 'bg-blue-500',    label: t('overlay.openListing') },
    analyse:        { bg: 'bg-amber-500',   label: t('overlay.analyse') },
  };

  const overlayOpacity = Math.min(
    Math.max(Math.abs(dragX), Math.abs(dragY)) / 150,
    0.85
  );

  const rawPrice = card?.price ? parseFloat(String(card.price)) : null;
  const priceText = rawPrice
    ? '€ ' + Math.round(rawPrice).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : '';

  const loading = propsLoading || scrapedLoading;

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-gray-400">{t('loading')}</p>
    </div>
  );

  const allReviewed = current >= total;

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-4 px-4 pb-8 w-full">

      {/* Preset + saved filter pills — always visible */}
      <PresetFilters
        active={activePresets}
        onChange={setActivePresets}
        savedFilters={savedFilters}
        activeSavedFilterIds={activeSavedFilterIds}
        onToggleSavedFilter={toggleSavedFilter}
      />

      {allReviewed ? (
        <div className="flex-1 flex items-center justify-center w-full">
          <div className="text-center px-8 max-w-md">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('allCaughtUp.title')}</h2>
            <p className="text-gray-500 mb-2">{t('allCaughtUp.subtitle', { total })}</p>
            <p className="text-sm text-gray-400 mb-8">{t('allCaughtUp.widenHint')}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => { setCurrent(0); setDismissedIds(new Set()); }}
                className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('allCaughtUp.startOver')}
              </button>
              <Link
                href="/dashboard"
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-gray-700 text-sm font-medium rounded-lg transition-colors text-center"
              >
                {t('allCaughtUp.backToDashboard')}
              </Link>
              <Link
                href="/funnel"
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-gray-700 text-sm font-medium rounded-lg transition-colors text-center"
              >
                {t('allCaughtUp.goToFunnel')}
              </Link>
            </div>
          </div>
        </div>
      ) : (
      <>
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
            {card.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.imageUrl}
                alt={card.title ?? ''}
                width={400}
                height={288}
                className="w-full h-full object-cover pointer-events-none"
                loading="eager"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-300 text-5xl">🏠</div>
            )}
            {/* Source badge */}
            <span className={`absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              card.source === 'own'
                ? 'bg-teal-50/90 text-teal-700 border-teal-200'
                : 'bg-white/90 text-gray-700 border-gray-200'
            }`}>
              {PLATFORM_LABELS[card.platform] ?? card.platform}
            </span>
          </div>

          {/* Details */}
          <div className="p-5">
            <h2 className="font-bold text-gray-900 text-lg mb-3 line-clamp-2">
              {card.title}
            </h2>
            <div className="space-y-1 text-sm text-gray-600">
              {priceText && (
                <div className="text-2xl font-bold text-blue-600 mb-1">{priceText}</div>
              )}
              {card.location && (
                <div className="text-gray-500">📍 {card.location}</div>
              )}
              <div className="flex gap-4 text-gray-500">
                {card.sizeSqm && <span>{Math.round(card.sizeSqm)} m²</span>}
                {card.rooms && <span>{card.rooms} {t('rooms')}</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-4 mt-5">
        <button
          onClick={() => handleAction('not_relevant')}
          title={card.source === 'scraped' ? t('buttons.skipTitle') : t('buttons.notRelevantTitle')}
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
          title={card.source === 'scraped' ? t('buttons.saveTitle') : t('buttons.investigatingTitle')}
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-emerald-600 font-bold text-lg hover:bg-emerald-50 hover:border-emerald-300 transition-colors shadow-sm flex items-center justify-center"
        >
          {card.source === 'scraped' ? '＋' : '✓'}
        </button>
      </div>

      {/* Directions */}
      <div className="flex gap-6 text-xs text-gray-400 text-center mt-3">
        <span>{card.source === 'scraped' ? t('directions.leftScraped') : t('directions.left')}</span>
        <span>{t('directions.up')}</span>
        <span>{t('directions.down')}</span>
        <span>{card.source === 'scraped' ? t('directions.rightScraped') : t('directions.right')}</span>
      </div>

      {/* Progress count */}
      <div className="text-gray-400 text-xs mt-2">{t('progress', { current: current + 1, total })}</div>

      {/* Analyse modal — only for own properties */}
      {showAnalyseModal && card?.source === 'own' && card.propertyId && (
        <PropertyAnalysisModal
          property={allOwn.find(p => p.id === card.propertyId)!}
          onClose={() => setShowAnalyseModal(false)}
        />
      )}
      </>
      )}
    </div>
  );
}
