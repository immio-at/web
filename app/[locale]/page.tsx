'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import SignInModal from '@/components/SignInModal';
import RegisterModal from '@/components/RegisterModal';
import { useAuth } from '@/context/AuthContext';

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
        : <span className="text-gray-300 text-xs">&mdash;</span>
      }
      {text}
    </li>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LandingPageInner() {
  const locale = useLocale();
  const t = useTranslations('landing');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [heroEmail, setHeroEmail] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session, loading } = useAuth();

  // Wait for AuthContext to finish loading before making any redirect decision.
  // This prevents a race condition where the landing page renders briefly
  // before Supabase has confirmed whether a valid session exists.
  // Once loading is false:
  //   - session present → redirect to dashboard (user is logged in)
  //   - session absent  → show landing page, open sign-in modal if ?signin=true
  useEffect(() => {
    if (loading) return;
    if (session) {
      router.push('/dashboard');
    } else {
      if (searchParams.get('signin') === 'true') setSignInOpen(true);
    }
  }, [loading, session, router, searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-sm">{'\u00A0'}</p>
      </div>
    );
  }

  // Don't render the landing page if we're about to redirect
  if (session) return null;

  function handleRegister() {
    if (!email || !email.includes('@')) {
      setEmailError(true);
      setTimeout(() => setEmailError(false), 2000);
      return;
    }
    setHeroEmail(email);
    setRegisterOpen(true);
  }

  function handleLangToggle() {
    const newLocale = locale === 'de' ? 'en' : 'de';
    localStorage.setItem('immio_locale', newLocale);
    router.replace(pathname, { locale: newLocale });
  }

  // Use t.raw() for structured data (arrays of objects, string arrays)
  const tier1Features = t.raw('pricing.tier1.features') as { included: boolean; text: string }[];
  const tier2Features = t.raw('pricing.tier2.features') as { included: boolean; text: string }[];
  const tier3Features = t.raw('pricing.tier3.features') as { included: boolean; text: string }[];

  const feat1Pills = t.raw('features.feat1Pills') as string[];
  const feat2Pills = t.raw('features.feat2Pills') as string[];
  const feat3Pills = t.raw('features.feat3Pills') as string[];
  const feat4Pills = t.raw('features.feat4Pills') as string[];

  return (
    <div className="min-h-screen bg-gray-50 font-sans">

      {/* Sign In Modal */}
      <SignInModal
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
      />

      {/* Register Modal */}
      <RegisterModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        initialEmail={heroEmail}
        onSwitchToSignIn={() => setSignInOpen(true)}
      />

      {/* NAV */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-2xl text-gray-900 flex-shrink-0">
            IM<span className="text-3xl">M</span>IO
          </Link>
          <div className="hidden md:flex items-center gap-8">
            <a href="#how" className="text-sm text-gray-500 hover:text-primary transition-colors">{t('nav.how')}</a>
            <a href="#features" className="text-sm text-gray-500 hover:text-primary transition-colors">{t('nav.features')}</a>
            <a href="#pricing" className="text-sm text-gray-500 hover:text-primary transition-colors">{t('nav.pricing')}</a>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleLangToggle}
              className="font-mono text-[11px] text-gray-400 border border-gray-200 rounded px-2 py-1 hover:text-gray-700 hover:border-gray-300 transition-colors"
            >
              {t('nav.langToggle')}
            </button>
            <button
              onClick={() => setSignInOpen(true)}
              className="text-sm text-gray-600 hover:text-primary font-medium transition-colors px-3 py-2"
            >
              {t('nav.signIn')}
            </button>
            <Link
              href="/register"
              className="bg-primary text-white text-[13px] font-medium px-4 py-2 rounded-lg hover:bg-primary-light transition-colors"
            >
              {t('nav.cta')}
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
            {t('hero.badge')}
          </div>
          <h1 className="text-4xl md:text-6xl font-light leading-[1.1] tracking-tight text-primary mb-5">
            {t('hero.h1Line1')}<br />
            <em className="not-italic text-accent font-semibold">{t('hero.h1Line2')}</em><br />
            {t('hero.h1Line3')}
          </h1>
          <p className="text-lg text-gray-500 font-light leading-relaxed mb-10 max-w-xl mx-auto">
            {t('hero.sub')}
          </p>
          <div className="flex gap-2 max-w-md mx-auto">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              placeholder={t('hero.placeholder')}
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
              {t('hero.cta')}
            </button>
          </div>
          <p className="font-mono text-[11px] text-gray-400 mt-3">{t('hero.note')}</p>
        </div>
      </section>

      {/* MARKET BANNER */}
      <div className="bg-primary px-6 py-4 flex flex-wrap items-center justify-center gap-2 text-center">
        <span className="text-sm text-white/60 font-light">{t('market.prefix')}</span>
        <span className="font-mono text-base font-medium text-accent">{t('market.number')}</span>
        <span className="text-sm text-white/60 font-light">{t('market.suffix')}</span>
        <span className="text-white/20 text-lg mx-1">·</span>
        <span className="text-sm text-white/60 font-light">{t('market.claim')}</span>
      </div>

      {/* PROBLEM */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <LabelTag>{t('problem.label')}</LabelTag>
          <h2 className="text-4xl font-light tracking-tight text-primary leading-tight mb-4">
            {t('problem.h2a')}<br />
            <em className="not-italic text-accent font-semibold">{t('problem.h2b')}</em>
          </h2>
          <p className="text-gray-500 font-light leading-relaxed mb-10 max-w-lg">{t('problem.sub')}</p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: '📋', title: t('problem.card1Title'), body: t('problem.card1Body') },
              { icon: '📬', title: t('problem.card2Title'), body: t('problem.card2Body') },
              { icon: '🗂', title: t('problem.card3Title'), body: t('problem.card3Body') },
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
          <LabelTag>{t('howItWorks.label')}</LabelTag>
          <h2 className="text-4xl font-light tracking-tight text-primary leading-tight mb-4">
            {t('howItWorks.h2a')}<br />
            <em className="not-italic text-accent font-semibold">{t('howItWorks.h2b')}</em>
          </h2>
          <p className="text-gray-500 font-light leading-relaxed mb-10 max-w-lg">{t('howItWorks.sub')}</p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { num: t('howItWorks.step1Num'), title: t('howItWorks.step1Title'), body: t('howItWorks.step1Body'), chip: t('howItWorks.step1Chip') },
              { num: t('howItWorks.step2Num'), title: t('howItWorks.step2Title'), body: t('howItWorks.step2Body'), chip: t('howItWorks.step2Chip') },
              { num: t('howItWorks.step3Num'), title: t('howItWorks.step3Title'), body: t('howItWorks.step3Body'), chip: t('howItWorks.step3Chip') },
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
          <LabelTag>{t('features.label')}</LabelTag>
          <h2 className="text-4xl font-light tracking-tight text-primary leading-tight mb-4">
            {t('features.h2a')}<br />
            <em className="not-italic text-accent font-semibold">{t('features.h2b')}</em>
          </h2>
          <p className="text-gray-500 font-light leading-relaxed mb-10 max-w-lg">{t('features.sub')}</p>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { tag: t('features.feat1Tag'), title: t('features.feat1Title'), body: t('features.feat1Body'), pills: feat1Pills },
              { tag: t('features.feat2Tag'), title: t('features.feat2Title'), body: t('features.feat2Body'), pills: feat2Pills },
              { tag: t('features.feat3Tag'), title: t('features.feat3Title'), body: t('features.feat3Body'), pills: feat3Pills },
              { tag: t('features.feat4Tag'), title: t('features.feat4Title'), body: t('features.feat4Body'), pills: feat4Pills },
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
          <LabelTag>{t('pricing.label')}</LabelTag>
          <h2 className="text-4xl font-light tracking-tight text-primary leading-tight mb-4">
            {t('pricing.h2a')}<br />
            <em className="not-italic text-accent font-semibold">{t('pricing.h2b')}</em>
          </h2>
          <p className="text-gray-500 font-light leading-relaxed mb-10 max-w-lg">{t('pricing.sub')}</p>
          <div className="grid md:grid-cols-3 gap-4">

            {/* Free */}
            <div className="bg-white border border-gray-200 rounded-xl p-7 flex flex-col shadow-sm">
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-3">{t('pricing.tier1.name')}</p>
              <p className="text-5xl font-light text-primary tracking-tight mb-1">
                <sup className="text-xl align-super">{'\u20AC'}</sup>{t('pricing.tier1.price')}
              </p>
              <p className="font-mono text-[11px] text-gray-400 mb-6">{t('pricing.tier1.cadence')}</p>
              <ul className="flex-1 mb-6">
                {tier1Features.map((f) => <FeatureRow key={f.text} {...f} />)}
              </ul>
              <button onClick={() => setRegisterOpen(true)} className="block w-full text-center py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors">
                {t('pricing.tier1.cta')}
              </button>
            </div>

            {/* Light — featured */}
            <div className="bg-white border-2 border-primary rounded-xl p-7 flex flex-col shadow-sm relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white font-mono text-[10px] uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap">
                {t('pricing.tier2.badge')}
              </span>
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-3">{t('pricing.tier2.name')}</p>
              <p className="text-5xl font-light text-primary tracking-tight mb-1">
                <sup className="text-xl align-super">{'\u20AC'}</sup>{t('pricing.tier2.price')}
                <span className="text-2xl font-light">{t('pricing.tier2.cents')}</span>
              </p>
              <p className="font-mono text-[11px] text-gray-400 mb-6">{t('pricing.tier2.cadence')}</p>
              <ul className="flex-1 mb-6">
                {tier2Features.map((f) => <FeatureRow key={f.text} {...f} />)}
              </ul>
              <button onClick={() => setRegisterOpen(true)} className="block w-full text-center py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-light transition-colors">
                {t('pricing.tier2.cta')}
              </button>
            </div>

            {/* Pro */}
            <div className="bg-white border border-gray-200 rounded-xl p-7 flex flex-col shadow-sm">
              <p className="font-mono text-xs uppercase tracking-widest text-gray-400 mb-3">{t('pricing.tier3.name')}</p>
              <p className="text-5xl font-light text-primary tracking-tight mb-1">
                <sup className="text-xl align-super">{'\u20AC'}</sup>{t('pricing.tier3.price')}
                <span className="text-2xl font-light">{t('pricing.tier3.cents')}</span>
              </p>
              <p className="font-mono text-[11px] text-gray-400 mb-6">{t('pricing.tier3.cadence')}</p>
              <ul className="flex-1 mb-6">
                {tier3Features.map((f) => <FeatureRow key={f.text} {...f} />)}
              </ul>
              <button onClick={() => setRegisterOpen(true)} className="block w-full text-center py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-500 hover:border-primary hover:text-primary transition-colors">
                {t('pricing.tier3.cta')}
              </button>
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
            <li><Link href="/datenschutz" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">{t('footer.privacy')}</Link></li>
            <li><Link href="/impressum" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">{t('footer.imprint')}</Link></li>
            <li><Link href="/kontakt" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">{t('footer.contact')}</Link></li>
          </ul>
          <p className="font-mono text-[11px] text-gray-400">{t('footer.copy')}</p>
        </div>
      </footer>

    </div>
  );
}

// useSearchParams requires Suspense boundary in Next.js App Router
export default function LandingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-gray-400 text-sm">{'\u00A0'}</p></div>}>
      <LandingPageInner />
    </Suspense>
  );
}
