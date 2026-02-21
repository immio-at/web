'use client';

import { useState, useRef } from 'react';
import { updateProperty } from '@/lib/api';
import { useProperties } from '@/hooks/useProperties';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function FinderClient() {
  const { properties: all, loading } = useProperties();
  const properties = all.filter(p => p.status === 'new');

  const [current, setCurrent] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const property = properties[current];
  const total = properties.length;

  async function handleAction(status: string) {
    if (!property) return;
    setLastAction(status);
    await updateProperty(property.id, { status });
    setTimeout(() => {
      setCurrent(c => c + 1);
      setLastAction(null);
      setDragX(0);
      setDragY(0);
    }, 300);
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
    if (dragX > 100) {
      await handleAction('interested');
    } else if (dragX < -100) {
      await handleAction('not_relevant');
    } else if (dragY < -100) {
      window.open(property.sourceUrl, '_blank');
      setDragX(0);
      setDragY(0);
    } else if (dragY > 100) {
      await handleAction('maybe');
    } else {
      setDragX(0);
      setDragY(0);
    }
    dragStart.current = null;
    setIsDragging(false);
  }

  const overlayColor =
    dragX > 50 ? 'bg-green-500' :
    dragX < -50 ? 'bg-red-500' :
    dragY < -50 ? 'bg-yellow-400' : null;

  const overlayLabel =
    dragX > 50 ? '✅ Interested' :
    dragX < -50 ? '❌ Not Relevant' :
    dragY < -50 ? '🤷‍♀️ Maybe' : null;

  const overlayOpacity = Math.min(
    Math.max(Math.abs(dragX), Math.abs(dragY)) / 150,
    0.85
  );

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-gray-400 text-lg">Loading properties...</div>
    </div>
  );

  if (current >= total) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-900 px-8">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-3xl font-bold mb-2">All caught up!</h2>
          <p className="text-gray-500 mb-8">You've reviewed all {total} properties</p>
          <Link
            href="/"
            className="bg-blue-600 text-white px-8 py-3 rounded-full font-medium hover:bg-blue-700 transition-colors"
          >
            View Your Lists
          </Link>
        </div>
      </div>
    );
  }

  const rawPrice = property.price ? parseFloat(String(property.price)) : null;
  const priceText = rawPrice
    ? '€ ' + Math.round(rawPrice).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : '';

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-4 px-4 pb-8 w-full">
      {/* Progress */}
      <div className="text-gray-500 text-sm mb-2">{current} of {total} reviewed</div>
      <div className="w-full max-w-sm bg-gray-200 rounded-full h-1 mb-6">
        <div
          className="bg-blue-500 h-1 rounded-full transition-all"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </div>

      {/* Card */}
      <div
        className="relative w-full max-w-sm mx-auto cursor-grab active:cursor-grabbing select-none"
        style={{
          transform: `translateX(${dragX}px) translateY(${dragY}px) rotate(${dragX * 0.05}deg)`,
          transition: isDragging ? 'none' : 'transform 0.3s ease',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* Drag overlay */}
        {overlayColor && overlayLabel && (
          <div
            className={`absolute inset-0 z-10 rounded-2xl ${overlayColor} flex items-center justify-center`}
            style={{ opacity: overlayOpacity }}
          >
            <span className="text-white text-3xl font-bold">{overlayLabel}</span>
          </div>
        )}

        {/* Action flash */}
        {lastAction && (
          <div className={`absolute inset-0 z-10 rounded-2xl flex items-center justify-center ${
            lastAction === 'interested' ? 'bg-green-500' :
            lastAction === 'not_relevant' ? 'bg-red-500' :
            'bg-yellow-400'
          }`}>
            <span className="text-white text-4xl font-bold">
              {lastAction === 'interested' ? '✅' :
               lastAction === 'not_relevant' ? '❌' : '🤷‍♀️'}
            </span>
          </div>
        )}

        <div className="bg-white rounded-2xl overflow-hidden shadow-2xl" style={{ width: '384px', maxWidth: '100%', margin: '0 auto' }}>
          {/* Image */}
          <div className="relative w-full bg-gray-200" style={{ height: '288px' }}>
            {property.imageUrl ? (
              <img
                src={property.imageUrl}
                alt={property.title}
                className="w-full h-full object-cover pointer-events-none"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <span className="text-6xl">🏠</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="p-5">
            <h2 className="font-bold text-gray-900 text-lg mb-3 line-clamp-2">
              {property.title}
            </h2>
            <div className="space-y-1 text-sm text-gray-600">
              {priceText && (
                <div className="text-2xl font-bold text-blue-600">{priceText}</div>
              )}
              {property.location && <div>📍 {property.location}</div>}
              <div className="flex gap-4">
                {property.sizeSqm && <span>📏 {property.sizeSqm}m²</span>}
                {property.rooms && <span>🏠 {property.rooms} Zimmer</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hint */}
      <p className="text-gray-400 text-xs mt-4 mb-6">
        Drag ← ❌ · → ✅ · ↑ 🔗 Open listing · ↓ 🤷‍♀️ Maybe · or use buttons below
      </p>

      {/* Buttons */}
      <div className="flex gap-6">
        <button
          onClick={() => handleAction('not_relevant')}
          className="w-16 h-16 rounded-full bg-white border-2 border-red-500 text-2xl hover:bg-red-500 transition-colors flex items-center justify-center"
        >
          ❌
        </button>
        <button
          onClick={() => handleAction('maybe')}
          className="w-16 h-16 rounded-full bg-white border-2 border-yellow-400 text-2xl hover:bg-yellow-400 transition-colors flex items-center justify-center"
        >
          🤷‍♀️
        </button>
        <button
          onClick={() => handleAction('interested')}
          className="w-16 h-16 rounded-full bg-white border-2 border-green-500 text-2xl hover:bg-green-500 transition-colors flex items-center justify-center"
        >
          ✅
        </button>
      </div>
    </div>
  );
}