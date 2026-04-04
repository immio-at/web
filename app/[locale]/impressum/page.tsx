import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

// ─── Impressum ────────────────────────────────────────────────────────────────
// Required fields under § 5 ECG (E-Commerce-Gesetz) and § 25 MedienG (Austria)
// Update all [PLACEHOLDER] fields before going live.
// Once GmbH is registered, update legal form, FN number, and address accordingly.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata = {
  title: 'Impressum — IMMIO',
  description: 'Pflichtangaben gemäß § 5 ECG und § 25 MedienG.',
};

export default async function ImpressumPage() {
  const tLegal = await getTranslations('legal');
  const t = await getTranslations('legal.impressum');

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Minimal nav */}
      <nav className="bg-white border-b border-gray-200 px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-2xl text-gray-900 flex-shrink-0">
          IM<span className="text-3xl">M</span>IO
        </Link>
        <Link href="/" className="text-sm text-gray-500 hover:text-primary transition-colors">
          {tLegal('back')}
        </Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-light text-primary tracking-tight mb-2">{t('title')}</h1>
        <p className="text-sm text-gray-400 font-mono mb-12">{t('subtitle')}</p>

        <Section title={t('company.title')}>
          {/*
            PRE-REGISTRATION: Use personal details until GmbH is registered.
            POST-REGISTRATION: Replace with:
              Firma: IMMIO GmbH
              Firmenbuchnummer: FN [NUMBER] [COURT]
              Firmenbuchgericht: Handelsgericht Wien
          */}
          <Field label={t('company.nameLabel')}>{t('company.nameValue')}</Field>
          <Field label={t('company.purposeLabel')}>{t('company.purposeValue')}</Field>
          <Field label={t('company.legalFormLabel')}>{t('company.legalFormValue')}</Field>
          {/* <Field label="Firmenbuchnummer">FN [NUMMER] [GERICHT]</Field> */}
        </Section>

        <Section title={t('contact.title')}>
          <Field label={t('contact.addressLabel')}>{t('contact.addressValue')}</Field>
          <Field label={t('contact.emailLabel')}>
            <a href="mailto:hello@immio.at" className="text-teal-600 hover:underline">hello@immio.at</a>
          </Field>
          {/* <Field label="Telefon">[NUMMER]</Field> */}
        </Section>

        <Section title={t('vat.title')}>
          {/*
            Required once registered for VAT (Umsatzsteuer).
            Small businesses (Kleinunternehmerregelung) may be exempt initially.
            Consult your Steuerberater.
          */}
          <Field label={t('vat.uidLabel')}>
            <span className="text-gray-400 italic">{t('vat.uidValue')}</span>
          </Field>
        </Section>

        <Section title={t('authority.title')}>
          <Field label={t('authority.authorityLabel')}>{t('authority.authorityValue')}</Field>
          <Field label={t('authority.lawLabel')}>{t('authority.lawValue')}{' '}
            <a href="https://www.ris.bka.gv.at" target="_blank" rel="noreferrer" className="text-teal-600 hover:underline">
              www.ris.bka.gv.at
            </a>
          </Field>
        </Section>

        <Section title={t('odr.title')}>
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            {t('odr.text1')}{' '}
            <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer" className="text-teal-600 hover:underline">
              https://ec.europa.eu/consumers/odr
            </a>
          </p>
          <p className="text-sm text-gray-600 font-light leading-relaxed mt-3">
            {t('odr.text2')}
          </p>
        </Section>

        <Section title={t('liability.title')}>
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            {t('liability.text')}
          </p>
        </Section>

        <div className="mt-16 pt-8 border-t border-gray-200">
          <p className="font-mono text-[11px] text-gray-400">{t('lastUpdated')}</p>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-xs font-mono uppercase tracking-widest text-gray-400 mb-4 pb-2 border-b border-gray-200">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="text-sm text-gray-400 font-light min-w-[160px] shrink-0">{label}</span>
      <span className="text-sm text-gray-700 font-light">{children}</span>
    </div>
  );
}
