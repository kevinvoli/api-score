export interface BackendRequestOptions {
  method: string;
  path: string;
  sessionToken?: string | null;
  body?: string;
}

export interface BackendRawResponse {
  status: number;
  contentType: string | null;
  bodyText: string;
}

export interface NormalizedBackendError {
  status: number;
  error: string;
}

export class BackendTimeoutError extends Error {}

const TIMEOUT_MS = 10_000;

/** Statuts pour lesquels le message backend est passé tel quel (voir contrat `/auth/*`, lot 1). */
const PASSTHROUGH_STATUSES = new Set([400, 401, 403, 404, 409, 422, 429]);

const getBackendBaseUrl = (): string => {
  const base = process.env.BACKEND_API_BASE_URL;
  if (!base) {
    throw new Error('BACKEND_API_BASE_URL manquant');
  }
  return base;
};

const getBackendApiKey = (): string => {
  const key = process.env.BACKEND_API_KEY;
  if (!key) {
    throw new Error('BACKEND_API_KEY manquant');
  }
  return key;
};

export async function callBackend(
  options: BackendRequestOptions,
): Promise<BackendRawResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'x-api-key': getBackendApiKey(),
    };
    if (options.sessionToken) {
      headers.authorization = `Bearer ${options.sessionToken}`;
    }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    const response = await fetch(`${getBackendBaseUrl()}${options.path}`, {
      method: options.method,
      headers,
      body: options.body,
      signal: controller.signal,
    });

    const bodyText = await response.text();
    return {
      status: response.status,
      contentType: response.headers.get('content-type'),
      bodyText,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new BackendTimeoutError("Délai dépassé lors de l'appel au backend");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function parseJsonSafely(text: string): unknown {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const extractMessage = (body: unknown): string | null => {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const message = (body as Record<string, unknown>).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return null;
};

export function normalizeBackendError(
  status: number,
  parsedBody: unknown,
): NormalizedBackendError {
  if (status >= 500 || status === 0) {
    return { status: 502, error: 'Le service backend est momentanément indisponible' };
  }

  const message = extractMessage(parsedBody);
  if (PASSTHROUGH_STATUSES.has(status) && message) {
    return { status, error: message };
  }

  return { status, error: 'Requête invalide' };
}
