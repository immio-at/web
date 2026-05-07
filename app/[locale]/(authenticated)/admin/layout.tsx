import AdminUnacknowledgedToast from '@/components/feedback/AdminUnacknowledgedToast';

// Admin layout — wraps all /admin/* routes. Hosts the
// AdminUnacknowledgedToast (ADR-018 §5.5) so it persists across
// every admin sub-page, not just /admin/reports.

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminUnacknowledgedToast />
      {children}
    </>
  );
}
