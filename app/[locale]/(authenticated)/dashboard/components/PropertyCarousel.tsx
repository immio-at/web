'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Property } from '@/lib/api';

type InteractionFn = (id: string, type?: 'view' | 'analysis' | 'url_click' | 'status_change') => void;

export default function PropertyCarousel({
  title,
  properties,
  emptyMessage,
  onInteraction,
  onAnalyse,
}: {
  title: string;
  properties: Property[];
  emptyMessage?: string;
  onInteraction?: InteractionFn;
  onAnalyse?: (p: Property) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(direction: 'left' | 'right') {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  }

  if (properties.length === 0 && emptyMessage) {
    return (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
        <p className="text-sm text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  if (properties.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
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
        {properties.map(p => (
          <CarouselCard key={p.id} property={p} onInteraction={onInteraction} onAnalyse={onAnalyse} />
        ))}
      </div>
    </div>
  );
}

function CarouselCard({ property, onInteraction, onAnalyse }: {
  property: Property;
  onInteraction?: InteractionFn;
  onAnalyse?: (p: Property) => void;
}) {
  const t = useTranslations('dashboard.carousels');
  const rawPrice = property.price ? parseFloat(String(property.price)) : null;
  const priceText = rawPrice
    ? '€ ' + Math.round(rawPrice).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : '';
  const isExpired = property.listingStatus === 'expired';

  return (
    <div className="flex-shrink-0 w-48 bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      <a
        href={property.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onInteraction?.(property.id, 'url_click')}
      >
        <div className="relative h-28 bg-gray-100">
          {property.imageUrl ? (
            <img
              src={property.imageUrl}
              alt={property.title ?? ''}
              className={`w-full h-full object-cover ${isExpired ? 'grayscale' : ''}`}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-2xl text-gray-300">🏠</div>
          )}
        </div>
      </a>
      <div className="p-2">
        <p className="text-xs font-medium text-gray-900 line-clamp-1">{property.title ?? '—'}</p>
        {priceText && <p className="text-xs font-semibold text-blue-600 mt-0.5">{priceText}</p>}
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500">
          {property.sizeSqm && <span>{property.sizeSqm}m²</span>}
          {property.rooms && <span>{property.rooms} Zi.</span>}
          {property.zipCode && <span>{property.zipCode}</span>}
        </div>
        {onAnalyse && (
          <button
            onClick={() => onAnalyse(property)}
            className="mt-1.5 w-full text-[10px] text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded py-1 transition-colors"
          >
            🔍 {t('analyse')}
          </button>
        )}
      </div>
    </div>
  );
}
