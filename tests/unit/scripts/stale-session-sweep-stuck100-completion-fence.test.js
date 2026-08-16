/**
 * SD-LEO-INFRA-STUCK100-COMPLETED-WRITE-FENCE-001 — the STUCK_100 stale-approval branch
 * (scripts/stale-session-sweep.cjs) previously did a raw `.update({status:'completed'})` on ANY
 * pending_approval row at 100% progress with a completion_date set — no orchestrator/sd_type
 * fence, no LEAD-FINAL-APPROVAL witness. Safe only by COINCIDENCE (the two live orchestrator
 * parents at this shape both happen to have completion_date NULL). This file pins the fenced
 * replacement, completeStuck100Sd: two independent guard axes, both checked before any write.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const SOURCE_PATH = resolve(REPO_ROOT, 'scripts/stale-session-sweep.cjs');
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');

const require = createRequire(import.meta.url);
const sweep = require(SOURCE_PATH);

/** A minimal chainable fake for `.from('strategic_directives_v2').update(...).eq(...).select()`. */
function makeFakeSupabase({ updateError = null, updateMatchesZeroRows = false } = {}) {
  const calls = [];
  const from = (table) => ({
    update(payload) {
      calls.push({ table, payload });
      return {
        eq(col, val) {
          calls[calls.length - 1].eqCol = col;
          calls[calls.length - 1].eqVal = val;
          return {
            select: () => Promise.resolve({
              error: updateError,
              data: updateError ? null : (updateMatchesZeroRows ? [] : [{ sd_key: val }]),
            }),
          };
        },
      };
    },
  });
  return { from, calls };
}

describe('[grep guard] status:completed is written from exactly ONE site', () => {
  it('the literal string "status: \'completed\'" appears exactly once in the whole file — inside completeStuck100Sd', () => {
    const matches = SOURCE.match(/status: 'completed'/g) || [];
    expect(matches.length).toBe(1);
    // Confirm it lives inside completeStuck100Sd, not some other function.
    const fnStart = SOURCE.indexOf('async function completeStuck100Sd');
    const matchIndex = SOURCE.indexOf("status: 'completed'");
    const nextFnStart = SOURCE.indexOf('\nasync function ', fnStart + 1);
    expect(fnStart).toBeGreaterThan(-1);
    expect(matchIndex).toBeGreaterThan(fnStart);
    if (nextFnStart > -1) expect(matchIndex).toBeLessThan(nextFnStart);
  });
});

describe('resolveAcceptedHandoffSets — dual-keyed LEAD-FINAL-APPROVAL witness resolution', () => {
  const candidates = [
    { id: 'uuid-a', sd_key: 'SD-UUID-KEYED-001' },
    { id: 'uuid-b', sd_key: 'SD-STRING-KEYED-001' },
  ];

  it('resolves an ACCEPTED LEAD-FINAL-APPROVAL witness keyed by UUID', () => {
    const handoffRows = [
      { sd_id: 'uuid-a', handoff_type: 'LEAD-FINAL-APPROVAL', status: 'accepted', created_at: '2026-08-16T01:00:00Z' },
    ];
    const { acceptedLeadFinalSet } = sweep.resolveAcceptedHandoffSets(candidates, handoffRows);
    expect(acceptedLeadFinalSet.has('SD-UUID-KEYED-001')).toBe(true);
  });

  it('[the real bug this SD found] resolves an ACCEPTED LEAD-FINAL-APPROVAL witness keyed by the sd_key STRING, not the UUID -- measured live 2026-08-16: 161/1000 real LEAD-FINAL-APPROVAL rows are string-keyed, an ACTIVE code path (one specimen: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-142, completed the same session this fence was authored in)', () => {
    const handoffRows = [
      { sd_id: 'SD-STRING-KEYED-001', handoff_type: 'LEAD-FINAL-APPROVAL', status: 'accepted', created_at: '2026-08-16T01:00:00Z' },
    ];
    const { acceptedLeadFinalSet } = sweep.resolveAcceptedHandoffSets(candidates, handoffRows);
    expect(acceptedLeadFinalSet.has('SD-STRING-KEYED-001')).toBe(true);
  });

  it('only the LATEST row per (handoff_type, logical sd_key) decides the verdict -- an old accepted row does not survive a later non-accepted one', () => {
    const handoffRows = [
      // caller pre-sorts created_at DESC -- latest first
      { sd_id: 'uuid-a', handoff_type: 'LEAD-FINAL-APPROVAL', status: 'rejected', created_at: '2026-08-16T02:00:00Z' },
      { sd_id: 'uuid-a', handoff_type: 'LEAD-FINAL-APPROVAL', status: 'accepted', created_at: '2026-08-16T01:00:00Z' },
    ];
    const { acceptedLeadFinalSet } = sweep.resolveAcceptedHandoffSets(candidates, handoffRows);
    expect(acceptedLeadFinalSet.has('SD-UUID-KEYED-001')).toBe(false);
  });

  it('PLAN-TO-LEAD and LEAD-FINAL-APPROVAL are tracked independently for the same SD', () => {
    const handoffRows = [
      { sd_id: 'uuid-a', handoff_type: 'PLAN-TO-LEAD', status: 'accepted', created_at: '2026-08-15T01:00:00Z' },
      // No LEAD-FINAL-APPROVAL row at all for this SD.
    ];
    const { acceptedPlanToLeadSet, acceptedLeadFinalSet } = sweep.resolveAcceptedHandoffSets(candidates, handoffRows);
    expect(acceptedPlanToLeadSet.has('SD-UUID-KEYED-001')).toBe(true);
    expect(acceptedLeadFinalSet.has('SD-UUID-KEYED-001')).toBe(false);
  });

  it('a handoff row whose sd_id matches no candidate (id or sd_key) is silently ignored, not mis-attributed', () => {
    const handoffRows = [
      { sd_id: 'some-other-sd-entirely', handoff_type: 'LEAD-FINAL-APPROVAL', status: 'accepted', created_at: '2026-08-16T01:00:00Z' },
    ];
    const { acceptedLeadFinalSet } = sweep.resolveAcceptedHandoffSets(candidates, handoffRows);
    expect(acceptedLeadFinalSet.size).toBe(0);
  });
});

describe('resolveOrchestratorParentSdKeys — [adversarial-review fix] both axes verified live, not just via completeStuck100Sd fixtures', () => {
  // Adversarial review of this SD's first draft found BOTH claimed axes broken: axis 1
  // (sd_type classifier) was fed rows that never selected sd_type, so it was permanently dead;
  // axis 2 (children lookup) only matched parent_sd_id by UUID, missing the sd_key-string form
  // that lib/fleet/claim-eligibility.cjs's parentLeadPending already proves is a live pattern.
  // These tests drive the REAL resolver (not hand-constructed orchestratorSdKeys Sets), so a
  // regression on either axis fails here, not silently in production.

  it('axis 1: a row with sd_type=orchestrator is detected even with zero child rows', () => {
    const candidates = [{ id: 'uuid-orch-1', sd_key: 'SD-ORCH-TYPED-001', sd_type: 'orchestrator' }];
    const result = sweep.resolveOrchestratorParentSdKeys(candidates, []);
    expect(result.has('SD-ORCH-TYPED-001')).toBe(true);
  });

  it('axis 1 is inert (not a crash) when sd_type is absent — proves the caller-select dependency, not a false positive', () => {
    const candidates = [{ id: 'uuid-leaf-1', sd_key: 'SD-LEAF-NO-TYPE-001' }];
    const result = sweep.resolveOrchestratorParentSdKeys(candidates, []);
    expect(result.has('SD-LEAF-NO-TYPE-001')).toBe(false);
  });

  it('axis 2: a child row whose parent_sd_id holds the parent UUID is detected', () => {
    const candidates = [{ id: 'uuid-parent-2', sd_key: 'SD-PARENT-UUID-LINKED-001' }];
    const childRows = [{ parent_sd_id: 'uuid-parent-2' }];
    const result = sweep.resolveOrchestratorParentSdKeys(candidates, childRows);
    expect(result.has('SD-PARENT-UUID-LINKED-001')).toBe(true);
  });

  it('[the real bug adversarial review found] axis 2: a child row whose parent_sd_id holds the parent sd_key STRING (not the UUID) is still detected', () => {
    const candidates = [{ id: 'uuid-parent-3', sd_key: 'SD-PARENT-STRING-LINKED-001' }];
    const childRows = [{ parent_sd_id: 'SD-PARENT-STRING-LINKED-001' }];
    const result = sweep.resolveOrchestratorParentSdKeys(candidates, childRows);
    expect(result.has('SD-PARENT-STRING-LINKED-001')).toBe(true);
  });

  it('a child row whose parent_sd_id matches no candidate (id or sd_key) is silently ignored, not mis-attributed', () => {
    const candidates = [{ id: 'uuid-parent-4', sd_key: 'SD-PARENT-004' }];
    const childRows = [{ parent_sd_id: 'some-unrelated-parent-ref' }];
    const result = sweep.resolveOrchestratorParentSdKeys(candidates, childRows);
    expect(result.size).toBe(0);
  });

  it('a leaf SD with neither sd_type=orchestrator nor any matching child row is NOT flagged', () => {
    const candidates = [{ id: 'uuid-leaf-5', sd_key: 'SD-LEAF-005', sd_type: 'feature' }];
    const result = sweep.resolveOrchestratorParentSdKeys(candidates, []);
    expect(result.has('SD-LEAF-005')).toBe(false);
  });

  it('both axes can independently contribute across a mixed candidate batch', () => {
    const candidates = [
      { id: 'uuid-a', sd_key: 'SD-TYPED-ORCH', sd_type: 'orchestrator' },
      { id: 'uuid-b', sd_key: 'SD-LINKED-ORCH' },
      { id: 'uuid-c', sd_key: 'SD-PLAIN-LEAF', sd_type: 'feature' },
    ];
    const childRows = [{ parent_sd_id: 'SD-LINKED-ORCH' }]; // string-keyed, axis 2 only
    const result = sweep.resolveOrchestratorParentSdKeys(candidates, childRows);
    expect(result.has('SD-TYPED-ORCH')).toBe(true);
    expect(result.has('SD-LINKED-ORCH')).toBe(true);
    expect(result.has('SD-PLAIN-LEAF')).toBe(false);
    expect(result.size).toBe(2);
  });
});

describe('completeStuck100Sd — orchestrator-parent fence', () => {
  it('an orchestrator-parent SD (per orchestratorSdKeys) is NOT completed, and a named line is returned', async () => {
    const { from, calls } = makeFakeSupabase();
    const sd = { id: 'uuid-1', sd_key: 'SD-PARENT-001', progress_percentage: 100, completion_date: '2026-08-15T00:00:00Z' };
    const result = await sweep.completeStuck100Sd(
      { from },
      sd,
      { orchestratorSdKeys: new Set(['SD-PARENT-001']), acceptedLeadFinalSet: new Set(['SD-PARENT-001']) },
    );
    expect(result.written).toBe(false);
    expect(result.line).toMatch(/orchestrator_parent/);
    expect(result.line).toContain('SD-PARENT-001');
    expect(calls.length).toBe(0); // no DB write attempted at all
  });
});

describe('completeStuck100Sd — LEAD-FINAL-APPROVAL witness fence', () => {
  it('a non-orchestrator leaf WITHOUT an accepted LEAD-FINAL-APPROVAL witness is NOT completed, named STUCK_100_NO_LFA_WITNESS', async () => {
    const { from, calls } = makeFakeSupabase();
    const sd = { id: 'uuid-2', sd_key: 'SD-LEAF-NO-LFA-001', progress_percentage: 100, completion_date: '2026-08-15T00:00:00Z' };
    const result = await sweep.completeStuck100Sd(
      { from },
      sd,
      { orchestratorSdKeys: new Set(), acceptedLeadFinalSet: new Set() },
    );
    expect(result.written).toBe(false);
    expect(result.line).toMatch(/STUCK_100_NO_LFA_WITNESS/);
    expect(result.line).toContain('SD-LEAF-NO-LFA-001');
    expect(calls.length).toBe(0);
  });

  it('a non-orchestrator leaf WITH an accepted LEAD-FINAL-APPROVAL witness completes — existing behavior preserved', async () => {
    const { from, calls } = makeFakeSupabase();
    const sd = { id: 'uuid-3', sd_key: 'SD-LEAF-WITH-LFA-001', progress_percentage: 100, completion_date: '2026-08-15T00:00:00Z' };
    const result = await sweep.completeStuck100Sd(
      { from },
      sd,
      { orchestratorSdKeys: new Set(), acceptedLeadFinalSet: new Set(['SD-LEAF-WITH-LFA-001']) },
    );
    expect(result.written).toBe(true);
    expect(result.line).toMatch(/^QA: completed SD-LEAF-WITH-LFA-001/);
    expect(calls.length).toBe(1);
    expect(calls[0].payload).toMatchObject({ status: 'completed', claiming_session_id: null, active_session_id: null, is_working_on: false });
    expect(calls[0].eqCol).toBe('sd_key');
    expect(calls[0].eqVal).toBe('SD-LEAF-WITH-LFA-001');
  });

  it('a DB error on the write surfaces (written:false, error set, no misleading line)', async () => {
    const dbError = { message: 'boom' };
    const { from } = makeFakeSupabase({ updateError: dbError });
    const sd = { id: 'uuid-4', sd_key: 'SD-LEAF-DB-ERROR-001', progress_percentage: 100, completion_date: '2026-08-15T00:00:00Z' };
    const result = await sweep.completeStuck100Sd(
      { from },
      sd,
      { orchestratorSdKeys: new Set(), acceptedLeadFinalSet: new Set(['SD-LEAF-DB-ERROR-001']) },
    );
    expect(result.written).toBe(false);
    expect(result.line).toBeNull();
    expect(result.error).toBe(dbError);
  });

  it('[adversarial-review fix, QF-20260727-363 parity] an UPDATE matching zero rows is NOT reported as written -- !error alone never proved a write happened', async () => {
    const { from, calls } = makeFakeSupabase({ updateMatchesZeroRows: true });
    const sd = { id: 'uuid-6', sd_key: 'SD-LEAF-RACED-001', progress_percentage: 100, completion_date: '2026-08-15T00:00:00Z' };
    const result = await sweep.completeStuck100Sd(
      { from },
      sd,
      { orchestratorSdKeys: new Set(), acceptedLeadFinalSet: new Set(['SD-LEAF-RACED-001']) },
    );
    expect(result.written).toBe(false);
    expect(result.line).toMatch(/zero rows/);
    expect(result.line).not.toMatch(/^QA: completed/);
    expect(calls.length).toBe(1); // the write WAS attempted, just didn't match -- distinct from the two upstream guard refusals (zero calls)
  });
});

describe('completeStuck100Sd — the orchestrator fence takes precedence over the LFA witness fence', () => {
  it('an orchestrator SD that ALSO happens to have an accepted LFA witness is still refused (never a raw write on a parent)', async () => {
    const { from, calls } = makeFakeSupabase();
    const sd = { id: 'uuid-5', sd_key: 'SD-PARENT-WITH-LFA-001', progress_percentage: 100, completion_date: '2026-08-15T00:00:00Z' };
    const result = await sweep.completeStuck100Sd(
      { from },
      sd,
      { orchestratorSdKeys: new Set(['SD-PARENT-WITH-LFA-001']), acceptedLeadFinalSet: new Set(['SD-PARENT-WITH-LFA-001']) },
    );
    expect(result.written).toBe(false);
    expect(result.line).toMatch(/orchestrator_parent/);
    expect(calls.length).toBe(0);
  });
});
