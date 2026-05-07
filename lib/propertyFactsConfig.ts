/**
 * ADR-017 §5 — Static field config for the Property Facts header.
 *
 * Single source of truth for which schema fields appear as chips,
 * which input type renders in the add/edit popover, how each value
 * formats to a chip string, and which enum values are suppressed
 * (because they're effectively "no signal" — `parkplatz = 'none'`,
 * `widmung = 'wohnung'` etc.).
 *
 * Schema-coverage check: every column on `property_details` is either
 * listed here or in `EXCLUDED_FIELDS` with a comment. The unit test
 * (propertyFactsConfig.test.ts) compares this list to the
 * PropertyDetails interface — adding a column without listing it
 * fails the test.
 */

import type { PropertyDetails } from './api';

// ── Field type taxonomy ───────────────────────────────────────────
// Input rendering branches on this. Edit/add affordances render a
// type-appropriate input — text box, year picker, native select, etc.
export type FactFieldType =
  | 'text'
  | 'number'
  | 'year'
  | 'decimal'
  | 'enum'
  | 'boolean'
  | 'date'
  | 'address';

export type FactFieldGroup = 'building' | 'energy' | 'amenity' | 'address' | 'commercial';

// ── Localisation surface ──────────────────────────────────────────
// We don't pull next-intl into this module (kept pure for tests).
// Components pass a translator function in when they call format helpers.
export type FactTranslator = (key: string, values?: Record<string, string | number>) => string;

export type FactFieldKey =
  | 'addressCombined' // synthetic — covers addressStreet/addressZip/addressCity
  | 'baujahr'
  | 'haustyp'
  | 'zustand'
  | 'etage'
  | 'aufzug'
  | 'keller'
  | 'aussenflaeche'
  | 'parkplatz'
  | 'heizung'
  | 'boden'
  | 'fenster'
  | 'bathrooms'
  | 'separateWC'
  | 'widmung'
  | 'grundflaeche'
  | 'hwbClassValue' // synthetic — covers hwbClass + hwbValue
  | 'beziehbarAb';

export interface FactFieldDefinition {
  /** stable identifier, also the i18n labelKey suffix */
  key: FactFieldKey;
  /** display group — drives chip ordering within the row */
  group: FactFieldGroup;
  /** input affordance type */
  type: FactFieldType;
  /** for `enum`, the allowed values (snake_case as stored on the DB) */
  enumValues?: string[];
  /** for `enum`, values that should NOT render a chip even when stored */
  suppressEnumValues?: string[];
  /** for `number` / `decimal` / `year`, optional min/max bounds */
  min?: number;
  max?: number;
  /** display unit ("m²", "kWh/m²a") — appended in chip label or rendered as suffix */
  unit?: string;
  /** the schema columns this chip reads from */
  columns: (keyof PropertyDetails)[];
  /**
   * Format the chip value for display. Returns null to suppress the chip
   * (boolean false, sentinel enum value, all columns null).
   *
   * `t` is the translator scoped to `portfolio` is unused here — we use
   * the `propertyFacts` namespace in the components, not in formatters.
   */
  formatChipValue: (
    details: PropertyDetails,
    t: FactTranslator,
  ) => string | null;
}

// ── Helpers used inside formatChipValue ───────────────────────────
function labelEnum(t: FactTranslator, key: FactFieldKey, value: string): string {
  return t(`enum.${key}.${value}`);
}

function formatYear(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return String(Math.round(value));
}

// ── Field definitions ─────────────────────────────────────────────
// The order in this array IS the chip render order — facts cluster
// naturally (building → energy → amenity → address → commercial).
export const PROPERTY_FACT_FIELDS: FactFieldDefinition[] = [
  {
    key: 'haustyp',
    group: 'building',
    type: 'enum',
    enumValues: ['altbau', 'gruenderzeit', 'neubau', 'dachausbau'],
    columns: ['haustyp'],
    formatChipValue: (d, t) => (d.haustyp ? labelEnum(t, 'haustyp', d.haustyp) : null),
  },
  {
    key: 'baujahr',
    group: 'building',
    type: 'year',
    min: 1700,
    max: new Date().getFullYear() + 5,
    columns: ['baujahr'],
    formatChipValue: (d) => formatYear(d.baujahr),
  },
  {
    key: 'zustand',
    group: 'building',
    type: 'enum',
    enumValues: [
      'erstbezug',
      'neuwertig',
      'gepflegt',
      'renovierungsbeduerftig',
      'sanierungsbeduerftig',
    ],
    columns: ['zustand'],
    formatChipValue: (d, t) => (d.zustand ? labelEnum(t, 'zustand', d.zustand) : null),
  },
  {
    key: 'etage',
    group: 'building',
    type: 'number',
    min: -1,
    max: 60,
    columns: ['etage'],
    formatChipValue: (d, t) => {
      if (d.etage == null) return null;
      if (d.etage === 0) return t('format.etage.ground');
      return t('format.etage.numbered', { n: d.etage });
    },
  },
  {
    key: 'widmung',
    group: 'building',
    type: 'enum',
    enumValues: [
      'wohnung',
      'einfamilienhaus',
      'mehrfamilienhaus',
      'dachgeschoss',
      'buero',
      'geschaeftslokal',
      'anlagenobjekt',
      'grundstueck',
      'sonstiges',
    ],
    suppressEnumValues: ['wohnung'], // implicit default for everything in the funnel
    columns: ['widmung'],
    formatChipValue: (d, t) => {
      if (!d.widmung) return null;
      if (d.widmung === 'wohnung') return null;
      return labelEnum(t, 'widmung', d.widmung);
    },
  },
  {
    key: 'hwbClassValue',
    group: 'energy',
    type: 'text', // edited via custom logic — see PropertyFactInlineEditor
    columns: ['hwbClass', 'hwbValue'],
    formatChipValue: (d, t) => {
      if (!d.hwbClass && d.hwbValue == null) return null;
      if (d.hwbClass && d.hwbValue != null) {
        return t('format.hwb.classAndValue', {
          cls: d.hwbClass,
          val: d.hwbValue.toFixed(1),
        });
      }
      if (d.hwbClass) return t('format.hwb.classOnly', { cls: d.hwbClass });
      return t('format.hwb.valueOnly', { val: d.hwbValue!.toFixed(1) });
    },
  },
  {
    key: 'heizung',
    group: 'energy',
    type: 'enum',
    enumValues: ['fernwaerme', 'gas', 'waermepumpe', 'pellets', 'nachtspeicher', 'sonstiges'],
    columns: ['heizung'],
    formatChipValue: (d, t) => (d.heizung ? labelEnum(t, 'heizung', d.heizung) : null),
  },
  {
    key: 'aufzug',
    group: 'amenity',
    type: 'boolean',
    columns: ['aufzug'],
    formatChipValue: (d, t) => (d.aufzug === true ? t('label.aufzug') : null),
  },
  {
    key: 'keller',
    group: 'amenity',
    type: 'boolean',
    columns: ['keller'],
    formatChipValue: (d, t) => (d.keller === true ? t('label.keller') : null),
  },
  {
    key: 'aussenflaeche',
    group: 'amenity',
    type: 'enum',
    enumValues: ['none', 'balkon', 'terrasse', 'loggia'],
    suppressEnumValues: ['none'],
    columns: ['aussenflaeche'],
    formatChipValue: (d, t) => {
      if (!d.aussenflaeche || d.aussenflaeche === 'none') return null;
      return labelEnum(t, 'aussenflaeche', d.aussenflaeche);
    },
  },
  {
    key: 'parkplatz',
    group: 'amenity',
    type: 'enum',
    enumValues: ['none', 'tiefgarage', 'carport', 'freiplatz'],
    suppressEnumValues: ['none'],
    columns: ['parkplatz'],
    formatChipValue: (d, t) => {
      if (!d.parkplatz || d.parkplatz === 'none') return null;
      return labelEnum(t, 'parkplatz', d.parkplatz);
    },
  },
  {
    key: 'boden',
    group: 'amenity',
    type: 'enum',
    enumValues: ['parkett', 'fliesen', 'laminat', 'teppich', 'sonstiges'],
    columns: ['boden'],
    formatChipValue: (d, t) => (d.boden ? labelEnum(t, 'boden', d.boden) : null),
  },
  {
    key: 'fenster',
    group: 'amenity',
    type: 'enum',
    enumValues: ['holz', 'holz_alu', 'kunststoff', 'sonstiges'],
    columns: ['fenster'],
    formatChipValue: (d, t) => (d.fenster ? labelEnum(t, 'fenster', d.fenster) : null),
  },
  {
    key: 'bathrooms',
    group: 'amenity',
    type: 'number',
    min: 0,
    max: 10,
    columns: ['bathrooms'],
    formatChipValue: (d, t) => {
      if (d.bathrooms == null) return null;
      return d.bathrooms === 1 ? t('format.bathrooms.one') : t('format.bathrooms.many', { n: d.bathrooms });
    },
  },
  {
    key: 'separateWC',
    group: 'amenity',
    type: 'boolean',
    columns: ['separateWC'],
    formatChipValue: (d, t) => (d.separateWC === true ? t('label.separateWC') : null),
  },
  {
    key: 'addressCombined',
    group: 'address',
    type: 'address',
    columns: ['addressStreet', 'addressZip', 'addressCity'],
    formatChipValue: (d) => {
      const street = d.addressStreet?.trim() ?? '';
      const zip = d.addressZip?.trim() ?? '';
      const city = d.addressCity?.trim() ?? '';
      if (!street && !zip && !city) return null;
      const zipCity = [zip, city].filter(Boolean).join(' ');
      if (street && zipCity) return `${street}, ${zipCity}`;
      return street || zipCity;
    },
  },
  {
    key: 'beziehbarAb',
    group: 'commercial',
    type: 'date',
    columns: ['beziehbarAb'],
    formatChipValue: (d, t) => {
      if (!d.beziehbarAb) return null;
      const date = new Date(d.beziehbarAb);
      if (Number.isNaN(date.getTime())) return null;
      return t('format.beziehbarAb', { date: date.toLocaleDateString() });
    },
  },
  {
    key: 'grundflaeche',
    group: 'commercial',
    type: 'number',
    min: 0,
    max: 100000,
    unit: 'm²',
    columns: ['grundflaeche'],
    formatChipValue: (d, t) => {
      if (d.grundflaeche == null) return null;
      return t('format.grundflaeche', { n: d.grundflaeche });
    },
  },
];

/**
 * Columns on `PropertyDetails` that intentionally do NOT appear in the
 * facts header. Each entry has a one-line reason. The schema-coverage
 * test asserts that every interface key is either present in
 * PROPERTY_FACT_FIELDS' columns or in this set.
 */
export const EXCLUDED_FIELDS = new Set<keyof PropertyDetails>([
  'id',                  // internal
  'propertyId',          // internal
  'createdAt',           // internal
  'updatedAt',           // internal
  'extractedAt',         // metadata
  'extractionSource',    // metadata, surfaced via tooltip not chip
  'mrgRisk',             // soft signal — surfaces as a banner in the rental tab, not a chip
  // Calculator-relevant fields stay in the Dossier with → Apply
  // (ADR-017 §5.1 — different audience, different affordance):
  'exposePrice',
  'purchaseDate',
  'bkUmlagefaehig',
  'bkNichtUmlagefaehig',
  'sizeSqmVerified',
  'roomsVerified',
  // Makler contact has its own block above the facts header:
  'maklerName',
  'maklerPhone',
  'maklerEmail',
  'maklerOrganisation',
]);

/**
 * Returns the field definition that uses a given DB column — used to
 * route a click on a chip back to the right config entry.
 */
export function findFieldByColumn(
  column: keyof PropertyDetails,
): FactFieldDefinition | null {
  return PROPERTY_FACT_FIELDS.find((f) => f.columns.includes(column)) ?? null;
}

/**
 * Returns the field definition by its config key.
 */
export function findFieldByKey(key: FactFieldKey): FactFieldDefinition | null {
  return PROPERTY_FACT_FIELDS.find((f) => f.key === key) ?? null;
}

/**
 * For the add popover dropdown — list every field with whether it's
 * already populated. Already-populated fields can still be picked (they
 * route to edit mode); the suffix is rendered on the dropdown item.
 */
export interface FactDropdownItem {
  field: FactFieldDefinition;
  label: string; // localised
  populated: boolean;
}

export function buildDropdownItems(
  details: PropertyDetails | null,
  t: FactTranslator,
): FactDropdownItem[] {
  return PROPERTY_FACT_FIELDS.map((field) => ({
    field,
    label: t(`label.${field.key}`),
    populated: details ? field.formatChipValue(details, t) !== null : false,
  })).sort((a, b) => a.label.localeCompare(b.label));
}
