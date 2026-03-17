'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: '🏠' },
  { label: 'Search', href: '/search', icon: '🔍' },
  { label: 'Finder', href: '/finder', icon: '⚡' },
  { label: 'Funnel', href: '/funnel', icon: '📊' },
  { label: 'Analytics', href: '/analytics', icon: '📈' },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  // Read isAdmin from localStorage — set on login alongside accessToken.
  // Cast to string comparison because localStorage only stores strings.
  const isAdmin = typeof window !== 'undefined'
    ? localStorage.getItem('isAdmin') === 'true'
    : false;

  function handleLogout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('immioEmail');
    localStorage.removeItem('approved');
    localStorage.removeItem('isAdmin');
    router.push('/');
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Utility area — settings, admin (if applicable), sign out */}
          <div className="flex items-center gap-2">

            <Link
              href="/settings"
              title="Settings"
              className={`text-sm border border-gray-200 rounded-lg px-3 py-1.5 transition-colors ${
                pathname === '/settings'
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              ⚙
            </Link>

            {/* Admin link — only rendered for admin users */}
            {isAdmin && (
              <Link
                href="/admin"
                className={`text-sm border rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  pathname === '/admin'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'text-gray-400 hover:text-amber-700 hover:bg-amber-50 hover:border-amber-200 border-gray-200'
                }`}
              >
                Admin
              </Link>
            )}

            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              Sign Out
            </button>

          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex gap-1 pb-2 overflow-x-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {item.icon} {item.label}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50 transition-colors"
            >
              ⚡ Admin
            </Link>
          )}
        </div>

      </div>
    </nav>
  );
}
