import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

// ─── Datenschutzerklärung ─────────────────────────────────────────────────────
// GDPR (DSGVO) compliant privacy policy for Austria.
// All data processors (Art. 28 DSGVO) are listed with their roles.
// Update all [PLACEHOLDER] fields before going live.
//
// Legal basis references:
//   Art. 6 Abs. 1 lit. b DSGVO — contract performance
//   Art. 6 Abs. 1 lit. c DSGVO — legal obligation
//   Art. 6 Abs. 1 lit. f DSGVO — legitimate interest
//
// This is a template. Have it reviewed by a Datenschutzbeauftragter or
// Rechtsanwalt before launch, particularly the legitimate interest assessments.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata = {
  title: 'Datenschutzerklärung — IMMIO',
  description: 'Informationen zur Verarbeitung personenbezogener Daten gemäß DSGVO.',
};

export default async function DatenschutzPage() {
  const tLegal = await getTranslations('legal');
  const t = await getTranslations('legal.datenschutz');

  // Pre-fetch typed arrays from messages
  const rows = [0, 1, 2, 3, 4].map(i => [
    t(`section2.rows.${i}.0`),
    t(`section2.rows.${i}.1`),
    t(`section2.rows.${i}.2`),
  ] as [string, string, string]);

  const section3Items = [0, 1, 2, 3, 4].map(i => ({
    purpose: t(`section3.items.${i}.purpose`),
    basis: t(`section3.items.${i}.basis`),
    basisText: t(`section3.items.${i}.basisText`),
  }));

  const processors = [0, 1, 2, 3].map(i => ({
    name: t(`section4.processors.${i}.name`),
    location: t(`section4.processors.${i}.location`),
    role: t(`section4.processors.${i}.role`),
    safeguard: t(`section4.processors.${i}.safeguard`),
    url: t(`section4.processors.${i}.url`),
  }));

  const section5Items = [0, 1, 2, 3].map(i => t(`section5.items.${i}`));

  const section6Rights = [0, 1, 2, 3, 4, 5].map(i => [
    t(`section6.rights.${i}.0`),
    t(`section6.rights.${i}.1`),
  ] as [string, string]);

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

        <Section title={t('section1.title')}>
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            {t('section1.intro')}
          </p>
          <div className="mt-3 p-4 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 font-light space-y-1">
            <p>{t('section1.name')}</p>
            <p>{t('section1.address')}</p>
            <p>Email: <a href="mailto:hello@immio.at" className="text-teal-600 hover:underline">hello@immio.at</a></p>
          </div>
        </Section>

        <Section title={t('section2.title')}>
          <p className="text-sm text-gray-600 font-light leading-relaxed mb-4">
            {t('section2.intro')}
          </p>
          <DataTable
            headers={[t('section2.headerCategory'), t('section2.headerData'), t('section2.headerPurpose')]}
            rows={rows}
          />
        </Section>

        <Section title={t('section3.title')}>
          {section3Items.map((item, i) => (
            <LegalBasis
              key={i}
              purpose={item.purpose}
              basis={item.basis}
              basisText={item.basisText}
            />
          ))}
        </Section>

        <Section title={t('section4.title')}>
          <p className="text-sm text-gray-600 font-light leading-relaxed mb-4">
            {t('section4.intro')}
          </p>
          <div className="space-y-4">
            {processors.map((proc) => (
              <Processor
                key={proc.name}
                name={proc.name}
                location={proc.location}
                role={proc.role}
                safeguard={proc.safeguard}
                url={proc.url}
                privacyLinkText={t('section4.privacyLink')}
                labelLocation={t('section4.labelLocation')}
                labelRole={t('section4.labelRole')}
                labelSafeguard={t('section4.labelSafeguard')}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400 font-light mt-4 leading-relaxed">
            {t('section4.note')}
          </p>
        </Section>

        <Section title={t('section5.title')}>
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            {t('section5.intro')}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-gray-600 font-light">
            {section5Items.map((item, i) => (
              <li key={i} className="flex gap-2"><span className="text-gray-300 shrink-0">&mdash;</span>{item}</li>
            ))}
          </ul>
        </Section>

        <Section title={t('section6.title')}>
          <p className="text-sm text-gray-600 font-light leading-relaxed mb-3">
            {t('section6.intro')}
          </p>
          <ul className="space-y-2 text-sm text-gray-600 font-light">
            {section6Rights.map(([right, desc]) => (
              <li key={right} className="flex gap-3">
                <span className="font-medium text-primary shrink-0 min-w-[180px]">{right}</span>
                <span>{desc}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-gray-600 font-light">
            {t('section6.contactText')}{' '}
            <a href="mailto:hello@immio.at" className="text-teal-600 hover:underline">hello@immio.at</a>
          </p>
        </Section>

        <Section title={t('section7.title')}>
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            {t('section7.intro')}
          </p>
          <div className="mt-3 p-4 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 font-light space-y-1">
            <p className="font-medium text-primary">{t('section7.authorityName')}</p>
            <p>{t('section7.authorityAddress')}</p>
            <p>
              <a href="https://www.dsb.gv.at" target="_blank" rel="noreferrer" className="text-teal-600 hover:underline">
                www.dsb.gv.at
              </a>
            </p>
          </div>
        </Section>

        <Section title={t('section8.title')}>
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            {t('section8.text')}
          </p>
        </Section>

        <Section title={t('section9.title')}>
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            {t('section9.text')}
          </p>
        </Section>

        <div className="mt-16 pt-8 border-t border-gray-200 flex justify-between items-center">
          <p className="font-mono text-[11px] text-gray-400">{t('lastUpdated')}</p>
          <p className="font-mono text-[11px] text-gray-400">{t('version')}</p>
        </div>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-12">
      <h2 className="text-xs font-mono uppercase tracking-widest text-gray-400 mb-5 pb-2 border-b border-gray-200">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: [string, string, string]; rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            {headers.map((h) => (
              <th key={h} className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 pr-4 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([cat, data, purpose]) => (
            <tr key={cat} className="border-t border-gray-100">
              <td className="py-2.5 pr-4 text-primary font-medium align-top">{cat}</td>
              <td className="py-2.5 pr-4 text-gray-500 font-light align-top">{data}</td>
              <td className="py-2.5 text-gray-500 font-light align-top">{purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LegalBasis({ purpose, basis, basisText }: { purpose: string; basis: string; basisText: string }) {
  return (
    <div className="flex gap-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600 font-light flex-1">{purpose}</span>
      <span className="text-xs font-mono text-teal-600 bg-teal-50 px-2 py-0.5 rounded self-start shrink-0 whitespace-nowrap">
        {basisText}
      </span>
    </div>
  );
}

function Processor({
  name, location, role, safeguard, url,
  privacyLinkText, labelLocation, labelRole, labelSafeguard,
}: {
  name: string; location: string; role: string; safeguard: string; url: string;
  privacyLinkText: string; labelLocation: string; labelRole: string; labelSafeguard: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <p className="text-sm font-medium text-primary">{name}</p>
        <a href={url} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-teal-600 hover:underline shrink-0">
          {privacyLinkText}
        </a>
      </div>
      <div className="space-y-1">
        <ProcessorRow label={labelLocation} value={location} />
        <ProcessorRow label={labelRole} value={role} />
        <ProcessorRow label={labelSafeguard} value={safeguard} />
      </div>
    </div>
  );
}

function ProcessorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="text-gray-400 font-light min-w-[100px] shrink-0">{label}</span>
      <span className="text-gray-600 font-light">{value}</span>
    </div>
  );
}
