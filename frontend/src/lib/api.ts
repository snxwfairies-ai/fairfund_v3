// src/lib/api.ts
const BASE = typeof window !== 'undefined' ? '/api/v1' : `${process.env.NEXT_PUBLIC_API_URL}/api/v1`;

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('ff_access_token');
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method, headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json().catch(() => ({}));

  // Auto-refresh on 401 TOKEN_EXPIRED
  if (res.status === 401 && data?.code === 'TOKEN_EXPIRED' && typeof window !== 'undefined') {
    const rt = localStorage.getItem('ff_refresh_token');
    if (rt) {
      const refreshRes = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (refreshRes.ok) {
        const tokens = await refreshRes.json();
        localStorage.setItem('ff_access_token',  tokens.data?.accessToken  || tokens.accessToken);
        localStorage.setItem('ff_refresh_token', tokens.data?.refreshToken || tokens.refreshToken);
        return request<T>(method, path, body);
      }
    }
    localStorage.clear();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) throw new Error(data?.message || `Request failed: ${res.status}`);
  return (data?.data ?? data) as T;
}

export const api = {
  get:    <T>(path: string)              => request<T>('GET',    path),
  post:   <T>(path: string, body: unknown) => request<T>('POST',   path, body),
  put:    <T>(path: string, body?: unknown) => request<T>('PUT',    path, body),
  delete: <T>(path: string)              => request<T>('DELETE', path),
};
