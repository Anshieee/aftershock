/**
 * Routing drift guard, built on a production-verified fact (2026-10-18):
 * Netlify rewrites CANNOT intercept inside the reserved
 * /.netlify/functions/* namespace — a sub-path like
 * /.netlify/functions/graph/probe resolves function name "graph" (miss)
 * and falls through to the SPA fallback serving HTML, while the dash-named
 * function path /.netlify/functions/graph-probe is served directly (200
 * JSON). Canonical client routes are therefore the dash-named function
 * file paths with NO rewrite indirection.
 *
 * This guard asserts that:
 *  1. EVERY route template in src/lib/api.ts `apiRoutes` starts with the
 *     filename of an existing netlify/functions/<name>.mjs (dash-name =
 *     filename) — EXCEPT `/unimplemented` routes, which must target the
 *     unimplemented.mjs 501 stub with a `for=` query param.
 *  2. Dynamic parameters appear ONLY as query strings — no path params,
 *     none of which the reserved namespace supports.
 *  3. netlify.toml contains NO rewrite whose `from` starts with
 *     /.netlify/functions/ (regression guard), and the SPA fallback is
 *     the LAST redirect.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// vitest transforms import.meta.url (no file: scheme) — resolve from cwd,
// which vitest pins to the project root.
const TOML = readFileSync('netlify.toml', 'utf8');
const API_TS = readFileSync('src/lib/api.ts', 'utf8');

/**
 * Extracts the apiRoutes table from the TypeScript client source. Entries
 * are either `key: '/literal'` (static) or `key: (params) => '/literal' + …`
 * (parametric — the leading literal is captured; the tail concatenates
 * encodeURIComponent output). Throws on any line inside the exported block
 * it cannot parse, so a refactor that changes the table's shape fails
 * loudly here instead of drifting silently.
 * @param {string} apiTs
 * @returns {Map<string, { route: string, sourceLine: string }>}
 */
function parseApiRoutes(apiTs) {
  const block = apiTs.match(/export const apiRoutes = \{([\s\S]*?)\n\} as const;/);
  if (!block) throw new Error('apiRoutes block not found in src/lib/api.ts');
  /** @type {Map<string, { route: string, sourceLine: string }>} */
  const routes = new Map();
  for (const rawLine of block[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('//') || line.startsWith('*')) continue;
    const entry = line.match(/^(\w+):\s*(?:\([^)]*\)\s*=>\s*)?'((?:[^'\\]|\\.)*)'/);
    if (!entry) {
      throw new Error(`Unparseable apiRoutes entry — update this drift guard: ${line}`);
    }
    routes.set(entry[1], { route: entry[2], sourceLine: line });
  }
  if (routes.size === 0) throw new Error('apiRoutes block parsed to zero routes');
  return routes;
}

const ROUTES = parseApiRoutes(API_TS);

/** Deployed function names: netlify/functions/<name>.mjs (dash names). */
const FUNCTIONS = readdirSync('netlify/functions')
  .filter((file) => file.endsWith('.mjs'))
  .map((file) => file.slice(0, -'.mjs'.length));

/** Splits `/name/path?query` into { head, tail, query }. */
function splitRoute(route) {
  const [path, query = ''] = route.split('?');
  const segments = path.split('/').filter(Boolean);
  return { head: segments[0], tail: segments.slice(1), query };
}

describe('src/lib/api.ts apiRoutes — canonical dash paths', () => {
  it('exposes the expected route keys (extend this guard when adding routes)', () => {
    expect([...ROUTES.keys()].sort()).toEqual([
      'analysisRunStatus',
      'analysisStatus',
      'analyze',
      'demoSeed',
      'document',
      'documentDetail',
      'documents',
      'exportAnnotatedManuscript',
      'exportReport',
      'exportRevisionPack',
      'graphEdges',
      'graphProbe',
      'health',
      'importDocument',
      'reviewDecide',
      'reviewRevision',
    ]);
  });

  /**
   * M4 routes whose function files land with the parallel backend wave
   * (fixed client↔server contract, same sprint): import-document, analyze,
   * analyze-status, document-detail. The existence check tolerates EXACTLY
   * these heads until the files are deployed — every other unknown segment
   * still fails loudly. Remove entries once the functions land on main.
   * @type {Set<string>}
   */
  const PENDING_FUNCTION_FILES = new Set([
    'import-document',
    'analyze',
    'analyze-status',
    'document-detail',
    'export-annotated-manuscript',
    'export-report',
    'export-revision-pack',
    'review-decide',
    'review-revision',
  ]);

  for (const [key, { route, sourceLine }] of ROUTES) {
    describe(`route ${key} = ${route}`, () => {
      const { head, tail, query } = splitRoute(route);

      it('first path segment names an existing netlify/functions/<name>.mjs file', () => {
        expect(
          FUNCTIONS.includes(head) || PENDING_FUNCTION_FILES.has(head),
          `first segment "${head}" must be a function filename (deployed: ${FUNCTIONS.join(
            ', ',
          )}) or an explicitly pending M4 route`,
        ).toBe(true);
      });

      it('carries NO path parameters — dynamic params are query-only', () => {
        expect(route, 'no ":"-style or "*" path params (unsupported in-namespace)').not.toMatch(
          /(^|\/)[:*]/,
        );
        expect(route, 'no template placeholders in the route literal').not.toMatch(/[${}]/);
        for (const segment of tail) {
          expect(segment, 'no dynamic segments beyond the function name').not.toMatch(/[:*]/);
        }
      });

      if (head === 'unimplemented') {
        it('targets the unimplemented.mjs 501 stub with a `for=` query param', () => {
          expect(query, 'unimplemented route must carry for=').toMatch(/(^|&)for=/);
        });
        it('appends dynamic params via encodeURIComponent (never into the path)', () => {
          expect(
            sourceLine,
            'dynamic params must be appended encodeURIComponent-encoded',
          ).toContain('encodeURIComponent(');
        });
      } else if (head === 'review-decide' || head === 'review-revision') {
        // M5 review routes carry their caseId as a query param per §5; the
        // caller appends encodeURIComponent(caseId) at the call site (in the
        // reviewDecide/reviewRevision client functions), so the route table
        // line itself contains no encodeURIComponent.
        it('carries ?caseId= as its query prefix (caseId appended at call site)', () => {
          expect(route.endsWith('?caseId='), `route ${key} should end with ?caseId=`).toBe(true);
        });
      } else {
        it('is a static function-file path (no appended value concatenation)', () => {
          // Real endpoints are plain function-file paths; per-request query
          // strings are built at the call site (see getGraphOverview). A
          // trailing "=" here would mean a dynamic value was appended to
          // the route table instead of the query construction.
          expect(route.endsWith('='), `unexpected appended value in route ${key}`).toBe(false);
        });
      }
    });
  }
});

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
const spaFallbackIndex = redirects.findIndex((r) => r.from === '/*');

describe('netlify.toml — redirect table', () => {
  it('contains NO rewrite inside the reserved /.netlify/functions namespace', () => {
    const offenders = redirects
      .map((rule) => String(rule.from ?? ''))
      .filter((from) => from.startsWith('/.netlify/functions/'));
    expect(
      offenders,
      'rewrites cannot intercept /.netlify/functions/* (production-verified 2026-10-18) — canonical dash paths only',
    ).toEqual([]);
  });

  it('keeps the SPA fallback as the LAST redirect', () => {
    expect(spaFallbackIndex, 'SPA fallback (from = "/*") must exist').toBeGreaterThanOrEqual(0);
    expect(spaFallbackIndex, 'SPA fallback must be the LAST redirect').toBe(redirects.length - 1);
    const fallback = redirects[spaFallbackIndex];
    expect(fallback.to).toBe('/index.html');
    expect(fallback.status).toBe(200);
  });
});
