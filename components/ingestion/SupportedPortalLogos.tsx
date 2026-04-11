'use client';

/**
 * SupportedPortalLogos — visual row of supported portals shown beneath
 * the URL input on the Webseite tab (ADR-010 I3).
 *
 * Per the ADR's open question, only LIVE parsers are shown. Adding
 * more is part of I8–I12: extend this list when each parser ships.
 */

const LIVE_PORTALS = [
  { key: 'willhaben', label: 'Willhaben' },
];

export default function SupportedPortalLogos() {
  return (
    <div className="flex items-center gap-2 mt-2 flex-wrap">
      <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
        Unterstützt:
      </span>
      {LIVE_PORTALS.map((p) => (
        <span
          key={p.key}
          className="text-xs font-medium px-2 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600"
        >
          {p.label}
        </span>
      ))}
    </div>
  );
}
