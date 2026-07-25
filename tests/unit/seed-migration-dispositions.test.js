/**
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001 — disposition seeder (FR-2).
 *
 * buildLedger is pure, so every case here runs with no disk and no DB.
 */

import { describe, it, expect } from 'vitest';
import { buildLedger, parseSweepDoc, serializeLedger } from '../../scripts/seed-migration-dispositions.mjs';

const NOW = '2026-07-25T00:00:00.000Z';
const GATED = '-- requires-chairman-apply\nALTER TABLE t ADD COLUMN c int;';
const GATED_STAMPED = '-- requires-chairman-apply\n-- @approved-by: codestreetlabs@gmail.com\nALTER TABLE t ADD COLUMN c int;';
const PLAIN = '-- just a migration\nALTER TABLE t ADD COLUMN c int;';

const build = (over = {}) => buildLedger({
  gaps: [], sql: new Map(), sweep: new Map(), existing: {}, now: NOW, ...over,
});

describe('FR-2b — the seeder can never emit APPLIED', () => {
  it('never writes APPLIED for any input combination', () => {
    const { ledger } = build({
      gaps: [{ file: 'a.sql', missing: [{ cls: 'table', name: 'x' }] }, { file: 'b.sql', missing: [] }],
      sql: new Map([['a.sql', GATED], ['b.sql', PLAIN]]),
      sweep: new Map([['x', { verdict: 'RETIRED', file: 'a.sql' }]]),
    });
    expect(Object.values(ledger).map((e) => e.disposition)).not.toContain('APPLIED');
  });

  it('a gap file is by definition unapplied — every emitted disposition suppresses or is absent', () => {
    const { ledger } = build({
      gaps: [{ file: 'a.sql', missing: [] }],
      sql: new Map([['a.sql', GATED]]),
    });
    expect(['RETIRED', 'DEFERRED']).toContain(ledger['a.sql'].disposition);
  });
});

describe('rule A — chairman-gated without a usable approver stamp', () => {
  it('defers a gated file carrying no @approved-by', () => {
    const { ledger, seeded } = build({ gaps: [{ file: 'a.sql', missing: [] }], sql: new Map([['a.sql', GATED]]) });
    expect(seeded).toEqual(['a.sql']);
    expect(ledger['a.sql']).toMatchObject({ disposition: 'DEFERRED', owner: 'chairman' });
    expect(ledger['a.sql'].reason.length).toBeGreaterThan(20);
  });

  it('does NOT defer a gated file that already carries a valid stamp — it is genuinely applyable', () => {
    // The live 20260711_ship_review_findings_actor_metadata.sql case: gated AND stamped, so it
    // is waiting on the apply token, not on a signature. Deferring it would misreport why.
    const { ledger, residue } = build({ gaps: [{ file: 'a.sql', missing: [] }], sql: new Map([['a.sql', GATED_STAMPED]]) });
    expect(ledger['a.sql']).toBeUndefined();
    expect(residue).toEqual(['a.sql']);
  });

  it('does not defer an ungated file', () => {
    const { residue } = build({ gaps: [{ file: 'a.sql', missing: [] }], sql: new Map([['a.sql', PLAIN]]) });
    expect(residue).toEqual(['a.sql']);
  });

  it('rejects a stamp with angle brackets — the real 20260712 "<pending chairman sign-off>" case', () => {
    const pending = '-- requires-chairman-apply\n-- @approved-by: <pending chairman sign-off>\nALTER TABLE t ADD COLUMN c int;';
    const { ledger } = build({ gaps: [{ file: 'a.sql', missing: [] }], sql: new Map([['a.sql', pending]]) });
    expect(ledger['a.sql'].disposition).toBe('DEFERRED'); // placeholder is not an approval
  });
});

describe('rule B — sweep-doc verdicts, only at full object coverage', () => {
  const gaps = [{ file: 'a.sql', missing: [{ cls: 'table', name: 'tbl' }, { cls: 'index', name: 'idx' }] }];

  it('disposition requires EVERY missing object to be covered', () => {
    const partial = new Map([['tbl', { verdict: 'RETIRED', file: 'a.sql' }]]); // idx uncovered
    expect(build({ gaps, sql: new Map([['a.sql', PLAIN]]), sweep: partial }).residue).toEqual(['a.sql']);
  });

  it('disposition is assigned when all objects are covered', () => {
    const full = new Map([['tbl', { verdict: 'RETIRED', file: 'a.sql' }], ['idx', { verdict: 'RETIRED', file: 'a.sql' }]]);
    expect(build({ gaps, sql: new Map([['a.sql', PLAIN]]), sweep: full }).ledger['a.sql'].disposition).toBe('RETIRED');
  });

  it('DEFERRED dominates RETIRED — one live-referenced object makes retiring the file wrong', () => {
    const mixed = new Map([['tbl', { verdict: 'DEFERRED', file: 'a.sql' }], ['idx', { verdict: 'RETIRED', file: 'a.sql' }]]);
    expect(build({ gaps, sql: new Map([['a.sql', PLAIN]]), sweep: mixed }).ledger['a.sql'].disposition).toBe('DEFERRED');
  });

  it('FILE ANCHOR: a verdict citing a DIFFERENT file never re-targets this one', () => {
    // Observed live: the doc adjudicates v_sd_test_readiness in 20251210_unified_test_evidence.sql,
    // but the lifecycle fold attributes that view to 20251211_unified_test_evidence_fixed.sql.
    // Name-only matching stamped a retire verdict onto a file the sweep never examined.
    const drifted = [{ file: '20251211_unified_test_evidence_fixed.sql', missing: [{ cls: 'view', name: 'v_sd_test_readiness' }] }];
    const sweep = new Map([['v_sd_test_readiness', { verdict: 'RETIRED', file: '20251210_unified_test_evidence.sql' }]]);
    const { ledger, residue } = build({ gaps: drifted, sql: new Map(), sweep });
    expect(ledger).toEqual({});
    expect(residue).toEqual(['20251211_unified_test_evidence_fixed.sql']);
  });

  it('a file with zero missing objects is never dispositioned by rule B', () => {
    const sweep = new Map([['tbl', { verdict: 'RETIRED', file: 'a.sql' }]]);
    expect(build({ gaps: [{ file: 'a.sql', missing: [] }], sql: new Map([['a.sql', PLAIN]]), sweep }).residue).toEqual(['a.sql']);
  });
});

describe('idempotence — re-seeding must produce no diff', () => {
  const existing = {
    'a.sql': { disposition: 'RETIRED', reason: 'hand-adjudicated by a human', owner: 'rick', sd_key: 'SD-X', recorded_at: '2026-01-01T00:00:00.000Z' },
  };

  it('preserves an existing entry byte-for-byte and never regenerates recorded_at', () => {
    const { ledger, preserved, seeded } = build({
      gaps: [{ file: 'a.sql', missing: [] }], sql: new Map([['a.sql', GATED]]), existing,
    });
    expect(ledger['a.sql']).toEqual(existing['a.sql']);
    expect(ledger['a.sql'].recorded_at).toBe('2026-01-01T00:00:00.000Z');
    expect(preserved).toEqual(['a.sql']);
    expect(seeded).toEqual([]);
  });

  it('a HAND-ADJUDICATED verdict survives re-seeding even where a rule would disagree', () => {
    // rule A would say DEFERRED for this gated file; the human said RETIRED. Human wins.
    const { ledger } = build({ gaps: [{ file: 'a.sql', missing: [] }], sql: new Map([['a.sql', GATED]]), existing });
    expect(ledger['a.sql'].disposition).toBe('RETIRED');
  });

  it('serializeLedger sorts keys so re-seeding is byte-stable regardless of gap order', () => {
    expect(serializeLedger({ b: 1, a: 2 })).toBe(serializeLedger({ a: 2, b: 1 }));
    expect(Object.keys(JSON.parse(serializeLedger({ z: 1, a: 2 })))).toEqual(['a', 'z']);
  });
});

describe('parseSweepDoc', () => {
  const doc = `
## APPLIED by this SD (live hot-path breaks)

| Object | Migration | Live consumers |
|---|---|---|
| v_sd_completion_integrity | database/migrations/20260510_v.sql | scripts/x.js |

## DEFERRED — live-referenced, needs per-case APPLY-vs-RETIRE decision

| Object | Live refs | Sample consumers | Defining SQL |
|---|---|---|---|
| uat_reports | 1 | scripts/x.js | database/migrations/uat-structured-reports.sql |

## RETIRE-CANDIDATES — zero live references

- content_versions (database/migrations/032_content_forge_tables.sql)
`;

  it('extracts DEFERRED table rows and RETIRE bullets with their files', () => {
    const m = parseSweepDoc(doc);
    expect(m.get('uat_reports')).toEqual({ verdict: 'DEFERRED', file: 'uat-structured-reports.sql' });
    expect(m.get('content_versions')).toEqual({ verdict: 'RETIRED', file: '032_content_forge_tables.sql' });
  });

  it('IGNORES the APPLIED section — those were applied by a prior SD, not dispositioned here', () => {
    expect(parseSweepDoc(doc).has('v_sd_completion_integrity')).toBe(false);
  });

  it('returns an empty map for empty or malformed input rather than throwing', () => {
    for (const bad of ['', null, undefined, '## DEFERRED\n\ngarbage']) {
      expect(parseSweepDoc(bad).size).toBe(0);
    }
  });
});
