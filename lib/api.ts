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
}

export async function getProperties(): Promise<Property[]> {
  // Get auth token from localStorage
  const token = localStorage.getItem('accessToken');
  
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_URL}/properties`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    cache: 'no-store',
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch properties');
  }
  
  return response.json();
}

export async function updateProperty(id: string, data: { status?: string; notes?: string }) {
  const token = localStorage.getItem('accessToken');
  
  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${API_URL}/properties/${id}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update property');
  }
  
  return response.json();
}