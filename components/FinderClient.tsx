'use client';

import { useState, useRef } from 'react';
import { updateProperty } from '@/lib/api';
import { useProperties } from '@/hooks/useProperties';
import Link from 'next/link';

export default function FinderClient() {
  const { properties: all, loading } = useProperties();
  const properties = all.filter(p => p.status === 'new');

  const [current, setCurrent] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
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

    if (action === 'note') {
      setNote(property.notes || '');
      setShowNoteDialog(true);
      setDragX(0);
      setDragY(0);
      return;
    }

    setLastAction(action);
    await updateProperty(property.id, { status: action });
    setTimeout(() => {
      setCurrent(c => c + 1);
      setLastAction(null);
      setDragX(0);
      setDragY(0);
    }, 300);
  }

  async function saveNote() {
    if (!property) return;
    setSavingNote(true);
    await updateProperty(property.id, { notes: note });
    setSavingNote(false);
    setShowNoteDialog(false);
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
      if (dragX > 100) await handleAction('interested');
      else if (dragX < -100) await handleAction('not_relevant');
      else { setDragX(0); setDragY(0); }
    } else {
      // Vertical swipe dominates
      if (dragY < -100) await handleAction('open');
      else if (dragY > 100) await handleAction('note');
      else { setDragX(0); setDragY(0); }
    }

    dragStart.current = null;
    setIsDragging(false);
  }

  // Overlay feedback during drag
  const swipeIntent =
    Math.abs(dragX) > Math.abs(dragY)
      ? dragX > 50 ? 'interested' : dragX < -50 ? 'not_relevant' : null
      : dragY < -50 ? 'open' : dragY > 50 ? 'note' : null;

  const overlayConfig: Record<string, { bg: string; label: string }> = {
    interested:   { bg: 'bg-emerald-500', label: 'Interested' },
    not_relevant: { bg: 'bg-rose-500',    label: 'Not Relevant' },
    open:         { bg: 'bg-blue-500',    label: 'Open Listing' },
    note:         { bg: 'bg-amber-500',   label: 'Add Note' },
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
      <p className="text-gray-400">Loading properties...</p>
    </div>
  );

  if (current >= total) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center px-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">All caught up</h2>
        <p className="text-gray-500 mb-8">You've reviewed all {total} new properties</p>
        <Link
          href="/dashboard"
          className="bg-slate-700 text-white px-8 py-3 rounded-lg font-medium hover:bg-slate-800 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col items-center justify-start pt-4 px-4 pb-8 w-full">

      {/* Directions — single line at top */}
      <div className="flex gap-6 text-xs text-gray-400 text-center mb-4">
        <span>← Not Relevant</span>
        <span>↑ Open</span>
        <span>↓ Note</span>
        <span>→ Interested</span>
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
                {property.rooms && <span>{property.rooms} Zimmer</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-4 mt-5">
        <button
          onClick={() => handleAction('not_relevant')}
          title="Not Relevant"
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-rose-500 font-bold text-lg hover:bg-rose-50 hover:border-rose-300 transition-colors shadow-sm flex items-center justify-center"
        >
          ✕
        </button>
        <button
          onClick={() => handleAction('note')}
          title="Add Note"
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-amber-500 font-bold text-lg hover:bg-amber-50 hover:border-amber-300 transition-colors shadow-sm flex items-center justify-center"
        >
          ✎
        </button>
        <button
          onClick={() => handleAction('open')}
          title="Open Listing"
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-blue-500 font-bold text-lg hover:bg-blue-50 hover:border-blue-300 transition-colors shadow-sm flex items-center justify-center"
        >
          ↗
        </button>
        <button
          onClick={() => handleAction('interested')}
          title="Interested"
          className="w-14 h-14 rounded-full bg-white border border-gray-200 text-emerald-600 font-bold text-lg hover:bg-emerald-50 hover:border-emerald-300 transition-colors shadow-sm flex items-center justify-center"
        >
          ✓
        </button>
      </div>

      {/* Progress count */}
      <div className="text-gray-400 text-xs mt-4">{current} of {total} reviewed</div>

      {/* Note dialog */}
      {showNoteDialog && property && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-gray-900 text-lg mb-1">Add Note</h3>
            <p className="text-sm text-gray-500 mb-4 line-clamp-1">{property.title}</p>

            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Your notes, observations, or calculations..."
              rows={5}
              autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none mb-4"
            />

            <p className="text-xs text-gray-400 mb-4">
              ROI calculator coming soon — for now use this space to record your thoughts.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowNoteDialog(false)}
                className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveNote}
                disabled={savingNote}
                className="flex-1 bg-slate-700 text-white py-2 rounded-lg text-sm hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {savingNote ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
