const API_BASE = '/api';

export function getStoredToken(): string | null {
  return localStorage.getItem('ll_token');
}

export function setStoredToken(token: string) {
  localStorage.setItem('ll_token', token);
}

export function clearStoredToken() {
  localStorage.removeItem('ll_token');
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const isReplayed = response.headers.get('X-Idempotent-Replay') === 'true';

  let data: any = {};
  try {
    data = await response.json();
  } catch (e) {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}: Request failed`);
  }

  if (isReplayed && typeof data === 'object') {
    data._isReplayed = true;
  }

  return data as T;
}
