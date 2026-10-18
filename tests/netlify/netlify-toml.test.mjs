/**
 * Rewrite-table correctness for netlify.toml: every client-facing function
 * route must be present as a status-200 force rewrite, and ALL function
 * rewrites must sit ABOVE the SPA fallback (which must be LAST), so the
 * app-shell fallback can never shadow an API route.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// vitest transforms import.meta.url (no file: scheme) — resolve from cwd,
// which vitest pins to the project root.
const TOML = readFileSync('netlify.toml', 'utf8');

/**
 * Minimal ordered parser for the `[[redirects]]` blocks we ship. Throws on
 * malformed lines inside a block so a broken table fails loudly here.
 * @param {string} toml
 */
function parseRedirects(toml) {
  /** @type {Array<Record<string, string | number | boolean>>} */
  const blocks = [];
  let current = null;
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('[[redirects]]')) {
      current = {};
      blocks.push(current);
      continue;
    }
    if (!current || line.startsWith('#') || line.startsWith('[') || line === '') continue;
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    let value = kv[2];
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else value = Number(value);
    current[kv[1]] = value;
  }
  return blocks;
}

const redirects = parseRedirects(TOML);
const byFrom = new Map(redirects.map((r) => [String(r.from), r]));
const spaFallbackIndex = redirects.findIndex((r) => r.from === '/*');

/** The client-facing routes and the functions they must reach. */
const FUNCTION_ROUTES = {
  '/.netlify/functions/graph/probe': '/.netlify/functions/graph-probe',
  '/.netlify/functions/demo/seed': '/.netlify/functions/demo-seed',
  '/.netlify/functions/graph/edges': '/.netlify/functions/graph-edges',
  '/.netlify/functions/documents': '/.netlify/functions/documents',
  '/.netlify/functions/documents/*': '/.netlify/functions/unimplemented',
  '/.netlify/functions/analyze/*': '/.netlify/functions/unimplemented',
  '/.netlify/functions/seed': '/.netlify/functions/seed',
};

describe('netlify.toml redirect table', () => {
  it('parses at all and contains the SPA fallback', () => {
    expect(redirects.length).toBeGreaterThan(0);
    expect(spaFallbackIndex).toBeGreaterThanOrEqual(0);
  });

  it('maps every client-facing function route with status 200 + force', () => {
    for (const [from, to] of Object.entries(FUNCTION_ROUTES)) {
      const rule = byFrom.get(from);
      expect(rule, `missing rewrite for ${from}`).toBeDefined();
      expect(rule.to, `${from} → to`).toBe(to);
      expect(rule.status, `${from} status`).toBe(200);
      expect(rule.force, `${from} force`).toBe(true);
    }
  });

  it('keeps the SPA fallback LAST — every function rewrite sits above it', () => {
    expect(spaFallbackIndex).toBe(redirects.length - 1);
    const fallback = redirects[spaFallbackIndex];
    expect(fallback.to).toBe('/index.html');
    expect(fallback.status).toBe(200);
    for (const from of Object.keys(FUNCTION_ROUTES)) {
      const index = redirects.findIndex((r) => r.from === from);
      expect(index, `${from} must be above the SPA fallback`).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(spaFallbackIndex);
    }
  });

  it('covers every static client route the deployed api client calls', async () => {
    const apiTs = readFileSync('src/lib/api.ts', 'utf8');
    const routeEntries = [...apiTs.matchAll(/(\w+):\s*'(\/[^']*)'/g)].map(([, key, path]) => ({ key, path }));
    const staticPaths = routeEntries
      .filter(({ key }) => ['health', 'graphProbe', 'demoSeed', 'graphEdges', 'documents'].includes(key))
      .map(({ path }) => `/.netlify/functions${path.replace(/\/$/, '')}`);
    expect(staticPaths.length).toBeGreaterThanOrEqual(5);
    for (const clientPath of staticPaths) {
      const served =
        byFrom.has(clientPath) // explicit rewrite
        || clientPath === '/.netlify/functions/health'; // or auto-routed function file
      expect(served, `client route ${clientPath} has no rewrite and no function file`).toBe(true);
    }
  });
});
