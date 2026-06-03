const API_BASE = process.env.ADA_API_BASE ?? 'http://localhost:3000'; // Fallback to localhost:3000 for dev

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiCall<T>(
  path: string,
  opts: { method?: string; body?: unknown; apiKey: string },
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let body: { error?: string; message?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* */
    }
    throw new ApiClientError(res.status, body.error ?? 'unknown', body.message ?? res.statusText);
  }
  return (await res.json()) as T;
}
