/**
 * SD-LEO-INFRA-LEO-COMPLETION-001-D FR-7 — reboot-respawn drill runner.
 * The four PASS/FAIL checks run against the REAL runRebootRespawn via injected seams (spawnFn/logFn/
 * queryEventsFn exercise real logic). NOTE (no_unit_mock=true): these unit checks do NOT satisfy the
 * SD's live-drill acceptance — that is the separate in-session/canary drill (see runbook). This file
 * only proves the drill MECHANISM is correct.
 */
import { describe, it, expect } from 'vitest';
import { runRebootRespawnDrill, printLiveExecutionPrecondition } from '../../../lib/fleet/reboot-respawn-drill-runner.js';

const SLOTS = [
  { name: 'Worker-1', role: 'worker', account_profile: null, resume_uuid: 'u-1' },
  { name: 'Worker-2', role: 'worker', account_profile: null, resume_uuid: 'u-2' },
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
  it('PASSes all four checks when manifest loads, roster builds, --resume relaunches, and events persist', async () => {
    const { logFn, queryEventsFn } = makeEventSeams();
    const { pass, checks } = await runRebootRespawnDrill({
      supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }), logFn, queryEventsFn, live: false,
    });
    expect(checks.map((c) => c.name)).toEqual(['manifest_loaded', 'roster_built', 'per_slot_resume_relaunch', 'respawn_events_present']);
    expect(pass).toBe(true);
    expect(checks.every((c) => c.pass)).toBe(true);
  });

  it('FAILs overall when no fleet_verb_respawn events are observed (log-before-action violated)', async () => {
    const { pass, checks } = await runRebootRespawnDrill({
      supabase: {}, loadFn: async () => SLOTS, spawnFn: () => ({ pid: 1 }),
      logFn: async () => ({ ok: true }), queryEventsFn: async () => [], live: false,
    });
    expect(pass).toBe(false);
    expect(checks.find((c) => c.name === 'respawn_events_present').pass).toBe(false);
  });

  it('FAILs manifest_loaded when the desired manifest is empty (table unapplied / no seed)', async () => {
    const { logFn, queryEventsFn } = makeEventSeams();
    const { pass, checks } = await runRebootRespawnDrill({
      supabase: {}, loadFn: async () => [], logFn, queryEventsFn, live: false,
    });
    expect(pass).toBe(false);
    expect(checks.find((c) => c.name === 'manifest_loaded').pass).toBe(false);
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
