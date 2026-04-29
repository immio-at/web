'use client';

import { useEffect, useRef, useState } from 'react';
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

  // ADR-012 v1.1 PC5 — image-tap opens the modal. We track the pointer's
  // initial coordinates so we can suppress accidental taps during a swipe
  // (Finder) or drag (Funnel). Movement > 6px between pointerdown and click
  // is treated as gesture, not tap.
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  function handleImagePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
  }
  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    const start = pointerDownRef.current;
    pointerDownRef.current = null;
    if (start) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dx * dx + dy * dy > 36) return; // 6px movement threshold
    }
    e.stopPropagation();
    actions.onAnalyse?.(item);
  }
  function handleImageKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      actions.onAnalyse?.(item);
    }
  }

  // ADR-012 v1.1 PC6 — external-link button. When sourceUrl is null
  // (manual properties), render disabled with a different tooltip.
  const hasSourceUrl = !!item.sourceUrl && item.sourceUrl.length > 0;

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
      className={`group relative bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col ${widthClass} hover:shadow-md transition-shadow ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Image — ADR-012 v1.1 PC5: tapping opens the modal (was: link to source).
          Rendered as a div+role="button" rather than a real <button> because the
          heart icon below is itself a <button> and HTML forbids nested buttons —
          browsers auto-close the outer button mid-tree, breaking the `group`
          containment that the action-stack hover-visibility relies on. */}
      <div
        role="button"
        tabIndex={0}
        onPointerDown={handleImagePointerDown}
        onClick={handleImageClick}
        onKeyDown={handleImageKeyDown}
        aria-label={t('analyse')}
        className={`block w-full text-left relative ${compact ? 'h-[7.7rem]' : 'h-[13.2rem]'} bg-gray-100 overflow-hidden flex-shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
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

        {/* Expired badge (bottom-left — heart owns top-right) */}
        {isExpired && (
          <span className="absolute bottom-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50/90 text-amber-700 border border-amber-200">
            {t('expired')}
          </span>
        )}

        {/* House icon — top-right of image */}
        <button
          type="button"
          onClick={handleHeart}
          title={heartTooltip}
          aria-label={heartTooltip}
          disabled={!ownCanMoveStage && (isOwn || scrapedSaved)}
          className={`absolute ${compact ? 'top-1.5 right-1.5 w-6 h-6' : 'top-2 right-2 w-8 h-8'} flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 shadow-sm transition-all ${
            heartFilled
              ? `text-teal-600${ownCanMoveStage ? ' hover:scale-110' : ''}`
              : 'text-gray-400 hover:text-teal-600 hover:scale-110'
          } ${isOwn && !ownCanMoveStage ? 'cursor-default' : ''}`}
        >
          <svg
            viewBox="0 0 24 24"
            className={compact ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5'}
            fill={heartFilled ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth={heartFilled ? 0 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.5z" />
            {!heartFilled && <path d="M9 21V14h6v7" />}
          </svg>
        </button>

      </div>

      {/* Right-side action stack: external-link / ⚠ / ✕.
          Sibling of the image div (NOT a child) so clicks never accidentally
          navigate to the listing or fire the image-tap modal handler.
          Positioned over the image via the card root's `relative`. Always
          visible — the previous hover-reveal pattern was unreliable across
          Tailwind v4's `(hover: hover)` media-query scoping and made the
          discoverability poor on touch laptops. */}
      <div className={`absolute z-10 ${
        compact
          ? 'right-1.5 top-9 flex-col gap-1'
          : 'right-2 top-[6.6rem] -translate-y-1/2 flex-col gap-1.5'
      } flex`}>
        {/* ADR-012 v1.1 PC6: external-link replaces the 🔍 view button —
            opens the source listing in a new tab; modal is now the image-tap
            target. Disabled state for manual properties without sourceUrl. */}
        {hasSourceUrl ? (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.stopPropagation(); handleLink(); }}
            title={t('openExternal')}
            aria-label={t('openExternal')}
            className={`${actionBtn} text-gray-500 hover:text-blue-600 hover:bg-blue-50`}
          >
            <ExternalLinkIcon compact={compact} />
          </a>
        ) : (
          <button
            type="button"
            disabled
            title={t('openExternalUnavailable')}
            aria-label={t('openExternalUnavailable')}
            className={`${actionBtn} text-gray-300 cursor-not-allowed`}
          >
            <ExternalLinkIcon compact={compact} />
          </button>
        )}
        {actions.onReportDead && !isExpired && (
          <button
            type="button"
            onClick={() => actions.onReportDead!(item)}
            title={t('reportDead')}
            aria-label={t('reportDead')}
            className={`${actionBtn} text-gray-500 hover:text-orange-500 hover:bg-orange-50`}
          >
            ⚠
          </button>
        )}
        <button
          type="button"
          onClick={() => actions.onDismiss(item)}
          title={t('dismiss')}
          aria-label={t('dismiss')}
          className={`${actionBtn} text-gray-500 hover:text-rose-500 hover:bg-rose-50`}
        >
          ✕
        </button>
      </div>

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

// Lucide-style external-link icon (inlined to avoid pulling lucide-react
// for a single icon — the codebase already inlines its other SVGs).
function ExternalLinkIcon({ compact }: { compact: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={compact ? 12 : 14}
      height={compact ? 12 : 14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}
