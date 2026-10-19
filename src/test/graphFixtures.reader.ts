/**
 * Reader fixture helper (M7 Priority A — new file; nothing existing is
 * modified). Builds on the real seeded-demo wire fixture
 * (`buildDemoOverviewRecord`) by injecting the `location` metadata the
 * real seed fixture carries (server/fixtures/demo-fixture.json):
 *
 *   ref-lee-2020      {page 4, section 3.2, offset null}    (JSON-string form kept below)
 *   claim-A           {page 3, section 2.1}
 *   claim-B           {page 5, section 4.1}
 *   conclusion-C      {page 6, section 5.2}
 *   cu-A-supporting   {page 3, section 2.1, excerptOffset 0}
 *   cu-B-historical   {page 5, section 4.1, excerptOffset 0}
 *
 * `ref-lee-2020` deliberately arrives as the SEED-TIME JSON STRING so
 * the reader's string-vs-object tolerance is exercised by the same
 * payload shapes production sends (seed.mjs `normalizeValue`).
 */
import { buildDemoOverviewRecord } from './graphFixtures';

const LOCATIONS: Record<string, unknown> = {
  'claim-A': { page: 3, section: '2.1' },
  'claim-B': { page: 5, section: '4.1' },
  'conclusion-C': { page: 6, section: '5.2' },
  'cu-A-supporting': { page: 3, section: '2.1', excerptOffset: 0 },
  'cu-B-historical': { page: 5, section: '4.1', excerptOffset: 0 },
  // Seed-time serialization: JSON string, offset null dropped as absent.
  'ref-lee-2020': '{"page": 4, "section": "3.2", "offset": null}',
};

export function buildReaderOverviewRecord(): Record<string, unknown> {
  const base = buildDemoOverviewRecord();
  const nodes = (base.nodes as Record<string, unknown>[]).map((node) => {
    const location = LOCATIONS[node.id as string];
    if (location === undefined) return node;
    return { ...node, location };
  });
  return { ...base, nodes };
}

export function cloneReaderOverviewRecord(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(buildReaderOverviewRecord())) as Record<string, unknown>;
}
