'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Property } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PropertyCardProps {
  property: Property;
}

export default function PropertyCard({ property }: PropertyCardProps) {
  const [status, setStatus] = useState(property.status);
  const [loading, setLoading] = useState(false);

  const rawPrice = property.price ? parseFloat(String(property.price)) : null;
  const priceText = rawPrice
    ? '€ ' + Math.round(rawPrice).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : '';
  const dateText = new Date(property.emailReceivedAt).toLocaleDateString('de-AT');

  async function updateStatus(newStatus: string) {
    if (loading) return;
    setLoading(true);
    try {
      await fetch(`${API_URL}/properties/${property.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      setStatus(newStatus);
    } catch (e) {
      console.error('Failed to update status', e);
    } finally {
      setLoading(false);
    }
  }

  const borderColor = {
    interested: 'border-green-400',
    maybe: 'border-yellow-400',
    not_relevant: 'border-red-400',
    new: 'border-transparent',
  }[status] || 'border-transparent';

  const opacity = status === 'not_relevant' ? 'opacity-50' : 'opacity-100';

  return (
    <div className={`bg-white rounded-lg shadow-sm border-4 ${borderColor} ${opacity} transition-all duration-300`}>
      {/* Status Badge */}
      {status !== 'new' && (
        <div className={`px-3 py-1 text-xs font-bold ${
          status === 'interested' ? 'bg-green-500 text-white' :
          status === 'maybe' ? 'bg-yellow-400 text-white' :
          'bg-red-500 text-white'
        }`}>
          {status === 'interested' ? '✅ Interested' :
           status === 'maybe' ? '🤷‍♀️ Maybe' :
           '❌ Not Relevant'}
        </div>
      )}

      {/* Image */}
      <a href={property.sourceUrl} target="_blank" rel="noopener noreferrer">
        <div className="relative h-48 overflow-hidden bg-gray-200">
          {property.imageUrl ? (
            <Image
              src={property.imageUrl}
              alt={property.title}
              fill
              className="object-cover hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <span className="text-gray-400 text-4xl">🏠</span>
            </div>
          )}
        </div>
      </a>

      {/* Details */}
      <div className="p-4">
        <a href={property.sourceUrl} target="_blank" rel="noopener noreferrer">
          <h3 className="font-semibold text-gray-900 mb-2 hover:text-blue-600 transition-colors">
            {property.title}
          </h3>
        </a>

        <div className="space-y-1 text-sm text-gray-600 mb-4">
          {priceText && (
            <div className="font-semibold text-lg text-blue-600">{priceText}</div>
          )}
          {property.location && <div>📍 {property.location}</div>}
          <div className="flex items-center gap-4">
            {property.sizeSqm && <span>📏 {property.sizeSqm}m²</span>}
            {property.rooms && <span>🏠 {property.rooms} Zimmer</span>}
          </div>
          <div className="text-xs text-gray-400">{dateText}</div>
        </div>

        {/* Status Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => updateStatus('interested')}
            disabled={loading}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              status === 'interested'
                ? 'bg-green-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-green-100'
            }`}
          >
            ✅
          </button>
          <button
            onClick={() => updateStatus('maybe')}
            disabled={loading}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              status === 'maybe'
                ? 'bg-yellow-400 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-yellow-100'
            }`}
          >
            🤷‍♀️
          </button>
          <button
            onClick={() => updateStatus('not_relevant')}
            disabled={loading}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              status === 'not_relevant'
                ? 'bg-red-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-red-100'
            }`}
          >
            ❌
          </button>
        </div>
      </div>
    </div>
  );
}
