type FetchOptions = RequestInit & {
  query?: Record<string, unknown>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY ?? '';

const buildUrl = (path: string, query?: Record<string, unknown>) => {
  const url = `${API_BASE}${path}`;
  if (!query) {
    return url;
  }
  const searchParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    searchParams.set(key, String(value));
  });
  const queryString = searchParams.toString();
  return queryString ? `${url}?${queryString}` : url;
};

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const url = buildUrl(path, options.query);
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`API error (${response.status}): ${body}`);
  }

  return response.json();
}
