'use client';

import { useMemo } from 'react';
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

export default function SourcesSetupTile({
  properties,
  immioEmail,
}: {
  properties: Property[];
  immioEmail: string | null;
}) {
  const t = useTranslations('dashboard.sourcesTile');

  const platformStatus = useMemo(() => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const result: Record<string, { active: boolean; lastReceived: string | null }> = {};

    for (const platform of KNOWN_PLATFORMS) {
      result[platform] = { active: false, lastReceived: null };
    }

    // Only consider email-parsed properties (not scraped)
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

  const activePlatforms = KNOWN_PLATFORMS.filter(p => platformStatus[p].active);
  const inactivePlatforms = KNOWN_PLATFORMS.filter(p => !platformStatus[p].active);
  const hasAnyEmail = properties.some(p => KNOWN_PLATFORMS.includes(p.platform));
  const allActive = inactivePlatforms.length === 0;

  // State A — new user
  if (!hasAnyEmail) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-between h-full">
        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-2">{t('setupPrompt')}</h3>
          <p className="text-sm text-gray-500 mb-4">{t('setupBody')}</p>
          {immioEmail && (
            <div className="bg-slate-50 rounded-lg px-4 py-3 mb-4">
              <p className="text-xs text-gray-400 mb-1">{t('yourEmail')}</p>
              <p className="text-base font-mono font-medium text-gray-900 select-all">{immioEmail}</p>
            </div>
          )}
        </div>
        <button
          className="mt-3 block w-full text-center text-sm font-medium text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg py-2.5 transition-colors"
        >
          {t('setupCta')}
        </button>
      </div>
    );
  }

  // State C — all healthy
  if (allActive) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-between h-full">
        <div>
          <h3 className="text-base font-semibold text-gray-900 mb-4">{t('titleHealthy')}</h3>
          <div className="space-y-3">
            {KNOWN_PLATFORMS.map(platform => (
              <div key={platform} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-green-500 text-sm">✓</span>
                  <span className="text-sm text-gray-700">{PLATFORM_LABELS[platform]}</span>
                </div>
                {platformStatus[platform].lastReceived && (
                  <span className="text-xs text-gray-400">
                    {new Date(platformStatus[platform].lastReceived!).toLocaleDateString('de-AT')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // State B — partial
  const firstInactive = inactivePlatforms[0];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col justify-between h-full">
      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-4">{t('title')}</h3>
        <div className="space-y-3">
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

        {firstInactive && (
          <p className="text-sm text-teal-600 mt-4">
            {t('nudge', { platform: PLATFORM_LABELS[firstInactive] })}
          </p>
        )}
      </div>

      <button
        className="mt-3 block w-full text-center text-sm font-medium text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg py-2.5 transition-colors"
      >
        {t('guideCta')}
      </button>
    </div>
  );
}
