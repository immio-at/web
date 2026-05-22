/**
 * ADR-024 §2.1 — bilingual (DE + EN) Austrian property-vocabulary token
 * maps. Each entry's canonical key is the value the suggestion routes to:
 *
 *  - PROPERTY_TYPE_TOKENS  — canonical `UserListing.propertyType` chip value
 *  - RENT_REGULATION_TOKENS — canonical `UserListing.rentRegulationCategory`
 *  - BUNDESLAND_TOKENS     — the Bundesland preset key (`W`, `NÖ`, …)
 *
 * The recognised-string lists mix DE, EN and Austrian abbreviations
 * (EFH / MFH / ETW / TG / nö …) — recognition is locale-blind (§9.1).
 * Multi-word strings ("old building", "lower austria") are matched by the
 * tokeniser's greedy n-gram window. Every string is normalised at
 * vocabulary-build time, so umlaut/casing variants need not be listed.
 */

/** Canonical `propertyType` → recognised strings (ADR-022 six types). */
export const PROPERTY_TYPE_TOKENS: Record<string, string[]> = {
  haus: ['haus', 'house', 'einfamilienhaus', 'efh'],
  wohnung: ['wohnung', 'apartment', 'flat', 'eigentumswohnung', 'etw'],
  zinshaus: ['zinshaus', 'mehrfamilienhaus', 'mfh', 'anlageobjekt', 'anlagenobjekt'],
  garage: ['garage', 'stellplatz', 'tiefgarage', 'parking', 'tg'],
  gewerbe: ['gewerbe', 'commercial', 'büro', 'office', 'geschäftslokal'],
  grundstueck: ['grundstück', 'grundstueck', 'plot', 'land', 'baugrund'],
};

/** Canonical `rentRegulationCategory` → recognised strings. Austrian
 *  construction-era vocabulary with minimal EN translation (ADR-024 §2.1). */
export const RENT_REGULATION_TOKENS: Record<string, string[]> = {
  mrg_full: ['altbau', 'old building'],
  mrg_partial: ['wiederaufbau', 'reconstruction'],
  free: ['neubau', 'new build'],
};

/** Bundesland preset key → recognised strings (full name DE/EN + abbrevs). */
export const BUNDESLAND_TOKENS: Record<string, string[]> = {
  W: ['wien', 'vienna'],
  'NÖ': ['niederösterreich', 'niederoesterreich', 'lower austria', 'noe', 'nö'],
  'OÖ': ['oberösterreich', 'oberoesterreich', 'upper austria', 'ooe', 'oö'],
  ST: ['steiermark', 'styria', 'stmk'],
  K: ['kärnten', 'kaernten', 'carinthia', 'ktn'],
  S: ['salzburg', 'sbg'],
  T: ['tirol', 'tyrol'],
  V: ['vorarlberg', 'vbg'],
  B: ['burgenland', 'bgld'],
};

/** Whitespace noise words dropped before tokenisation (ADR-024 §2.5). */
export const NOISE_WORDS: ReadonlySet<string> = new Set(['mit', 'with', 'und', 'and', 'in', 'im']);
