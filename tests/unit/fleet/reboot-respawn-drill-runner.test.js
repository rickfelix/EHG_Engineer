/**
 * SD-LEO-INFRA-LEO-COMPLETION-001-D FR-7 — reboot-respawn drill runner.
 * The four PASS/FAIL checks run against the REAL runRebootRespawn via injected seams (spawnFn/logFn/
 * queryEventsFn exercise real logic). NOTE (no_unit_mock=true): these unit checks do NOT satisfy the
 * SD's live-drill acceptance — that is the separate in-session/canary drill (see runbook). This file
 * only proves the drill MECHANISM is correct.
 */
import { describe, it, expect } from 'vitest';
import { runRebootRespawnDrill, printLiveExecutionPrecondition } from '../../../lib/fleet/reboot-respawn-drill-runner.js';

// SD-LEO-INFRA-FLEET-CANNOT-SELF-001 FR-1: account_profile:null is now SKIPPED, not silently
// un-isolated -- 'host-default' is the explicit sentinel for a normal, spawning slot with no
// isolation, which is what this drill-mechanism file's fixtures actually need.
const SLOTS = [
  { name: 'Worker-1', role: 'worker', account_profile: 'host-default', resume_uuid: 'u-1' },
  { name: 'Worker-2', role: 'worker', account_profile: 'host-default', resume_uuid: 'u-2' },
];

/** logFn records events into a shared array; queryEventsFn reads them back — real emit->read path. */
function makeEventSeams() {
  const events = [];
  return {
    logFn: async (_s, ev) => { events.push(ev); return { ok: true }; },
    queryEventsFn: async () => events,
    events,
  };
}

describe('runRebootRespawnDrill (FR-7)', () => {
  it('PASSes all five checks when manifest loads, roster builds, --resume relaunches, and events persist', async () => {
    const { logFn, queryEventsFn } = makeEventSeams();
    const { pass, checks } = await runRebootRespawnDrill({
      supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }), logFn, queryEventsFn, live: false,
    });
    expect(checks.map((c) => c.name)).toEqual(['manifest_loaded', 'roster_built', 'per_slot_resume_relaunch', 'respawn_events_present', 'respawn_bind_audited']);
    expect(pass).toBe(true);
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  // SHIP-REVIEW FIX (adversarial review, PR #7168, finding F7): a skipped slot (invocation:null,
  // argv=[]) used to pass per_slot_resume_relaunch VACUOUSLY for a no-resume-token slot
  // (![].includes('--resume') is true), so the check's own detail string falsely claimed "all N
  // slot(s) relaunched with the correct --resume token" for a slot that was never relaunched at all.
  describe('SD-LEO-INFRA-FLEET-CANNOT-SELF-001 ship-review F7: a skipped slot must not read as a successful relaunch', () => {
    it('per_slot_resume_relaunch FAILS (not vacuously passes) when a slot is skipped for lacking account_profile', async () => {
      const { logFn, queryEventsFn } = makeEventSeams();
      const slots = [
        { name: 'Broken', role: 'worker', resume_uuid: null }, // no account_profile -> skipped
        SLOTS[0],
      ];
      const { checks, pass } = await runRebootRespawnDrill({
        supabase: {}, loadFn: async () => slots, spawnFn: () => ({ pid: 1 }), logFn, queryEventsFn, live: false,
      });
      const resumeCheck = checks.find((c) => c.name === 'per_slot_resume_relaunch');
      expect(resumeCheck.pass).toBe(false);
      expect(resumeCheck.detail).not.toMatch(/all \d+ slot\(s\) relaunched/);
      expect(pass).toBe(false);
    });
  });

  // QF-20260725-790: the false pass that made every other defect in the 2026-07-26T00:15Z CP3
  // acceptance attempt invisible. That run emitted exactly ONE row — fleet_verb_respawn with
  // live:false, outcome:'dry_run', session_id:null — and zero session_lifecycle_events. Two legs never
  // executed, yet BOTH guard checks went green: check 4 counted the dry_run row (1 >= 1) and check 5
  // passed trivially at 0 === 0 because a null session_id never enters the bound population.
  // These reproduce that exact population and assert it now goes RED under --live.
  describe('QF-20260725-790: a dry_run row is NOT leg evidence under --live', () => {
    const DRY_RUN_ROW = { event_type: 'fleet_verb_respawn', session_id: null, payload: { live: false, outcome: 'dry_run' } };

    it('check 4 REJECTS dry_run rows under live (was N >= N PASS on a run that did nothing)', async () => {
      // Supply ONE dry_run row PER SLOT. With fewer rows than slots the check would fail on the count
      // alone and this test would go red for a reason unrelated to the fix — verified: an earlier
      // single-row version passed against the UNFIXED code, which is no evidence at all. Saturating
      // the count isolates the population filter as the only thing that can turn it red.
      const rows = SLOTS.map(() => ({ ...DRY_RUN_ROW }));
      const { checks, pass } = await runRebootRespawnDrill({
        supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }),
        logFn: async () => ({ ok: true }), queryEventsFn: async () => rows,
        queryLifecycleEventsFn: async () => [], live: true,
      });
      expect(checks.find((c) => c.name === 'respawn_events_present').pass).toBe(false);
      expect(pass).toBe(false);
    });

    it('check 5 does NOT pass trivially on an EMPTY bound population under live (was 0 === 0)', async () => {
      const { checks } = await runRebootRespawnDrill({
        supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }),
        logFn: async () => ({ ok: true }), queryEventsFn: async () => [DRY_RUN_ROW],
        queryLifecycleEventsFn: async () => [], live: true,
      });
      const c5 = checks.find((c) => c.name === 'respawn_bind_audited');
      expect(c5.pass).toBe(false);
      expect(c5.detail).toMatch(/absence is not a pass/);
    });

    it('a row the emitter stamped live:false is rejected under live even if its outcome looks ok', async () => {
      // Count-saturated for the same reason, and each row is fully bind-audited — so under the UNFIXED
      // code every other signal is green and ONLY the live:false stamp can fail it.
      const rows = SLOTS.map((_, i) => ({ event_type: 'fleet_verb_respawn', session_id: `s-${i}`, payload: { live: false, outcome: 'ok' } }));
      const { checks } = await runRebootRespawnDrill({
        supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }),
        logFn: async () => ({ ok: true }),
        queryEventsFn: async () => rows,
        queryLifecycleEventsFn: async () => SLOTS.map((_, i) => ({ event_type: 'RESPAWN_BIND_VERIFIED', session_id: `s-${i}` })),
        live: true,
      });
      expect(checks.find((c) => c.name === 'respawn_events_present').pass).toBe(false);
    });

    // BOTH DIRECTIONS. The dry_run exemption is still CORRECT for a mechanism/dry-run drill — there is
    // no live session by design — so gating it on `live` must not break the dry-run path.
    it('the dry_run exemption is PRESERVED for a non-live mechanism drill (no over-correction)', async () => {
      const { logFn, queryEventsFn } = makeEventSeams();
      const { pass, checks } = await runRebootRespawnDrill({
        supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }), logFn, queryEventsFn, live: false,
      });
      expect(checks.find((c) => c.name === 'respawn_events_present').pass).toBe(true);
      expect(checks.find((c) => c.name === 'respawn_bind_audited').pass).toBe(true);
      expect(pass).toBe(true);
    });

    it('a GENUINELY bound + audited live respawn still PASSES (the fix is not a blanket live-fail)', async () => {
      const bound = SLOTS.map((_, i) => ({ event_type: 'fleet_verb_respawn', session_id: `s-${i}`, payload: { live: true, outcome: 'ok' } }));
      const { checks } = await runRebootRespawnDrill({
        supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }),
        logFn: async () => ({ ok: true }), queryEventsFn: async () => bound,
        queryLifecycleEventsFn: async () => SLOTS.map((_, i) => ({ event_type: 'RESPAWN_BIND_VERIFIED', session_id: `s-${i}` })),
        live: true,
      });
      expect(checks.find((c) => c.name === 'respawn_events_present').pass).toBe(true);
      expect(checks.find((c) => c.name === 'respawn_bind_audited').pass).toBe(true);
    });
  });

  // QF-20260725-790 scope part 2: "print every check name, verdict AND THE EVIDENCE ROW ID". The first
  // pass shipped name+verdict only; these cover the row-id half. On the 00:15Z run the unanswerable
  // question was "which row satisfied this check?" — the verdict has to name its evidence.
  describe('QF-20260725-790: checks carry the EVIDENCE ROW IDS their verdict was computed from', () => {
    it('check 4 lists every row in the window, including ones it REJECTED and why', async () => {
      const rows = [
        { id: 'evt-dry', event_type: 'fleet_verb_respawn', session_id: null, payload: { live: false, outcome: 'dry_run' } },
        { id: 'evt-ok', event_type: 'fleet_verb_respawn', session_id: 's-1', payload: { live: true, outcome: 'ok' } },
      ];
      const { checks } = await runRebootRespawnDrill({
        supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }),
        logFn: async () => ({ ok: true }), queryEventsFn: async () => rows,
        queryLifecycleEventsFn: async () => [], live: true,
      });
      const ev = checks.find((c) => c.name === 'respawn_events_present').evidence;
      expect(ev.map((e) => e.id)).toEqual(['evt-dry', 'evt-ok']);
      // The REJECTED row must still appear — a report that hid it would hide the false pass itself.
      expect(ev.find((e) => e.id === 'evt-dry').counted).toBe(false);
      expect(ev.find((e) => e.id === 'evt-ok').counted).toBe(true);
    });

    it('the evidence list agrees with the COUNT — one predicate, not two re-derivations', async () => {
      const rows = [
        { id: 'a', event_type: 'fleet_verb_respawn', session_id: 's-1', payload: { live: true, outcome: 'ok' } },
        { id: 'b', event_type: 'fleet_verb_respawn', session_id: null, payload: { live: true, outcome: 'respawn_unbound' } },
        { id: 'c', event_type: 'fleet_verb_respawn', session_id: 's-2', payload: { live: true, outcome: 'ok' } },
      ];
      const { checks } = await runRebootRespawnDrill({
        supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }),
        logFn: async () => ({ ok: true }), queryEventsFn: async () => rows,
        queryLifecycleEventsFn: async () => SLOTS.map((_, i) => ({ id: `au-${i}`, event_type: 'RESPAWN_BIND_VERIFIED', session_id: `s-${i + 1}` })),
        live: true,
      });
      const c4 = checks.find((c) => c.name === 'respawn_events_present');
      const countedInEvidence = c4.evidence.filter((e) => e.counted).length;
      // The detail string states the count the verdict used; the evidence must not contradict it.
      expect(c4.detail).toContain(`events: ${countedInEvidence}`);
      expect(countedInEvidence).toBe(2);
    });

    it('check 5 names the audit rows AND the bound sessions that have NO audit row', async () => {
      const { checks } = await runRebootRespawnDrill({
        supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }),
        logFn: async () => ({ ok: true }),
        queryEventsFn: async () => SLOTS.map((_, i) => ({ id: `e-${i}`, event_type: 'fleet_verb_respawn', session_id: `s-${i}`, payload: { live: true, outcome: 'ok' } })),
        queryLifecycleEventsFn: async () => [{ id: 'audit-0', event_type: 'RESPAWN_BIND_VERIFIED', session_id: 's-0' }],
        live: true,
      });
      const c5 = checks.find((c) => c.name === 'respawn_bind_audited');
      expect(c5.pass).toBe(false);
      expect(c5.evidence.audit_rows).toEqual([{ id: 'audit-0', session_id: 's-0' }]);
      // The actionable half: WHICH bind is unproven, not just "1/2".
      expect(c5.evidence.unaudited_bound_sessions).toEqual(['s-1']);
    });
  });

  it('FAILs overall when no fleet_verb_respawn events are observed (log-before-action violated)', async () => {
    const { pass, checks } = await runRebootRespawnDrill({
      supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }),
      logFn: async () => ({ ok: true }), queryEventsFn: async () => [], live: false,
    });
    expect(pass).toBe(false);
    expect(checks.find((c) => c.name === 'respawn_events_present').pass).toBe(false);
  });

  it('respawn_events_present FAILs when the events are respawn_unbound no-ops even though the COUNT meets slots (QF-20260724-828)', async () => {
    const { logFn } = makeEventSeams();
    // Post-QF-911 a live respawn that binds no heartbeating session emits outcome:'respawn_unbound' +
    // session_id:null. Two such events meet the count (2 >= slots.length) yet bound NO session — the
    // old count-based check false-passed on this no-op; the session-bound check must FAIL it.
    const { checks } = await runRebootRespawnDrill({
      supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }), logFn, live: false,
      queryEventsFn: async () => [
        { event_type: 'fleet_verb_respawn', session_id: null, payload: { outcome: 'respawn_unbound' } },
        { event_type: 'fleet_verb_respawn', session_id: null, payload: { outcome: 'respawn_unbound' } },
      ],
    });
    expect(checks.find((c) => c.name === 'respawn_events_present').pass).toBe(false);
  });

  it('respawn_events_present PASSES when events are session-bound (outcome ok + non-null session_id) (QF-20260724-828)', async () => {
    const { logFn } = makeEventSeams();
    const { checks } = await runRebootRespawnDrill({
      supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }), logFn, live: false,
      queryEventsFn: async () => [
        { event_type: 'fleet_verb_respawn', session_id: 'sess-1', payload: { outcome: 'ok' } },
        { event_type: 'fleet_verb_respawn', session_id: 'sess-2', payload: { outcome: 'ok' } },
      ],
    });
    expect(checks.find((c) => c.name === 'respawn_events_present').pass).toBe(true);
  });

  it('FAILs manifest_loaded when the desired manifest is empty (table unapplied / no seed)', async () => {
    const { logFn, queryEventsFn } = makeEventSeams();
    const { pass, checks } = await runRebootRespawnDrill({
      supabase: {}, loadFn: async () => [], logFn, queryEventsFn, live: false,
    });
    expect(pass).toBe(false);
    expect(checks.find((c) => c.name === 'manifest_loaded').pass).toBe(false);
  });

  it('respawn_bind_audited PASSES when every session-bound respawn has a matching RESPAWN_BIND_VERIFIED audit row (QF-20260724-070)', async () => {
    const { logFn } = makeEventSeams();
    const { checks } = await runRebootRespawnDrill({
      supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }), logFn, live: false,
      queryEventsFn: async () => [
        { event_type: 'fleet_verb_respawn', session_id: 'sess-1', payload: { outcome: 'ok' } },
        { event_type: 'fleet_verb_respawn', session_id: 'sess-2', payload: { outcome: 'ok' } },
      ],
      queryLifecycleEventsFn: async () => [
        { event_type: 'RESPAWN_BIND_VERIFIED', session_id: 'sess-1' },
        { event_type: 'RESPAWN_BIND_VERIFIED', session_id: 'sess-2' },
      ],
    });
    expect(checks.find((c) => c.name === 'respawn_bind_audited').pass).toBe(true);
  });

  it('respawn_bind_audited FAILs when a session-bound respawn has NO matching audit row -- session_id-populated-post-hoc alone is not proof (QF-20260724-070)', async () => {
    const { logFn } = makeEventSeams();
    const { checks } = await runRebootRespawnDrill({
      supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }), logFn, live: false,
      queryEventsFn: async () => [
        { event_type: 'fleet_verb_respawn', session_id: 'sess-1', payload: { outcome: 'ok' } },
        { event_type: 'fleet_verb_respawn', session_id: 'sess-2', payload: { outcome: 'ok' } },
      ],
      queryLifecycleEventsFn: async () => [
        { event_type: 'RESPAWN_BIND_VERIFIED', session_id: 'sess-1' }, // sess-2 never audited
      ],
    });
    expect(checks.find((c) => c.name === 'respawn_bind_audited').pass).toBe(false);
  });

  it('respawn_bind_audited PASSES trivially when no session-bound respawns exist (dry-run/unbound), even without queryLifecycleEventsFn', async () => {
    const { logFn } = makeEventSeams();
    const { checks } = await runRebootRespawnDrill({
      supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }), logFn, live: false,
      queryEventsFn: async () => [
        { event_type: 'fleet_verb_respawn', session_id: null, payload: { outcome: 'dry_run' } },
        { event_type: 'fleet_verb_respawn', session_id: null, payload: { outcome: 'dry_run' } },
      ],
    });
    expect(checks.find((c) => c.name === 'respawn_bind_audited').pass).toBe(true);
  });

  it('per_slot_resume_relaunch FAILs if a slot with a resume_uuid is relaunched WITHOUT its --resume token', async () => {
    const { logFn, queryEventsFn } = makeEventSeams();
    // Inject a buildInvocationFn that "forgets" the resume token -> the check must catch the masking.
    const { checks } = await runRebootRespawnDrill({
      supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }), logFn, queryEventsFn, live: false,
      buildInvocationFn: ({ callsign }) => ({ program: 'wt.exe', args: ['new-tab', '--', 'claude'], env: { FLEET_WORKER_CALLSIGN: callsign } }),
    });
    expect(checks.find((c) => c.name === 'per_slot_resume_relaunch').pass).toBe(false);
  });
});

describe('printLiveExecutionPrecondition (no-false-live-claim guardrail)', () => {
  it('states mechanism-ready NOT live-executed, the no_unit_mock pin, and the Solomon-deferred canary leg', () => {
    const text = printLiveExecutionPrecondition();
    expect(text).toMatch(/MECHANISM-READY, NOT live-executed/);
    expect(text).toMatch(/no_unit_mock=true/);
    expect(text).toMatch(/DEFERRED to Solomon/);
    expect(text).toMatch(/FLEET_SPAWN_CONTROL_LIVE/);
    expect(text).not.toMatch(/live drill (passed|complete|proven)/i);
  });
});
