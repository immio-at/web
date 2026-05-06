import { redirect } from 'next/navigation';

// ADR-016 §1: bare `/funnel/analyses` redirects to the Rental tab
// (the most-used and the default sort).
export default function AnalysesIndexPage() {
  redirect('/funnel/analyses/rental');
}
