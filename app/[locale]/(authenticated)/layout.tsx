import NavBar from '@/components/NavBar';
import SSEProvider from '@/components/SSEProvider';

// This layout wraps all authenticated routes inside app/(authenticated)/.
// The route group folder name "(authenticated)" is invisible to the URL router —
// /dashboard, /finder, /funnel etc. all keep their existing URLs.
//
// Pages that should NOT have the navbar (landing, impressum, datenschutz,
// login, register, pending) live outside this folder in app/ directly.

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <SSEProvider />
      <NavBar />
      <main>{children}</main>
    </div>
  );
}
