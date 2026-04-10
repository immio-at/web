'use client';

/**
 * UserFilterPill — single user-defined filter pill with kebab menu.
 * Used inside PresetFilters Row 2 per ADR-008.
 *
 * Click on the pill body either toggles the filter (default mode) or
 * applies it to the parent's field state (dashboardMode). The kebab
 * (⋮) opens a small dropdown with Edit and Delete actions.
 *
 * The kebab dropdown is hosted inline rather than via portal because
 * the pill bar is already absolutely positioned within a tile / page
 * scroll context — a portal would risk z-index and clip issues.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  id: string;
  name: string;
  isActive: boolean;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void | Promise<void>;
  compact?: boolean;
}

export default function UserFilterPill({ id, name, isActive, onClick, onEdit, onDelete, compact = false }: Props) {
  const t = useTranslations('presetFilters');
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  async function handleDelete() {
    if (deleting) return;
    if (!confirm(t('confirmDelete', { name }))) return;
    setDeleting(true);
    try {
      await onDelete();
      setMenuOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  const labelClass = compact
    ? 'rounded-l-full pl-2 pr-1.5 py-0.5 text-[10px] font-medium border-y border-l max-w-[120px]'
    : 'rounded-l-full pl-3 pr-2 py-1 text-xs font-medium border-y border-l max-w-[140px]';
  const kebabClass = compact
    ? 'rounded-r-full pl-0.5 pr-1.5 py-0.5 text-[10px] border-y border-r'
    : 'rounded-r-full pl-1 pr-2 py-1 text-xs border-y border-r';

  return (
    <div ref={wrapperRef} className="relative inline-flex items-center">
      <button
        onClick={onClick}
        title={name}
        className={`${labelClass} transition-colors whitespace-nowrap truncate ${
          isActive
            ? 'bg-amber-500 text-white border-amber-500'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
        }`}
      >
        {name}
      </button>
      <button
        onClick={() => setMenuOpen(o => !o)}
        aria-label={t('filterMenu', { name })}
        className={`${kebabClass} transition-colors ${
          isActive
            ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
            : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50 hover:text-gray-600'
        }`}
      >
        ⋮
      </button>

      {menuOpen && (
        <div
          className="absolute top-full left-0 mt-1 z-20 min-w-[120px] bg-white border border-gray-200 rounded-md shadow-lg py-1"
          role="menu"
        >
          <button
            onClick={() => { setMenuOpen(false); onEdit(); }}
            className="block w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            role="menuitem"
          >
            {t('editFilter')}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="block w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            role="menuitem"
          >
            {deleting ? t('deleting') : t('deleteFilter')}
          </button>
        </div>
      )}
    </div>
  );
}
