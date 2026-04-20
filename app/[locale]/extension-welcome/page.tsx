'use client';

import { Link } from '@/i18n/navigation';

export default function ExtensionWelcomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-lg mx-auto px-6 py-12 text-center">
        <p className="text-[11px] font-mono uppercase tracking-widest text-teal-600 mb-4">IMMIO</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Erweiterung installiert!</h1>
        <p className="text-gray-600 mb-8 leading-relaxed">
          Speichere Immobilien von Willhaben und ImmoScout24 direkt in
          deinen IMMIO Funnel — mit einem Klick.
        </p>

        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8 text-left space-y-4">
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-7 h-7 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-sm font-semibold">1</span>
            <div>
              <p className="text-sm font-medium text-gray-900">Anmelden</p>
              <p className="text-xs text-gray-500">Klicke auf das IMMIO-Symbol in deiner Browser-Leiste und melde dich an.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-7 h-7 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-sm font-semibold">2</span>
            <div>
              <p className="text-sm font-medium text-gray-900">Inserat öffnen</p>
              <p className="text-xs text-gray-500">Öffne ein Inserat auf Willhaben oder ImmoScout24.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-7 h-7 bg-teal-100 text-teal-700 rounded-full flex items-center justify-center text-sm font-semibold">3</span>
            <div>
              <p className="text-sm font-medium text-gray-900">„Send to IMMIO" klicken</p>
              <p className="text-xs text-gray-500">Das Inserat landet automatisch in deinem Funnel in der Phase „In Prüfung".</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Zum Dashboard
          </Link>
          <a
            href="https://www.willhaben.at/iad/immobilien/haus-kaufen/haus-angebote"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-2.5 border border-gray-200 text-gray-700 hover:bg-gray-100 text-sm font-medium rounded-lg transition-colors"
          >
            Willhaben testen →
          </a>
        </div>
      </div>
    </div>
  );
}
