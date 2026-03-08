const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-e03a.up.railway.app';

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
    // Token rejected by backend — clear session and redirect
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

export async function updateProperty(id: string, data: { status?: string; notes?: string; movedToStageAt?: string }) {
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
