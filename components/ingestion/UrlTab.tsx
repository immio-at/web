'use client';

/**
 * UrlTab — paste a portal URL (ADR-010 I3).
 *
 * On submit, the parent AddPropertyModal calls
 * createPropertyFromUrl(url, status). This component just owns the
 * input value and forwards it. Errors are displayed inline; the modal
 * decides what to do on success (close + open property modal).
 *
 * If the backend returns the structured UNSUPPORTED_URL error, the
 * parent maps it to a friendly i18n string.
 */

import { useTranslations } from 'next-intl';
import SupportedPortalLogos from './SupportedPortalLogos';

interface Props {
  value: string;
  onChange: (next: string) => void;
  errorMessage: string | null;
}

export default function UrlTab({ value, onChange, errorMessage }: Props) {
  const t = useTranslations('addProperty.urlTab');
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500 font-medium block mb-1">
          {t('label')}
        </label>
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://www.willhaben.at/iad/immobilien/d/..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <SupportedPortalLogos />
      </div>

      {errorMessage && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
