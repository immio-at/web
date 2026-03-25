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

async function handleResponse(response: Response) {
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

  // Flip
  flipDurationMonths: number | null;
  flipResalePrice: number | null;

  createdAt: string;
  updatedAt: string;
}

export type CreateAnalysisDto = {
  usageType: 'owner' | 'rental' | 'flip';
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

// ─── Import from URL ─────────────────────────────────────────────────────────

export async function importFromUrl(url: string, status?: string): Promise<{ message: string; property: Property }> {
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
  platform?: string;
  zipCode?: string;
  minPrice?: number;
  maxPrice?: number;
  minPricePerSqm?: number;
  maxPricePerSqm?: number;
  minSize?: number;
  maxSize?: number;
  minRooms?: number;
  maxRooms?: number;
  sortBy?: string;
  sortOrder?: string;
  page?: number;
}

export async function getScrapedListings(filter: ScrapedListingsFilter = {}): Promise<ScrapedListingsResponse> {
  const token = await getAuthToken();
  const params = new URLSearchParams();
  if (filter.platform) params.set('platform', filter.platform);
  if (filter.zipCode) params.set('zipCode', filter.zipCode);
  if (filter.minPrice !== undefined) params.set('minPrice', String(filter.minPrice));
  if (filter.maxPrice !== undefined) params.set('maxPrice', String(filter.maxPrice));
  if (filter.minPricePerSqm !== undefined) params.set('minPricePerSqm', String(filter.minPricePerSqm));
  if (filter.maxPricePerSqm !== undefined) params.set('maxPricePerSqm', String(filter.maxPricePerSqm));
  if (filter.minSize !== undefined) params.set('minSize', String(filter.minSize));
  if (filter.maxSize !== undefined) params.set('maxSize', String(filter.maxSize));
  if (filter.minRooms !== undefined) params.set('minRooms', String(filter.minRooms));
  if (filter.maxRooms !== undefined) params.set('maxRooms', String(filter.maxRooms));
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

export async function getAnalyses(propertyId: string): Promise<PropertyAnalysis[]> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/analyses`, {
    headers: { 'Authorization': `Bearer ${token}` },
    cache: 'no-store',
  });
  return handleResponse(response);
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
  return handleResponse(response);
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
  return handleResponse(response);
}

export async function deleteAnalysis(propertyId: string, analysisId: string): Promise<void> {
  const token = await getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/analyses/${analysisId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
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
