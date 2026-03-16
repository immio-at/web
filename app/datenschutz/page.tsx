import Link from 'next/link';

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

export default function DatenschutzPage() {
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
        <h1 className="text-3xl font-light text-primary tracking-tight mb-2">Datenschutzerklärung</h1>
        <p className="text-sm text-gray-400 font-mono mb-12">Gemäß Art. 13 und 14 DSGVO (EU 2016/679)</p>

        <Section title="1. Verantwortlicher">
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            Verantwortlicher im Sinne der DSGVO ist:
          </p>
          <div className="mt-3 p-4 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 font-light space-y-1">
            <p>Reece Tyrrell (IMMIO GmbH in Gründung)</p>
            <p>[STRASSE], [PLZ] Wien, Österreich</p>
            <p>Email: <a href="mailto:hello@immio.at" className="text-teal-600 hover:underline">hello@immio.at</a></p>
          </div>
        </Section>

        <Section title="2. Welche Daten wir verarbeiten">
          <p className="text-sm text-gray-600 font-light leading-relaxed mb-4">
            Wir verarbeiten folgende Kategorien personenbezogener Daten:
          </p>
          <DataTable rows={[
            ['Kontodaten', 'Email-Adresse, Passwort (gehasht)', 'Registrierung & Login'],
            ['IMMIO-Adresse', 'Zugewiesene @mail.immio.at Adresse', 'Email-Weiterleitung'],
            ['Immobiliendaten', 'Aus Emails extrahierte Objektdaten (Preis, Größe, Lage etc.)', 'Kernfunktion der Plattform'],
            ['Analysedaten', 'Vom Nutzer eingegebene Renditeberechnungen', 'Gespeicherte Analysen'],
            ['Nutzungsdaten', 'Log-Daten, IP-Adresse, Browser-Typ', 'Sicherheit & Fehlerbehebung'],
          ]} />
        </Section>

        <Section title="3. Zwecke und Rechtsgrundlagen der Verarbeitung">
          <LegalBasis
            purpose="Bereitstellung der Plattform (Registrierung, Login, Kernfunktionen)"
            basis="Art. 6 Abs. 1 lit. b DSGVO"
            basisText="Vertragserfüllung"
          />
          <LegalBasis
            purpose="Empfang und Verarbeitung von Suchagenten-Emails"
            basis="Art. 6 Abs. 1 lit. b DSGVO"
            basisText="Vertragserfüllung"
          />
          <LegalBasis
            purpose="Speicherung von Immobiliendaten und Analysen"
            basis="Art. 6 Abs. 1 lit. b DSGVO"
            basisText="Vertragserfüllung"
          />
          <LegalBasis
            purpose="Technischer Betrieb, Sicherheit, Fehlerbehebung"
            basis="Art. 6 Abs. 1 lit. f DSGVO"
            basisText="Berechtigtes Interesse"
          />
          <LegalBasis
            purpose="Erfüllung gesetzlicher Aufbewahrungspflichten"
            basis="Art. 6 Abs. 1 lit. c DSGVO"
            basisText="Rechtliche Verpflichtung"
          />
        </Section>

        <Section title="4. Auftragsverarbeiter (Art. 28 DSGVO)">
          <p className="text-sm text-gray-600 font-light leading-relaxed mb-4">
            Wir setzen folgende Dienstleister als Auftragsverarbeiter ein, mit denen
            Auftragsverarbeitungsverträge (AVV) gemäß Art. 28 DSGVO abgeschlossen wurden oder werden:
          </p>
          <div className="space-y-4">
            <Processor
              name="Supabase Inc."
              location="USA (EU-Region: eu-west-1)"
              role="Datenbankhosting (PostgreSQL), Nutzerauthentifizierung"
              safeguard="EU Standardvertragsklauseln (SCC)"
              url="https://supabase.com/privacy"
            />
            <Processor
              name="Twilio SendGrid"
              location="USA"
              role="Empfang und Weiterleitung von Suchagenten-Emails (Inbound Parse)"
              safeguard="EU Standardvertragsklauseln (SCC)"
              url="https://www.twilio.com/en-us/legal/privacy"
            />
            <Processor
              name="Vercel Inc."
              location="USA (CDN-Nodes in der EU)"
              role="Hosting des Frontends (immio.at)"
              safeguard="EU Standardvertragsklauseln (SCC)"
              url="https://vercel.com/legal/privacy-policy"
            />
            <Processor
              name="Railway Corp."
              location="USA"
              role="Hosting des Backends (API)"
              safeguard="EU Standardvertragsklauseln (SCC)"
              url="https://railway.app/legal/privacy"
            />
          </div>
          <p className="text-xs text-gray-400 font-light mt-4 leading-relaxed">
            Alle genannten Anbieter mit Sitz außerhalb der EU/EWR übermitteln Daten auf Basis von
            EU-Standardvertragsklauseln gemäß Art. 46 Abs. 2 lit. c DSGVO.
          </p>
        </Section>

        <Section title="5. Speicherdauer">
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            Personenbezogene Daten werden nur so lange gespeichert, wie es für die jeweiligen Zwecke
            erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen:
          </p>
          <ul className="mt-3 space-y-2 text-sm text-gray-600 font-light">
            <li className="flex gap-2"><span className="text-gray-300 shrink-0">—</span>Kontodaten: bis zur Löschung des Kontos, danach unverzüglich gelöscht</li>
            <li className="flex gap-2"><span className="text-gray-300 shrink-0">—</span>Immobilien- und Analysedaten: bis zur Kontoauflösung oder auf Nutzerwunsch</li>
            <li className="flex gap-2"><span className="text-gray-300 shrink-0">—</span>Log-Daten: maximal 90 Tage</li>
            <li className="flex gap-2"><span className="text-gray-300 shrink-0">—</span>Buchungsrelevante Daten: 7 Jahre gemäß § 132 BAO (österreichisches Steuerrecht)</li>
          </ul>
        </Section>

        <Section title="6. Ihre Rechte (Art. 15–22 DSGVO)">
          <p className="text-sm text-gray-600 font-light leading-relaxed mb-3">
            Sie haben folgende Rechte bezüglich Ihrer personenbezogenen Daten:
          </p>
          <ul className="space-y-2 text-sm text-gray-600 font-light">
            {[
              ['Auskunft (Art. 15)', 'Welche Daten wir über Sie speichern'],
              ['Berichtigung (Art. 16)', 'Korrektur unrichtiger Daten'],
              ['Löschung (Art. 17)', 'Löschung Ihrer Daten ("Recht auf Vergessenwerden")'],
              ['Einschränkung (Art. 18)', 'Einschränkung der Verarbeitung'],
              ['Datenübertragbarkeit (Art. 20)', 'Export Ihrer Daten in maschinenlesbarem Format'],
              ['Widerspruch (Art. 21)', 'Widerspruch gegen die Verarbeitung auf Basis berechtigten Interesses'],
            ].map(([right, desc]) => (
              <li key={right} className="flex gap-3">
                <span className="font-medium text-primary shrink-0 min-w-[180px]">{right}</span>
                <span>{desc}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-gray-600 font-light">
            Zur Ausübung Ihrer Rechte wenden Sie sich an:{' '}
            <a href="mailto:hello@immio.at" className="text-teal-600 hover:underline">hello@immio.at</a>
          </p>
        </Section>

        <Section title="7. Beschwerderecht">
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            Sie haben das Recht, sich bei der zuständigen Datenschutzbehörde zu beschweren.
            Für Österreich ist dies:
          </p>
          <div className="mt-3 p-4 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 font-light space-y-1">
            <p className="font-medium text-primary">Österreichische Datenschutzbehörde</p>
            <p>Barichgasse 40–42, 1030 Wien</p>
            <p>
              <a href="https://www.dsb.gv.at" target="_blank" rel="noreferrer" className="text-teal-600 hover:underline">
                www.dsb.gv.at
              </a>
            </p>
          </div>
        </Section>

        <Section title="8. Cookies">
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            IMMIO verwendet ausschließlich technisch notwendige Cookies für die Sitzungsverwaltung
            (Authentifizierungstoken). Es werden keine Tracking-, Werbe- oder Analyse-Cookies eingesetzt.
            Es sind daher keine Cookie-Einwilligungen erforderlich.
          </p>
        </Section>

        <Section title="9. Änderungen dieser Datenschutzerklärung">
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            Wir behalten uns vor, diese Datenschutzerklärung bei Änderungen der Plattform oder der
            rechtlichen Anforderungen anzupassen. Die jeweils aktuelle Version ist auf dieser Seite
            verfügbar. Bei wesentlichen Änderungen informieren wir registrierte Nutzer per Email.
          </p>
        </Section>

        <div className="mt-16 pt-8 border-t border-gray-200 flex justify-between items-center">
          <p className="font-mono text-[11px] text-gray-400">Zuletzt aktualisiert: März 2026</p>
          <p className="font-mono text-[11px] text-gray-400">Version 1.0</p>
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

function DataTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 pr-4 font-normal">Kategorie</th>
            <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 pr-4 font-normal">Daten</th>
            <th className="font-mono text-[10px] uppercase tracking-widest text-gray-400 pb-3 font-normal">Zweck</th>
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
}: {
  name: string; location: string; role: string; safeguard: string; url: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <p className="text-sm font-medium text-primary">{name}</p>
        <a href={url} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-teal-600 hover:underline shrink-0">
          Datenschutz ↗
        </a>
      </div>
      <div className="space-y-1">
        <ProcessorRow label="Standort" value={location} />
        <ProcessorRow label="Rolle" value={role} />
        <ProcessorRow label="Schutzmaßnahme" value={safeguard} />
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
