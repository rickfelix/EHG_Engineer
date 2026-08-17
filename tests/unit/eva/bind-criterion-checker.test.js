import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  evaluateExitGateCriterion,
  evaluateVentureStackCriterion,
  groupRowsByGateString,
  CANDIDATE_GATE_STRINGS,
  MARKETLENS_VENTURE_IDS,
} from '../../../lib/eva/lifecycle/bind-criterion-checker.js';

const MARKETLENS_ID = MARKETLENS_VENTURE_IDS[0];
const OTHER_VENTURE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

function rowAt(hoursAgo, overrides = {}) {
  const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  return { venture_id: OTHER_VENTURE_ID, would_satisfy: true, created_at: createdAt, ...overrides };
}

function makeRows(count, { spanHours = 0, ...overrides } = {}) {
  return Array.from({ length: count }, (_, i) => {
    const hoursAgo = count > 1 ? (spanHours * i) / (count - 1) : 0;
    return rowAt(hoursAgo, overrides);
  });
}

describe('evaluateExitGateCriterion (SD-LEO-INFRA-BIND-OBSERVE-ONLY-001 FR-1)', () => {
  it('TS-1: meets all three criteria -> MEETS_CRITERION, marketlens_status=CLEAN', () => {
    const rows = [
      ...makeRows(24, { spanHours: 50 }),
      rowAt(50, { venture_id: MARKETLENS_ID, would_satisfy: true }),
      rowAt(0, { venture_id: MARKETLENS_ID, would_satisfy: true }),
    ];
    const result = evaluateExitGateCriterion(rows);
    expect(result.verdict).toBe('MEETS_CRITERION');
    expect(result.reason).toBeNull();
    expect(result.row_count).toBe(26);
    expect(result.span_hours).toBeGreaterThanOrEqual(48);
    expect(result.marketlens_status).toBe('CLEAN');
  });

  it('TS-2: insufficient row count -> NOT_MET, reason=insufficient_rows', () => {
    const rows = makeRows(24, { spanHours: 50 });
    const result = evaluateExitGateCriterion(rows);
    expect(result.verdict).toBe('NOT_MET');
    expect(result.reason).toBe('insufficient_rows');
    expect(result.row_count).toBe(24);
  });

  it('TS-3: insufficient time span -> NOT_MET, reason=insufficient_span', () => {
    const rows = makeRows(30, { spanHours: 10 });
    const result = evaluateExitGateCriterion(rows);
    expect(result.verdict).toBe('NOT_MET');
    expect(result.reason).toBe('insufficient_span');
    expect(result.row_count).toBe(30);
  });

  it('TS-4: flagship veto overrides an otherwise-satisfied criterion', () => {
    const rows = [
      ...makeRows(29, { spanHours: 60 }),
      rowAt(30, { venture_id: MARKETLENS_ID, would_satisfy: false }),
    ];
    const result = evaluateExitGateCriterion(rows);
    expect(result.row_count).toBe(30);
    expect(result.span_hours).toBeGreaterThanOrEqual(48);
    expect(result.verdict).toBe('NOT_MET');
    expect(result.reason).toBe('flagship_veto');
    expect(result.marketlens_status).toBe('FALSE_REJECT');
  });

  it('TS-5: untested vs clean distinction -- zero MarketLens rows still passes row/span but is UNTESTED, not CLEAN', () => {
    const rows = makeRows(30, { spanHours: 60 });
    const result = evaluateExitGateCriterion(rows);
    expect(result.verdict).toBe('MEETS_CRITERION');
    expect(result.marketlens_status).toBe('UNTESTED');
  });

  it('accepts a custom MarketLens id list (does not hardcode the module-level constant)', () => {
    const customId = 'ffffffff-0000-1111-2222-333333333333';
    const rows = [...makeRows(29, { spanHours: 60 }), rowAt(30, { venture_id: customId, would_satisfy: false })];
    const resultDefault = evaluateExitGateCriterion(rows);
    expect(resultDefault.marketlens_status).toBe('UNTESTED');
    const resultCustom = evaluateExitGateCriterion(rows, [customId]);
    expect(resultCustom.marketlens_status).toBe('FALSE_REJECT');
    expect(resultCustom.verdict).toBe('NOT_MET');
    expect(resultCustom.reason).toBe('flagship_veto');
  });

  it('adversarial-review regression: a MarketLens row with would_satisfy=null/undefined vetoes, same as false -- ambiguous is never CLEAN', () => {
    const nullRows = [...makeRows(29, { spanHours: 60 }), rowAt(30, { venture_id: MARKETLENS_ID, would_satisfy: null })];
    const nullResult = evaluateExitGateCriterion(nullRows);
    expect(nullResult.marketlens_status).toBe('FALSE_REJECT');
    expect(nullResult.verdict).toBe('NOT_MET');
    expect(nullResult.reason).toBe('flagship_veto');

    const undefinedRows = [...makeRows(29, { spanHours: 60 }), rowAt(30, { venture_id: MARKETLENS_ID, would_satisfy: undefined })];
    const undefinedResult = evaluateExitGateCriterion(undefinedRows);
    expect(undefinedResult.marketlens_status).toBe('FALSE_REJECT');
    expect(undefinedResult.verdict).toBe('NOT_MET');
  });
});

describe('evaluateVentureStackCriterion (SD-LEO-INFRA-BIND-OBSERVE-ONLY-001 FR-5)', () => {
  it('zero rows -> NOT_MET, reason=insufficient_rows, no NaN', () => {
    const result = evaluateVentureStackCriterion([]);
    expect(result.verdict).toBe('NOT_MET');
    expect(result.reason).toBe('insufficient_rows');
    expect(result.row_count).toBe(0);
    expect(result.span_hours).toBe(0);
    expect(result.false_positive_proxy_rate).toBeNull();
    expect(Number.isNaN(result.false_positive_proxy_rate)).toBe(false);
  });

  it('computes and reports the missing.length>0 false-positive proxy rate as a percentage', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      sd_id: `sd-${i}`,
      missing: i < 6 ? ['clerk'] : [],
      created_at: new Date(Date.now() - i * 2 * 60 * 60 * 1000).toISOString(),
    }));
    const result = evaluateVentureStackCriterion(rows);
    expect(result.row_count).toBe(30);
    expect(result.false_positive_proxy_rate).toBeCloseTo(20, 5);
  });

  it('below-threshold rows still returns a numeric (not NaN) false-positive rate', () => {
    const rows = [
      { sd_id: 'sd-1', missing: ['clerk'], created_at: new Date().toISOString() },
      { sd_id: 'sd-2', missing: [], created_at: new Date().toISOString() },
    ];
    const result = evaluateVentureStackCriterion(rows);
    expect(result.verdict).toBe('NOT_MET');
    expect(result.reason).toBe('insufficient_rows');
    expect(result.false_positive_proxy_rate).toBeCloseTo(50, 5);
  });
});

describe('groupRowsByGateString (SD-LEO-INFRA-BIND-OBSERVE-ONLY-001 FR-2)', () => {
  it('groups rows by (stage_number, gate_string) into the 5 candidate buckets', () => {
    const rows = [
      { stage_number: 19, gate_string: 'stack descriptor valid', venture_id: null, would_satisfy: true, created_at: new Date().toISOString() },
      { stage_number: 24, gate_string: 'pages url live', venture_id: null, would_satisfy: false, created_at: new Date().toISOString() },
    ];
    const { groups, malformed } = groupRowsByGateString(rows);
    expect(groups.size).toBe(CANDIDATE_GATE_STRINGS.length);
    expect(groups.get('19::stack descriptor valid')).toHaveLength(1);
    expect(groups.get('24::pages url live')).toHaveLength(1);
    expect(groups.get('19::deployment target provisioned')).toHaveLength(0);
    expect(malformed).toHaveLength(0);
  });

  it('excludes rows missing stage_number or gate_string, counting them as malformed rather than silently dropping', () => {
    const rows = [
      { stage_number: null, gate_string: 'stack descriptor valid', created_at: new Date().toISOString() },
      { stage_number: 19, gate_string: null, created_at: new Date().toISOString() },
      { stage_number: 19, gate_string: 'stack descriptor valid', venture_id: null, would_satisfy: true, created_at: new Date().toISOString() },
    ];
    const { groups, malformed } = groupRowsByGateString(rows);
    expect(malformed).toHaveLength(2);
    expect(groups.get('19::stack descriptor valid')).toHaveLength(1);
  });

  it('ignores well-formed rows for a (stage,gate_string) pair outside the candidate list, without counting them as malformed', () => {
    const rows = [
      { stage_number: 7, gate_string: 'some other gate', venture_id: null, would_satisfy: true, created_at: new Date().toISOString() },
    ];
    const { groups, malformed } = groupRowsByGateString(rows);
    expect(malformed).toHaveLength(0);
    expect([...groups.values()].every((g) => g.length === 0)).toBe(true);
  });
});

describe('checker module is provably read-only (SD-LEO-INFRA-BIND-OBSERVE-ONLY-001 FR-6, TS-7)', () => {
  // Adversarial review: the CLI report renderer (scripts/eva/check-bind-criteria.mjs) ships in
  // a follow-up PR (see this SD's PR split for the 400-LOC guideline) and is NOT present on this
  // branch's ancestor commits -- a test here referencing it would fail on any fresh clone/CI run
  // of this commit alone. Its own read-only guard lives with it in the follow-up PR.
  it('contains zero .update(/.insert(/.upsert(/.delete( calls against a Supabase client', () => {
    const modulePath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../lib/eva/lifecycle/bind-criterion-checker.js'
    );
    const source = readFileSync(modulePath, 'utf8');
    expect(source).not.toMatch(/\.update\s*\(/);
    expect(source).not.toMatch(/\.insert\s*\(/);
    expect(source).not.toMatch(/\.upsert\s*\(/);
    expect(source).not.toMatch(/\.delete\s*\(/);
  });
});
