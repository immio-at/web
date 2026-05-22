'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { UserListing, getScrapedListings, Listing } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { deriveCriteria, scoreProperty, type DerivedCriteria } from '@/lib/recommendations';
import PropertyCard, { type CardProperty, type CardActions } from '@/components/PropertyCard';
import { useProperties } from '@/hooks/useProperties';
import { trackInteraction } from '@/hooks/useInteractionTracker';
import { useRef } from 'react';

// ─── Module-level cache ──────────────────────────────────────────────────────
type ScoredCard = { card: CardProperty; score: number; sourceUrl: string };
let recommendedCache: ScoredCard[] | null = null;

export function clearRecommendedCache(): void {
  recommendedCache = null;
}

function propertyToCard(p: UserListing): CardProperty {
  // Prisma serializes Decimal columns as strings — coerce so any downstream
  // sort/compare op behaves numerically.
  return {
    id: p.id,
    title: p.title,
    price: p.price != null ? parseFloat(String(p.price)) : null,
    sizeSqm: p.sizeSqm != null ? parseFloat(String(p.sizeSqm)) : null,
    rooms: p.rooms != null ? parseFloat(String(p.rooms)) : null,
    location: p.location,
    zipCode: p.zipCode,
    imageUrl: p.imageUrl,
    sourceUrl: p.sourceUrl,
    platform: p.platform,
    status: p.status,
    listingStatus: p.listingStatus,
    source: 'own',
    emailReceivedAt: p.emailReceivedAt,
    analysisCount: p.analysisCount ?? 0,
    documentCount: p.documentCount ?? 0,
  };
}

function scrapedToCard(s: Listing): CardProperty {
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

// Score a scraped listing using a UserListing-like shape
function scoreScraped(s: Listing, criteria: DerivedCriteria): number {
  // Build a minimal UserListing-like shape for the scorer
  const proxy = {
    price: s.price ? parseFloat(String(s.price)) : null,
    pricePerSqm: s.price && s.sizeSqm && parseFloat(String(s.sizeSqm)) > 0
      ? parseFloat(String(s.price)) / parseFloat(String(s.sizeSqm))
      : null,
    sizeSqm: s.sizeSqm ? Math.round(parseFloat(String(s.sizeSqm))) : null,
    zipCode: s.zipCode,
  } as UserListing;
  return scoreProperty(proxy, criteria);
}

export default function RecommendedCarousel({
  properties,
  actions,
  firstCardTourId,
}: {
  properties: UserListing[];
  actions: CardActions;
  /** ADR-021 HH8 — `data-tour-id` for the first rendered card. */
  firstCardTourId?: string;
}) {
  const t = useTranslations('dashboard.carousels');
  const { session, loading: authLoading } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Derive criteria from funnel properties
  const criteria = useMemo(() => deriveCriteria(properties), [properties]);

  // Own property scores (instant from cache). Keep scores so we can rank
  // own + scraped together below — the user wants a single ranked list,
  // not own-first-then-scraped.
  const ownScored = useMemo<ScoredCard[]>(() => {
    if (!criteria) return [];
    return properties
      .filter(p => p.status === 'new')
      .map(p => ({ card: propertyToCard(p), score: scoreProperty(p, criteria), sourceUrl: p.sourceUrl }))
      .filter(r => r.score > 0);
  }, [properties, criteria]);

  // Scraped recommendations (secondary async load) — also kept with scores.
  const [scrapedScored, setScrapedScored] = useState<ScoredCard[]>([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!criteria || authLoading || !session || fetchedRef.current) return;
    if (recommendedCache) { setScrapedScored(recommendedCache); return; }
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
        const scored = data.data
          .map(s => ({ card: scrapedToCard(s), score: scoreScraped(s, criteria), sourceUrl: s.sourceUrl }))
          .filter(r => r.score > 0);
        recommendedCache = scored;
        setScrapedScored(scored);
      })
      .catch(() => {});
    // session?.user?.id is stable across token refresh — using `session`
    // would re-evaluate (and re-fetch) on every focus-time refresh.
  }, [criteria, authLoading, session?.user?.id]);

  // Mix own + scraped, rank by score, dedupe by sourceUrl (own wins ties since
  // it's already in the funnel — keeps the existing record in view).
  const recommended = useMemo(() => {
    const seen = new Set<string>();
    return [...ownScored, ...scrapedScored]
      .sort((a, b) => b.score - a.score)
      .filter(r => {
        if (seen.has(r.sourceUrl)) return false;
        seen.add(r.sourceUrl);
        return true;
      })
      .slice(0, 20)
      .map(r => r.card);
  }, [ownScored, scrapedScored]);

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
        {recommended.map((card, i) => (
          <PropertyCard
            key={card.id}
            item={card}
            actions={actions}
            compact
            dataTourId={i === 0 ? firstCardTourId : undefined}
          />
        ))}
      </div>
    </div>
  );
}
