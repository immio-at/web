/**
 * Austrian Bundeslaender (federal states) to postcode (PLZ) mapping.
 *
 * Data source: RTR (Rundfunk und Telekom Regulierungs-GmbH) open data
 *   https://data.rtr.at/api/v1/tables/plz.json
 *   https://www.data.gv.at/katalog/dataset/f76ed887-00d6-450f-a158-9f8b1cbbeebf
 *
 * Contains all 2221 Austrian 4-digit postcodes mapped to their Bundesland.
 */

import data from "./austria-plz-bundesland.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BundeslandAbbreviation =
  | "W"
  | "NÖ"
  | "OÖ"
  | "S"
  | "T"
  | "V"
  | "K"
  | "ST"
  | "B";

export interface BundeslandInfo {
  name: string;
  abbreviation: BundeslandAbbreviation;
  aliases: string[];
}

// ---------------------------------------------------------------------------
// Static data (imported from JSON at build time — tree-shaken by Next.js)
// ---------------------------------------------------------------------------

const bundeslaender = data.bundeslaender as Record<string, { name: string; aliases: string[] }>;
const bundeslandToPostcodes = data.bundeslandToPostcodes as Record<string, string[]>;
const postcodeToBundesland = data.postcodeToBundesland as Record<string, string>;

// ---------------------------------------------------------------------------
// Alias lookup — built once, maps every known alias (lowercased) to its abbreviation
// ---------------------------------------------------------------------------

const aliasMap = new Map<string, BundeslandAbbreviation>();
for (const [abbr, info] of Object.entries(bundeslaender)) {
  for (const alias of info.aliases) {
    aliasMap.set(alias.toLowerCase(), abbr as BundeslandAbbreviation);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a user query (abbreviation, full name, English name) to a
 * Bundesland abbreviation.
 *
 * Examples:
 *   resolveBundesland("Wien")   → "W"
 *   resolveBundesland("NÖ")    → "NÖ"
 *   resolveBundesland("Tyrol") → "T"
 *   resolveBundesland("xyz")   → undefined
 */
export function resolveBundesland(
  query: string
): BundeslandAbbreviation | undefined {
  return aliasMap.get(query.toLowerCase());
}

/**
 * Get all postcodes belonging to a Bundesland.
 * Accepts any alias (abbreviation, full name, English name).
 *
 * Returns sorted string array of 4-digit postcodes, or undefined if the
 * Bundesland could not be resolved.
 */
export function getPostcodesByBundesland(
  query: string
): string[] | undefined {
  const abbr = resolveBundesland(query);
  if (!abbr) return undefined;
  return bundeslandToPostcodes[abbr];
}

/**
 * Look up which Bundesland a postcode belongs to.
 * Returns the abbreviation (e.g. "W", "NÖ") or undefined if unknown.
 */
export function getBundeslandByPostcode(
  postcode: string
): BundeslandAbbreviation | undefined {
  return postcodeToBundesland[postcode] as BundeslandAbbreviation | undefined;
}

/**
 * Get full info for a Bundesland abbreviation.
 */
export function getBundeslandInfo(
  abbreviation: BundeslandAbbreviation
): BundeslandInfo | undefined {
  const info = bundeslaender[abbreviation];
  if (!info) return undefined;
  return {
    name: info.name,
    abbreviation,
    aliases: info.aliases,
  };
}

/**
 * All 9 Bundeslaender with their metadata.
 */
export function getAllBundeslaender(): BundeslandInfo[] {
  return Object.entries(bundeslaender).map(([abbr, info]) => ({
    name: info.name,
    abbreviation: abbr as BundeslandAbbreviation,
    aliases: info.aliases,
  }));
}

/**
 * Every Austrian postcode, ascending. Used by the R9 postcode dropdown's
 * typeahead (ADR-023 §10.5.4).
 */
export function getAllPostcodes(): string[] {
  return Object.keys(postcodeToBundesland).sort();
}

/**
 * All Bundesland abbreviations.
 */
export const BUNDESLAND_ABBREVIATIONS: BundeslandAbbreviation[] = [
  "W",
  "NÖ",
  "OÖ",
  "S",
  "T",
  "V",
  "K",
  "ST",
  "B",
];
