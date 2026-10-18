/**
 * Unit tests: seed planning is a pure function — validate batching, node/edge
 * enrichment (seeded flags, primaryLabel), the SeedMeta contract, expected
 * count consistency and determinism. No DB, no credentials.
 */

import { describe, expect, it } from 'vitest';
import { FIXTURE_IDS } from '../../contract.mjs';
import { defaultFixture, buildSeedPlan, expectedCountsFor } from '../../seed.mjs';

const fixture = defaultFixture();
const plan = buildSeedPlan(fixture, { now: new Date('2026-10-18T00:00:00.000Z') });

describe('buildSeedPlan — batching', () => {
  it('groups every node under its (single) label with seeded + primaryLabel enrichment', () => {
    expect(plan.expected.nodes).toBe(fixture.nodes.length);
    for (const [labelName, rows] of plan.nodesByLabel) {
      expect(labelName).toBeTypeOf('string');
      for (const row of rows) {
        expect(row.seeded).toBe(true);
        expect(row.primaryLabel).toBe(labelName);
        expect(typeof row.id).toBe('string');
      }
    }
    const relabeledTotal = [...plan.nodesByLabel.values()].reduce((acc, rows) => acc + rows.length, 0);
    expect(relabeledTotal).toBe(fixture.nodes.length);
  });

  it('groups every edge under its type with structure fields stripped from props', () => {
    expect(plan.expected.edges).toBe(fixture.edges.length);
    const stripKeys = ['type', 'fromId', 'toId'];
    for (const [typeName, rows] of plan.edgesByType) {
      expect(typeof typeName).toBe('string');
      for (const row of rows) {
        expect(typeof row.fromId).toBe('string');
        expect(typeof row.toId).toBe('string');
        for (const key of stripKeys) {
          expect(Object.prototype.hasOwnProperty.call(row.props, key)).toBe(false);
        }
        expect(row.props.seeded).toBe(true);
        expect(row.props.rationale).toBeTypeOf('string');
        expect(row.props.sourcePointer).toBeTypeOf('string');
      }
    }
  });

  it('keeps the SeedMeta contract node (id + seedVersion) out of the label batches', () => {
    expect(plan.metaNode.id).toBe(FIXTURE_IDS.seedMeta);
    expect(plan.metaNode.seedVersion).toBe(FIXTURE_IDS.seedVersion);
    const allBatchIds = [...plan.nodesByLabel.values()].flat().map((r) => r.id);
    expect(allBatchIds).not.toContain(FIXTURE_IDS.seedMeta);
  });

  it('serializes structural values into JSON strings (FalkorDB stores primitives/arrays only)', () => {
    const refRows = plan.nodesByLabel.get('ReferenceOccurrence') ?? [];
    expect(refRows).toHaveLength(1);
    const encoded = JSON.parse(/** @type {string} */ (refRows[0].location));
    expect(encoded.page).toBe(4);
    expect(encoded.section).toBe('3.2');

    const edgeProps = plan.edgesByType.get('CONCLUSION_DEPENDS_ON_CLAIM') ?? [];
    expect(edgeProps).toHaveLength(1);
    expect(edgeProps[0].props.confidence).toBeCloseTo(0.9);
    expect(edgeProps[0].props.seeded).toBe(true);
  });

  it('derives expected counts consistent with the plan (used by no-op checks)', () => {
    const expected = expectedCountsFor(fixture);
    expect(expected).toEqual(plan.expected);
    expect(Object.values(expected.nodesByLabel).reduce((a, b) => a + b, 0)).toBe(expected.nodes);
    expect(Object.values(expected.edgesByType).reduce((a, b) => a + b, 0)).toBe(expected.edges);
  });
});

describe('buildSeedPlan — determinism', () => {
  it('is byte-for-byte deterministic for a fixed clock (except nothing at all)', () => {
    const a = buildSeedPlan(fixture, { now: new Date('2026-10-18T00:00:00.000Z') });
    const b = buildSeedPlan(fixture, { now: new Date('2026-10-18T00:00:00.000Z') });
    expect(JSON.stringify(a.metaNode)).toBe(JSON.stringify(b.metaNode));
    expect(JSON.stringify(a.expected)).toBe(JSON.stringify(b.expected));
    expect(JSON.stringify([...a.nodesByLabel.entries()])).toBe(JSON.stringify([...b.nodesByLabel.entries()]));
    expect(JSON.stringify([...a.edgesByType.entries()])).toBe(JSON.stringify([...b.edgesByType.entries()]));
    expect(a.warnings).toEqual(b.warnings);
  });

  it('flags collect no warnings for the shipped fixture (no real-record drift)', () => {
    expect(plan.warnings).toEqual([]);
  });

  it('honors a custom clock for the SeedMeta row', () => {
    const dated = buildSeedPlan(fixture, { now: new Date('2026-01-02T03:04:05.000Z') });
    expect(dated.metaNode.createdAt).toBe('2026-01-02T03:04:05.000Z');
    expect(dated.metaNode.updatedAt).toBe('2026-01-02T03:04:05.000Z');
  });
});
