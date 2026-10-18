/**
 * Unit tests for the unimplemented M4/M5 stub routes. The stub must claim
 * nothing: 501 + { reason: 'not-implemented' } which the deployed client maps
 * (with 404) to the honest "not available yet" outcome.
 */

import { describe, expect, it } from 'vitest';
import handler from '../../netlify/functions/unimplemented.mjs';

describe('unimplemented stub handler', () => {
  it('answers 501 with the honest not-implemented body for any route/method', async () => {
    for (const url of [
      'http://localhost/.netlify/functions/documents/doc-demo-manuscript',
      'http://localhost/.netlify/functions/analyze/run-123/status',
    ]) {
      const res = await handler(new Request(url));
      expect(res.status, url).toBe(501);
      const body = await res.json();
      expect(body.reason).toBe('not-implemented');
      expect(body.message).toContain('Nothing ran');
    }
  });

  it('never runs database code and never returns fabricated status data', async () => {
    const res = await handler(new Request('http://localhost/x'));
    const text = await res.text();
    expect(text.includes('status')).toBe(false);
    expect(text.includes('runId')).toBe(false);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
