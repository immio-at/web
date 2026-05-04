'use client';

import { useRef } from 'react';
import PropertyCard, { type CardProperty, type CardActions } from '@/components/PropertyCard';

export default function PropertyCarousel({
  title,
  cards,
  emptyMessage,
  actions,
}: {
  title: string;
  cards: CardProperty[];
  emptyMessage?: string;
  actions: CardActions;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(direction: 'left' | 'right') {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.75;
    scrollRef.current.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' });
  }

  if (cards.length === 0 && emptyMessage) {
    return (
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">{title}</h3>
        <p className="text-sm text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  if (cards.length === 0) return null;

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
        {cards.map(c => (
          <PropertyCard key={c.id} item={c} actions={actions} compact />
        ))}
      </div>
    </div>
  );
}
