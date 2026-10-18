import { describe, expect, it } from 'vitest';
import handler from '../../netlify/functions/health.mjs';

/**
 * Unit test for the M1 /health Netlify function (Functions v2 style).
 * Contract per docs/DATA_CONTRACTS.md §5 + M1 brief: liveness only,
 * no FalkorDB connection, no secrets.
 */
describe('netlify function: health', () => {
  it('answers with the contractual JSON body', async () => {
    const res = await handler();

    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      service: 'aftershock-demo',
      graph: 'not-configured',
      version: '0.1.0',
    });
  });

  it('does not claim a connected graph or include credential-shaped fields', async () => {
    const res = await handler();
    const body = await res.json();
    expect(body.graph).toBe('not-configured');
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized.includes('falkordb')).toBe(false);
    expect(serialized.includes('password')).toBe(false);
    expect(serialized.includes('token')).toBe(false);
    expect(serialized.includes('secret')).toBe(false);
  });
});
