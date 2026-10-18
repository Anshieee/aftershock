import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ServiceStatusChip from './ServiceStatusChip';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

it('reports API: online when the health function answers ok', async () => {
  stubFetch(() =>
    Promise.resolve(
      new Response(JSON.stringify({ ok: true, service: 'aftershock-demo', graph: 'not-configured', version: '0.1.0' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );

  render(<ServiceStatusChip />);

  // Honest transient state first; then the truthful observed result.
  expect(screen.getByTestId('service-status').textContent).toMatch(/checking/i);
  await waitFor(() =>
    expect(screen.getByTestId('service-status').textContent).toMatch(/^API: online$/),
  );
});

it('reports API: unavailable on network failure — never a fake online state', async () => {
  stubFetch(() => Promise.reject(new Error('connection refused')));

  render(<ServiceStatusChip />);
  await waitFor(() =>
    expect(screen.getByTestId('service-status').textContent).toMatch(/^API: unavailable$/),
  );
});

it('reports API: unavailable when the endpoint answers with an error status', async () => {
  stubFetch(() => Promise.resolve(new Response('internal error', { status: 500 })));
  render(<ServiceStatusChip />);
  await waitFor(() =>
    expect(screen.getByTestId('service-status').textContent).toMatch(/^API: unavailable$/),
  );
});

it('only ever queries the real health endpoint', async () => {
  const mock = vi.fn((_url: unknown) =>
    Promise.resolve(new Response('{"ok":true}', { status: 200 })),
  );
  vi.stubGlobal('fetch', mock);
  render(<ServiceStatusChip />);
  await waitFor(() => expect(mock).toHaveBeenCalled());
  expect(mock.mock.calls.at(0)?.[0]).toBe('/.netlify/functions/health');
});
