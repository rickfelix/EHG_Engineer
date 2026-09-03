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
import { evaluate, PREDICATE_TYPE } from '../../lib/governance/release-condition-predicate.js';

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
    // The evaluator's first non-test importer — this is what makes it live rather than dead code.
    expect(src).toMatch(/import \{ evaluate, PREDICATE_TYPE \} from '\.\.\/lib\/governance\/release-condition-predicate\.js'/);
    expect(src).toMatch(/evaluate\(p, injectedState\)/);
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
