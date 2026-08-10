/**
 * SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001 — the forecaster belt spans the DISPATCHABLE-LEAF extent.
 *
 * The bug (measured live 2026-08-10 ~07:45Z): the forecaster counted the RAW-UNCLAIMED extent, so
 * its deficit alarm read SURPLUS while the true dispatchable leaf belt was 1 and workers were about
 * to idle. These tests pin the fix two-sided: raw >> floor + leaf <= floor FIRES a DEFICIT (positive
 * control), each real-gap class (in-flight/parent-LEAD/metadata-blocker) drops from the count
 * (behaviour changes vs the pre-fix forecaster), bare-shell stays dropped (forecaster subset-of
 * ranker), the SD table is read ONCE (no duplicate computeClaimableLeaves fetch), and the emitted
 * inputs carry the named raw-vs-dispatchable breakdown.
 */
import { describe, it, expect } from 'vitest';
import { gatherCapacityInputs, BELT_BUFFER } from '../../scripts/lib/capacity-inputs.mjs';
import { computeBeltVerdict } from '../../lib/drive-loop/belt-verdict.js';
import { claimableDbFreeReason, blockerKeysFor } from '../../scripts/lib/claimable-leaves.mjs';
import { isBareShell } from '../../lib/coordinator/sd-exclusion.mjs';

/** Fake supabase mirroring capacity-inputs.test.js, plus a from()-call counter for the read-count assertion. */
function fakeClient({ sessions = [], sds = [], qfCount = 0, counter } = {}) {
  const table = (rows) => {
    const b = {
      _rows: rows,
      select() { return b; }, eq() { return b; }, in() { return b; }, is() { return b; },
      not() { return b; }, gte() { return b; }, order() { return b; }, limit() { return b; },
      range(from, to) { return Promise.resolve({ data: b._rows.slice(from, to + 1), error: null }); },
      then(res) { return Promise.resolve({ data: b._rows, error: null }).then(res); },
    };
    return b;
  };
  return {
    from(name) {
      if (counter) counter[name] = (counter[name] || 0) + 1;
      if (name === 'claude_sessions') return table(sessions);
      if (name === 'strategic_directives_v2') return table(sds);
      if (name === 'quick_fixes') {
        const b = {
          select() { return b; }, eq() { return b; }, in() { return b; }, is() { return b; },
          not() { return b; }, order() { return b; },
          then(res) { return Promise.resolve({ count: qfCount, error: null }).then(res); },
        };
        return b;
      }
      return table([]);
    },
  };
}

const liveIdle = (over = {}) => ({
  session_id: `s-${Math.random().toString(36).slice(2)}`,
  terminal_id: 't', sd_key: null,
  heartbeat_at: new Date().toISOString(), process_alive_at: new Date().toISOString(),
  loop_state: 'active', expected_silence_until: null, metadata: { callsign: 'Alpha' },
  status: 'active', released_reason: null, released_at: null, ...over,
});

const sd = (over = {}) => ({
  id: over.sd_key || 'SD-CLEAN-001',
  sd_key: 'SD-CLEAN-001',
  title: 'A real strategic directive with a genuine described body of work',
  description: 'A substantive, non-bare-shell description that differs from the title entirely.',
  status: 'draft', sd_type: 'infrastructure', current_phase: 'LEAD', progress_percentage: 0,
  claiming_session_id: null, dependencies: null, metadata: {}, target_application: 'EHG_Engineer',
  parent_sd_id: null, ...over,
});

// The six-row shape from TESTING Q3: 1 clean dispatchable leaf + 5 gap-class rows that RAW counts but
// the dispatchable-leaf extent drops.
const cleanLeaf = () => sd({ sd_key: 'SD-CLEAN-001', id: 'SD-CLEAN-001' });
const bareShell = () => sd({ sd_key: 'SD-BARESHELL-001', id: 'SD-BARESHELL-001', title: 'Bare shell', description: 'Bare shell' });
const humanHeld = () => sd({ sd_key: 'SD-HUMAN-001', id: 'SD-HUMAN-001', metadata: { requires_human_action: true } });
const inFlight = () => sd({ sd_key: 'SD-INFLIGHT-001', id: 'SD-INFLIGHT-001', current_phase: 'EXEC' });
const ventureRemediation = () => sd({ sd_key: 'SD-LEO-FIX-REMEDIATION-001', id: 'SD-LEO-FIX-REMEDIATION-001', target_application: 'EHG' });
const depBlocked = () => sd({ sd_key: 'SD-DEPBLOCK-001', id: 'SD-DEPBLOCK-001', dependencies: [{ sd_key: 'SD-BLOCKER-999' }] });

describe('belt extent — dispatchable-leaf, not raw-unclaimed', () => {
  it('TS-1: raw >> floor but leaf <= floor FIRES a DEFICIT (the silent-hour shape)', async () => {
    const out = await gatherCapacityInputs(fakeClient({
      sessions: [liveIdle(), liveIdle()], // idleNow=2 -> floor = demandSoon(2) + buffer(1) = 3
      sds: [cleanLeaf(), bareShell(), humanHeld(), inFlight(), ventureRemediation(), depBlocked()],
      qfCount: 0,
    }));
    expect(out.rawUnclaimed, 'six unclaimed rows — the extent the bug measured').toBe(6);
    expect(out.dispatchableCount, 'only the clean leaf is dispatchable').toBe(1);
    const cap = computeBeltVerdict({ idleNow: out.idleNow, freeingSoon: out.freeingSoon, claimableCount: out.claimableCount, openQfCount: out.openQfCount, buffer: BELT_BUFFER });
    expect(cap.beltDepth).toBe(1); // >0, so DEFICIT not DEFICIT-URGENT (proves the EXCLUSIONS caught it)
    expect(cap.verdict).toBe('DEFICIT');
    expect(cap.deficit).toBe(2);
    // The bug's reading: raw 6 vs floor 3 -> would have read SURPLUS.
    const buggy = computeBeltVerdict({ idleNow: out.idleNow, freeingSoon: out.freeingSoon, claimableCount: out.rawUnclaimed, openQfCount: 0, buffer: BELT_BUFFER });
    expect(buggy.verdict, 'the pre-fix raw-unclaimed count read SURPLUS during the exact silent hour').toBe('SURPLUS');
  });

  it('TS-3: bare-shell stays excluded (forecaster subset-of ranker, safe deficit direction)', async () => {
    const out = await gatherCapacityInputs(fakeClient({ sds: [cleanLeaf(), bareShell()] }));
    expect(out.claimableCount).toBe(1);
  });

  it('TS-4: an in-flight/started (past-LEAD) unclaimed row no longer counts as supply', async () => {
    const out = await gatherCapacityInputs(fakeClient({ sds: [cleanLeaf(), inFlight()] }));
    expect(out.claimableCount, 'in-flight was counted before the fix; now dropped via the shared isStartedSd axis').toBe(1);
  });

  it('TS-5: an orchestrator child whose parent has not passed LEAD is dropped (in-memory parent resolution)', async () => {
    const parent = sd({ sd_key: 'SD-PARENT-001', id: 'SD-PARENT-001', sd_type: 'orchestrator', current_phase: 'LEAD' });
    const child = sd({ sd_key: 'SD-CHILD-001', id: 'SD-CHILD-001', parent_sd_id: 'SD-PARENT-001' });
    const out = await gatherCapacityInputs(fakeClient({ sds: [cleanLeaf(), parent, child] }));
    // parent is an orchestrator (dropped by classifyDispatchIneligibility) AND the child is parent-LEAD-pending.
    expect(out.claimableCount, 'only the clean leaf; the orchestrator parent and its pre-LEAD child both drop').toBe(1);
  });

  it('TS-6: a metadata.blocked_by_sd_key row is dropped (blockerKeysFor, not just top-level deps)', async () => {
    const blocked = sd({ sd_key: 'SD-METABLOCK-001', id: 'SD-METABLOCK-001', dependencies: null, metadata: { blocked_by_sd_key: 'SD-BLOCKER-999' } });
    const out = await gatherCapacityInputs(fakeClient({ sds: [cleanLeaf(), blocked] }));
    expect(out.claimableCount, 'the metadata blocker (uncompleted) drops it — previously counted').toBe(1);
  });

  it('TS-2: forecaster claimable set == the ranker pure-predicate leaf set minus bare-shell (subset parity, derived)', async () => {
    const rows = [cleanLeaf(), bareShell(), humanHeld(), inFlight(), ventureRemediation(), depBlocked(),
      sd({ sd_key: 'SD-CLEAN-002', id: 'SD-CLEAN-002' })];
    const byKey = new Map(rows.map(r => [r.sd_key, r]));
    // Derive the expected set from the SAME shared predicates (never a hardcoded list):
    const expected = rows
      .filter(d => !d.claiming_session_id)
      .filter(d => { const r = claimableDbFreeReason(d); return !r || r === 'claimed'; })
      .filter(d => !isBareShell(d))
      .filter(d => blockerKeysFor(d).every(k => (byKey.has(k) ? byKey.get(k).status === 'completed' : false)))
      .map(d => d.sd_key).sort();
    const out = await gatherCapacityInputs(fakeClient({ sds: rows }));
    const actual = out.claimable.map(d => d.sd_key).sort();
    expect(actual).toEqual(expected);
    expect(actual).toEqual(['SD-CLEAN-001', 'SD-CLEAN-002']);
  });

  it('TS-9: the SD table is read ONCE — no duplicate computeClaimableLeaves fetch', async () => {
    const counter = {};
    await gatherCapacityInputs(fakeClient({ sds: [cleanLeaf(), depBlocked()], counter }));
    // One paginated leaf read + at most one dep-status read = the from() count must not double from a
    // second computeClaimableLeaves(sb) pagination. The forecaster reuses pure predicates in-memory.
    expect(counter['strategic_directives_v2'], 'the leaf read + the dep-status read — never a 2nd full pagination').toBeLessThanOrEqual(2);
  });

  it('TS-10: QF still counts when SD belt is 0 (the QF term survives the refactor)', async () => {
    const out = await gatherCapacityInputs(fakeClient({ sds: [], qfCount: 2 }));
    const cap = computeBeltVerdict({ idleNow: out.idleNow, freeingSoon: out.freeingSoon, claimableCount: out.claimableCount, openQfCount: out.openQfCount, buffer: BELT_BUFFER });
    expect(out.claimableCount).toBe(0);
    expect(cap.beltDepth, 'beltDepth === openQfCount').toBe(2);
    expect(cap.verdict).not.toBe('DEFICIT-URGENT');
  });

  it('TS-11: the emitted inputs NAME the extent + carry the raw-vs-dispatchable breakdown (FR-3, asserted not prose)', async () => {
    const out = await gatherCapacityInputs(fakeClient({ sds: [cleanLeaf(), bareShell(), inFlight()] }));
    expect(out.beltExtent).toBe('dispatchable-leaf');
    expect(out.rawUnclaimed).toBe(3);
    expect(out.dispatchableCount).toBe(1);
    expect(out.claimableCount).toBe(out.dispatchableCount);
  });
});
