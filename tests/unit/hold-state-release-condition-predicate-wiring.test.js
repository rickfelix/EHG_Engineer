// SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-D (FR-6) — the release-condition predicate gets a producer AND a
// consumer, in one commit.
//
// BEFORE THIS: lib/governance/release-condition-predicate.js shipped complete and fail-closed with
// EXACTLY ONE importer — its own unit test. Its docblock said consumers were "not-yet-built" and they
// never were. Column hold_state_contract_violations.release_condition_predicate
// (20260718_release_condition_predicate.sql:18) had no reader and no writer anywhere in the tree.
// A fail-closed evaluator nothing calls is indistinguishable from no evaluator at all.
//
// PROSE IS NEVER PARSED INTO A PREDICATE. Release conditions in the wild embed structured data inside
// free text (a live QF carries `review_at=` as prose). A parser would appear to work while silently
// mis-reading anything phrased differently — a new lying instrument inside the workstream built to
// remove them. So a condition is either an explicit predicate object or it stays prose and is counted
// as the remaining gap.
import { describe, it, expect } from 'vitest';
import { isStructuredPredicate, logHoldStateViolation } from '../../lib/governance/hold-state-contract.js';
import { evaluate, PREDICATE_TYPE, classifyReleaseConditions, hasStateFor } from '../../lib/governance/release-condition-predicate.js';

// Minimal capture client: records the row handed to .insert() so the producer is asserted on what it
// actually writes, not on what it returns.
function captureClient() {
  const inserted = [];
  return {
    inserted,
    from() { return { insert(row) { inserted.push(row); return Promise.resolve({ error: null }); } }; },
  };
}

describe('FR-6 producer: the predicate is persisted alongside the prose, never parsed from it', () => {
  it('persists a STRUCTURED predicate into release_condition_predicate', async () => {
    const client = captureClient();
    const predicate = { type: PREDICATE_TYPE.TEST_GREEN, params: { suite: 'unit' } };
    await logHoldStateViolation(client, {
      surface: 'test-surface',
      stamp: { reason: 'r', owner: 'o', review_at: '2026-09-04T00:00:00Z', release_condition: 'prose form', release_condition_predicate: predicate },
      errors: [],
    });
    expect(client.inserted).toHaveLength(1);
    expect(client.inserted[0].release_condition_predicate).toEqual(predicate);
    // The prose is KEPT, not replaced — the two carry different information.
    expect(client.inserted[0].release_condition).toBe('prose form');
  });

  it('writes NULL rather than inventing a predicate when the condition is prose only', async () => {
    const client = captureClient();
    await logHoldStateViolation(client, {
      surface: 'test-surface',
      stamp: { reason: 'r', owner: 'o', release_condition: 'SD-LEO-FIX-SOMETHING-001 ships and lands the sentinel row' },
      errors: [],
    });
    expect(client.inserted[0].release_condition_predicate).toBeNull();
    expect(client.inserted[0].release_condition).toMatch(/sentinel row/);
  });

  it('rejects a malformed or unknown-type predicate rather than persisting it', async () => {
    const client = captureClient();
    for (const bad of [{ type: 'not_a_real_type' }, 'review_at=2026-09-01', ['array'], 42, null]) {
      await logHoldStateViolation(client, { surface: 's', stamp: { release_condition_predicate: bad }, errors: [] });
    }
    for (const row of client.inserted) expect(row.release_condition_predicate).toBeNull();
  });

  it('isStructuredPredicate accepts every evaluator type and nothing else', () => {
    for (const type of Object.values(PREDICATE_TYPE)) {
      expect(isStructuredPredicate({ type, params: {} })).toBe(true);
    }
    // Prose is the case that matters: it must never be mistaken for a predicate.
    expect(isStructuredPredicate('review_at=2026-09-01, then release')).toBe(false);
    expect(isStructuredPredicate({ type: 'test_green_ish' })).toBe(false);
    expect(isStructuredPredicate({})).toBe(false);
    expect(isStructuredPredicate(undefined)).toBe(false);
  });
});

describe('FR-6 consumer: fail-closed false is not evidence of not-met', () => {
  it('evaluate() returns false for BOTH unmet and unevaluable, which is why the gauge counts them apart', () => {
    // Genuinely unmet: the state is present and says false.
    expect(evaluate({ type: PREDICATE_TYPE.DB_ROW_EXISTS, params: { key: 'k' } }, { rowCounts: { k: 0 } })).toBe(false);
    // Unevaluable HERE: the gauge cannot supply testResults, so this is false for a different reason.
    expect(evaluate({ type: PREDICATE_TYPE.TEST_GREEN, params: { suite: 's' } }, { rowCounts: { k: 1 } })).toBe(false);
    // Met.
    expect(evaluate({ type: PREDICATE_TYPE.DB_ROW_EXISTS, params: { key: 'k' } }, { rowCounts: { k: 3 } })).toBe(true);
    // The two falses above are INDISTINGUISHABLE from the evaluator alone. Collapsing them into a
    // single "unmet" number would report a condition as not-met when it was never checked — the exact
    // assertion-without-measurement defect this workstream closes. The gauge therefore reports
    // releaseConditionsUnevaluableHere separately, asserted below.
  });

  it('the gauge is a REAL consumer: it imports the evaluator and keeps the three counts distinct', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../scripts/gauge-runner.mjs', import.meta.url), 'utf8');
    // The evaluator module's first non-test importer — what makes it live rather than dead code.
    expect(src).toMatch(/classifyReleaseConditions.*from '\.\.\/lib\/governance\/release-condition-predicate\.js'/);
    expect(src).toMatch(/classifyReleaseConditions\(predicateRows \|\| \[\], injectedState, isStructuredPredicate\)/);
    // Paginated, never a bare .limit(N): a capped read would measure the cap, not the population.
    expect(src).toMatch(/fetchAllPaginated\(\(\) => supabase[\s\S]{0,200}hold_state_contract_violations/);
    // Three distinct counters; unevaluable is never folded into unmet.
    expect(src).toMatch(/releaseConditionsMet/);
    expect(src).toMatch(/releaseConditionsUnmet/);
    expect(src).toMatch(/releaseConditionsUnevaluableHere/);
    // The remaining gap stays countable rather than invisible.
    expect(src).toMatch(/proseOnlyConditionCount/);
  });

  it('the producer column is actually written (pinned): a call without the column is the dead state', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../lib/governance/hold-state-contract.js', import.meta.url), 'utf8');
    // Behavioural tests alone pass a fix that adds the call but not the column — QF-20260812-281
    // records exactly that failure mode on a sibling fix, so the column name is pinned.
    expect(src).toMatch(/release_condition_predicate: isStructuredPredicate\(predicate\)/);
  });
});

describe('FR-6 consumer: the three-way split is asserted BEHAVIOURALLY, not by grep', () => {
  // The first cut of this classification lived inline in gauge-runner.mjs and its only coverage was a
  // regex test asserting the counter NAMES existed. Inverting the met/unmet branch would have left
  // every assertion matching — zero behavioural coverage over the whole block. These tests fail if the
  // branch is inverted, if unevaluable is folded into unmet, or if prose is parsed into a predicate.
  const dbRow = (key) => ({ release_condition_predicate: { type: PREDICATE_TYPE.DB_ROW_EXISTS, params: { key } } });
  const testRow = (suite) => ({ release_condition_predicate: { type: PREDICATE_TYPE.TEST_GREEN, params: { suite } } });
  const proseRow = (text) => ({ release_condition: text });

  it('counts MET only when the injected state actually satisfies the predicate', () => {
    const r = classifyReleaseConditions([dbRow('k')], { rowCounts: { k: 3 } }, isStructuredPredicate);
    expect(r).toMatchObject({ met: 1, unmet: 0, unevaluable: 0, structured: 1 });
  });

  it('counts UNMET when the state is present and says no — distinct from unevaluable', () => {
    const r = classifyReleaseConditions([dbRow('k')], { rowCounts: { k: 0 } }, isStructuredPredicate);
    expect(r).toMatchObject({ met: 0, unmet: 1, unevaluable: 0 });
  });

  it('counts UNEVALUABLE, never unmet, when the state key is absent — the key-level gate', () => {
    // A db_row_exists predicate keyed to a table the caller did not count. Gating on TYPE alone would
    // send this down evaluate(), get a fail-closed false, and record it as UNMET — reporting "not met"
    // about something never measured. That is the exact defect this workstream closes.
    const r = classifyReleaseConditions([dbRow('a_table_nobody_counted')], { rowCounts: { k: 1 } }, isStructuredPredicate);
    expect(r).toMatchObject({ met: 0, unmet: 0, unevaluable: 1, structured: 1 });
  });

  it('with NO injected state, nothing is unmet and everything structured is unevaluable', () => {
    const r = classifyReleaseConditions([dbRow('k'), testRow('s')], {}, isStructuredPredicate);
    expect(r.unmet).toBe(0);          // the assertion that matters: zero false not-met
    expect(r.unevaluable).toBe(2);
    expect(r.structured).toBe(2);
  });

  it('counts prose as the remaining gap and never parses it into a predicate', () => {
    const r = classifyReleaseConditions(
      [proseRow('SD-X ships and lands the sentinel row'), { release_condition_predicate: 'review_at=2026-09-01', release_condition: 'review_at=2026-09-01' }],
      { rowCounts: { k: 1 } }, isStructuredPredicate);
    expect(r).toMatchObject({ structured: 0, proseOnly: 2, met: 0, unmet: 0, unevaluable: 0 });
  });

  it('hasStateFor discriminates per-KEY, not per-type', () => {
    expect(hasStateFor({ type: PREDICATE_TYPE.DB_ROW_EXISTS, params: { key: 'k' } }, { rowCounts: { k: 0 } })).toBe(true);
    expect(hasStateFor({ type: PREDICATE_TYPE.DB_ROW_EXISTS, params: { key: 'z' } }, { rowCounts: { k: 0 } })).toBe(false);
    expect(hasStateFor({ type: PREDICATE_TYPE.TEST_GREEN, params: { suite: 's' } }, { rowCounts: { k: 0 } })).toBe(false);
    expect(hasStateFor({ type: 'bogus', params: {} }, { rowCounts: { k: 0 } })).toBe(false);
  });
});

describe('SEC-D-1 / SEC-D-3: a malformed stored predicate must never crash or silence a consumer', () => {
  // SECURITY review found the guard ADMITTED {type:<valid>, params:null} and evaluate() then threw
  // TypeError. Inside a governance detector whose caller catches per-detector, one malformed stored row
  // would void the ENTIRE hold-state-overdue detector for that tick -- findOverdueHolds, mode and
  // recentViolationCount all lost -- while the run printed healthy. The earlier test covered
  // {type:'not_a_real_type'}, 'string', ['array'], 42 and null, but NOT the one shape that is admitted
  // and then crashes. JSONB round-trips null faithfully, so this is a reachable stored shape.
  const NULL_PARAMS = JSON.parse('{"type":"db_row_exists","params":null}');

  it('SEC-D-1: the guard REJECTS a valid type carrying params:null', () => {
    expect(isStructuredPredicate(NULL_PARAMS)).toBe(false);
  });

  it('SEC-D-1: evaluate() answers false instead of throwing on params:null', () => {
    expect(() => evaluate(NULL_PARAMS, { rowCounts: { k: 1 } })).not.toThrow();
    expect(evaluate(NULL_PARAMS, { rowCounts: { k: 1 } })).toBe(false);
  });

  it('SEC-D-1: an absent params is still valid — the fix must not reject the legitimate shape', () => {
    expect(isStructuredPredicate({ type: PREDICATE_TYPE.MANUAL_FLAG })).toBe(true);
    expect(isStructuredPredicate({ type: PREDICATE_TYPE.DB_ROW_EXISTS, params: { key: 'k' } })).toBe(true);
    // params must be an OBJECT when present — an array or scalar is malformed.
    expect(isStructuredPredicate({ type: PREDICATE_TYPE.DB_ROW_EXISTS, params: [] })).toBe(false);
    expect(isStructuredPredicate({ type: PREDICATE_TYPE.DB_ROW_EXISTS, params: 'k' })).toBe(false);
  });

  it('SEC-D-3: a throwing getter on `type` returns false rather than propagating', () => {
    // Unfixed, this threw out of logHoldStateViolation's outer try, silently dropping the ENTIRE
    // violation record (reason, owner, review_at, prose) — letting a caller suppress its own
    // contract-violation log. A shape guard must answer, never propagate.
    const hostile = {};
    Object.defineProperty(hostile, 'type', { get() { throw new Error('boom'); } });
    expect(() => isStructuredPredicate(hostile)).not.toThrow();
    expect(isStructuredPredicate(hostile)).toBe(false);
  });

  it('SEC-D-3: a hostile predicate does not prevent the violation record from being written', async () => {
    const client = captureClient();
    const hostile = {};
    Object.defineProperty(hostile, 'type', { get() { throw new Error('boom'); } });
    await logHoldStateViolation(client, {
      surface: 'test-surface',
      stamp: { reason: 'the reason that must survive', owner: 'o', release_condition_predicate: hostile },
      errors: [],
    });
    expect(client.inserted).toHaveLength(1);           // the record was NOT dropped
    expect(client.inserted[0].reason).toBe('the reason that must survive');
    expect(client.inserted[0].release_condition_predicate).toBeNull();
  });

  it('the classifier counts a still-throwing row as malformed rather than voiding the batch', () => {
    // Defence in depth: even if a row slips past both hardened guards, one bad row must not take the
    // detector down with it. A good row alongside it is still classified.
    const throwOnEvaluate = { type: PREDICATE_TYPE.DB_ROW_EXISTS, params: { get key() { throw new Error('boom'); } } };
    const rows = [
      { release_condition_predicate: { type: PREDICATE_TYPE.DB_ROW_EXISTS, params: { key: 'k' } } },
      { release_condition_predicate: throwOnEvaluate },
    ];
    const r = classifyReleaseConditions(rows, { rowCounts: { k: 2 } }, isStructuredPredicate);
    expect(r.met).toBe(1);                    // the good row still classified
    expect(r.met + r.unmet + r.unevaluable + r.malformed).toBe(r.structured);
  });
});
