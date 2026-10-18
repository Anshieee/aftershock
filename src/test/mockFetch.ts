import { vi } from 'vitest';

export interface RoutedResponse {
  status: number;
  body?: unknown;
}

export type RouteHandler = (url: string, init: RequestInit | undefined) => RoutedResponse | undefined;

export interface CallRecord {
  url: string;
  init: RequestInit | undefined;
}

/**
 * Stubs global fetch with a route handler so page tests can answer each
 * real API path differently. Unknown URLs get a bare 404 (like a missing
 * Netlify function), matching honest behavior.
 */
export function stubFetchByRoute(handler: RouteHandler): CallRecord[] {
  const calls: CallRecord[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String((input as Request).url);
      calls.push({ url, init });
      const resolved = handler(url, init);
      if (!resolved) return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
      return new Response(
        resolved.body === undefined ? 'no body' : JSON.stringify(resolved.body),
        { status: resolved.status, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
  return calls;
}
