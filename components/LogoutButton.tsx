'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userId');
    router.push('/login');
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-gray-600 hover:text-gray-900 border rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
    >
      Sign Out
    </button>
  );
}