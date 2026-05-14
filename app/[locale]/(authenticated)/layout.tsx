import NavBar from '@/components/NavBar';
import SSEProvider from '@/components/SSEProvider';
import FeedbackButton from '@/components/feedback/FeedbackButton';
import AdminUnacknowledgedToast from '@/components/feedback/AdminUnacknowledgedToast';
import OnboardingTour from '@/components/help/OnboardingTour';

// This layout wraps all authenticated routes inside app/(authenticated)/.
// The route group folder name "(authenticated)" is invisible to the URL router —
// /dashboard, /finder, /funnel etc. all keep their existing URLs.
//
// Pages that should NOT have the navbar (landing, impressum, datenschutz,
// login, register, pending) live outside this folder in app/ directly.
//
// AdminUnacknowledgedToast (ADR-018 §5.5) is mounted globally for admins
// so new-issue alerts surface from every page. The component self-gates
// on `isAdmin` and on a non-zero unread count — non-admins render nothing,
// admins with zero unacknowledged reports also render nothing.

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <SSEProvider />
      <AdminUnacknowledgedToast />
      <NavBar />
      <main>{children}</main>
      <FeedbackButton />
      <OnboardingTour />
    </div>
  );
}
