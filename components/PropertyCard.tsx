'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { UserListing } from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ListingCard {
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
  // ADR-025 M2b — unified-schema replacement for the old own-vs-scraped
  // `source` discriminator. Funnel membership is signalled
  // by the *presence* of a UserListing (stage + listing-availability are read
  // from it); the listing's `visibility` distinguishes a discoverable public
  // listing from the user's own private one. The card branches on funnel
  // membership, never on origin.
  userListing: UserListing | null;
  listing: { visibility: 'public' | 'private' };
  scrapedListingId?: string;
  emailReceivedAt?: string | null;
  savedByUser?: boolean;
  /** Number of saved analyses on the underlying UserListing. Drives the
   *  analyse-button colour (gray when both this and documentCount are 0,
   *  blue otherwise). Optional — scraped tiles without a backing UserListing
   *  omit it and render gray. */
  analysisCount?: number;
  /** Number of uploaded documents on the underlying UserListing. Same role
   *  as analysisCount in the analyse-button colour. */
  documentCount?: number;
  // ADR-022 §7.5 — effective rent-regulation state. `rentRegulationCategory`
  // is the effective category (stored value or year-based heuristic);
  // `rentRegulationSource` is its provenance ('inferred' for heuristic
  // values); `baujahr` distinguishes "year unknown" from "uncertain era".
  // All optional — cards without the data render no badge.
  rentRegulationCategory?: string | null;
  rentRegulationSource?: string | null;
  baujahr?: number | null;
  propertyType?: string | null;
}

export interface CardActions {
  onSaveToFunnel?: (item: ListingCard) => void | Promise<void>;
  /**
   * Re-click-undo on a filled heart. ADR-012 v1.2 — when provided AND
   * onMoveStage is not, clicking the filled house reverses the recent save:
   *   - own → revert status to 'new' (stays visible until next mount)
   *   - scraped → DELETE the just-created UserListing and clear savedByUser
   * Used by Discover only. Funnel takes onMoveStage and ignores this.
   */
  onUndoSave?: (item: ListingCard) => void | Promise<void>;
  /**
   * Own-card override. When provided, clicking the heart on an own
   * property fires this callback instead of being a no-op. Used by the
   * Funnel to open a stage-picker dropdown anchored to the heart.
   */
  onMoveStage?: (item: ListingCard, anchor: DOMRect) => void;
  onAnalyse?: (item: ListingCard) => void;
  onReportDead?: (item: ListingCard) => void;
  onDismiss: (item: ListingCard) => void;
  onUrlClick?: (item: ListingCard) => void;
}

// ─── Magnifying-glass icon (lucide-style, no extra dep) ──────────────────────
// Used by the analyse-button inline with the card title. Coloured blue when
// the property has any saved analyses or uploaded documents; gray otherwise.

function MagnifyingGlassIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
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

// ─── ADR-022 §7.5 — rent-regulation badge ────────────────────────────────────
// Three visually-distinct states surfacing what we know about a property's
// MRG status. A confident known category renders nothing here (ADR-023 owns
// the positive Altbau/Wiederaufbau/Neubau chip). Precedence: an `mrg_unknown`
// category is always the warning badge, even when it was heuristic-inferred.

function RegulationBadge({
  category,
  source,
  baujahr,
  t,
}: {
  category?: string | null;
  source?: string | null;
  baujahr?: number | null;
  t: ReturnType<typeof useTranslations>;
}) {
  if (category === 'mrg_unknown') {
    return (
      <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
        {t('regulationUnknown')}
      </span>
    );
  }
  if (source === 'inferred') {
    return (
      <span className="inline-block mt-1 text-[10px] italic text-gray-400">
        {t('regulationInferred')}
      </span>
    );
  }
  if (baujahr == null && !category) {
    return (
      <span className="inline-block mt-1 text-[10px] text-gray-400">
        {t('baujahrUnknown')}
      </span>
    );
  }
  return null;
}

// ─── Card Component ──────────────────────────────────────────────────────────

export default function PropertyCard({
  item,
  actions,
  compact = false,
  fullWidth = false,
  draggable,
  dataTourId,
}: {
  item: ListingCard;
  actions: CardActions;
  compact?: boolean;
  /** Use 100% width of the parent instead of the default fixed w-48 (compact). */
  fullWidth?: boolean;
  /** When set, the card root becomes draggable (used by the Funnel kanban). */
  draggable?: {
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  /** ADR-021 HH8 — `data-tour-id` for the card root. */
  dataTourId?: string;
}) {
  const t = useTranslations('propertyCard');
  const tStages = useTranslations('funnel.stages');

  // Scraped-only heart optimistic fill. Gated to source==='scraped' because
  // `propertyToUnified` sets savedByUser=true for every own property — left
  // ungated, ADR-012 v1.2's gray-house rule for own@'new' was being shadowed
  // by a stale-state initializer. Reset when the rendered item changes so
  // Finder / Discover callers that reuse the component across swipes don't
  // inherit the previous card's filled state.
  // A public listing (no UserListing) is the only place the optimistic
  // save-fill applies — an in-funnel card already reads its filled state from
  // userListing.status below.
  const inFunnel = item.userListing != null;
  const [scrapedSaved, setScrapedSaved] = useState<boolean>(
    !inFunnel && !!item.savedByUser,
  );
  useEffect(() => {
    setScrapedSaved(item.userListing == null && !!item.savedByUser);
  }, [item.id, item.userListing, item.savedByUser]);

  const ownStatus = item.userListing?.status;
  const priceText = formatPrice(item.price);
  const ppsmText = !compact ? formatPricePerSqm(item.price, item.sizeSqm) : null;
  const isExpired = item.userListing?.listingStatus === 'expired';
  const currentStageLabel = ownStatus && STAGE_I18N_KEY[ownStatus]
    ? tStages(STAGE_I18N_KEY[ownStatus])
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

  // Heart state + behaviour (ADR-012 v1.2)
  // The house icon represents "in active funnel" — i.e. status `new` (the
  // auto-imported, not-yet-considered landing state) renders gray and is
  // clickable, identical to an unsaved scraped listing. Clicking promotes
  // own-at-new to `investigating`, or saves a scraped listing to the
  // funnel at `investigating`. Status `investigating` and beyond renders
  // filled. Re-clicking a filled heart fires onUndoSave when provided
  // (Discover-only) for symmetry — toggle.
  // `inFunnel` (computed above) is the new own/scraped discriminant:
  // userListing present ⇒ the listing is in the user's funnel ("own").
  const isOwnAtNew = inFunnel && ownStatus === 'new';
  const heartFilled = (inFunnel && !isOwnAtNew) || scrapedSaved;
  // Funnel page passes onMoveStage; own-at-new opens it (gray + actionable)
  // exactly like own-past-new (filled + actionable).
  const ownCanMoveStage = inFunnel && !!actions.onMoveStage;
  // Discover/Dashboard surfaces don't pass onMoveStage. There the gray
  // house's click promotes via onSaveToFunnel; the filled house's click
  // (when onUndoSave is provided) reverses that save.
  const isPromotePath = isOwnAtNew && !ownCanMoveStage;
  const isScrapedSavePath = !inFunnel && !scrapedSaved;
  const isUndoPath = heartFilled && !ownCanMoveStage && !!actions.onUndoSave;
  const heartActionable =
    ownCanMoveStage || isPromotePath || isScrapedSavePath || isUndoPath;

  const heartTooltip = ownCanMoveStage
    ? (currentStageLabel ? t('changeStageFrom', { stage: currentStageLabel }) : t('changeStage'))
    : isPromotePath
      ? t('moveToInvestigating')
      : isScrapedSavePath
        ? t('saveToFunnel')
        : isUndoPath
          ? t('undoSave')
          : (currentStageLabel
              ? t('alreadyInFunnelWithStage', { stage: currentStageLabel })
              : t('alreadyInFunnel'));

  async function handleHeart(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (ownCanMoveStage) {
      actions.onMoveStage!(item, e.currentTarget.getBoundingClientRect());
      return;
    }
    if (isPromotePath) {
      // Cache update from the parent flips status `new` → `investigating`,
      // which makes heartFilled re-evaluate to true on the next render.
      // No need to flip scrapedSaved.
      try { await actions.onSaveToFunnel?.(item); } catch {}
      return;
    }
    if (isUndoPath) {
      // Filled scraped → call undo (parent deletes UserListing + flips
      // savedByUser). Filled own → call undo (parent reverts status `new`).
      // Local scrapedSaved snaps back so the UI flips outline immediately.
      if (!inFunnel) setScrapedSaved(false);
      try {
        await actions.onUndoSave!(item);
      } catch {
        if (!inFunnel) setScrapedSaved(true);
      }
      return;
    }
    if (!isScrapedSavePath) return;
    setScrapedSaved(true);
    try {
      await actions.onSaveToFunnel?.(item);
    } catch {
      setScrapedSaved(false);
    }
  }

  // Button styling shared by the bottom-right action cluster. Fixed
  // square dimensions (w-X h-X) on both compact and full sizes so
  // rounded-full renders as a true circle regardless of the inner
  // glyph's intrinsic width — the previous full-mode `p-1.5` was
  // padding-based and the differing glyph widths (⚠ vs ✕ vs the
  // ExternalLink SVG) produced oval/pill shapes. Sizes match the
  // top-right cluster so the four card icons read as a consistent set.
  const actionBtn = `${
    compact ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs'
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
      data-tour-id={dataTourId}
      data-testid="listing-card"
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

        {/* ADR-012 v1.3 PC10 — top-right cluster: magnifying-glass + house.
            Magnifying-glass left, house right (left-to-right reads
            lighter-commitment exploratory action first, state-changing
            action second). Both achieve the same modal-open as the
            invisible image-tap shortcut; the magnifying-glass is the
            explicit visual cue. Each button stops propagation so the
            click never falls through to the image's handleImageClick. */}
        <div
          className={`absolute z-10 flex items-center ${
            compact ? 'top-1.5 right-1.5 gap-1' : 'top-2 right-2 gap-1.5'
          }`}
        >
          {(() => {
            const hasContent = (item.analysisCount ?? 0) > 0 || (item.documentCount ?? 0) > 0;
            const sizeClass = compact ? 'w-6 h-6' : 'w-8 h-8';
            const colourClass = hasContent
              ? 'text-blue-600 hover:text-blue-700'
              : 'text-gray-400 hover:text-gray-600';
            return (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  actions.onAnalyse?.(item);
                }}
                title={t('openAnalysis')}
                aria-label={t('openAnalysis')}
                className={`${sizeClass} flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 shadow-sm transition-colors ${colourClass}`}
              >
                <MagnifyingGlassIcon size={compact ? 14 : 18} />
              </button>
            );
          })()}

          <button
            type="button"
            onClick={handleHeart}
            title={heartTooltip}
            aria-label={heartTooltip}
            disabled={!heartActionable}
            className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} flex items-center justify-center rounded-full bg-white/90 backdrop-blur-sm border border-gray-200 shadow-sm transition-all ${
              heartFilled
                ? `text-teal-600${ownCanMoveStage ? ' hover:scale-110' : ''}`
                : 'text-gray-400 hover:text-teal-600 hover:scale-110'
            } ${inFunnel && !ownCanMoveStage ? 'cursor-default' : ''}`}
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

        {/* ADR-012 v1.3 PC11 — bottom-right horizontal cluster:
            external-link / ⚠ / ✕. Was a right-edge vertical stack
            (sibling of the image div) below the heart; the v1.3 layout
            pass groups card chrome by intent — top-right for engagement,
            bottom-right for housekeeping. Now inside the image div like
            the top-right cluster; every button stopPropagation()s so
            the image-tap modal handler doesn't fire on cluster clicks.
            Always visible — Session 45 always-visible deviation
            absorbed into spec. */}
        <div className={`absolute z-10 flex items-center ${
          compact ? 'bottom-1.5 right-1.5 gap-1' : 'bottom-2 right-2 gap-1.5'
        }`}>
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
              onClick={(e) => e.stopPropagation()}
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
              onClick={(e) => { e.stopPropagation(); actions.onReportDead!(item); }}
              title={t('reportDead')}
              aria-label={t('reportDead')}
              className={`${actionBtn} text-gray-500 hover:text-orange-500 hover:bg-orange-50`}
            >
              ⚠
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); actions.onDismiss(item); }}
            title={t('dismiss')}
            aria-label={t('dismiss')}
            className={`${actionBtn} text-gray-500 hover:text-rose-500 hover:bg-rose-50`}
          >
            ✕
          </button>
        </div>

      </div>


      {/* Details */}
      <div className={`${compact ? 'p-2' : 'p-3'} flex flex-col flex-grow`}>
        {/* ADR-012 v1.3 PC9 — the inline-with-title magnifying-glass
            shipped in v1.2.1 (Session 50 iteration item 6) is removed.
            The affordance lives on the image overlay's top-right cluster
            now; analysisCount/documentCount drive its gray/blue state. */}
        <a
          href={item.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleLink}
        >
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
          {/* ADR-022 §7.5 — rent-regulation status badge. Full cards only;
              compact carousel/kanban tiles have no room for it. */}
          {!compact && (
            <RegulationBadge
              category={item.rentRegulationCategory}
              source={item.rentRegulationSource}
              baujahr={item.baujahr}
              t={t}
            />
          )}
          {/* Current stage indicator */}
          {currentStageLabel && inFunnel && ownStatus !== 'new' && (
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
