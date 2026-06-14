import { auth } from './firebase';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  let token: string | null = null;
  if (auth.currentUser) {
    token = await auth.currentUser.getIdToken();
  }

  const headers = new Headers(opts.headers ?? {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (opts.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  });

  if (!response.ok) {
    let body: { error?: string; message?: string; details?: unknown } = {};
    try {
      body = await response.json();
    } catch {
      // ignore JSON parse failures for non-JSON error responses
    }

    throw new ApiError(
      response.status,
      body.error ?? 'unknown',
      body.message ?? response.statusText,
      body.details,
    );
  }

  // Handle empty or 204 No Content responses safely
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}
