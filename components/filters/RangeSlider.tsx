'use client';

/**
 * RangeSlider — ADR-023 R6 / §2 / §10.5.6. Dual-handle slider with editable
 * numeric inputs at each end, plus an at-rest visual treatment.
 *
 * Controlled: `minValue` / `maxValue` are strings ('' = no bound — the
 * "and above" / "no minimum" sentinel of §2.2/§2.5). Handles and numeric
 * inputs share the same state — moving one updates the other (§2.3).
 *
 * §10.5.6 — at-rest treatment. When both handles sit at the extremes the
 * slider is *untouched*: no active-range fill, smaller grey handles, and
 * the readout reads "All". A touched slider gets the blue fill, full-size
 * blue-bordered handles, and a "min – max" readout. The label stays full
 * weight in both states (§10.5.6 — the label is a labelling affordance,
 * not a value display).
 */

import { useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  label: string;
  /** Hard slider bounds (§2.2). */
  min: number;
  max: number;
  step: number;
  /** '' means the bound is open (no min / "and above"). */
  minValue: string;
  maxValue: string;
  onChange: (next: { min: string; max: string }) => void;
  /** Formats the numeric input's neighbouring unit hint, e.g. "€". */
  unit?: string;
  compact?: boolean;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export default function RangeSlider({
  label,
  min,
  max,
  step,
  minValue,
  maxValue,
  onChange,
  unit,
  compact = false,
}: Props) {
  const t = useTranslations('presetFilters');
  const trackRef = useRef<HTMLDivElement>(null);

  // Resolve the open-ended sentinels to concrete positions for rendering.
  const lo = minValue === '' ? min : clamp(parseFloat(minValue) || min, min, max);
  const hi = maxValue === '' ? max : clamp(parseFloat(maxValue) || max, min, max);
  const span = max - min || 1;
  const loPct = ((lo - min) / span) * 100;
  const hiPct = ((hi - min) / span) * 100;

  // §10.5.6 — both handles at the extremes ⇒ untouched / inactive.
  const isAtRest = lo <= min && hi >= max;

  // §10.5.6 — readout column: "All" at rest, the range when touched.
  function fmt(v: string): string {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString('de-AT') : v;
  }
  let readout: string;
  if (isAtRest) {
    readout = t('rangeAll');
  } else if (minValue !== '' && maxValue !== '') {
    readout = `${fmt(minValue)} – ${fmt(maxValue)}`;
  } else if (minValue !== '') {
    readout = `≥ ${fmt(minValue)}`;
  } else {
    readout = `≤ ${fmt(maxValue)}`;
  }

  // Snap a raw value to the step grid; emit '' when a handle sits on its
  // extreme so the backend query carries no bound (§2.2).
  const emit = useCallback(
    (which: 'min' | 'max', raw: number) => {
      const snapped = clamp(Math.round(raw / step) * step, min, max);
      if (which === 'min') {
        const next = snapped <= min ? '' : String(snapped);
        onChange({ min: next, max: maxValue });
      } else {
        const next = snapped >= max ? '' : String(snapped);
        onChange({ min: minValue, max: next });
      }
    },
    [step, min, max, minValue, maxValue, onChange],
  );

  function startDrag(which: 'min' | 'max') {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      function move(clientX: number) {
        const frac = clamp((clientX - rect.left) / rect.width, 0, 1);
        let raw = min + frac * span;
        // Prevent the handles from crossing.
        if (which === 'min') raw = Math.min(raw, hi);
        else raw = Math.max(raw, lo);
        emit(which, raw);
      }
      move(e.clientX);
      function onMove(ev: PointerEvent) {
        move(ev.clientX);
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
  }

  function onHandleKey(which: 'min' | 'max', current: number) {
    return (e: React.KeyboardEvent) => {
      const big = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        emit(which, current + step * big);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        emit(which, current - step * big);
      }
    };
  }

  const numInput = `${
    compact ? 'text-[10px] py-0.5 px-1 w-16' : 'text-xs py-1 px-1.5 w-20'
  } border border-gray-200 rounded-md bg-white text-gray-700 text-center focus:outline-none focus:ring-2 focus:ring-blue-500`;

  // §10.5.6 — handles: at rest 12px with a grey border and no shadow;
  // touched 16px (compact 12px) with a blue border and a shadow.
  const handle = `absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-white border-2 cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-blue-400 ${
    isAtRest
      ? 'w-3 h-3 border-gray-300'
      : `${compact ? 'w-3 h-3' : 'w-4 h-4'} border-blue-600 shadow`
  }`;

  return (
    <div className={`flex flex-col ${compact ? 'gap-0.5' : 'gap-1'}`}>
      {/* Label (full weight, both states) + at-rest-aware readout. */}
      <div className="flex items-baseline justify-between gap-2">
        <span className={`${compact ? 'text-[10px]' : 'text-xs'} text-gray-400 font-medium`}>
          {label}
        </span>
        <span
          className={`${compact ? 'text-[10px]' : 'text-xs'} ${
            isAtRest ? 'text-gray-300' : 'text-gray-600 font-medium'
          }`}
        >
          {readout}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          {unit && <span className="text-[10px] text-gray-400">{unit}</span>}
          <input
            type="number"
            step={step}
            value={minValue}
            placeholder={String(min)}
            onChange={(e) => onChange({ min: e.target.value, max: maxValue })}
            className={numInput}
            aria-label={`${label} min`}
          />
        </div>

        {/* Track */}
        <div
          ref={trackRef}
          className={`relative flex-1 ${compact ? 'h-4' : 'h-5'} flex items-center`}
        >
          <div className="absolute inset-x-0 h-1 rounded-full bg-gray-200" />
          {/* §10.5.6 — active-range fill renders only when the slider is touched. */}
          {!isAtRest && (
            <div
              className="absolute h-1 rounded-full bg-blue-500"
              style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }}
            />
          )}
          <div
            role="slider"
            tabIndex={0}
            aria-label={`${label} min`}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={lo}
            onPointerDown={startDrag('min')}
            onKeyDown={onHandleKey('min', lo)}
            className={handle}
            style={{ left: `${loPct}%` }}
          />
          <div
            role="slider"
            tabIndex={0}
            aria-label={`${label} max`}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={hi}
            onPointerDown={startDrag('max')}
            onKeyDown={onHandleKey('max', hi)}
            className={handle}
            style={{ left: `${hiPct}%` }}
          />
        </div>

        <div className="flex items-center gap-0.5">
          {unit && <span className="text-[10px] text-gray-400">{unit}</span>}
          <input
            type="number"
            step={step}
            value={maxValue}
            placeholder={`${max}+`}
            onChange={(e) => onChange({ min: minValue, max: e.target.value })}
            className={numInput}
            aria-label={`${label} max`}
          />
        </div>
      </div>
    </div>
  );
}
