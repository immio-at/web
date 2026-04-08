'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CardProperty {
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
  status?: string;
  listingStatus?: string;
  source: 'own' | 'scraped';
  scrapedListingId?: string;
}

export interface CardActions {
  onStageChange: (item: CardProperty, stage: string) => void;
  onAnalyse?: (item: CardProperty) => void;
  onReportDead?: (item: CardProperty) => void;
  onDismiss: (item: CardProperty) => void;
  onUrlClick?: (item: CardProperty) => void;
}

// ─── Stage mapping for i18n ──────────────────────────────────────────────────

const STAGE_I18N_KEY: Record<string, string> = {
  new: 'new', investigating: 'investigating', interested: 'interested',
  visit_booked: 'visitBooked', visited: 'visited', offer_made: 'offerMade',
  parked: 'parked', won: 'won',
};

const ASSIGNABLE_STAGES = [
  'investigating', 'interested', 'visit_booked', 'visited', 'offer_made', 'parked', 'won',
];

// ─── Platform labels ─────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  willhaben: 'Willhaben', immoscout24: 'ImmoScout24', immowelt: 'Immowelt',
  bazar: 'Bazar.at', immmo: 'immmo.at', raiffeisen: 'Raiffeisen',
  sreal: 's REAL', oerag: 'ÖRAG', remax: 'RE/MAX',
};

function formatPrice(price: number | null) {
  if (!price) return null;
  return '€ ' + Math.round(price).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatPricePerSqm(price: number | null, size: number | null) {
  if (!price || !size || size <= 0) return null;
  const ppsm = Math.round(price / size);
  return '€ ' + ppsm.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '/m²';
}

// ─── Card Component ──────────────────────────────────────────────────────────

export default function PropertyCard({
  item,
  actions,
  compact = false,
}: {
  item: CardProperty;
  actions: CardActions;
  compact?: boolean;
}) {
  const t = useTranslations('propertyCard');
  const tStages = useTranslations('funnel.stages');
  const [stageOpen, setStageOpen] = useState(false);

  const priceText = formatPrice(item.price);
  const ppsmText = !compact ? formatPricePerSqm(item.price, item.sizeSqm) : null;
  const isExpired = item.listingStatus === 'expired';
  const currentStage = item.status && STAGE_I18N_KEY[item.status]
    ? tStages(STAGE_I18N_KEY[item.status])
    : null;

  function handleLink() {
    actions.onUrlClick?.(item);
  }

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col ${compact ? 'w-48 flex-shrink-0' : ''} hover:shadow-md transition-shadow`}>
      {/* Image */}
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleLink}
        className={`block relative ${compact ? 'h-28' : 'h-48'} bg-gray-100 overflow-hidden flex-shrink-0`}
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.title ?? ''}
            className={`w-full h-full object-cover ${isExpired ? 'grayscale' : ''} ${!compact ? 'hover:scale-105 transition-transform duration-300' : ''}`}
            loading="lazy"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className={`flex items-center justify-center h-full ${compact ? 'text-2xl' : 'text-4xl'} text-gray-300`}>🏠</div>
        )}
        {/* Platform badge */}
        <span className={`absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
          item.source === 'own'
            ? 'bg-teal-50/90 text-teal-700 border-teal-200'
            : 'bg-white/90 text-gray-700 border-gray-200'
        }`}>
          {PLATFORM_LABELS[item.platform] ?? item.platform}
        </span>
        {/* Expired badge */}
        {isExpired && (
          <span className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50/90 text-amber-700 border border-amber-200">
            {t('expired')}
          </span>
        )}
      </a>

      {/* Details */}
      <div className={`${compact ? 'p-2' : 'p-3'} flex flex-col flex-grow`}>
        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={handleLink}>
          <h3 className={`font-medium text-gray-900 ${compact ? 'text-xs line-clamp-1' : 'text-sm line-clamp-2 hover:text-blue-600 transition-colors leading-snug'}`}>
            {item.title ?? '—'}
          </h3>
        </a>

        <div className={`${compact ? 'mt-0.5' : 'mt-1'} flex-grow`}>
          {priceText && (
            <div className={`font-semibold text-blue-600 ${compact ? 'text-xs' : 'text-lg'}`}>{priceText}</div>
          )}
          {ppsmText && <div className="text-xs text-gray-400">{ppsmText}</div>}
          {!compact && item.location && <div className="text-xs text-gray-500 mt-0.5">📍 {item.location}</div>}
          <div className={`flex items-center gap-2 ${compact ? 'text-[10px]' : 'text-xs'} text-gray-500 mt-0.5`}>
            {item.sizeSqm && <span>{Math.round(item.sizeSqm)}m²</span>}
            {item.rooms && <span>{item.rooms} Zi.</span>}
            {compact && item.zipCode && <span>{item.zipCode}</span>}
          </div>
          {/* Current stage indicator */}
          {currentStage && item.source === 'own' && item.status !== 'new' && (
            <div className="text-[10px] text-teal-600 font-medium mt-1">{currentStage}</div>
          )}
        </div>

        {/* Actions */}
        <div className={`${compact ? 'mt-1.5 pt-1.5' : 'mt-2 pt-2'} border-t border-gray-100`}>
          <div className="flex items-center gap-1">
            {/* Stage dropdown */}
            <div className="relative flex-1 min-w-0">
              <button
                onClick={() => setStageOpen(!stageOpen)}
                className={`w-full text-left ${compact ? 'text-[10px] px-1.5 py-1' : 'text-xs px-2 py-1.5'} font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors truncate`}
              >
                {item.source === 'own' && item.status !== 'new' ? t('moveToStage') : t('addToFunnel')} ▾
              </button>
              {stageOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setStageOpen(false)} />
                  <div className={`absolute bottom-full left-0 mb-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg ${compact ? 'w-36' : 'w-44'} py-1 max-h-48 overflow-y-auto`}>
                    {ASSIGNABLE_STAGES.map(stage => (
                      <button
                        key={stage}
                        onClick={() => { setStageOpen(false); actions.onStageChange(item, stage); }}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                          item.status === stage ? 'text-teal-600 font-semibold' : 'text-gray-700'
                        }`}
                      >
                        {tStages(STAGE_I18N_KEY[stage])}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Analyse */}
            {actions.onAnalyse && (
              <button
                onClick={() => actions.onAnalyse!(item)}
                title={t('analyse')}
                className={`${compact ? 'p-1 text-[10px]' : 'p-1.5 text-xs'} text-amber-600 hover:bg-amber-50 rounded border border-gray-200 transition-colors flex-shrink-0`}
              >
                🔍
              </button>
            )}

            {/* Report dead link */}
            {actions.onReportDead && item.source === 'own' && !isExpired && (
              <button
                onClick={() => actions.onReportDead!(item)}
                title={t('reportDead')}
                className={`${compact ? 'p-1 text-[10px]' : 'p-1.5 text-xs'} text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded border border-gray-200 transition-colors flex-shrink-0`}
              >
                ⚠
              </button>
            )}

            {/* Dismiss */}
            <button
              onClick={() => actions.onDismiss(item)}
              title={t('dismiss')}
              className={`${compact ? 'p-1 text-[10px]' : 'p-1.5 text-xs'} text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded border border-gray-200 transition-colors flex-shrink-0`}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
