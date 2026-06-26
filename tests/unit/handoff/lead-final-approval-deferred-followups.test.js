import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDeferredFollowupsGate,
  parseDeferredFollowups,
  gatherCompletionText,
} from '../../../scripts/modules/handoff/executors/lead-final-approval/gates/deferred-followups-gate.js';

// SD-LEO-INFRA-COMPLETION-GATE-DEFERRED-HOME-001: completion-integrity gate unit tests.

// Minimal Supabase stub: maps sd_key -> {sd_key,status} (or null = not found).
function makeSupabase(rowsByKey) {
  return {
    from() {
      let _key = null;
      const builder = {
        select() { return builder; },
        eq(_col, val) { _key = val; return builder; },
        async maybeSingle() {
          const row = rowsByKey[_key];
          return { data: row || null, error: null };
        },
      };
      return builder;
    },
  };
}

describe('parseDeferredFollowups', () => {
  it('parses array, JSON string, and falls back to []', () => {
    expect(parseDeferredFollowups([{ follow_up_sd_key: 'SD-X-001' }])).toHaveLength(1);
    expect(parseDeferredFollowups('[{"follow_up_sd_key":"SD-X-001"}]')).toHaveLength(1);
    expect(parseDeferredFollowups('not json')).toEqual([]);
    expect(parseDeferredFollowups(undefined)).toEqual([]);
  });
});

describe('DEFERRED_FOLLOWUPS_HOME gate', () => {
  let restoreEnv;
  beforeEach(() => {
    const prev = process.env.DEFERRED_HOME_GATE_DISABLED;
    restoreEnv = () => { process.env.DEFERRED_HOME_GATE_DISABLED = prev; };
    delete process.env.DEFERRED_HOME_GATE_DISABLED;
  });

  it('FR-2: BLOCKS when a declared follow-up SD does not exist', async () => {
    const gate = createDeferredFollowupsGate(makeSupabase({}));
    const ctx = { sd: { id: 'id-1', metadata: { deferred_followups: [{ description: 'x', follow_up_sd_key: 'SD-MISSING-001' }] } } };
    const r = await gate.validator(ctx);
    expect(r.passed).toBe(false);
    expect(r.issues[0]).toMatch(/SD-MISSING-001.*does NOT exist/);
    restoreEnv();
  });

  it('FR-2: BLOCKS when the declared follow-up SD is cancelled', async () => {
    const gate = createDeferredFollowupsGate(makeSupabase({ 'SD-DEAD-001': { sd_key: 'SD-DEAD-001', status: 'cancelled' } }));
    const ctx = { sd: { id: 'id-1', metadata: { deferred_followups: [{ follow_up_sd_key: 'SD-DEAD-001' }] } } };
    const r = await gate.validator(ctx);
    expect(r.passed).toBe(false);
    expect(r.issues[0]).toMatch(/cancelled/i);
    restoreEnv();
  });

  it('FR-2: PASSES when every declared follow-up SD exists and is live', async () => {
    const gate = createDeferredFollowupsGate(makeSupabase({ 'SD-HOME-001': { sd_key: 'SD-HOME-001', status: 'draft' } }));
    const ctx = { sd: { id: 'id-1', metadata: { deferred_followups: [{ follow_up_sd_key: 'SD-HOME-001' }] } } };
    const r = await gate.validator(ctx);
    expect(r.passed).toBe(true);
    expect(r.issues).toEqual([]);
    restoreEnv();
  });

  it('BLOCKS when a deferred entry has no follow_up_sd_key', async () => {
    const gate = createDeferredFollowupsGate(makeSupabase({}));
    const ctx = { sd: { id: 'id-1', metadata: { deferred_followups: [{ description: 'orphan deferral' }] } } };
    const r = await gate.validator(ctx);
    expect(r.passed).toBe(false);
    expect(r.issues[0]).toMatch(/missing follow_up_sd_key/);
    restoreEnv();
  });

  it('no-deferral SD passes cleanly (byte-identical to today)', async () => {
    const gate = createDeferredFollowupsGate(makeSupabase({}));
    const ctx = { sd: { id: 'id-1', metadata: {}, description: 'a normal SD' } };
    const r = await gate.validator(ctx);
    expect(r.passed).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.warnings).toEqual([]);
    restoreEnv();
  });

  it('FR-3: heuristic-WARNS (non-blocking) on an unstructured deferral phrase with no declaration', async () => {
    const gate = createDeferredFollowupsGate(makeSupabase({}));
    const ctx = { sd: { id: 'id-1', metadata: { completion_notes: 'The X feature was deferred to follow-up.' } } };
    const r = await gate.validator(ctx);
    expect(r.passed).toBe(true);            // non-blocking
    expect(r.warnings.join(' ')).toMatch(/deferred to follow-up/);
    restoreEnv();
  });

  it('FR-4: DEFERRED_HOME_GATE_DISABLED=true => pass-through even with a missing home', async () => {
    process.env.DEFERRED_HOME_GATE_DISABLED = 'true';
    const gate = createDeferredFollowupsGate(makeSupabase({}));
    const ctx = { sd: { id: 'id-1', metadata: { deferred_followups: [{ follow_up_sd_key: 'SD-MISSING-001' }] } } };
    const r = await gate.validator(ctx);
    expect(r.passed).toBe(true);
    restoreEnv();
  });

  it('gathers completion text from multiple metadata fields', () => {
    const text = gatherCompletionText({ description: 'A', metadata: { completion_notes: 'B', completion_summary: 'C' } });
    expect(text).toContain('a');
    expect(text).toContain('b');
    expect(text).toContain('c');
  });
});
