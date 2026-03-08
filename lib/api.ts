const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-e03a.up.railway.app';

// ─── Property ─────────────────────────────────────────────────────────────────

export interface Property {
  id: string;
  title: string;
  price: number | null;
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

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function getAuthToken(): string {
  const token = localStorage.getItem('accessToken');
  if (!token) {
    window.location.href = '/login';
    throw new Error('No active session');
  }
  return token;
}

async function handleResponse(response: Response) {
  if (response.status === 401) {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('immioEmail');
    localStorage.removeItem('approved');
    window.location.href = '/login?reason=session_expired';
    throw new Error('Session expired');
  }
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

// ─── Property API ─────────────────────────────────────────────────────────────

export async function getProperties(): Promise<Property[]> {
  const token = getAuthToken();
  const response = await fetch(`${API_URL}/properties`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    cache: 'no-store',
  });
  return handleResponse(response);
}

export async function updateProperty(
  id: string,
  data: { status?: string; notes?: string; movedToStageAt?: string },
) {
  const token = getAuthToken();
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

// ─── Analysis API ─────────────────────────────────────────────────────────────

export async function getAnalyses(propertyId: string): Promise<PropertyAnalysis[]> {
  const token = getAuthToken();
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
  const token = getAuthToken();
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
  const token = getAuthToken();
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
  const token = getAuthToken();
  const response = await fetch(`${API_URL}/properties/${propertyId}/analyses/${analysisId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  return handleResponse(response);
}
