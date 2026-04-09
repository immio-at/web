'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Property, getScrapedListings, ScrapedListing } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { deriveCriteria, getRecommendedOwn, scoreProperty, type DerivedCriteria } from '@/lib/recommendations';
import PropertyCard, { type CardProperty, type CardActions } from '@/components/PropertyCard';
import { useProperties } from '@/hooks/useProperties';
import { trackInteraction } from '@/hooks/useInteractionTracker';
import { useRef } from 'react';

// ─── Module-level cache ──────────────────────────────────────────────────────
let recommendedCache: CardProperty[] | null = null;

function propertyToCard(p: Property): CardProperty {
  return {
    id: p.id,
    title: p.title,
    price: p.price,
    sizeSqm: p.sizeSqm,
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

function scrapedToCard(s: ScrapedListing): CardProperty {
  return {
    id: s.id,
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
  };
}

// Score a scraped listing using a Property-like shape
function scoreScraped(s: ScrapedListing, criteria: DerivedCriteria): number {
  // Build a minimal Property-like shape for the scorer
  const proxy = {
    price: s.price ? parseFloat(String(s.price)) : null,
    pricePerSqm: s.price && s.sizeSqm && parseFloat(String(s.sizeSqm)) > 0
      ? parseFloat(String(s.price)) / parseFloat(String(s.sizeSqm))
      : null,
    sizeSqm: s.sizeSqm ? Math.round(parseFloat(String(s.sizeSqm))) : null,
    zipCode: s.zipCode,
  } as Property;
  return scoreProperty(proxy, criteria);
}

export default function RecommendedCarousel({
  properties,
  actions,
}: {
  properties: Property[];
  actions: CardActions;
}) {
  const t = useTranslations('dashboard.carousels');
  const { session, loading: authLoading } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Derive criteria from funnel properties
  const criteria = useMemo(() => deriveCriteria(properties), [properties]);

  // Own property recommendations (instant from cache)
  const ownRecommended = useMemo(() => {
    if (!criteria) return [];
    return getRecommendedOwn(properties, criteria, 10);
  }, [properties, criteria]);

  // Scraped recommendations (secondary async load)
  const [scrapedRecommended, setScrapedRecommended] = useState<CardProperty[]>([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!criteria || authLoading || !session || fetchedRef.current) return;
    if (recommendedCache) { setScrapedRecommended(recommendedCache); return; }
    fetchedRef.current = true;

    // Build query from criteria — use postcodes + price range
    const postcodes = Array.from(criteria.postcodes);
    const params: Record<string, unknown> = {
      page: 1,
      hideNullPrice: true,
      ...(postcodes.length > 0 && { postcodes }),
      ...(criteria.priceMin !== null && { minPrice: criteria.priceMin * 0.8 }),
      ...(criteria.priceMax !== null && { maxPrice: criteria.priceMax * 1.2 }),
    };

    getScrapedListings(params as any)
      .then(data => {
        // Score and sort
        const scored = data.data
          .map(s => ({ card: scrapedToCard(s), score: scoreScraped(s, criteria) }))
          .filter(r => r.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 15)
          .map(r => r.card);
        recommendedCache = scored;
        setScrapedRecommended(scored);
      })
      .catch(() => {});
  }, [criteria, authLoading, session]);

  // Merge own + scraped, deduplicate by sourceUrl, limit 20
  const recommended = useMemo(() => {
    const ownCards = ownRecommended.map(propertyToCard);
    const ownUrls = new Set(ownCards.map(c => c.sourceUrl));
    const dedupedScraped = scrapedRecommended.filter(c => !ownUrls.has(c.sourceUrl));
    return [...ownCards, ...dedupedScraped].slice(0, 20);
  }, [ownRecommended, scrapedRecommended]);

  function scroll(direction: 'left' | 'right') {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  }

  // Locked state — fewer than 5 funnel properties
  if (!criteria) {
    return (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('recommended')}</h3>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-6 py-8 text-center">
          <p className="text-sm text-gray-400">{t('recommendedLocked')}</p>
        </div>
      </div>
    );
  }

  if (recommended.length === 0) {
    return (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('recommended')}</h3>
        <p className="text-sm text-gray-400">{t('recommendedEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{t('recommended')}</h3>
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
        {recommended.map(card => (
          <PropertyCard key={card.id} item={card} actions={actions} compact />
        ))}
      </div>
    </div>
  );
}
