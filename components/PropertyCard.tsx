'use client';

import { useEffect, useState } from 'react';
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
  emailReceivedAt?: string | null;
  savedByUser?: boolean;
}

export interface CardActions {
  onSaveToFunnel?: (item: CardProperty) => void | Promise<void>;
  /**
   * Own-card override. When provided, clicking the heart on an own
   * property fires this callback instead of being a no-op. Used by the
   * Funnel to open a stage-picker dropdown anchored to the heart.
   */
  onMoveStage?: (item: CardProperty, anchor: DOMRect) => void;
  onAnalyse?: (item: CardProperty) => void;
  onReportDead?: (item: CardProperty) => void;
  onDismiss: (item: CardProperty) => void;
  onUrlClick?: (item: CardProperty) => void;
}

// ─── Stage mapping for i18n ──────────────────────────────────────────────────

const STAGE_I18N_KEY: Record<string, string> = {
  new: 'new', investigating: 'investigating', interested: 'interested',
  due_diligence: 'dueDiligence', offer_made: 'offerMade',
  parked: 'parked', won: 'won',
};

// ─── Platform labels ─────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  willhaben: 'Willhaben', immoscout24: 'ImmoScout24', immowelt: 'Immowelt',
  bazar: 'Bazar.at', immmo: 'immmo.at', raiffeisen: 'Raiffeisen',
  sreal: 's REAL', oerag: 'ÖRAG', remax: 'RE/MAX',
  'exposé_upload': 'Exposé',
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
  fullWidth = false,
  draggable,
}: {
  item: CardProperty;
  actions: CardActions;
  compact?: boolean;
  /** Use 100% width of the parent instead of the default fixed w-48 (compact). */
  fullWidth?: boolean;
  /** When set, the card root becomes draggable (used by the Funnel kanban). */
  draggable?: {
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
}) {
  const t = useTranslations('propertyCard');
  const tStages = useTranslations('funnel.stages');

  // Scraped heart optimistic fill. Reset when the rendered item changes so
  // Finder / Discover callers that reuse the component across swipes don't
  // inherit the previous card's filled state.
  const [scrapedSaved, setScrapedSaved] = useState<boolean>(!!item.savedByUser);
  useEffect(() => {
    setScrapedSaved(!!item.savedByUser);
  }, [item.id, item.savedByUser]);

  const priceText = formatPrice(item.price);
  const ppsmText = !compact ? formatPricePerSqm(item.price, item.sizeSqm) : null;
  const isExpired = item.listingStatus === 'expired';
  const currentStageLabel = item.status && STAGE_I18N_KEY[item.status]
    ? tStages(STAGE_I18N_KEY[item.status])
    : null;

  function handleLink() {
    actions.onUrlClick?.(item);
  }

  // Heart state + behaviour
  const isOwn = item.source === 'own';
  const heartFilled = isOwn || scrapedSaved;
  const ownCanMoveStage = isOwn && !!actions.onMoveStage;
  const heartTooltip = isOwn
    ? (ownCanMoveStage
        ? (currentStageLabel ? t('changeStageFrom', { stage: currentStageLabel }) : t('changeStage'))
        : (currentStageLabel
            ? t('alreadyInFunnelWithStage', { stage: currentStageLabel })
            : t('alreadyInFunnel')))
    : (scrapedSaved ? t('alreadyInFunnel') : t('saveToFunnel'));

  async function handleHeart(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (ownCanMoveStage) {
      actions.onMoveStage!(item, e.currentTarget.getBoundingClientRect());
      return;
    }
    if (isOwn || scrapedSaved) return;
    setScrapedSaved(true);
    try {
      await actions.onSaveToFunnel?.(item);
    } catch {
      setScrapedSaved(false);
    }
  }

  // Button styling shared by the right-side action stack. Scales down in
  // compact (Dashboard carousels) so buttons stay proportional to the
  // smaller card chrome and the top action clears the heart on hover.
  const actionBtn = `${
    compact ? 'w-6 h-6 text-[10px]' : 'p-1.5 text-xs'
  } inline-flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-full border border-gray-200 shadow-sm transition-all flex-shrink-0`;

  const widthClass = compact
    ? (fullWidth ? 'w-full' : 'w-48 flex-shrink-0')
    : '';
  const draggableProps = draggable
    ? {
        draggable: true,
        onDragStart: draggable.onDragStart,
        onDragEnd: draggable.onDragEnd,
      }
    : {};

  return (
    <div
      {...draggableProps}
      className={`bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col ${widthClass} hover:shadow-md transition-shadow ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Image */}
      <a
        href={item.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleLink}
        className={`group block relative ${compact ? 'h-[7.7rem]' : 'h-[13.2rem]'} bg-gray-100 overflow-hidden flex-shrink-0`}
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt={item.title ?? ''}
            className={`w-full h-full object-cover ${isExpired ? 'grayscale' : ''} ${!compact ? 'group-hover:scale-105 transition-transform duration-300' : ''}`}
            loading="lazy"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className={`flex items-center justify-center h-full ${compact ? 'text-2xl' : 'text-4xl'} text-gray-300`}>🏠</div>
        )}

        {/* Source badge — green for search agent, grey for scraped */}
        {(() => {
          const isSearchAgent = !!item.emailReceivedAt;
          const platformName = PLATFORM_LABELS[item.platform] ?? item.platform;
          const label = isSearchAgent ? `${platformName} Suchagent` : platformName;
          return (
            <span className={`absolute top-2 left-2 text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full border ${
              isSearchAgent
                ? 'bg-emerald-50/90 text-emerald-700 border-emerald-200'
                : 'bg-white/90 text-gray-600 border-gray-200'
            }`}>
              {label}
            </span>
          );
        })()}

        {/* Expired badge (bottom-left — heart owns top-right) */}
        {isExpired && (
          <span className="absolute bottom-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50/90 text-amber-700 border border-amber-200">
            {t('expired')}
          </span>
        )}

        {/* Heart — top-right of image */}
        <button
          type="button"
          onClick={handleHeart}
          title={heartTooltip}
          aria-label={heartTooltip}
          disabled={!ownCanMoveStage && (isOwn || scrapedSaved)}
          className={`absolute ${compact ? 'top-1.5 right-1.5 w-6 h-6 text-xs' : 'top-2 right-2 w-8 h-8 text-base'} flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 shadow-sm transition-all ${
            heartFilled
              ? `text-teal-600${ownCanMoveStage ? ' hover:scale-110' : ''}`
              : 'text-gray-400 hover:text-teal-600 hover:scale-110'
          } ${isOwn && !ownCanMoveStage ? 'cursor-default' : ''}`}
        >
          {heartFilled ? '♥' : '♡'}
        </button>

        {/* Right-side action stack: 🔍 / ⚠ / ✕.
            Hover-visible on desktop, always visible on mobile.
            Full size centres vertically on the image. Compact anchors
            below the heart so the three buttons can never overlap it on
            the smaller Dashboard cards. */}
        <div className={`absolute ${
          compact
            ? 'right-1.5 top-9 flex-col gap-1'
            : 'right-2 top-1/2 -translate-y-1/2 flex-col gap-1.5'
        } flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity`}>
          {actions.onAnalyse && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); actions.onAnalyse!(item); }}
              title={t('analyse')}
              aria-label={t('analyse')}
              className={`${actionBtn} text-gray-500 grayscale hover:grayscale-0 hover:text-blue-600 hover:bg-blue-50`}
            >
              🔍
            </button>
          )}
          {actions.onReportDead && !isExpired && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); actions.onReportDead!(item); }}
              title={t('reportDead')}
              aria-label={t('reportDead')}
              className={`${actionBtn} text-gray-500 hover:text-orange-500 hover:bg-orange-50`}
            >
              ⚠
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); actions.onDismiss(item); }}
            title={t('dismiss')}
            aria-label={t('dismiss')}
            className={`${actionBtn} text-gray-500 hover:text-rose-500 hover:bg-rose-50`}
          >
            ✕
          </button>
        </div>
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
          {currentStageLabel && isOwn && item.status !== 'new' && (
            <div className="text-[10px] text-teal-600 font-medium mt-1">{currentStageLabel}</div>
          )}
        </div>
      </div>
    </div>
  );
}
