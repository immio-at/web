'use client';

import { useAuth } from '@/context/AuthContext';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';

const navItems = [
  { key: 'dashboard' as const, href: '/dashboard', icon: '🏠', tourId: 'nav-dashboard' },
  { key: 'search' as const, href: '/search', icon: '🔍', tourId: 'nav-discover' },
  { key: 'finder' as const, href: '/finder', icon: '⚡', tourId: 'nav-finder' },
  { key: 'funnel' as const, href: '/funnel', icon: '📊', tourId: 'nav-funnel' },
  { key: 'analytics' as const, href: '/analytics', icon: '📈', tourId: 'nav-analytics' },
];

// Help lives in the utility area next to Settings on desktop (icon button),
// and as a labelled link in the mobile nav row below.
const HELP_NAV = { key: 'help' as const, href: '/help', icon: '❓', tourId: 'nav-help' };

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin, signOut } = useAuth();
  const t = useTranslations('nav');
  const locale = useLocale();

  async function handleLogout() {
    await signOut();
    router.push('/');
  }

  function switchLocale() {
    const newLocale = locale === 'de' ? 'en' : 'de';
    localStorage.setItem('immio_locale', newLocale);
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="text-2xl text-gray-900 flex-shrink-0">
            IM<span className="text-3xl">M</span>IO
          </Link>

          {/* Nav tabs — desktop */}
          <div className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  data-tour-id={item.tourId}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </div>

          {/* Utility area — language, settings, admin, sign out */}
          <div className="flex items-center gap-2">

            {/* Language toggle */}
            <button
              onClick={switchLocale}
              className="text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
              title={locale === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'}
            >
              {locale === 'de' ? 'EN' : 'DE'}
            </button>

            <Link
              href={HELP_NAV.href}
              data-tour-id={HELP_NAV.tourId}
              title={t(HELP_NAV.key)}
              aria-label={t(HELP_NAV.key)}
              className={`text-sm border border-gray-200 rounded-lg px-3 py-1.5 transition-colors ${
                pathname === HELP_NAV.href
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              ?
            </Link>

            <Link
              href="/settings"
              title={t('settings')}
              className={`text-sm border border-gray-200 rounded-lg px-3 py-1.5 transition-colors ${
                pathname === '/settings'
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              ⚙
            </Link>

            {/* Admin + Reports links — only rendered for admin users.
                Reports is a separate top-level route (not nested under
                /admin) so it gets its own utility-area entry between
                Admin and Sign Out. */}
            {isAdmin && (
              <>
                <Link
                  href="/admin"
                  className={`text-sm border rounded-lg px-3 py-1.5 font-medium transition-colors ${
                    pathname === '/admin'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'text-gray-400 hover:text-amber-700 hover:bg-amber-50 hover:border-amber-200 border-gray-200'
                  }`}
                >
                  {t('admin')}
                </Link>
                <Link
                  href="/reports"
                  className={`text-sm border rounded-lg px-3 py-1.5 font-medium transition-colors ${
                    pathname === '/reports'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'text-gray-400 hover:text-amber-700 hover:bg-amber-50 hover:border-amber-200 border-gray-200'
                  }`}
                >
                  {t('reports')}
                </Link>
                <Link
                  href="/mgmt"
                  className={`text-sm border rounded-lg px-3 py-1.5 font-medium transition-colors ${
                    pathname === '/mgmt'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'text-gray-400 hover:text-amber-700 hover:bg-amber-50 hover:border-amber-200 border-gray-200'
                  }`}
                >
                  {t('mgmt')}
                </Link>
              </>
            )}

            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              {t('signOut')}
            </button>

          </div>
        </div>

        {/* Mobile nav — labelled links for every product surface plus Help.
            Mobile has no utility area, so Help stays in the row here even
            though desktop renders it as an icon button next to Settings. */}
        <div className="md:hidden flex gap-1 pb-2 overflow-x-auto">
          {[...navItems, HELP_NAV].map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour-id={`${item.tourId}-mobile`}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {item.icon} {t(item.key)}
              </Link>
            );
          })}
          {isAdmin && (
            <>
              <Link
                href="/admin"
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50 transition-colors"
              >
                ⚡ {t('admin')}
              </Link>
              <Link
                href="/reports"
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50 transition-colors"
              >
                📨 {t('reports')}
              </Link>
              <Link
                href="/mgmt"
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50 transition-colors"
              >
                🗂 {t('mgmt')}
              </Link>
            </>
          )}
        </div>

      </div>
    </nav>
  );
}
