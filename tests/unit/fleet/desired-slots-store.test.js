/**
 * SD-LEO-INFRA-LEO-COMPLETION-001-D FR-1/FR-2/FR-3 — desired-state slot store.
 * Pure/deterministic parts: fail-soft reader, normalized shape, roster translation, resume_uuid
 * get-then-merge capture. (The LOAD-BEARING live reboot drill is separate — see FR-7 / runbook.)
 */
import { describe, it, expect } from 'vitest';
import {
  loadDesiredSlots,
  upsertDesiredSlot,
  captureResumeUuid,
  slotsToRoster,
} from '../../../lib/fleet/desired-slots-store.js';

/** from(TABLE).select(cols) -> Promise<{data,error}> — the exact call loadDesiredSlots makes. */
function makeSelectSupabase({ data = null, error = null } = {}) {
  return { from: () => ({ select: () => Promise.resolve({ data, error }) }) };
}

/** Stateful fake covering the claude_sessions + fleet_desired_slots shapes captureResumeUuid touches. */
function makeSessionSupabase({ sessions = {}, slots = {} } = {}) {
  const sessionStore = JSON.parse(JSON.stringify(sessions));
  const slotStore = JSON.parse(JSON.stringify(slots));
  return {
    _sessions: sessionStore,
    _slots: slotStore,
    from(table) {
      if (table === 'claude_sessions') {
        return {
          select: () => ({ eq: (_c, val) => ({ maybeSingle: async () => ({ data: sessionStore[val] ? { metadata: sessionStore[val].metadata } : null, error: null }) }) }),
          update: (patch) => ({ eq: async (_c, val) => { if (sessionStore[val]) Object.assign(sessionStore[val], patch); return { error: sessionStore[val] ? null : { message: 'not found' } }; } }),
        };
      }
      if (table === 'fleet_desired_slots') {
        return {
          update: (patch) => ({ eq: async (_c, val) => { if (slotStore[val]) Object.assign(slotStore[val], patch); return { error: null }; } }),
          upsert: async () => ({ error: null }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('loadDesiredSlots (FR-1) — fail-soft', () => {
  it('returns [] when the table is absent (chairman-gated migration unapplied)', async () => {
    const supabase = makeSelectSupabase({ data: null, error: { message: 'relation "fleet_desired_slots" does not exist', code: '42P01' } });
    // RED against a non-fail-soft reader: a throw/undefined here instead of [] would fail this.
    expect(await loadDesiredSlots(supabase)).toEqual([]);
  });

  it('returns [] on a null/absent client (never throws)', async () => {
    expect(await loadDesiredSlots(null)).toEqual([]);
    expect(await loadDesiredSlots({})).toEqual([]);
  });

  it('returns normalizeDesiredSlots-shaped rows, excluding disabled + nameless slots', async () => {
    const supabase = makeSelectSupabase({
      data: [
        { name: 'Worker-1', color: 'blue', role: 'worker', account_profile: 'acctA', model: 'opus', effort: 'high', worktree: 'C:\\wt\\1', resume_uuid: 'u-1', enabled: true },
        { name: 'Worker-2', color: null, role: 'worker', account_profile: null, model: null, effort: null, worktree: null, resume_uuid: null, enabled: false }, // disabled -> excluded
        { name: null, color: 'red', enabled: true }, // nameless -> dropped by normalizeDesiredSlots
      ],
      error: null,
    });
    const slots = await loadDesiredSlots(supabase);
    expect(slots).toEqual([
      { name: 'Worker-1', color: 'blue', role: 'worker', account_profile: 'acctA', model: 'opus', effort: 'high', worktree: 'C:\\wt\\1', resume_uuid: 'u-1' },
    ]);
  });
});

describe('upsertDesiredSlot (FR-1)', () => {
  it('rejects a nameless slot without touching the DB', async () => {
    const res = await upsertDesiredSlot(makeSessionSupabase(), {});
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/name is required/);
  });

  it('upserts a named slot and reports ok', async () => {
    const res = await upsertDesiredSlot(makeSessionSupabase(), { name: 'Worker-1', role: 'worker' });
    expect(res.ok).toBe(true);
  });
});

describe('captureResumeUuid (FR-2) — get-then-merge, never a bare replace', () => {
  it('stamps metadata.resume_uuid = sessionId while preserving fleet_identity/callsign/tier_rank/role', async () => {
    const supabase = makeSessionSupabase({
      sessions: { 's-1': { metadata: { fleet_identity: { callsign: 'Golf', color: 'blue' }, callsign: 'Golf', tier_rank: 2, role: 'worker' } } },
    });
    const res = await captureResumeUuid(supabase, { name: 'Golf', sessionId: 's-1' });
    expect(res.ok).toBe(true);
    const md = supabase._sessions['s-1'].metadata;
    // RED against a bare `.update({metadata:{resume_uuid}})` replace: those fields would be gone.
    expect(md.resume_uuid).toBe('s-1');
    expect(md.fleet_identity).toEqual({ callsign: 'Golf', color: 'blue' });
    expect(md.callsign).toBe('Golf');
    expect(md.tier_rank).toBe(2);
    expect(md.role).toBe('worker');
  });

  it('is fail-soft on a missing sessionId', async () => {
    const res = await captureResumeUuid(makeSessionSupabase(), { name: 'x' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/sessionId is required/);
  });
});

describe('slotsToRoster (FR-3) — FLEET_SUPERVISOR_ROSTER shape', () => {
  it('maps name->callsign, account_profile->accountProfile, role->role, carries resume_uuid', () => {
    const roster = slotsToRoster([
      { name: 'Worker-1', role: 'worker', account_profile: 'acctA', resume_uuid: 'u-1' },
    ]);
    expect(roster).toEqual([{ role: 'worker', callsign: 'Worker-1', accountProfile: 'acctA', resume_uuid: 'u-1' }]);
  });

  it('serializes to exactly the JSON fleet-supervisor.cjs parses (role/callsign/accountProfile)', () => {
    const roster = slotsToRoster([{ name: 'Adam-1', role: 'adam', account_profile: 'canary', resume_uuid: 'u-9' }]);
    const parsed = JSON.parse(JSON.stringify(roster));
    expect(parsed[0]).toMatchObject({ role: 'adam', callsign: 'Adam-1', accountProfile: 'canary' });
  });

  it('excludes enabled=false slots and drops nameless ones; defaults missing role to worker', () => {
    const roster = slotsToRoster([
      { name: 'Keep', enabled: true, resume_uuid: 'u-k' },       // no role -> worker
      { name: 'Drop', enabled: false },                           // disabled -> excluded
      { name: null, role: 'worker' },                             // nameless -> dropped
    ]);
    expect(roster).toEqual([{ role: 'worker', callsign: 'Keep', accountProfile: null, resume_uuid: 'u-k' }]);
  });
});
