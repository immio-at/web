const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-e03a.up.railway.app';

// ─── Token injection ──────────────────────────────────────────────────────────
// AuthContext calls setTokenGetter() on mount, injecting a function that
// returns the current Supabase access token. This lets api.ts get a fresh,
// auto-refreshed token on every call without needing React context.

let _getToken: (() => Promise<string | null>) | null = null;

export function setTokenGetter(getter: () => Promise<string | null>) {
  _getToken = getter;
}

async function getAuthToken(): Promise<string> {
  if (_getToken) {
    const token = await _getToken();
    if (token) return token;
  }
  // Fallback: redirect to landing page sign-in modal
  window.location.href = '/?signin=true';
  throw new Error('No active session');
}

// ─── Response handler ─────────────────────────────────────────────────────────

async function handleResponse(response: Response): Promise<any> {
  if (response.status === 401) {
    // Session expired — redirect to landing page with sign-in modal open
    window.location.href = '/?signin=true';
    throw new Error('Session expired');
  }
  if (!response.ok) {
    // Try to extract the backend error message
    let message = `Request failed: ${response.status}`;
    try {
      const body = await response.json();
      if (body.message) message = body.message;
    } catch { /* response wasn't JSON */ }
    throw new Error(message);
  }
  return response.json();
}

// ─── Property ─────────────────────────────────────────────────────────────────

export interface Property {
  id: string;
  title: string;
  price: number | null;
  pricePerSqm: number | null;
  location: string | null;
  zipCode: string | null;
  sizeSqm: number | null;
  rooms: number | null;
  imageUrl: string | null;
  sourceUrl: string;
  status: string;
  platform: string;
  emailReceivedAt: string;
  createdAt: string;
  notes: string | null;
  movedToStageAt: string | null;
  // Listing availability — set by nightly checker or manual report.
  // listingStatus: 'active' | 'expired'
  // listingExpiredAt: ISO timestamp of first expiry detection, or null
  listingStatus: string;
  listingExpiredAt: string | null;
  // ADR-009 DO1: defaults written by the Dossier → Apply flow. May be
  // null until the user has applied a Dossier value.
  purchaseDate: string | null;
  bkUmlagefaehig: number | null;
  bkNichtUmlagefaehig: number | null;
  // ADR-015: dedup flags. suspectedDuplicateOf points at a scraped_listings
  // row when Mechanism B suspects this property is the same as a scraped
  // listing the user is also seeing on Discover. relistBadgeDismissedAt
  // records when the user last acknowledged the "Relisted N×" pill.
  suspectedDuplicateOf?: string | null;
  suspectedDuplicateAt?: string | null;
  relistBadgeDismissedAt?: string | null;
  lastSeenAt?: string | null;
}

// ─── Property Analysis ────────────────────────────────────────────────────────

export interface RehabCostItem {
  label: string;
  amount: number;
  abzugsfaehig: number;
}

export interface PropertyAnalysis {
  id: string;
  propertyId: string;
  dealId: string;
  name: string | null;
  usageType: 'owner' | 'rental' | 'flip';
  legalStructure: 'private' | 'gmbh';

  // Purchase
  listPrice: number | null;
  desiredPrice: number | null;
  maklerPct: number;
  notarPct: number;
  grundbuchPct: number;
  grunderwerbsteuerPct: number;
  otherPurchaseCosts: number;
  rehabCosts: RehabCostItem[];

  // Financing
  financing: boolean;
  loan1AmountPct: number;
  loan1Amount: number | null;
  loan1Rate: number | null;
  loan1TermYears: number | null;
  loan2Enabled: boolean;
  loan2Amount: number | null;
  loan2Rate: number | null;
  loan2TermYears: number | null;

  // Owner Occupied
  ooBetriebskostenMonthly: number | null;
  ooRepairsPct: number;
  ooAppreciationPct: number;

  // Rental
  rentType: 'warm' | 'kalt';
  rentMonthly: number | null;
  bkUmlagefaehig: number | null;
  bkNichtUmlagefaehig: number | null;
  reparaturruecklageMon: number | null;
  vacancyPct: number;
  repairsPct: number;
  rentGrowthPct: number;
  valueGrowthPct: number;

  // Tax inputs
  purchaseDate: string | null;           // ISO date — for AfA schedule
  gebaeudeAnteilPct: number;             // default 0.60 — building proportion
  grenzsteuersatzPct: number | null;     // private marginal tax rate
  gmbhAccountingCostsAnnual: number | null; // GmbH annual accounting costs
  distributeProfit: boolean;             // GmbH: distribute profits (triggers KESt)

  // Flip
  flipDurationMonths: number | null;
  flipResalePrice: number | null;

  createdAt: string;
  updatedAt: string;
}

export type CreateAnalysisDto = {
  usageType: 'owner' | 'rental' | 'flip';
  legalStructure?: 'private' | 'gmbh';
  name?: string;
};

export type UpdateAnalysisDto = Partial<Omit<PropertyAnalysis, 'id' | 'propertyId' | 'createdAt' | 'updatedAt'>>;

// ─── Property API ─────────────────────────────────────────────────────────────

export async function getProperties(): Promise<Property[]> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  return handleResponse(response);
}

export interface PropertiesFilter {
  keyword?: string;
  postcodes?: string[];
  minPrice?: number;
  maxPrice?: number;
  minPricePerSqm?: number;
  maxPricePerSqm?: number;
  minSize?: number;
  maxSize?: number;
  minRooms?: number;
  maxRooms?: number;
  hideNullPrice?: boolean;
  sortBy?: string;
  sortOrder?: string;
}

export async function getPropertiesFiltered(filter: PropertiesFilter = {}): Promise<Property[]> {
  const token = await getAuthToken();
  const params = new URLSearchParams();
  if (filter.keyword) params.set('keyword', filter.keyword);
  if (filter.postcodes?.length) params.set('postcodes', filter.postcodes.join(','));
  if (filter.minPrice !== undefined) params.set('minPrice', String(filter.minPrice));
  if (filter.maxPrice !== undefined) params.set('maxPrice', String(filter.maxPrice));
  if (filter.minPricePerSqm !== undefined) params.set('minPricePerSqm', String(filter.minPricePerSqm));
  if (filter.maxPricePerSqm !== undefined) params.set('maxPricePerSqm', String(filter.maxPricePerSqm));
  if (filter.minSize !== undefined) params.set('minSize', String(filter.minSize));
  if (filter.maxSize !== undefined) params.set('maxSize', String(filter.maxSize));
  if (filter.minRooms !== undefined) params.set('minRooms', String(filter.minRooms));
  if (filter.maxRooms !== undefined) params.set('maxRooms', String(filter.maxRooms));
  if (filter.hideNullPrice === false) params.set('hideNullPrice', 'false');
  if (filter.sortBy) params.set('sortBy', filter.sortBy);
  if (filter.sortOrder) params.set('sortOrder', filter.sortOrder);
  const qs = params.toString();
  const response = await fetch(`${API_URL}/properties${qs ? `?${qs}` : ''}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  return handleResponse(response);
}

export async function updateProperty(
  id: string,
  data: { status?: string; notes?: string; movedToStageAt?: string },
) {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

// Manually flags a property as no longer available.
// Calls POST /properties/:id/report-unavailable on the backend.
// The backend sets listingStatus: 'expired' and records listingExpiredAt.
export async function reportUnavailable(id: string): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${id}/report-unavailable`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return handleResponse(response);
}

// Moves an expired property into the hidden 'delisted' stage.
// Calls POST /properties/:id/delist on the backend.
// Only valid for properties where listingStatus === 'expired'.
export async function delistProperty(id: string): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${id}/delist`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return handleResponse(response);
}

// Hard-delete a property. Used by the Discover heart re-click-undo when the
// user has just saved a scraped listing and changes their mind. Backend
// cascades children (analyses, dossier, documents, interactions, DD runs).
export async function deleteProperty(id: string): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return handleResponse(response);
}

// ─── OAuth Callback ──────────────────────────────────────────────────────────

export async function oauthCallback(accessToken: string): Promise<{
  userId: string;
  email: string;
  immioEmail: string;
  approved: boolean;
  isAdmin: boolean;
  tier: string;
}> {
  const response = await fetch(`${API_URL}/auth/oauth-callback`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  return handleResponse(response);
}

// ─── Import from URL ─────────────────────────────────────────────────────────

// ADR-015 — backend now returns an `action` discriminator distinguishing a
// fresh create from an update-in-place (relisting, Mechanism C) and a
// soft-suspect (Mechanism B match against an active scraped listing).
export type IngestAction =
  | 'created'
  | 'updated_existing'
  | 'inserted_with_soft_suspicion';

export async function importFromUrl(url: string, status?: string): Promise<{
  message: string;
  property: Property;
  action: IngestAction;
  suspectedDuplicateOf: string | null;
}> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/from-url`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, status }),
  });
  return handleResponse(response);
}

// ─── ADR-015 dedup endpoints ─────────────────────────────────────────────────

export interface ListingHistoryEvent {
  id: string;
  observedAt: string;
  source: string;
  sourceUrl: string | null;
  platform: string | null;
  price: number | null;
  priceDelta: number | null;
}

export async function getListingHistory(propertyId: string): Promise<ListingHistoryEvent[]> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/listing-history`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return handleResponse(response);
}

export async function applyDuplicateDecision(
  propertyId: string,
  decision: 'keep_both' | 'hide_this',
): Promise<Property> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/duplicate-decision`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ decision }),
  });
  return handleResponse(response);
}

export async function dismissRelistBadge(propertyId: string): Promise<Property> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/dismiss-relist-badge`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return handleResponse(response);
}

// ─── Interactions ─────────────────────────────────────────────────────────────

export type InteractionType = 'view' | 'analysis' | 'url_click' | 'status_change' | 'makler_contact';

export async function trackInteraction(
  propertyId: string,
  type: InteractionType,
): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/interactions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type }),
  });
  await handleResponse(response);
}

export async function trackInteractionBatch(
  interactions: { propertyId: string; type: InteractionType }[],
): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/interactions/batch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ interactions }),
  });
  await handleResponse(response);
}

// Track an interaction on a scraped listing (the user has not necessarily
// saved it to their funnel). Mirrors trackInteraction semantically — same
// types, same Recently-Viewed target.
export async function trackScrapedInteraction(
  scrapedListingId: string,
  type: InteractionType,
): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/scraped-listings/${scrapedListingId}/interactions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type }),
  });
  await handleResponse(response);
}

export type RecentlyViewedItem =
  | { kind: 'own'; lastAt: string; property: Property }
  | { kind: 'scraped'; lastAt: string; listing: ScrapedListing };

export async function getRecentlyViewed(limit: number = 20): Promise<RecentlyViewedItem[]> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/recently-viewed?limit=${limit}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  const body: { items?: RecentlyViewedItem[] } = await handleResponse(response);
  return body.items ?? [];
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  properties: {
    total: number;
    totalValue: number;
    avgPrice: number;
    expiredCount: number;
  };
  funnelDistribution: { stage: string; count: number }[];
  interactionCounts: {
    byType: { type: string; count: number }[];
    total: number;
    last7Days: number;
    last30Days: number;
  };
  analysisCounts: {
    byType: { type: string; count: number }[];
    total: number;
  };
  activityTimeline: { date: string; count: number }[];
  milestones: { key: string; value: number }[];
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/analytics/summary`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  return handleResponse(response);
}

// ─── Scraped Listings ─────────────────────────────────────────────────────────

export interface ScrapedListing {
  id: string;
  adId: string;
  platform: string;
  sourceUrl: string;
  title: string | null;
  price: number | null;
  sizeSqm: number | null;
  rooms: number | null;
  location: string | null;
  zipCode: string | null;
  imageUrl: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  savedByUser: boolean;
}

export interface ScrapedListingsResponse {
  data: ScrapedListing[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ScrapedListingsFilter {
  keyword?: string;
  postcodes?: string[];
  minPrice?: number;
  maxPrice?: number;
  minPricePerSqm?: number;
  maxPricePerSqm?: number;
  minSize?: number;
  maxSize?: number;
  minRooms?: number;
  maxRooms?: number;
  hideNullPrice?: boolean;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
}

export async function getScrapedListings(filter: ScrapedListingsFilter = {}): Promise<ScrapedListingsResponse> {
  const token = await getAuthToken();
  const params = new URLSearchParams();
  if (filter.keyword) params.set('keyword', filter.keyword);
  if (filter.postcodes?.length) params.set('postcodes', filter.postcodes.join(','));
  if (filter.minPrice !== undefined) params.set('minPrice', String(filter.minPrice));
  if (filter.maxPrice !== undefined) params.set('maxPrice', String(filter.maxPrice));
  if (filter.minPricePerSqm !== undefined) params.set('minPricePerSqm', String(filter.minPricePerSqm));
  if (filter.maxPricePerSqm !== undefined) params.set('maxPricePerSqm', String(filter.maxPricePerSqm));
  if (filter.minSize !== undefined) params.set('minSize', String(filter.minSize));
  if (filter.maxSize !== undefined) params.set('maxSize', String(filter.maxSize));
  if (filter.minRooms !== undefined) params.set('minRooms', String(filter.minRooms));
  if (filter.maxRooms !== undefined) params.set('maxRooms', String(filter.maxRooms));
  if (filter.hideNullPrice === false) params.set('hideNullPrice', 'false');
  if (filter.sortBy) params.set('sortBy', filter.sortBy);
  if (filter.sortOrder) params.set('sortOrder', filter.sortOrder);
  if (filter.page) params.set('page', String(filter.page));
  const qs = params.toString();
  const response = await fetch(`${API_URL}/scraped-listings${qs ? `?${qs}` : ''}`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  return handleResponse(response);
}

export async function saveScrapedListing(id: string): Promise<{ message: string; property: Property }> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/scraped-listings/${id}/save`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return handleResponse(response);
}

// ─── Analysis API ─────────────────────────────────────────────────────────────

// Per-property in-memory cache for getAnalyses. The analyses-tab fetch is
// the slowest part of opening the modal in Analysen mode (the only fetch
// the modal still does for that mode after Session 44). Caching across
// modal opens means a close+reopen within the TTL skips the roundtrip
// entirely. Mutations invalidate the entry for that property.
const analysesCache = new Map<string, { data: PropertyAnalysis[]; at: number }>();
const ANALYSES_CACHE_TTL_MS = 60_000;

function readAnalysesCache(propertyId: string): PropertyAnalysis[] | null {
  const hit = analysesCache.get(propertyId);
  if (!hit) return null;
  if (Date.now() - hit.at > ANALYSES_CACHE_TTL_MS) {
    analysesCache.delete(propertyId);
    return null;
  }
  return hit.data;
}

export function clearAnalysesCache(propertyId?: string): void {
  if (propertyId) analysesCache.delete(propertyId);
  else analysesCache.clear();
}

export async function getAnalyses(propertyId: string): Promise<PropertyAnalysis[]> {
  const cached = readAnalysesCache(propertyId);
  if (cached) return cached;
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/analyses`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  const raw = await handleResponse(response) as PropertyAnalysis[];
  const data = raw.map((a) => normalizeAnalysis(a));
  analysesCache.set(propertyId, { data, at: Date.now() });
  return data;
}

// ─── ADR-016 — Portfolio analyses (cross-property) ───────────────────────────

export interface PortfolioAnalysis extends PropertyAnalysis {
  property: {
    id: string;
    title: string | null;
    imageUrl: string | null;
    price: number | null;
    sizeSqm: number | null;
    status: string;
  };
}

let portfolioAnalysesCache: { data: PortfolioAnalysis[]; at: number } | null = null;
const PORTFOLIO_CACHE_TTL_MS = 60_000;

export function clearPortfolioAnalysesCache(): void {
  portfolioAnalysesCache = null;
}

// Prisma Decimal columns serialise as strings in JSON to preserve
// precision. The TypeScript interface says `number | null` but the raw
// response holds strings for these fields, which silently breaks
// calculator math: `"420000.00" + 50000` is string concatenation
// (`"42000050000"`), not addition. The PropertyAnalysisModal coerces
// them via `analysisToDraft()` before computing, but the
// PortfolioAnalysisTable and DashboardAnalysisTile read the raw
// response and feed it straight to the calculator. Normalising here
// keeps every caller honest.
const ANALYSIS_DECIMAL_FIELDS: (keyof PropertyAnalysis)[] = [
  'listPrice',
  'desiredPrice',
  'maklerPct',
  'notarPct',
  'grundbuchPct',
  'grunderwerbsteuerPct',
  'otherPurchaseCosts',
  'loan1AmountPct',
  'loan1Amount',
  'loan1Rate',
  'loan2Amount',
  'loan2Rate',
  'ooBetriebskostenMonthly',
  'ooRepairsPct',
  'ooAppreciationPct',
  'rentMonthly',
  'bkUmlagefaehig',
  'bkNichtUmlagefaehig',
  'reparaturruecklageMon',
  'vacancyPct',
  'repairsPct',
  'rentGrowthPct',
  'valueGrowthPct',
  'gebaeudeAnteilPct',
  'grenzsteuersatzPct',
  'gmbhAccountingCostsAnnual',
  'flipResalePrice',
];

function normalizeAnalysis<T extends PropertyAnalysis>(a: T): T {
  const out = { ...a } as unknown as Record<string, unknown>;
  for (const f of ANALYSIS_DECIMAL_FIELDS) {
    const v = out[f as string];
    if (v == null) continue;
    if (typeof v === 'number') continue;
    const parsed = parseFloat(String(v));
    out[f as string] = Number.isFinite(parsed) ? parsed : null;
  }
  // The joined property block on PortfolioAnalysis carries Decimal too.
  const property = (out as { property?: { price?: unknown; sizeSqm?: unknown } }).property;
  if (property) {
    if (property.price != null && typeof property.price !== 'number') {
      const p = parseFloat(String(property.price));
      property.price = Number.isFinite(p) ? p : null;
    }
    if (property.sizeSqm != null && typeof property.sizeSqm !== 'number') {
      const s = parseFloat(String(property.sizeSqm));
      property.sizeSqm = Number.isFinite(s) ? s : null;
    }
  }
  return out as T;
}

export async function getPortfolioAnalyses(): Promise<PortfolioAnalysis[]> {
  if (portfolioAnalysesCache && Date.now() - portfolioAnalysesCache.at < PORTFOLIO_CACHE_TTL_MS) {
    return portfolioAnalysesCache.data;
  }
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/property-analyses`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  const raw = await handleResponse(response) as PortfolioAnalysis[];
  const data = raw.map((a) => normalizeAnalysis(a));
  portfolioAnalysesCache = { data, at: Date.now() };
  return data;
}

export async function createAnalysis(
  propertyId: string,
  dto: CreateAnalysisDto,
): Promise<PropertyAnalysis> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/analyses`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dto),
  });
  const created = await handleResponse(response) as PropertyAnalysis;
  analysesCache.delete(propertyId);
  portfolioAnalysesCache = null;
  return created;
}

export async function updateAnalysis(
  propertyId: string,
  analysisId: string,
  dto: UpdateAnalysisDto,
): Promise<PropertyAnalysis> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/analyses/${analysisId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dto),
  });
  const updated = await handleResponse(response) as PropertyAnalysis;
  analysesCache.delete(propertyId);
  portfolioAnalysesCache = null;
  return updated;
}

export async function deleteAnalysis(propertyId: string, analysisId: string): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/analyses/${analysisId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  await handleResponse(response);
  analysesCache.delete(propertyId);
  portfolioAnalysesCache = null;
}

// ─── Property Documents ─────────────────────────────────────────────────────

export interface PropertyDocument {
  id: string;
  propertyId: string;
  label: string;
  fileName: string;
  storageKey: string;
  fileSize: number;
  createdAt: string;
}

export async function getDocuments(propertyId: string): Promise<PropertyDocument[]> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/documents`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  return handleResponse(response);
}

export async function uploadDocument(propertyId: string, file: File, label: string): Promise<PropertyDocument> {
  const token = await getAuthToken();
  const formData = new FormData();
  formData.append('file', file);
  formData.append('label', label);
  const response = await fetch(`${API_URL}/properties/${propertyId}/documents`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  return handleResponse(response);
}

// ─── ADR-019 — ZIP bundle upload ────────────────────────────────────────────

export type ZipSkipReason = 'duplicate' | 'non_pdf' | 'cap_reached' | 'too_large';
export type ZipFailReason = 'pdf_parse_failed' | 'storage_failed' | 'unknown';

export interface ZipUploadResult {
  imported: { documentId: string; fileName: string; label: string; size: number }[];
  skipped: { fileName: string; reason: ZipSkipReason }[];
  failed: { fileName: string; reason: ZipFailReason; detail?: string }[];
}

/**
 * Same endpoint as uploadDocument — the backend sniffs MIME / magic
 * bytes and routes to the ZIP path. Returns the per-file result envelope
 * so callers can surface skipped/failed detail in the UI.
 */
export async function uploadDocumentZip(
  propertyId: string,
  file: File,
): Promise<ZipUploadResult> {
  const token = await getAuthToken();
  const formData = new FormData();
  formData.append('file', file);
  // Label is ignored on the ZIP path — labels are inferred per file
  // server-side. Pass a dummy so the multipart form has the field.
  formData.append('label', 'Sonstiges');
  const response = await fetch(`${API_URL}/properties/${propertyId}/documents`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  return handleResponse(response);
}

export async function getDocumentDownloadUrl(propertyId: string, documentId: string): Promise<string> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/documents/${documentId}/download`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await handleResponse(response);
  return data.url;
}

export async function updateDocumentLabel(
  propertyId: string,
  documentId: string,
  label: string,
): Promise<PropertyDocument> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/documents/${documentId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ label }),
  });
  return handleResponse(response);
}

export async function deleteDocument(propertyId: string, documentId: string): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/documents/${documentId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (response.status === 204) return;
  return handleResponse(response);
}

// ─── Property Details (Dossier — ADR-009) ───────────────────────────────────

export type PropertyDetailsApplyableField =
  | 'exposePrice'
  | 'purchaseDate'
  | 'bkUmlagefaehig'
  | 'bkNichtUmlagefaehig'
  | 'sizeSqmVerified'
  | 'roomsVerified';

export interface PropertyDetails {
  id: string;
  propertyId: string;
  extractedAt: string | null;
  extractionSource: string | null;

  // Calculator-relevant
  exposePrice: number | null;
  purchaseDate: string | null;
  bkUmlagefaehig: number | null;
  bkNichtUmlagefaehig: number | null;
  sizeSqmVerified: number | null;
  roomsVerified: number | null;

  // Address
  addressStreet: string | null;
  addressZip: string | null;
  addressCity: string | null;

  // Property
  etage: number | null;
  aufzug: boolean | null;
  keller: boolean | null;
  aussenflaeche: string | null;
  parkplatz: string | null;
  baujahr: number | null;
  zustand: string | null;
  haustyp: string | null;
  beziehbarAb: string | null;
  heizung: string | null;
  boden: string | null;
  fenster: string | null;
  bathrooms: number | null;
  separateWC: boolean | null;
  widmung: string | null;
  grundflaeche: number | null;

  // Energy
  hwbClass: string | null;
  hwbValue: number | null;

  // Risk signal
  mrgRisk: boolean | null;

  // Makler contact (ADR-009 v1.1)
  maklerName: string | null;
  maklerPhone: string | null;
  maklerEmail: string | null;
  maklerOrganisation: string | null;

  createdAt: string;
  updatedAt: string;
}

export type UpdatePropertyDetailsDto = Partial<Omit<PropertyDetails,
  'id' | 'propertyId' | 'createdAt' | 'updatedAt' | 'extractedAt' | 'extractionSource'
>>;

// Prisma Decimal columns serialize as strings in JSON to preserve
// precision. The TypeScript interface says `number | null`, but the
// raw response holds strings for these fields. Coerce them once at
// the API boundary so every consumer gets real numbers.
const DECIMAL_FIELDS: (keyof PropertyDetails)[] = [
  'exposePrice',
  'bkUmlagefaehig',
  'bkNichtUmlagefaehig',
  'sizeSqmVerified',
  'roomsVerified',
  'hwbValue',
];

function normalizePropertyDetails(d: PropertyDetails | null): PropertyDetails | null {
  if (!d) return null;
  const out: Record<string, unknown> = { ...d };
  for (const f of DECIMAL_FIELDS) {
    const v = out[f];
    if (v === null || v === undefined) {
      out[f] = null;
    } else if (typeof v === 'string') {
      const parsed = parseFloat(v);
      out[f] = isNaN(parsed) ? null : parsed;
    }
  }
  return out as unknown as PropertyDetails;
}

export async function getPropertyDetails(propertyId: string): Promise<{ details: PropertyDetails | null }> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/details`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await handleResponse(response);
  return { details: normalizePropertyDetails(data?.details ?? null) };
}

export async function updatePropertyDetails(
  propertyId: string,
  dto: UpdatePropertyDetailsDto,
): Promise<PropertyDetails> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/details`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dto),
  });
  const data = await handleResponse(response);
  return normalizePropertyDetails(data) as unknown as PropertyDetails;
}

export async function extractPropertyDetails(propertyId: string): Promise<PropertyDetails> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/details/extract`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await handleResponse(response);
  return normalizePropertyDetails(data) as unknown as PropertyDetails;
}

export async function createPropertyFromExpose(
  file: File,
  status?: string,
): Promise<{ property: Property; details: PropertyDetails }> {
  const token = await getAuthToken();
  const formData = new FormData();
  formData.append('file', file);
  if (status) formData.append('status', status);
  const response = await fetch(`${API_URL}/properties/from-expose`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  const data = await handleResponse(response);
  return {
    property: data.property,
    details: normalizePropertyDetails(data.details) as unknown as PropertyDetails,
  };
}

// ── ADR-010 unified Add Property modal ───────────────────────────────────────

export interface CreateManualPropertyDto {
  title?: string | null;
  price?: number | null;
  sizeSqm?: number | null;
  rooms?: number | null;
  location?: string | null;
  zipCode?: string | null;
  notes?: string | null;
  status?: string;
}

export async function createManualProperty(dto: CreateManualPropertyDto): Promise<Property> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dto),
  });
  return handleResponse(response);
}

// Returns the full ingest envelope (action discriminator + property + suspect ref)
// so callers can render different toasts for new vs relisted vs soft-suspect
// per ADR-015 §7.2. Older callers reading just the Property still work because
// `result.property` carries the same shape.
export async function createPropertyFromUrl(url: string, status?: string): Promise<{
  property: Property;
  action: IngestAction;
  suspectedDuplicateOf: string | null;
}> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/from-url`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, status }),
  });
  const data = await handleResponse(response) as {
    property: Property;
    action?: IngestAction;
    suspectedDuplicateOf?: string | null;
  };
  return {
    property: data.property,
    action: data.action ?? 'created',
    suspectedDuplicateOf: data.suspectedDuplicateOf ?? null,
  };
}

export async function applyPropertyDetailField(
  propertyId: string,
  field: PropertyDetailsApplyableField,
): Promise<Property> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/details/apply-field`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ field }),
  });
  return handleResponse(response);
}

// ─── Saved Filters ──────────────────────────────────────────────────────────

export interface SavedFilter {
  id: string;
  userId: string;
  name: string;
  priceMin: number | null;
  priceMax: number | null;
  pricePerSqmMin: number | null;
  pricePerSqmMax: number | null;
  sizeMin: number | null;
  sizeMax: number | null;
  roomsMin: number | null;
  roomsMax: number | null;
  postcodes: string[];
  bezirke: string[];
  bundeslaender: string[];
  sources: string[];
  listedAfter: string | null;
  listedBefore: string | null;
  sortBy: string;
  sortOrder: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateSavedFilterDto = Partial<Omit<SavedFilter, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>;
export type UpdateSavedFilterDto = CreateSavedFilterDto;

export async function getSavedFilters(): Promise<SavedFilter[]> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/saved-filters`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  return handleResponse(response);
}

export async function createSavedFilter(dto: CreateSavedFilterDto): Promise<SavedFilter> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/saved-filters`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dto),
  });
  return handleResponse(response);
}

export async function updateSavedFilter(id: string, dto: UpdateSavedFilterDto): Promise<SavedFilter> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/saved-filters/${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dto),
  });
  return handleResponse(response);
}

export async function deleteSavedFilter(id: string): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/saved-filters/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (response.status === 204) return;
  return handleResponse(response);
}

// ─── Contact ──────────────────────────────────────────────────────────────────

export interface ContactMessageInput {
  name: string;
  email: string;
  message: string;
  phone?: string;
  honeypot?: string;
}

export async function sendContactMessage(data: ContactMessageInput): Promise<void> {
  const response = await fetch(`${API_URL}/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (response.ok) return;
  let code = 'UNKNOWN';
  try {
    const body = await response.json();
    code = body?.error ?? body?.message?.error ?? code;
  } catch { /* non-JSON */ }
  const err: Error & { code?: string } = new Error(`Contact send failed: ${code}`);
  err.code = code;
  throw err;
}

// ─── Due Diligence Check Engine (ADR-013) ───────────────────────────────────

export interface DueDiligenceCheckResult {
  checkId: string;
  result: string;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  detail: string;
  missingFields: string[];
  flags: string[];
  statuteRefs: string[];
  documentsUsed?: { label: string; fileName: string }[];
}

export interface DueDiligenceRun {
  id: string;
  propertyId: string;
  userId: string;
  runAt: string;
  documentsUsed: string[];
  overallScore: number | null;
  status: 'pending' | 'complete' | 'failed';
  mrgStatus: DueDiligenceCheckResult | null;
  grundbuchEncumbrances: DueDiligenceCheckResult | null;
  vorkaufsrecht: DueDiligenceCheckResult | null;
  energieausweis: DueDiligenceCheckResult | null;
  betriebskosten: DueDiligenceCheckResult | null;
  reparaturruecklage: DueDiligenceCheckResult | null;
  createdAt: string;
  updatedAt: string;
}

export async function runDueDiligence(
  propertyId: string,
  documentKeys: string[] = [],
): Promise<DueDiligenceRun> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/due-diligence/${propertyId}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ documentKeys }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `DD run failed: ${res.status}`);
  }
  return res.json();
}

export async function getDueDiligenceResults(
  propertyId: string,
): Promise<DueDiligenceRun[]> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/due-diligence/${propertyId}/results`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`DD results fetch failed: ${res.status}`);
  return res.json();
}

// ─── ADR-018 — Tester feedback reporting ────────────────────────────────────

export type FeedbackType = 'bug' | 'feature' | 'improvement';
export type FeedbackStatus =
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'wont_fix'
  | 'duplicate';

export interface FeedbackAttachment {
  id: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  signedUrl: string | null;
}

export interface FeedbackReport {
  id: string;
  userId: string;
  type: FeedbackType;
  title: string;
  description: string;
  status: FeedbackStatus;
  teamNote: string | null;
  contextUrl: string | null;
  userAgent: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  propertyId: string | null;
  propertyTitle: string | null;
  acknowledgedAt: string | null;
  statusUpdatedAt: string | null;
  createdAt: string;
  attachments: FeedbackAttachment[];
  user?: { id: string; email: string };
}

export interface UploadAttachmentResponse {
  storageKey: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}

export interface CreateFeedbackDto {
  type: FeedbackType;
  title: string;
  description: string;
  contextUrl?: string | null;
  userAgent?: string | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  propertyId?: string | null;
  propertyTitle?: string | null;
  attachmentKeys?: string[];
}

export async function uploadFeedbackAttachment(
  file: File,
): Promise<UploadAttachmentResponse> {
  const token = await getAuthToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/feedback/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return handleResponse(res);
}

export async function createFeedbackReport(
  dto: CreateFeedbackDto,
): Promise<FeedbackReport> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/feedback`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dto),
  });
  return handleResponse(res);
}

export async function getMyFeedbackReports(): Promise<FeedbackReport[]> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/feedback`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return handleResponse(res);
}

export interface AdminFeedbackFilters {
  status?: FeedbackStatus;
  type?: FeedbackType;
  userId?: string;
  unacknowledged?: boolean;
}

export async function getAdminFeedbackReports(
  filters: AdminFeedbackFilters = {},
): Promise<FeedbackReport[]> {
  const token = await getAuthToken();
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.type) params.set('type', filters.type);
  if (filters.userId) params.set('userId', filters.userId);
  if (filters.unacknowledged) params.set('unacknowledged', 'true');
  const qs = params.toString();
  const res = await fetch(`${API_URL}/admin/feedback${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return handleResponse(res);
}

export async function updateAdminFeedback(
  id: string,
  dto: { status?: FeedbackStatus; teamNote?: string | null },
): Promise<FeedbackReport> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/admin/feedback/${id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dto),
  });
  return handleResponse(res);
}

export async function acknowledgeAdminFeedback(id: string): Promise<FeedbackReport> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/admin/feedback/${id}/acknowledge`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  return handleResponse(res);
}

export async function getUnacknowledgedFeedbackCount(): Promise<{ count: number }> {
  const token = await getAuthToken();
  const res = await fetch(`${API_URL}/admin/feedback/unacknowledged-count`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return handleResponse(res);
}
