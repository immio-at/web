import Link from 'next/link';

// ─── Impressum ────────────────────────────────────────────────────────────────
// Required fields under § 5 ECG (E-Commerce-Gesetz) and § 25 MedienG (Austria)
// Update all [PLACEHOLDER] fields before going live.
// Once GmbH is registered, update legal form, FN number, and address accordingly.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata = {
  title: 'Impressum — IMMIO',
  description: 'Pflichtangaben gemäß § 5 ECG und § 25 MedienG.',
};

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Minimal nav */}
      <nav className="bg-white border-b border-gray-200 px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-[20px] font-semibold text-primary tracking-tight">
          iM<span className="font-light">M</span>io
        </Link>
        <Link href="/" className="text-sm text-gray-500 hover:text-primary transition-colors">
          ← Zurück
        </Link>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-light text-primary tracking-tight mb-2">Impressum</h1>
        <p className="text-sm text-gray-400 font-mono mb-12">Pflichtangaben gemäß § 5 ECG und § 25 MedienG</p>

        <Section title="Angaben zum Unternehmen">
          {/*
            PRE-REGISTRATION: Use personal details until GmbH is registered.
            POST-REGISTRATION: Replace with:
              Firma: IMMIO GmbH
              Firmenbuchnummer: FN [NUMBER] [COURT]
              Firmenbuchgericht: Handelsgericht Wien
          */}
          <Field label="Name">Reece Tyrrell</Field>
          <Field label="Unternehmensgegenstand">Entwicklung und Betrieb einer SaaS-Plattform für Immobilieninvestoren</Field>
          <Field label="Rechtsform">Einzelunternehmer (GmbH in Gründung)</Field>
          {/* <Field label="Firmenbuchnummer">FN [NUMMER] [GERICHT]</Field> */}
        </Section>

        <Section title="Kontakt">
          <Field label="Adresse">[STRASSE], [PLZ] Wien, Österreich</Field>
          <Field label="Email">
            <a href="mailto:hello@immio.at" className="text-teal-600 hover:underline">hello@immio.at</a>
          </Field>
          {/* <Field label="Telefon">[NUMMER]</Field> */}
        </Section>

        <Section title="Umsatzsteuer">
          {/*
            Required once registered for VAT (Umsatzsteuer).
            Small businesses (Kleinunternehmerregelung) may be exempt initially.
            Consult your Steuerberater.
          */}
          <Field label="UID-Nummer">
            <span className="text-gray-400 italic">Wird nach Registrierung ergänzt</span>
          </Field>
        </Section>

        <Section title="Aufsichtsbehörde">
          <Field label="Zuständige Behörde">Magistrat der Stadt Wien (Magistratisches Bezirksamt)</Field>
          <Field label="Anwendbare Rechtsvorschriften">Gewerbeordnung (GewO), abrufbar unter{' '}
            <a href="https://www.ris.bka.gv.at" target="_blank" rel="noreferrer" className="text-teal-600 hover:underline">
              www.ris.bka.gv.at
            </a>
          </Field>
        </Section>

        <Section title="Online-Streitbeilegung">
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{' '}
            <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer" className="text-teal-600 hover:underline">
              https://ec.europa.eu/consumers/odr
            </a>
          </p>
          <p className="text-sm text-gray-600 font-light leading-relaxed mt-3">
            Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer
            Verbraucherschlichtungsstelle teilzunehmen.
          </p>
        </Section>

        <Section title="Haftung für Inhalte">
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            Als Diensteanbieter sind wir gemäß § 7 Abs. 1 TMG für eigene Inhalte auf diesen Seiten nach den
            allgemeinen Gesetzen verantwortlich. Die auf dieser Plattform bereitgestellten Renditeberechnungen
            und Finanzinformationen stellen keine Anlage-, Steuer- oder Rechtsberatung dar und dienen
            ausschließlich der allgemeinen Information.
          </p>
        </Section>

        <div className="mt-16 pt-8 border-t border-gray-200">
          <p className="font-mono text-[11px] text-gray-400">Zuletzt aktualisiert: März 2026</p>
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
