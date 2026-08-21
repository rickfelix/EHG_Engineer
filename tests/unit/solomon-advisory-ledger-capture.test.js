/**
 * SD-LEO-INFRA-SOLOMON-ADVICE-OUTCOME-LEDGER-001 (FR-2, TR-2, TS-1, TS-2) — the fail-open
 * capture hook that upserts a solomon_advice_outcome_ledger row on every advisory send/request.
 *
 * SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 (FR-1c) extends this: captureLedgerRow now also
 * writes decision_requested and, on a PGRST204 error naming that column (the chairman-apply-gated
 * migration hasn't landed yet), retries once WITHOUT the field instead of failing capture
 * entirely — degrading to exactly pre-SD behavior rather than total silent capture loss.
 *
 * Injected-stub coverage (no real DB).
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const m = require('../../scripts/solomon-advisory.cjs');

describe('FR-2/TR-2: captureLedgerRow — fail-open ledger capture', () => {
  it('TS-1: upserts a pending row keyed on correlation_id when the write succeeds, defaulting decision_requested=true', async () => {
    let upsertArgs = null;
    let onConflictArgs = null;
    const sb = {
      from: () => ({
        upsert: (row, opts) => {
          upsertArgs = row;
          onConflictArgs = opts;
          return Promise.resolve({ error: null });
        },
      }),
    };
    const result = await m.captureLedgerRow(sb, { advisoryId: 'adv-1', correlationId: 'corr-1', sdKey: 'SD-1', body: 'hello' });
    expect(result.captured).toBe(true);
    expect(upsertArgs.correlation_id).toBe('corr-1');
    expect(upsertArgs.advisory_id).toBe('adv-1');
    expect(upsertArgs.sd_key).toBe('SD-1');
    expect(upsertArgs.proposal_summary).toBe('hello');
    expect(upsertArgs.decision_requested).toBe(true); // decisionRequested omitted -> defaults true
    expect(onConflictArgs.onConflict).toBe('correlation_id');
    expect(onConflictArgs.ignoreDuplicates).toBe(true);
  });

  it('TS-4 (part 1): writes decision_requested=false when explicitly passed false', async () => {
    let upsertArgs = null;
    const sb = { from: () => ({ upsert: (row) => { upsertArgs = row; return Promise.resolve({ error: null }); } }) };
    await m.captureLedgerRow(sb, { correlationId: 'corr-2', body: 'x', decisionRequested: false });
    expect(upsertArgs.decision_requested).toBe(false);
  });

  it('TS-2: is fail-open — a thrown/errored write never propagates', async () => {
    const throwing = { from: () => ({ upsert: () => { throw new Error('boom'); } }) };
    const errored = { from: () => ({ upsert: () => Promise.resolve({ error: { message: 'db down' } }) }) };
    const r1 = await m.captureLedgerRow(throwing, { correlationId: 'c1', body: 'x' });
    const r2 = await m.captureLedgerRow(errored, { correlationId: 'c2', body: 'x' });
    expect(r1.captured).toBe(false);
    expect(r1.reason).toMatch(/boom/);
    expect(r2.captured).toBe(false);
    expect(r2.reason).toMatch(/db down/);
  });

  it('skips (not captured) when no correlation_id is available, without touching the DB', async () => {
    const sb = { from: () => ({ upsert: () => { throw new Error('should not be called'); } }) };
    const result = await m.captureLedgerRow(sb, { body: 'x' });
    expect(result.captured).toBe(false);
    expect(result.reason).toMatch(/correlation_id/);
  });

  describe('TS-4: bounded fallback when decision_requested column is not yet migrated', () => {
    it('retries once WITHOUT decision_requested on a PGRST204 error naming the column, and reports degraded:true', async () => {
      let callCount = 0;
      const upsertCalls = [];
      const sb = {
        from: () => ({
          upsert: (row) => {
            callCount += 1;
            upsertCalls.push(row);
            if (callCount === 1) {
              return Promise.resolve({ error: { code: 'PGRST204', message: "Could not find the 'decision_requested' column of 'solomon_advice_outcome_ledger' in the schema cache" } });
            }
            return Promise.resolve({ error: null });
          },
        }),
      };
      const result = await m.captureLedgerRow(sb, { correlationId: 'corr-3', body: 'x', decisionRequested: true });
      expect(result.captured).toBe(true);
      expect(result.degraded).toBe(true);
      expect(callCount).toBe(2);
      expect(upsertCalls[0]).toHaveProperty('decision_requested');
      expect(upsertCalls[1]).not.toHaveProperty('decision_requested');
    });

    // TESTING (EXEC adversarial pass #2, NEW-1): the guard was PGRST204-only. Live-verified
    // (direct upsert probe against the real unmigrated table) that upsert's ACTUAL current error
    // code for this condition is PGRST204 — so this was not a live bug like F1 was. Widened to
    // also accept 42703 anyway, defensively: this table has now shown 3 different error shapes
    // for the identical missing-column condition across 3 query types (42703 on select/.eq(),
    // an uninformative head:true response, PGRST204 on upsert) — narrowing to only today's
    // confirmed shape would silently regress if that ever shifts.
    it('also retries on a 42703 error naming the column (defensive — not the live-confirmed shape for upsert, but accepted belt-and-braces)', async () => {
      let callCount = 0;
      const sb = {
        from: () => ({
          upsert: (row) => {
            callCount += 1;
            if (callCount === 1) {
              return Promise.resolve({ error: { code: '42703', message: 'column solomon_advice_outcome_ledger.decision_requested does not exist' } });
            }
            return Promise.resolve({ error: null });
          },
        }),
      };
      const result = await m.captureLedgerRow(sb, { correlationId: 'corr-42703', body: 'x', decisionRequested: true });
      expect(result.captured).toBe(true);
      expect(result.degraded).toBe(true);
      expect(callCount).toBe(2);
    });

    it('does NOT latch the degraded state across calls — a later call succeeds normally once the migration lands', async () => {
      // Call 1: column missing, degrades.
      const sb1 = {
        from: () => ({
          upsert: (row) => (Object.prototype.hasOwnProperty.call(row, 'decision_requested')
            ? Promise.resolve({ error: { code: 'PGRST204', message: "Could not find the 'decision_requested' column" } })
            : Promise.resolve({ error: null })),
        }),
      };
      const r1 = await m.captureLedgerRow(sb1, { correlationId: 'corr-4', body: 'x' });
      expect(r1.degraded).toBe(true);

      // Call 2: fresh call, migration now applied — first attempt succeeds, no retry needed.
      let call2Count = 0;
      const sb2 = { from: () => ({ upsert: (row) => { call2Count += 1; return Promise.resolve({ error: null }); } }) };
      const r2 = await m.captureLedgerRow(sb2, { correlationId: 'corr-5', body: 'x' });
      expect(r2.captured).toBe(true);
      expect(r2.degraded).toBeUndefined();
      expect(call2Count).toBe(1); // no retry — proves the degraded state from sb1's call is not cached on the module
    });
  });

  describe('TS-5: a generic (non-column) DB error is never retried or masked', () => {
    it('returns captured:false after exactly ONE upsert call for a non-PGRST204 error', async () => {
      let callCount = 0;
      const sb = { from: () => ({ upsert: () => { callCount += 1; return Promise.resolve({ error: { code: '57014', message: 'statement timeout' } }); } }) };
      const result = await m.captureLedgerRow(sb, { correlationId: 'corr-6', body: 'x' });
      expect(result.captured).toBe(false);
      expect(result.reason).toMatch(/statement timeout/);
      expect(callCount).toBe(1);
    });

    it('returns captured:false after exactly ONE upsert call for a PGRST204 NOT naming decision_requested', async () => {
      let callCount = 0;
      const sb = { from: () => ({ upsert: () => { callCount += 1; return Promise.resolve({ error: { code: 'PGRST204', message: "Could not find the 'some_other_column' column" } }); } }) };
      const result = await m.captureLedgerRow(sb, { correlationId: 'corr-7', body: 'x' });
      expect(result.captured).toBe(false);
      expect(callCount).toBe(1); // bounded to the specific decision_requested error class only
    });
  });
});

// QF-20260701-289: the "not-flying-blind" instrument was itself flying blind — captureLedgerRow's
// result was discarded at the call site, so a capture gap (e.g. the ledger table not yet applied)
// produced zero signal. checkLedgerCaptureHealth is the cheap gauge that makes it observable.
//
// SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 (FR-1c): the gauge now issues TWO queries — a
// head:true count (unchanged, cheap) and a SEPARATE tiny non-head probe of decision_requested.
// This split was forced by a LIVE finding against the real, then-unmigrated table: a head:true
// request on a nonexistent column returns an uninformative {message:""} with no error code
// (PostgREST appears to swallow the diagnostic on HEAD responses), while a normal select surfaces
// Postgres's real 42703 undefined_column error cleanly. The mock below models both call shapes.
function healthMock({ countResult = { count: 42, error: null }, colProbeResult = { data: [{ decision_requested: true }], error: null } } = {}) {
  let call = 0;
  return {
    from: () => ({
      select: (cols, opts) => {
        call += 1;
        if (call === 1) return Promise.resolve(countResult); // head:true count probe
        return { limit: () => Promise.resolve(colProbeResult) }; // decision_requested column probe
      },
    }),
  };
}

describe('QF-20260701-289: checkLedgerCaptureHealth — the ledger capture gauge', () => {
  it('reports healthy with the current row count when both the table and column are reachable', async () => {
    const result = await m.checkLedgerCaptureHealth(healthMock());
    expect(result.healthy).toBe(true);
    expect(result.rowCount).toBe(42);
  });

  it('reports unhealthy with the reason when the table is missing (e.g. PGRST205) — fails at the FIRST probe', async () => {
    const sb = healthMock({ countResult: { count: null, error: { message: 'PGRST205: table not found' } } });
    const result = await m.checkLedgerCaptureHealth(sb);
    expect(result.healthy).toBe(false);
    expect(result.columnMissing).toBe(false);
    expect(result.reason).toMatch(/PGRST205/);
  });

  it('is fail-open — a thrown query never propagates', async () => {
    const sb = { from: () => { throw new Error('boom'); } };
    const result = await m.checkLedgerCaptureHealth(sb);
    expect(result.healthy).toBe(false);
    expect(result.reason).toMatch(/boom/);
  });

  // TS-13 (SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001): a missing decision_requested column
  // must be distinguishable from a missing TABLE, so the operator message can tell "degraded
  // capture, apply the migration" apart from "capture is not happening at all". Error shape is
  // the REAL live one (42703 undefined_column from the non-head probe), not the PGRST204 shape
  // captureLedgerRow's upsert path sees — the two write/read paths surface different codes for
  // the identical underlying condition, empirically confirmed live.
  it('TS-13: reports columnMissing:true (distinct from the generic unhealthy case) when decision_requested is not found', async () => {
    const sb = healthMock({ colProbeResult: { data: null, error: { code: '42703', message: 'column solomon_advice_outcome_ledger.decision_requested does not exist' } } });
    const result = await m.checkLedgerCaptureHealth(sb);
    expect(result.healthy).toBe(false);
    expect(result.columnMissing).toBe(true);
  });

  it('TS-13: does NOT set columnMissing:true for an unrelated 42703 (a different missing column)', async () => {
    const sb = healthMock({ colProbeResult: { data: null, error: { code: '42703', message: 'column solomon_advice_outcome_ledger.some_other_column does not exist' } } });
    const result = await m.checkLedgerCaptureHealth(sb);
    expect(result.healthy).toBe(false);
    expect(result.columnMissing).toBe(false);
  });
});

// F3 (TESTING sub-agent, EXEC-phase adversarial review): checkLedgerCaptureHealth's columnMissing
// flag was computed correctly but had ZERO production consumers — the sole caller (inbox mode,
// ~line 903) branched only on `!healthy`, so the columnMissing:true (degraded-but-still-capturing)
// state printed the SAME "advisories are NOT being captured" wording as a genuinely down ledger,
// which is actively wrong once captureLedgerRow's fallback (FR-1c) is keeping capture alive. The
// inbox-mode dispatcher isn't independently unit-testable without a disproportionate refactor (it's
// one branch inside main()'s big argv switch, entangled with drainInbox/renderChairmanDirectives/
// checkAndPingOverdueReplies side effects) — source-pinned instead, mirroring the existing
// tests/unit/solomon-startup-check-decision-requested-prompt.test.js precedent for the same class
// of not-cleanly-unit-testable CLI/prompt text.
describe('F3: inbox mode surfaces a DISTINCT, accurate message for the degraded (columnMissing) state', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/solomon-advisory.cjs'), 'utf8');

  it('branches on ledgerHealth.columnMissing before falling through to the generic unhealthy case', () => {
    expect(/if \(!ledgerHealth\.healthy && ledgerHealth\.columnMissing\)/.test(source)).toBe(true);
  });

  it('the degraded-state message says DEGRADED and points at the migration file, and does NOT claim capture has stopped', () => {
    const match = source.match(/if \(!ledgerHealth\.healthy && ledgerHealth\.columnMissing\) \{[\s\S]*?console\.error\(`([^`]+)`\);/);
    expect(match).not.toBeNull();
    const degradedMessage = match[1];
    expect(degradedMessage).toMatch(/DEGRADED/);
    expect(degradedMessage).toMatch(/20260821_solomon_ledger_decision_requested\.sql/);
    expect(degradedMessage).not.toMatch(/NOT being captured/);
  });

  it('the generic (non-columnMissing) unhealthy branch is preserved unchanged, still saying NOT being captured', () => {
    expect(/\} else if \(!ledgerHealth\.healthy\) \{[\s\S]*?NOT being captured/.test(source)).toBe(true);
  });
});
