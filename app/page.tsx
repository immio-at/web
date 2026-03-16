'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ─── i18n ─────────────────────────────────────────────────────────────────────

const copy = {
  de: {
    navHow: 'So funktioniert es',
    navFeatures: 'Funktionen',
    navPricing: 'Preise',
    navSignIn: 'Anmelden',
    navCta: 'Frühen Zugang beantragen',
    badge: 'Früher Zugang — jetzt beantragen',
    h1Line1: 'Jede Immobilie.',
    h1Line2: 'Eine Plattform.',
    h1Line3: 'Kein Chaos.',
    sub: 'IMMIO erfasst Willhaben & Immoscout24-Angebote automatisch per Email, berechnet Renditen in Echtzeit und führt dich durch den gesamten Kaufprozess.',
    heroCta: 'Zugang beantragen',
    heroPlaceholder: 'deine@email.at',
    heroNote: 'Keine Kreditkarte · Keine Verpflichtungen · 2 Wochen Pro gratis',
    marketPrefix: 'Österreichischer Immobilienmarkt —',
    marketNumber: '63.000+',
    marketSuffix: 'aktive Inserate auf Willhaben & Co.',
    marketClaim: 'IMMIO erfasst sie alle.',
    probLabel: 'Das Problem',
    probH2a: 'Immobilieninvestment',
    probH2b: 'ist strukturlos',
    probSub: 'Die meisten Privatinvestoren jonglieren zwischen Suchagenten, Excel, Browser-Tabs und Notizzetteln. Nichts ist verbunden. Entscheidungen gehen verloren.',
    prob1Title: 'Excel für ROI-Berechnungen',
    prob1Body: 'Jede Immobilie bekommt eine eigene Tabelle. Formeln werden kopiert, Fehler schleichen sich ein. Kein Vergleich möglich.',
    prob2Title: 'Suchagenten-Emails versanden',
    prob2Body: 'Täglich Dutzende Benachrichtigungen. Interessante Objekte gehen im Posteingang unter — oft bevor du sie je gesehen hast.',
    prob3Title: 'Kein Kaufprozess-Überblick',
    prob3Body: 'Von der Besichtigung bis zum Notar: keine Pipeline, kein Überblick, kein Gedächtnis für getroffene Entscheidungen.',
    hiwLabel: 'So funktioniert es',
    hiwH2a: 'Von der Email zur',
    hiwH2b: 'Kaufentscheidung',
    hiwSub: 'Drei Schritte. Kein Setup. Vollautomatisch.',
    step1Num: 'Schritt 01',
    step1Title: 'Suchagent weiterleiten',
    step1Body: 'Du erhältst eine persönliche IMMIO-Adresse. Leite deine Willhaben- und Immoscout24-Suchagenten einfach dorthin weiter. Kein Scraping, keine AGB-Verstöße.',
    step1Chip: 'user_xxx@mail.immio.at',
    step2Num: 'Schritt 02',
    step2Title: 'Automatische Extraktion',
    step2Body: 'IMMIO parst jede Email und extrahiert Preis, Größe, Lage, Zimmer und Originallink — vollautomatisch, in Sekunden.',
    step2Chip: '9 Felder strukturiert',
    step3Num: 'Schritt 03',
    step3Title: 'Analysieren & entscheiden',
    step3Body: 'Dashboard, Renditerechner, Kaufprozess-Funnel und Finder in einem Portal. Alle Daten bleiben am Objekt gespeichert.',
    step3Chip: 'ROI in Echtzeit',
    featLabel: 'Funktionen',
    featH2a: 'Alles was du brauchst.',
    featH2b: 'Nichts was du nicht brauchst.',
    featSub: 'Vier Module, die zusammenarbeiten — von der ersten Email bis zum Kaufabschluss.',
    feat1Tag: 'Dashboard',
    feat1Title: 'Alle Objekte im Überblick',
    feat1Body: 'Kachel- und Tabellenansicht, Sofortsuche, Filter nach Plattform, Preis und Größe. Alle Daten aus deinen Suchagenten — strukturiert auf einem Screen.',
    feat1Pills: ['Kachelansicht', 'Tabellenansicht', 'Sofortsuche', '€/m²'],
    feat2Tag: 'Renditerechner',
    feat2Title: 'ROI — Vermietung, Eigennutzung, Flip',
    feat2Body: 'Kaufnebenkosten, Finanzierung, Cashflow, Brutto-/Nettomietrendite, Eigenkapitalrendite. Alle Berechnungen lokal im Browser — keine Serverlatenz.',
    feat2Pills: ['Vermietung', 'Eigennutzung', 'Flip', 'Diagramme'],
    feat3Tag: 'Kaufprozess-Funnel',
    feat3Title: 'Von der Besichtigung bis zum Notar',
    feat3Body: 'Kanban-Board mit 8 Stufen. Drag & Drop, Durchschnittspreise pro Spalte. Jedes Objekt strukturiert durch den Prozess geführt.',
    feat3Pills: ['8 Stufen', 'Drag & Drop', 'Preisstatistik'],
    feat4Tag: 'Finder',
    feat4Title: 'Schnellentscheidung per Swipe',
    feat4Body: 'Tinder-ähnliche Oberfläche für schnelle Vorselektion. Links: nicht relevant. Rechts: interessiert. Runter: Analyse öffnen. Oben: Originalinserat.',
    feat4Pills: ['Swipe UI', 'Optimistische Updates', 'Sofort'],
    priceLabel: 'Preise',
    priceH2a: 'Transparent.',
    priceH2b: 'Keine Überraschungen.',
    priceSub: 'Alle Tarife starten mit 2 Wochen Pro — kostenlos, keine Kreditkarte.',
    tier1Name: 'Free',
    tier1Price: '0',
    tier1Cadence: 'für immer',
    tier1Features: [
      { included: true,  text: 'Manuelle Einträge' },
      { included: true,  text: 'Bis zu 5 Objekte' },
      { included: false, text: 'Email-Parsing' },
      { included: false, text: 'Kaufprozess-Funnel' },
      { included: false, text: 'Renditerechner' },
      { included: false, text: 'Finder' },
    ],
    tier1Cta: 'Kostenlos starten',
    tier2Name: 'Light',
    tier2Price: '29',
    tier2Cents: '.99',
    tier2Cadence: '/Monat · oder €329/Jahr',
    tier2Badge: 'Empfohlen',
    tier2Features: [
      { included: true,  text: 'Email-Parsing' },
      { included: true,  text: '20 Suchagenten' },
      { included: true,  text: 'Kaufprozess-Funnel' },
      { included: true,  text: 'Renditerechner' },
      { included: true,  text: 'Finder' },
      { included: false, text: 'Analytics & Karte' },
    ],
    tier2Cta: 'Frühen Zugang beantragen',
    tier3Name: 'Pro',
    tier3Price: '39',
    tier3Cents: '.99',
    tier3Cadence: '/Monat · oder €429/Jahr',
    tier3Features: [
      { included: true, text: 'Alles aus Light' },
      { included: true, text: 'Unbegrenzte Suchagenten' },
      { included: true, text: 'Analytics-Dashboard' },
      { included: true, text: 'Intelligente Karte' },
      { included: true, text: 'Prioritäts-Support' },
      { included: true, text: 'Frühe Feature-Zugänge' },
    ],
    tier3Cta: 'Pro beantragen',
    footerPrivacy: 'Datenschutz',
    footerImprint: 'Impressum',
    footerContact: 'Kontakt',
    footerCopy: '© 2026 IMMIO GmbH (in Gründung)',
    langToggle: 'EN',
    // Modal
    modalTitle: 'Willkommen zurück',
    modalSub: 'Mit deinem IMMIO-Konto anmelden',
    modalEmail: 'Email',
    modalPassword: 'Passwort',
    modalEmailPlaceholder: 'deine@email.at',
    modalPasswordPlaceholder: '••••••••',
    modalSubmit: 'Anmelden',
    modalSubmitting: 'Wird angemeldet…',
    modalNoAccount: 'Noch kein Konto?',
    modalRegister: 'Registrieren',
    modalSessionExpired: 'Deine Sitzung ist abgelaufen. Bitte erneut anmelden.',
  },
  en: {
    navHow: 'How it works',
    navFeatures: 'Features',
    navPricing: 'Pricing',
    navSignIn: 'Sign in',
    navCta: 'Request early access',
    badge: 'Early access — apply now',
    h1Line1: 'Every property.',
    h1Line2: 'One platform.',
    h1Line3: 'No chaos.',
    sub: 'IMMIO automatically captures listings from Willhaben & Immoscout24 via email, calculates returns in real-time, and guides you through the entire buying process.',
    heroCta: 'Request access',
    heroPlaceholder: 'your@email.at',
    heroNote: 'No credit card · No commitments · 2 weeks Pro free',
    marketPrefix: 'Austrian property market —',
    marketNumber: '63,000+',
    marketSuffix: 'active listings on Willhaben & more.',
    marketClaim: 'IMMIO captures them all.',
    probLabel: 'The problem',
    probH2a: 'Property investment',
    probH2b: 'is structureless',
    probSub: 'Most private investors juggle search agents, Excel, browser tabs and sticky notes. Nothing is connected. Decisions get lost.',
    prob1Title: 'Excel for ROI calculations',
    prob1Body: 'Every property gets its own spreadsheet. Formulas get copied, errors creep in. No comparison possible.',
    prob2Title: 'Search agent emails pile up',
    prob2Body: 'Dozens of notifications daily. Interesting properties get buried in the inbox — often before you ever see them.',
    prob3Title: 'No buying process overview',
    prob3Body: 'From viewing to notary: no pipeline, no overview, no memory of decisions made.',
    hiwLabel: 'How it works',
    hiwH2a: 'From email to',
    hiwH2b: 'buying decision',
    hiwSub: 'Three steps. No setup. Fully automatic.',
    step1Num: 'Step 01',
    step1Title: 'Forward your search agent',
    step1Body: 'You get a personal IMMIO address. Simply forward your Willhaben and Immoscout24 search agent emails there. No scraping, no terms violations.',
    step1Chip: 'user_xxx@mail.immio.at',
    step2Num: 'Step 02',
    step2Title: 'Automatic extraction',
    step2Body: 'IMMIO parses every email and extracts price, size, location, rooms and the original listing link — automatically, in seconds.',
    step2Chip: '9 fields structured',
    step3Num: 'Step 03',
    step3Title: 'Analyse & decide',
    step3Body: 'Dashboard, ROI calculator, buying funnel and Finder in one portal. All data stays attached to the property.',
    step3Chip: 'ROI in real-time',
    featLabel: 'Features',
    featH2a: 'Everything you need.',
    featH2b: "Nothing you don't.",
    featSub: 'Four modules that work together — from first email to purchase completion.',
    feat1Tag: 'Dashboard',
    feat1Title: 'All properties at a glance',
    feat1Body: 'Tile and table view, instant search, filter by platform, price and size. All data from your search agents — structured on one screen.',
    feat1Pills: ['Tile view', 'Table view', 'Instant search', '€/m²'],
    feat2Tag: 'ROI Calculator',
    feat2Title: 'ROI — rental, owner-occupied, flip',
    feat2Body: 'Purchase costs, financing, cashflow, gross/net rental yield, return on equity. All calculations locally in the browser — no server latency.',
    feat2Pills: ['Rental', 'Owner-occupied', 'Flip', 'Charts'],
    feat3Tag: 'Buying Funnel',
    feat3Title: 'From viewing to notary',
    feat3Body: 'Kanban board with 8 stages. Drag & drop, average prices per column. Every property guided through the process.',
    feat3Pills: ['8 stages', 'Drag & drop', 'Price stats'],
    feat4Tag: 'Finder',
    feat4Title: 'Quick decisions by swipe',
    feat4Body: 'Tinder-like interface for rapid pre-selection. Left: not relevant. Right: interested. Down: open analysis. Up: original listing.',
    feat4Pills: ['Swipe UI', 'Optimistic updates', 'Instant'],
    priceLabel: 'Pricing',
    priceH2a: 'Transparent.',
    priceH2b: 'No surprises.',
    priceSub: 'All plans start with 2 weeks of Pro — free, no credit card.',
    tier1Name: 'Free',
    tier1Price: '0',
    tier1Cadence: 'forever',
    tier1Features: [
      { included: true,  text: 'Manual entries' },
      { included: true,  text: 'Up to 5 properties' },
      { included: false, text: 'Email parsing' },
      { included: false, text: 'Buying funnel' },
      { included: false, text: 'ROI calculator' },
      { included: false, text: 'Finder' },
    ],
    tier1Cta: 'Start free',
    tier2Name: 'Light',
    tier2Price: '29',
    tier2Cents: '.99',
    tier2Cadence: '/month · or €329/year',
    tier2Badge: 'Recommended',
    tier2Features: [
      { included: true,  text: 'Email parsing' },
      { included: true,  text: '20 search agents' },
      { included: true,  text: 'Buying funnel' },
      { included: true,  text: 'ROI calculator' },
      { included: true,  text: 'Finder' },
      { included: false, text: 'Analytics & map' },
    ],
    tier2Cta: 'Request early access',
    tier3Name: 'Pro',
    tier3Price: '39',
    tier3Cents: '.99',
    tier3Cadence: '/month · or €429/year',
    tier3Features: [
      { included: true, text: 'Everything in Light' },
      { included: true, text: 'Unlimited search agents' },
      { included: true, text: 'Analytics dashboard' },
      { included: true, text: 'Intelligent map' },
      { included: true, text: 'Priority support' },
      { included: true, text: 'Early feature access' },
    ],
    tier3Cta: 'Apply for Pro',
    footerPrivacy: 'Privacy Policy',
    footerImprint: 'Imprint',
    footerContact: 'Contact',
    footerCopy: '© 2026 IMMIO GmbH (in formation)',
    langToggle: 'DE',
    // Modal
    modalTitle: 'Welcome back',
    modalSub: 'Sign in to your IMMIO account',
    modalEmail: 'Email',
    modalPassword: 'Password',
    modalEmailPlaceholder: 'your@email.at',
    modalPasswordPlaceholder: '••••••••',
    modalSubmit: 'Sign in',
    modalSubmitting: 'Signing in…',
    modalNoAccount: "Don't have an account?",
    modalRegister: 'Register',
    modalSessionExpired: 'Your session expired. Please sign in again.',
  },
} as const;

type Lang = keyof typeof copy;

// ─── Sign In Modal ────────────────────────────────────────────────────────────

function SignInModal({
  open,
  onClose,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  lang: Lang;
}) {
  const t = copy[lang];
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
    [onClose],
  );
  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) { setEmail(''); setPassword(''); setError(''); setLoading(false); }
  }, [open]);

  async function handleLogin() {
    if (!email || !password) { setError('Bitte Email und Passwort eingeben.'); return; }
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Login fehlgeschlagen');
        return;
      }

      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('userEmail', data.email);
      localStorage.setItem('immioEmail', data.immioEmail);
      localStorage.setItem('approved', String(data.approved));

      if (!data.approved) {
        router.push('/pending');
        return;
      }

      router.push('/dashboard');

    } catch {
      setError('Verbindung zum Server fehlgeschlagen.');
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(15, 31, 61, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      {/* Panel — stop propagation so clicks inside don't close */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors text-xl leading-none"
          aria-label="Schließen"
        >
          ✕
        </button>

        {/* Header */}
        <div className="mb-6">
          <p className="text-[11px] font-mono uppercase tracking-widest text-teal-600 mb-1">IMMIO</p>
          <h2 className="text-xl font-semibold text-primary">{t.modalTitle}</h2>
          <p className="text-sm text-gray-500 font-light mt-1">{t.modalSub}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {t.modalEmail}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.modalEmailPlaceholder}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-primary bg-white outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              {t.modalPassword}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder={t.modalPasswordPlaceholder}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-primary bg-white outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)] transition-all"
            />
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-light disabled:opacity-50 text-white font-medium text-sm py-2.5 rounded-lg transition-colors mt-2"
          >
            {loading ? t.modalSubmitting : t.modalSubmit}
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          {t.modalNoAccount}{' '}
          <Link href="/register" className="text-teal-600 hover:underline font-medium">
            {t.modalRegister}
          </Link>
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LabelTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-widest uppercase text-teal-600 bg-teal-50 px-3 py-1 rounded-full mb-5">
      {children}
    </span>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <span className="font-mono text-[10px] bg-gray-50 border border-gray-200 text-gray-400 px-2.5 py-0.5 rounded-full">
      {text}
    </span>
  );
}

function FeatureRow({ included, text }: { included: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2 text-sm text-gray-500 py-1.5 border-b border-gray-100 last:border-0 font-light">
      {included
        ? <span className="text-teal-600 text-xs font-semibold">✓</span>
        : <span className="text-gray-300 text-xs">—</span>
      }
      {text}
    </li>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>('de');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();
  const t = copy[lang];

  // Redirect logged-in users to dashboard; show landing page to everyone else.
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      router.push('/dashboard');
    } else {
      setAuthChecked(true);
    }
  }, [router]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">Laden…</p>
      </div>
    );
  }

  function handleRegister() {
    if (!email || !email.includes('@')) {
      setEmailError(true);
      setTimeout(() => setEmailError(false), 2000);
      return;
    }
    router.push(`/register?email=${encodeURIComponent(email)}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">

      {/* Sign In Modal */}
      <SignInModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        lang={lang}
      />

      {/* NAV */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-2xl text-gray-900 flex-shrink-0">
            IM<span className="text-3xl">M</span>IO
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#how" className="text-sm text-gray-500 hover:text-primary transition-colors">{t.navHow}</a>
            <a href="#features" className="text-sm text-gray-500 hover:text-primary transition-colors">{t.navFeatures}</a>
            <a href="#pricing" className="text-sm text-gray-500 hover:text-primary transition-colors">{t.navPricing}</a>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLang(lang === 'de' ? 'en' : 'de')}
              className="font-mono text-[11px] text-gray-400 border border-gray-200 rounded px-2 py-1 hover:text-gray-700 hover:border-gray-300 transition-colors"
            >
              {t.langToggle}
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="text-sm text-gray-600 hover:text-primary font-medium transition-colors px-3 py-2"
            >
              {t.navSignIn}
            </button>
            <Link
              href="/register"
              className="bg-primary text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-primary-light transition-colors"
            >
              {t.navCta}
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="bg-white border-b border-gray-200 px-6 py-20 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(245,166,35,0.06),transparent)] pointer-events-none" />
        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5 text-xs font-medium text-amber-800 mb-8">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
            {t.badge}
          </div>
          <h1 className="text-4xl md:text-6xl font-light leading-[1.1] tracking-tight text-primary mb-5">
            {t.h1Line1}<br />
            <em className="not-italic text-accent font-semibold">{t.h1Line2}</em><br />
            {t.h1Line3}
          </h1>
          <p className="text-lg text-gray-500 font-light leading-relaxed mb-10 max-w-xl mx-auto">
            {t.sub}
          </p>
          <div className="flex gap-2 max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              placeholder={t.heroPlaceholder}
              className={`flex-1 border rounded-lg px-4 py-3 text-sm text-primary bg-white outline-none transition-all
                ${emailError
                  ? 'border-red-400 shadow-[0_0_0_3px_rgba(229,62,62,0.12)]'
                  : 'border-gray-300 focus:border-primary focus:shadow-[0_0_0_3px_rgba(15,31,61,0.08)]'
                }`}
            />
            <button
              onClick={handleRegister}
              className="bg-accent hover:bg-accent-light active:scale-95 text-primary font-semibold text-sm px-5 py-3 rounded-lg whitespace-nowrap transition-all shadow-[0_2px_8px_rgba(245,166,35,0.35)]"
            >
              {t.heroCta}
            </button>
          </div>
          <p className="font-mono text-[11px] text-gray-400 mt-3">{t.heroNote}</p>
        </div>
      </section>

      {/* MARKET BANNER */}
      <div className="bg-primary px-6 py-4 flex flex-wrap items-center justify-center gap-2 text-center">
        <span className="text-sm text-white/60 font-light">{t.marketPrefix}</span>
        <span className="font-mono text-base font-medium text-accent">{t.marketNumber}</span>
        <span className="text-sm text-white/60 font-light">{t.marketSuffix}</span>
        <span className="text-white/20 text-lg mx-1">·</span>
        <span className="text-sm text-white/60 font-light">{t.marketClaim}</span>
      </div>

      {/* PROBLEM */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <LabelTag>{t.probLabel}</LabelTag>
          <h2 className="text-4xl font-light tracking-tight text-primary leading-tight mb-4">
            {t.probH2a}<br />
            <em className="not-italic text-accent font-semibold">{t.probH2b}</em>
          </h2>
          <p className="text-gray-500 font-light leading-relaxed mb-10 max-w-lg">{t.probSub}</p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: '📋', title: t.prob1Title, body: t.prob1Body },
              { icon: '📬', title: t.prob2Title, body: t.prob2Body },
              { icon: '🗂', title: t.prob3Title, body: t.prob3Body },
            ].map((card) => (
              <div key={card.title} className="bg-white border border-gray-200 rounded-xl p-7 shadow-sm">
                <span className="text-xl mb-3 block">{card.icon}</span>
                <p className="text-sm font-medium text-primary mb-2">{card.title}</p>
                <p className="text-sm text-gray-500 leading-relaxed font-light">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-20 px-6 bg-white border-t border-b border-gray-200">
        <div className="max-w-5xl mx-auto">
          <LabelTag>{t.hiwLabel}</LabelTag>
          <h2 className="text-4xl font-light tracking-tight text-primary leading-tight mb-4">
            {t.hiwH2a}<br />
            <em className="not-italic text-accent font-semibold">{t.hiwH2b}</em>
          </h2>
          <p className="text-gray-500 font-light leading-relaxed mb-10 max-w-lg">{t.hiwSub}</p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { num: t.step1Num, title: t.step1Title, body: t.step1Body, chip: t.step1Chip },
              { num: t.step2Num, title: t.step2Title, body: t.step2Body, chip: t.step2Chip },
              { num: t.step3Num, title: t.step3Title, body: t.step3Body, chip: t.step3Chip },
            ].map((step) => (
              <div key={step.num} className="bg-gray-50 border border-gray-200 rounded-xl p-8">
                <span className="font-mono text-[10px] tracking-widest uppercase text-gray-400 mb-4 block">{step.num}</span>
                <p className="text-base font-medium text-primary mb-2">{step.title}</p>
                <p className="text-sm text-gray-500 leading-relaxed font-light">{step.body}</p>
                <span className="inline-block mt-4 font-mono text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded">
                  {step.chip}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <LabelTag>{t.featLabel}</LabelTag>
          <h2 className="text-4xl font-light tracking-tight text-primary leading-tight mb-4">
            {t.featH2a}<br />
            <em className="not-italic text-accent font-semibold">{t.featH2b}</em>
          </h2>
          <p className="text-gray-500 font-light leading-relaxed mb-10 max-w-lg">{t.featSub}</p>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { tag: t.feat1Tag, title: t.feat1Title, body: t.feat1Body, pills: t.feat1Pills },
              { tag: t.feat2Tag, title: t.feat2Title, body: t.feat2Body, pills: t.feat2Pills },
              { tag: t.feat3Tag, title: t.feat3Title, body: t.feat3Body, pills: t.feat3Pills },
              { tag: t.feat4Tag, title: t.feat4Title, body: t.feat4Body, pills: t.feat4Pills },
            ].map((feat) => (
              <div
                key={feat.tag}
                className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm hover:shadow-md hover:border-gray-300 transition-all"
              >
                <span className="font-mono text-[10px] tracking-widest uppercase text-teal-600 mb-3 block">{feat.tag}</span>
                <p className="text-base font-medium text-primary mb-2">{feat.title}</p>
                <p className="text-sm text-gray-500 leading-relaxed font-light">{feat.body}</p>
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {feat.pills.map((p) => <Pill key={p} text={p} />)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-20 px-6 bg-white border-t border-b border-gray-200">
        <div className="max-w-5xl mx-auto">
          <LabelTag>{t.priceLabel}</LabelTag>
          <h2 className="text-4xl font-light tracking-tight text-primary leading-tight mb-4">
            {t.priceH2a}<br />
            <em className="not-italic text-accent font-semibold">{t.priceH2b}</em>
          </h2>
          <p className="text-gray-500 font-light leading-relaxed mb-10 max-w-lg">{t.priceSub}</p>
          <div className="grid md:grid-cols-3 gap-4">

            {/* Free */}
            <div className="bg-white border border-gray-200 rounded-xl p-7 flex flex-col shadow-sm">
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-3">{t.tier1Name}</p>
              <p className="text-5xl font-light text-primary tracking-tight mb-1">
                <sup className="text-xl align-super">€</sup>{t.tier1Price}
              </p>
              <p className="font-mono text-[11px] text-gray-400 mb-6">{t.tier1Cadence}</p>
              <ul className="flex-1 mb-6">
                {t.tier1Features.map((f) => <FeatureRow key={f.text} {...f} />)}
              </ul>
              <Link href="/register" className="block text-center py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors">
                {t.tier1Cta}
              </Link>
            </div>

            {/* Light — featured */}
            <div className="bg-white border-2 border-primary rounded-xl p-7 flex flex-col shadow-sm relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white font-mono text-[10px] uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap">
                {t.tier2Badge}
              </span>
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-3">{t.tier2Name}</p>
              <p className="text-5xl font-light text-primary tracking-tight mb-1">
                <sup className="text-xl align-super">€</sup>{t.tier2Price}
                <span className="text-2xl font-light">{t.tier2Cents}</span>
              </p>
              <p className="font-mono text-[11px] text-gray-400 mb-6">{t.tier2Cadence}</p>
              <ul className="flex-1 mb-6">
                {t.tier2Features.map((f) => <FeatureRow key={f.text} {...f} />)}
              </ul>
              <Link href="/register" className="block text-center py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-light transition-colors">
                {t.tier2Cta}
              </Link>
            </div>

            {/* Pro */}
            <div className="bg-white border border-gray-200 rounded-xl p-7 flex flex-col shadow-sm">
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-3">{t.tier3Name}</p>
              <p className="text-5xl font-light text-primary tracking-tight mb-1">
                <sup className="text-xl align-super">€</sup>{t.tier3Price}
                <span className="text-2xl font-light">{t.tier3Cents}</span>
              </p>
              <p className="font-mono text-[11px] text-gray-400 mb-6">{t.tier3Cadence}</p>
              <ul className="flex-1 mb-6">
                {t.tier3Features.map((f) => <FeatureRow key={f.text} {...f} />)}
              </ul>
              <Link href="/register" className="block text-center py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors">
                {t.tier3Cta}
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white border-t border-gray-200 py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <Link href="/" className="text-2xl text-gray-900 flex-shrink-0">
            IM<span className="text-3xl">M</span>IO
          </Link>
          <ul className="flex gap-6">
            <li><Link href="/datenschutz" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">{t.footerPrivacy}</Link></li>
            <li><Link href="/impressum" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">{t.footerImprint}</Link></li>
            <li><a href="mailto:hello@immio.at" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">{t.footerContact}</a></li>
          </ul>
          <p className="font-mono text-[11px] text-gray-400">{t.footerCopy}</p>
        </div>
      </footer>

    </div>
  );
}
