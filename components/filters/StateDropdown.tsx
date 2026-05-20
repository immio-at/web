'use client';

/**
 * StateDropdown — ADR-023 R1 / §10.5.4. Multi-select dropdown for the nine
 * Bundesländer, replacing the former row of nine chip toggles.
 *
 * The trigger shows the current selection inline as comma-separated labels
 * ("Wien, NÖ"), collapsing to "+N mehr" past three. Clicking opens a
 * checkbox panel; the panel closes on outside-click or Escape. When a
 * saved filter supplies the location (ADR-008 F5 override) the whole
 * control is disabled.
 */

import { useEffect, useRef, useState } from 'react';

interface Option {
  key: string;
  label: string;
}

interface Props {
  options: Option[];
  /** Keys shown checked — active selections plus saved-filter-implied ones. */
  selected: Set<string>;
  onToggle: (key: string) => void;
  /** Clears every option-controlled selection in one shot (the parent
   *  decides what "all" means — for State this excludes saved-filter
   *  implied entries, which the parent leaves out of the panel anyway). */
  onClearAll?: () => void;
  /** Label for the footer Clear button. */
  clearAllLabel?: string;
  /** Trigger placeholder when nothing is selected. */
  placeholder: string;
  /** Builds the "+N mehr" overflow label. */
  moreLabel: (n: number) => string;
  disabled?: boolean;
  disabledTitle?: string;
  compact?: boolean;
}

function Chevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function StateDropdown({
  options,
  selected,
  onToggle,
  onClearAll,
  clearAllLabel,
  placeholder,
  moreLabel,
  disabled = false,
  disabledTitle,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chosen = options.filter((o) => selected.has(o.key));
  const triggerText =
    chosen.length === 0
      ? placeholder
      : chosen.length <= 3
        ? chosen.map((o) => o.label).join(', ')
        : `${chosen.slice(0, 3).map((o) => o.label).join(', ')}, ${moreLabel(chosen.length - 3)}`;

  const triggerSize = compact
    ? 'rounded-full px-2 py-0.5 text-[10px]'
    : 'rounded-full px-3 py-1 text-xs';

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${triggerSize} inline-flex items-center gap-1.5 border font-medium transition-colors whitespace-nowrap ${
          disabled
            ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
            : chosen.length > 0
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
        }`}
      >
        <span className="truncate max-w-[220px]">{triggerText}</span>
        <Chevron />
      </button>

      {open && !disabled && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((o) => {
            const isSel = selected.has(o.key);
            return (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => onToggle(o.key)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                    isSel ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'
                  }`}
                >
                  {isSel && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
                {o.label}
              </button>
            );
          })}
          {/* Footer Clear — visible only when there is something to clear,
              keeps the empty-state panel uncluttered. */}
          {onClearAll && selected.size > 0 && (
            <button
              type="button"
              onClick={() => { onClearAll(); setOpen(false); }}
              className="mt-1 flex w-full items-center justify-center border-t border-gray-100 px-3 py-1.5 text-left text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            >
              {clearAllLabel ?? 'Clear'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
