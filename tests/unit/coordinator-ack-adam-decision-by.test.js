/**
 * SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 (FR-2) — decision_by must be an identity, never
 * a notes field. 1208 of 1552 non-null historical values were full prose sentences.
 *
 * CORRECTION (caught by TESTING at PLAN): the write path requiring this fix is NOT
 * scripts/solomon-advisory.cjs's captureLedgerRow (which has no decision_by field at all) — it is
 * coordinator-ack-adam.cjs's TWO real writers, recordLedgerDecision (the primary-row write) AND
 * inheritTailDecisions (which fans a decision out to sibling rows sharing a correlation_id).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const m = require('../../scripts/coordinator-ack-adam.cjs');

describe('FR-2: normalizeDecisionBy — pure identity-prefix extraction', () => {
  it('leaves an already-clean identity untouched', () => {
    expect(m.normalizeDecisionBy('adam')).toBe('adam');
    expect(m.normalizeDecisionBy('adam:d02c9e34')).toBe('adam:d02c9e34');
    expect(m.normalizeDecisionBy('adam-08049808')).toBe('adam-08049808');
    expect(m.normalizeDecisionBy('solomon-52f5bab8-tail-walk')).toBe('solomon-52f5bab8-tail-walk');
  });

  it('TS-8: truncates the live prose specimen to its identity prefix, never rejecting', () => {
    const prose = 'adam:d02c9e34 2026-07-12: SD/QF ranking answer consumed in the ranking group discussion; do-not-merge-rankings guidance survives in belt design (belt=SSOT ratified 07-11)';
    expect(m.normalizeDecisionBy(prose)).toBe('adam:d02c9e34');
  });

  it('truncates a space-separated era-closure specimen to just the leading token', () => {
    expect(m.normalizeDecisionBy('adam d5080cf3 (era closure 2026-07-31, Solomon-ruled ecb9ce34)')).toBe('adam');
  });

  // F2 (TESTING sub-agent, EXEC-phase adversarial review): flagged this same drop-the-hash
  // behavior as "lossy", contradicting the docblock's former "0 exceptions"/"losslessly" wording.
  // Resolution: the docblock overclaimed -- the test directly above already pins this exact drop
  // as INTENDED (identity-prefix extraction, not lossless round-tripping). A hex-guessing fix was
  // considered and rejected: this codebase's one production writer (recordLedgerDecision's call
  // site) only ever passes a bare session UUID (no whitespace, no hash-suffix ambiguity), so the
  // space-separated-hash shape has zero confirmed real occurrences and zero reachable write path
  // -- and guessing "does the next token look like hex" would misfire on ordinary English words
  // that are valid hex (cab, dead, beef, face, cafe), which is a worse failure than the status quo.
  // Corrected per TESTING's EXEC-2 finding: "live production input shape" overclaimed -- this SD
  // hasn't shipped yet, so 0 of the currently-observed 1567 leading tokens are actually
  // UUID-shaped (all observed values pre-date this SD, from a writer no longer in this codebase).
  // What's verified is the CODE guarantee at the sole call site (a bare CLAUDE_SESSION_ID), not an
  // empirical observation of this writer's live output yet.
  it('F2: the sole call site\'s guaranteed input shape (a bare session UUID) round-trips with zero loss', () => {
    const sessionUuid = '29175888-1a98-4fb7-9d18-1bcf78c12477';
    expect(m.normalizeDecisionBy(sessionUuid)).toBe(sessionUuid); // no whitespace, 36 chars < 40 cap
  });

  it('caps at 40 characters', () => {
    expect(m.DECISION_BY_MAX_LEN).toBe(40);
    const longToken = 'a'.repeat(60); // one token, no whitespace, but too long
    expect(m.normalizeDecisionBy(longToken).length).toBe(40);
  });

  it('TS-8a: an unmatched value (no recognizable identity token) is stored fail-open, capped but never dropped', () => {
    const weird = 'x'.repeat(50); // single token, no whitespace, not a known adam/solomon shape
    const result = m.normalizeDecisionBy(weird);
    expect(result).not.toBeNull();
    expect(result.length).toBe(40);
    expect(weird.startsWith(result)).toBe(true); // verbatim prefix, not mangled
  });

  it('returns null for null/undefined/empty input (never throws)', () => {
    expect(m.normalizeDecisionBy(null)).toBeNull();
    expect(m.normalizeDecisionBy(undefined)).toBeNull();
    expect(m.normalizeDecisionBy('')).toBeNull();
    expect(m.normalizeDecisionBy('   ')).toBeNull();
  });

  it('TS-9: idempotent — normalizing an already-normalized value is a no-op', () => {
    const once = m.normalizeDecisionBy('adam:d02c9e34 2026-07-12: some note');
    const twice = m.normalizeDecisionBy(once);
    expect(twice).toBe(once);
  });
});

// QF-20260823-366: recordLedgerDecision's own write now chains .select('id').maybeSingle()
// (correlation_id is UNIQUE, so it can only ever affect 0 or 1 row) while inheritTailDecisions's
// tail-fanout .select('id') still resolves directly (it can affect several sibling rows). A shared
// mock `chain` serves both call sites: select() returns an already-resolved Promise (so a bare
// `await select()` works for the tail path) with a `.maybeSingle()` escape hatch attached for the
// primary path.
function selectResult(data) {
  const p = Promise.resolve({ data, error: null });
  p.maybeSingle = () => Promise.resolve({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null });
  return p;
}

describe('FR-2: recordLedgerDecision writes normalized decision_by, never rejects the decision', () => {
  it('truncates prose decision_by to its identity prefix in the updated row', async () => {
    let updatedRow = null;
    const chain = {
      update: (row) => { updatedRow = row; return chain; },
      eq: () => chain,
      select: () => selectResult([{ id: 'row-1' }]),
    };
    const sb = { from: () => chain };
    const result = await m.recordLedgerDecision(sb, {
      correlationId: 'corr-1',
      disposition: 'accepted',
      decidedBy: 'adam:d02c9e34 2026-07-12: SD/QF ranking answer consumed in discussion',
      outcomeRef: 'SD-TEST-001',
    });
    expect(result.recorded).toBe(true);
    expect(updatedRow.decision_by).toBe('adam:d02c9e34');
  });

  it('never rejects a decision for having a prose decidedBy — truncate, not reject', async () => {
    const chain = { update: () => chain, eq: () => chain, select: () => selectResult([{ id: 'row-2' }]) };
    const sb = { from: () => chain };
    const result = await m.recordLedgerDecision(sb, {
      correlationId: 'corr-2', disposition: 'rejected',
      decidedBy: 'a very long prose explanation of why this was rejected in full detail',
    });
    expect(result.recorded).toBe(true);
  });
});

describe('QF-20260823-366: recordLedgerDecision UPDATEs an existing pending row, never upserts', () => {
  it('records a decision against a pre-existing pending row (count=1), no proposal_summary in the payload', async () => {
    let updatedRow = null;
    const eqCalls = [];
    const chain = {
      update: (row) => { updatedRow = row; return chain; },
      eq: (col, val) => { eqCalls.push([col, val]); return chain; },
      select: () => selectResult([{ id: 'row-3' }]),
    };
    const sb = { from: () => chain };
    const result = await m.recordLedgerDecision(sb, {
      correlationId: 'corr-3',
      disposition: 'accepted',
      decidedBy: 'adam',
      outcomeRef: 'SD-TEST-002',
    });
    expect(result.recorded).toBe(true);
    expect(updatedRow).not.toHaveProperty('proposal_summary');
    expect(updatedRow).not.toHaveProperty('correlation_id');
    expect(eqCalls).toContainEqual(['correlation_id', 'corr-3']);
    expect(eqCalls).toContainEqual(['decision', 'pending']);
  });

  it('reports failure (not a silent no-op) when no pending row matches the correlation_id', async () => {
    const chain = { update: () => chain, eq: () => chain, select: () => selectResult([]) };
    const sb = { from: () => chain };
    const result = await m.recordLedgerDecision(sb, {
      correlationId: 'corr-missing', disposition: 'accepted', decidedBy: 'adam', outcomeRef: 'SD-TEST-003',
    });
    expect(result.recorded).toBe(false);
    expect(result.reason).toMatch(/no pending ledger row/);
  });
});

describe('FR-2: inheritTailDecisions writes normalized decision_by to sibling rows', () => {
  it('truncates prose decision_by in the tail-row patch', async () => {
    let patchArgs = null;
    const chain = {
      update: (patch) => { patchArgs = patch; return chain; },
      eq: () => chain,
      select: () => Promise.resolve({ data: [{ id: 'sib-1' }], error: null }),
    };
    const sb = { from: () => chain };
    const result = await m.inheritTailDecisions(sb, {
      correlationId: 'corr-1',
      disposition: 'accepted',
      decidedBy: 'adam-08049808 (era closure 2026-08-11, ruling a83c2e19)',
      decisionAt: new Date().toISOString(),
    });
    expect(result.inherited).toBe(1);
    expect(patchArgs.decision_by).toBe('adam-08049808');
  });
});
