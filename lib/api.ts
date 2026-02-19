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
  const response = await fetch(`${API_URL}/properties`, {
    cache: 'no-store', // Always get fresh data
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch properties');
  }
  
  return response.json();
}