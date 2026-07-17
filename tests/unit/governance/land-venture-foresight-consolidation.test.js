/**
 * Unit tests for the Venture Foresight Board land/supersede/stamp governance helpers.
 * SD: SD-LEO-INFRA-LAND-VENTURE-FORESIGHT-001
 *
 * The script performs governance-record mutations (supersede a deferred stub + stamp
 * anti-fork consolidation constraints); these tests pin its PURE logic:
 *   - the 3 constraints have the exact ratified targets (TS-1),
 *   - the supersession reason matches cancel-sd.js's superseded pattern + names spec+SD (TS-2),
 *   - the constraint stamp is idempotent — merges by id, never appends dupes (TS-3),
 *   - the FR-1 presence check fails LOUD on an absent spec, never a silent pass (TS-4).
 */
import { describe, test, expect } from 'vitest';
import {
  buildConsolidationConstraints,
  buildSupersessionReason,
  mergeConstraints,
  assessSpecPresence,
  SPEC_PATH,
  THIS_SD,
  STUB_SD,
} from '../../../scripts/governance/land-venture-foresight-consolidation.mjs';

describe('buildConsolidationConstraints (FR-3 / TS-1)', () => {
  test('produces exactly 3 constraints with the ratified targets', () => {
    const cs = buildConsolidationConstraints();
    expect(cs).toHaveLength(3);
    const byId = Object.fromEntries(cs.map((c) => [c.id, c]));
    expect(byId['C1-signal-scan-is-market-signal-scanner'].target).toMatch(/Market-Signal Scanner/i);
    expect(byId['C1-signal-scan-is-market-signal-scanner'].relation).toBe('is');
    expect(byId['C2-routing-consumes-model-capability-reference'].target).toMatch(/model_capability_reference/);
    expect(byId['C2-routing-consumes-model-capability-reference'].relation).toBe('consumes');
    expect(byId['C3-venture-screen-extends-selection-demand'].target).toBe('SD-LEO-INFRA-VENTURE-SELECTION-DEMAND-001');
    expect(byId['C3-venture-screen-extends-selection-demand'].relation).toBe('extends');
    // every constraint carries a human-readable statement
    for (const c of cs) expect(typeof c.constraint).toBe('string');
  });

  test('constraint ids are unique', () => {
    const ids = buildConsolidationConstraints().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildSupersessionReason (FR-2 / TS-2)', () => {
  test('matches cancel-sd.js superseded pattern AND names the spec + SD', () => {
    const reason = buildSupersessionReason();
    // cancel-sd.js gate: /superseded|duplicate[\s-]?of[\s-]?merged/i
    expect(reason).toMatch(/superseded|duplicate[\s-]?of[\s-]?merged/i);
    expect(reason).toContain(SPEC_PATH);
    expect(reason).toContain(THIS_SD);
  });
});

describe('mergeConstraints idempotence (FR-3 / TS-3)', () => {
  test('stamping twice yields 3 constraints, not 6', () => {
    const once = mergeConstraints([], buildConsolidationConstraints());
    expect(once).toHaveLength(3);
    const twice = mergeConstraints(once, buildConsolidationConstraints());
    expect(twice).toHaveLength(3);
  });

  test('preserves unrelated existing constraints and updates by id', () => {
    const existing = [{ id: 'X-other', constraint: 'unrelated' }, { id: 'C1-signal-scan-is-market-signal-scanner', constraint: 'STALE' }];
    const merged = mergeConstraints(existing, buildConsolidationConstraints());
    expect(merged).toHaveLength(4); // X-other + 3 canonical
    const c1 = merged.find((c) => c.id === 'C1-signal-scan-is-market-signal-scanner');
    expect(c1.constraint).not.toBe('STALE'); // canonical text wins
    expect(merged.some((c) => c.id === 'X-other')).toBe(true);
  });

  test('non-array existing is treated as empty', () => {
    expect(mergeConstraints(undefined, buildConsolidationConstraints())).toHaveLength(3);
    expect(mergeConstraints(null, buildConsolidationConstraints())).toHaveLength(3);
  });
});

describe('assessSpecPresence (FR-1 / TS-4)', () => {
  test('absent spec is a LOUD failure, never a silent pass', () => {
    const v = assessSpecPresence(false);
    expect(v.ok).toBe(false);
    expect(v.message).toMatch(/FAIL/);
    expect(v.message).toContain(SPEC_PATH);
  });
  test('present spec passes', () => {
    const v = assessSpecPresence(true);
    expect(v.ok).toBe(true);
    expect(v.message).toMatch(/OK/);
  });
});

describe('constants', () => {
  test('target the correct records', () => {
    expect(THIS_SD).toBe('SD-LEO-INFRA-LAND-VENTURE-FORESIGHT-001');
    expect(STUB_SD).toBe('SD-REFILL-00X2A49J');
    expect(SPEC_PATH).toBe('docs/design/ehg-venture-foresight-board-spec.md');
  });
});
