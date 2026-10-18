/**
 * Unit tests: source-level safety scans over the server library. Cheap,
 * credential-free guarantees that age with the code:
 *  - no module ever mentions the protected foreign graph `test_hosting`
 *  - the library never prints (no console.* in graphClient/seed/impact) so no
 *    credential or content can accidentally reach logs
 *  - only graphClient.mjs may touch process.env (seed/impact are env-free)
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PROTECTED_FOREIGN_GRAPHS } from '../../contract.mjs';

/** @param {string} file — relative to server/ */
function src(file) {
  return readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
}

const CORE_MODULES = ['graphClient.mjs', 'seed.mjs', 'impact.mjs'];

describe('source safety scans', () => {
  for (const file of CORE_MODULES) {
    it(`${file} never references protected foreign graphs (${PROTECTED_FOREIGN_GRAPHS.join(', ')})`, () => {
      const text = src(file);
      for (const forbidden of PROTECTED_FOREIGN_GRAPHS) {
        expect(text.includes(forbidden)).toBe(false);
      }
    });
  }

  it('the library never prints — logging belongs to callers (no console.*)', () => {
    for (const file of CORE_MODULES) {
      expect(src(file).includes('console.')).toBe(false);
    }
  });

  it('only graphClient.mjs reads process.env (seed/impact/env-free modules)', () => {
    expect(src('seed.mjs').includes('process.env')).toBe(false);
    expect(src('impact.mjs').includes('process.env')).toBe(false);
    expect(src('graphClient.mjs').includes('process.env')).toBe(true);
  });
});
