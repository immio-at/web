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

  const isLoginPage = pathname === '/login' || pathname === '/register';
  if (isLoginPage) return null;

  function handleLogout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userId');
    router.push('/login');
  }

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link href="/" className="flex-shrink-0">
            <span className="text-2xl font-bold text-gray-900">
              IM<span className="text-3xl">M</span>IO
            </span>
          </Link>

          {/* Nav tabs - desktop */}
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

          {/* User actions */}
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Mobile nav - bottom of navbar */}
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
        </div>
      </div>
    </nav>
  );
}