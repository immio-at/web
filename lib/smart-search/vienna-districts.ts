/**
 * ADR-024 §2.2 — Vienna district name → postcode map.
 *
 * Hand-maintained. Keys are lowercase district names (the tokeniser
 * normalises both the keys and the input before lookup, so umlauts and
 * casing are handled). Most districts are a single postcode; a few span
 * two. Activating a district suggestion adds every postcode in the array
 * to the postcode entry.
 *
 * `neubau` (the 7th district, 1070) deliberately collides with the
 * rent-regulation token `neubau` → `free` — ADR-024 §3.1's ambiguity case.
 * The tokeniser surfaces both routes; the user disambiguates.
 *
 * District-name routing for the other Bundesland capitals is deferred
 * (ADR-024 §14.4) — Vienna covers the large majority of tester queries.
 */
export const VIENNA_DISTRICT_TO_POSTCODES: Record<string, string[]> = {
  'innere stadt': ['1010'],
  leopoldstadt: ['1020'],
  landstrasse: ['1030'],
  wieden: ['1040'],
  margareten: ['1050'],
  mariahilf: ['1060'],
  neubau: ['1070'],
  josefstadt: ['1080'],
  alsergrund: ['1090'],
  favoriten: ['1100', '1101'],
  simmering: ['1110'],
  meidling: ['1120'],
  hietzing: ['1130'],
  penzing: ['1140'],
  'rudolfsheim-fuenfhaus': ['1150'],
  ottakring: ['1160'],
  hernals: ['1170'],
  waehring: ['1180'],
  doebling: ['1190'],
  brigittenau: ['1200'],
  floridsdorf: ['1210'],
  donaustadt: ['1220'],
  liesing: ['1230'],
};

/** Normalised district key → proper display name (umlauts restored). */
export const VIENNA_DISTRICT_DISPLAY: Record<string, string> = {
  'innere stadt': 'Innere Stadt',
  leopoldstadt: 'Leopoldstadt',
  landstrasse: 'Landstraße',
  wieden: 'Wieden',
  margareten: 'Margareten',
  mariahilf: 'Mariahilf',
  neubau: 'Neubau',
  josefstadt: 'Josefstadt',
  alsergrund: 'Alsergrund',
  favoriten: 'Favoriten',
  simmering: 'Simmering',
  meidling: 'Meidling',
  hietzing: 'Hietzing',
  penzing: 'Penzing',
  'rudolfsheim-fuenfhaus': 'Rudolfsheim-Fünfhaus',
  ottakring: 'Ottakring',
  hernals: 'Hernals',
  waehring: 'Währing',
  doebling: 'Döbling',
  brigittenau: 'Brigittenau',
  floridsdorf: 'Floridsdorf',
  donaustadt: 'Donaustadt',
  liesing: 'Liesing',
};
