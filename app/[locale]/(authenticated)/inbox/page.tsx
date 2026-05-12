/**
 * ADR-020 v1.1 II8 — /inbox route.
 *
 * Authenticated route. Lists inbound_emails captured from allowlisted
 * senders that didn't become a Property row — Gmail forwarding
 * confirmations, unknown-platform messages from allowlisted senders,
 * and parser failures. Reached via the Sources tile unread indicator
 * or direct URL. Not in the top nav (see ADR-021 v1.2 cross-ref).
 */

import { getTranslations } from 'next-intl/server';
import InboxList from '@/components/inbox/InboxList';

export default async function InboxPage() {
  const t = await getTranslations('inbox');
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('pageTitle')}</h1>
      <p className="text-sm text-gray-600 mb-6">{t('pageDescription')}</p>
      <InboxList />
    </div>
  );
}
