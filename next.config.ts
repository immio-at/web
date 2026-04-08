import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https' as const, hostname: 'cache.willhaben.at' },
      { protocol: 'https' as const, hostname: 'pictures.immobilienscout24.de' },
      { protocol: 'https' as const, hostname: 'static.immmo.at' },
      { protocol: 'https' as const, hostname: 'asset.bazar.at' },
      { protocol: 'https' as const, hostname: '**.raiffeisen-immobilien.at' },
      { protocol: 'https' as const, hostname: '**.sreal.at' },
      { protocol: 'https' as const, hostname: '**.oerag.at' },
      { protocol: 'https' as const, hostname: '**.remax.at' },
      { protocol: 'https' as const, hostname: '**.remax.net' },
    ],
  },
};

export default withNextIntl(nextConfig);
