'use client';

/**
 * MaklerBlock — listing-agent contact card (ADR-009 v1.1).
 *
 * Sits in the modal shell between PropertyInfoStrip and the mode toggle
 * (ADR-003 §10). Hidden when all four Makler fields are empty; shows a
 * small "+ Makler hinzufügen" ghost button instead.
 *
 * Inline-editable per field. Email/phone clicks fire a `makler_contact`
 * PropertyInteraction *before* the OS handoff so we still get the signal
 * when the user finishes the action outside the browser.
 */

import { useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import EditableField from './EditableField';
import {
  PropertyDetails,
  Property,
  trackInteraction,
  updatePropertyDetails,
} from '@/lib/api';

interface Props {
  property: Property;
  details: PropertyDetails | null;
  /** Passed in from the active analysis tab. Used to enrich the mailto subject. */
  dealId: string | null;
  /** Called after a successful PATCH so the parent can refresh its details state. */
  onDetailsChange: (next: PropertyDetails) => void;
}

const ROW_LABEL_STYLE: CSSProperties = { letterSpacing: '0.12em' };

function isEmpty(v: string | null | undefined): v is null | undefined | '' {
  return v == null || String(v).trim().length === 0;
}

export default function MaklerBlock({ property, details, dealId, onDetailsChange }: Props) {
  const t = useTranslations('propertyModal.makler');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = details?.maklerName ?? null;
  const phone = details?.maklerPhone ?? null;
  const email = details?.maklerEmail ?? null;
  const organisation = details?.maklerOrganisation ?? null;
  const allEmpty = isEmpty(name) && isEmpty(phone) && isEmpty(email) && isEmpty(organisation);

  async function save(field: 'maklerName' | 'maklerPhone' | 'maklerEmail' | 'maklerOrganisation', value: unknown) {
    setError(null);
    const trimmed = typeof value === 'string' ? value.trim() : value;
    const payload = trimmed === '' ? null : (trimmed as string | null);
    try {
      const next = await updatePropertyDetails(property.id, { [field]: payload });
      onDetailsChange(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Surface the actual backend message so save failures don't disappear
      // behind a generic toast — helps users (and us) diagnose which field
      // or which validation is rejecting the write.
      console.error(`[MaklerBlock] save ${field} failed:`, e);
      if (msg.includes('INVALID_MAKLER_EMAIL') || /email/i.test(msg)) {
        setError(t('errorEmail'));
      } else if (msg) {
        setError(`${t('errorSave')} (${msg})`);
      } else {
        setError(t('errorSave'));
      }
      // Re-throw so EditableField stays in edit mode and the user can retry.
      throw e;
    }
  }

  function emailSubject(): string {
    const title = property.title?.trim();
    const parens = dealId ? ` (${dealId})` : '';
    if (!title) return `${t('emailSubjectFallback')}${parens}`;
    return `${t('emailSubjectPrefix')} "${title}"${parens}`;
  }

  function handleEmailClick() {
    // Fire-and-forget — don't block the OS handoff on a tracking PATCH.
    trackInteraction(property.id, 'makler_contact').catch(() => undefined);
  }

  function handlePhoneClick() {
    trackInteraction(property.id, 'makler_contact').catch(() => undefined);
  }

  // Empty state — small inline ghost button. Rendered inside the parent
  // InfoStrip card so the user sees a single unified property summary
  // box instead of two stacked cards.
  if (allEmpty && !adding) {
    return (
      <div className="border-t border-[#e2e6ed] pt-3 mt-3">
        <button
          onClick={() => setAdding(true)}
          className="text-xs font-medium text-[#6b7a99] hover:text-[#0F1F3D] border border-dashed border-[#e2e6ed] hover:border-[#0F1F3D] rounded-lg px-3 py-1.5 transition-colors"
        >
          + {t('add')}
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-[#e2e6ed] pt-3 mt-3">
      <span
        className="text-[10px] font-semibold uppercase text-[#6b7a99] block mb-2"
        style={ROW_LABEL_STYLE}
      >
        {t('label')}
      </span>

      {/* Row 1 — name + organisation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          <div>
            <p className="text-[10px] uppercase text-[#6b7a99]" style={ROW_LABEL_STYLE}>
              {t('name')}
            </p>
            <EditableField
              kind="text"
              value={name}
              display={name ?? '—'}
              emptyAsPlaceholder={isEmpty(name)}
              placeholder={t('namePlaceholder')}
              onSave={(v) => save('maklerName', v)}
            />
          </div>
          <div>
            <p className="text-[10px] uppercase text-[#6b7a99]" style={ROW_LABEL_STYLE}>
              {t('organisation')}
            </p>
            <EditableField
              kind="text"
              value={organisation}
              display={organisation ?? '—'}
              emptyAsPlaceholder={isEmpty(organisation)}
              placeholder={t('organisationPlaceholder')}
              onSave={(v) => save('maklerOrganisation', v)}
            />
          </div>
        </div>

        {/* Row 2 — phone + email (tappable) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-3">
          <div>
            <p className="text-[10px] uppercase text-[#6b7a99]" style={ROW_LABEL_STYLE}>
              {t('phone')}
            </p>
            {isEmpty(phone) ? (
              <EditableField
                kind="text"
                value={phone}
                display="—"
                emptyAsPlaceholder
                placeholder={t('phonePlaceholder')}
                onSave={(v) => save('maklerPhone', v)}
              />
            ) : (
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${phone}`}
                  onClick={handlePhoneClick}
                  className="text-sm text-[#F5A623] hover:underline"
                >
                  {phone}
                </a>
                <EditableEditAffordance value={phone} onSave={(v) => save('maklerPhone', v)} />
              </div>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase text-[#6b7a99]" style={ROW_LABEL_STYLE}>
              {t('email')}
            </p>
            {isEmpty(email) ? (
              <EditableField
                kind="text"
                value={email}
                display="—"
                emptyAsPlaceholder
                placeholder={t('emailPlaceholder')}
                onSave={(v) => save('maklerEmail', v)}
              />
            ) : (
              <div className="flex items-center gap-2">
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent(emailSubject())}`}
                  onClick={handleEmailClick}
                  className="text-sm text-[#F5A623] hover:underline truncate"
                >
                  {email}
                </a>
                <EditableEditAffordance value={email} onSave={(v) => save('maklerEmail', v)} />
              </div>
            )}
          </div>
        </div>

      {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
    </div>
  );
}

// Tiny ✎ button that flips the adjacent tappable link into edit mode by
// reusing EditableField's display-only state. Keeps the link tappable for
// the common case (the user usually wants to call/email, not edit).
function EditableEditAffordance({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: unknown) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-[10px] text-[#6b7a99] hover:text-[#0F1F3D]"
        aria-label="Bearbeiten"
      >
        ✎
      </button>
    );
  }
  return (
    <EditableField
      kind="text"
      value={value}
      display={value}
      onSave={async (v) => {
        await onSave(v);
        setEditing(false);
      }}
    />
  );
}
