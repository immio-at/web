'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Property } from '@/lib/api';

const KNOWN_PLATFORMS = ['willhaben', 'immoscout24', 'immowelt', 'bazar', 'immmo'];

const PLATFORM_LABELS: Record<string, string> = {
  willhaben: 'Willhaben',
  immoscout24: 'ImmoScout24',
  immowelt: 'Immowelt',
  bazar: 'Bazar.at',
  immmo: 'immmo.at',
};

const SCRAPED_SOURCES = ['Raiffeisen Immobilien', 's REAL', 'ÖRAG', 'RE/MAX'];

function pickRandom(arr: string[], count: number): string[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export default function SourcesSetupTile({
  properties,
  immioEmail,
}: {
  properties: Property[];
  immioEmail: string | null;
}) {
  const t = useTranslations('dashboard.sourcesTile');
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (!immioEmail) return;
    navigator.clipboard.writeText(immioEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const platformStatus = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const result: Record<string, { active: boolean; lastReceived: string | null }> = {};

    for (const platform of KNOWN_PLATFORMS) {
      result[platform] = { active: false, lastReceived: null };
    }

    for (const p of properties) {
      const platform = p.platform;
      if (!KNOWN_PLATFORMS.includes(platform)) continue;

      const receivedAt = p.emailReceivedAt ? new Date(p.emailReceivedAt).getTime() : 0;

      if (!result[platform].lastReceived || receivedAt > new Date(result[platform].lastReceived!).getTime()) {
        result[platform].lastReceived = p.emailReceivedAt;
      }

      if (receivedAt > thirtyDaysAgo) {
        result[platform].active = true;
      }
    }

    return result;
  }, [properties]);

  // Pick 3 random scraped sources for the tagline (stable per render)
  const highlightedScraped = useMemo(() => pickRandom(SCRAPED_SOURCES, 3), []);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col h-full">
      <h3 className="text-base font-semibold text-gray-900 mb-3">{t('title')}</h3>

      {/* Email forwarding section */}
      {immioEmail && (
        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">{t('forwardHint')}</p>
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
            <p className="text-sm font-mono font-medium text-gray-900 select-all truncate flex-1">{immioEmail}</p>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 text-xs font-medium px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white transition-colors"
            >
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </div>
      )}

      {/* Platform status list */}
      <div className="space-y-2 flex-1">
        {KNOWN_PLATFORMS.map(platform => (
          <div key={platform} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {platformStatus[platform].active ? (
                <span className="text-green-500 text-sm">✓</span>
              ) : (
                <span className="text-amber-400 text-sm">○</span>
              )}
              <span className="text-sm text-gray-700">{PLATFORM_LABELS[platform]}</span>
            </div>
            {platformStatus[platform].active && platformStatus[platform].lastReceived ? (
              <span className="text-xs text-gray-400">
                {new Date(platformStatus[platform].lastReceived!).toLocaleDateString('de-AT')}
              </span>
            ) : (
              <span className="text-xs text-gray-400">{t('notConfigured')}</span>
            )}
          </div>
        ))}
      </div>

      {/* Scraped sources tagline */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          {t('scrapedHint', {
            count: SCRAPED_SOURCES.length,
            names: highlightedScraped.join(', '),
          })}
        </p>
      </div>
    </div>
  );
}
