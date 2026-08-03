// SD-LEO-INFRA-RESUME-FINAL-READ-001 (FR-1, FR-2) — the adopt path must READ holds before claiming.
//
// THE INCIDENT THIS PINS. On 2026-08-03 a worker's /checkin adopted
// SD-FDBK-ENH-LEARNING-LOOP-DESTROYS-001 out of pending_approval/LEAD_FINAL and resume_final
// auto-chained it through LEAD-FINAL-APPROVAL — while its PR was OPEN and its migration unapplied.
// A hold note predicting exactly that had been written to the row minutes earlier. The adopt path
// read nothing, so a correct warning was invisible to the mechanism it was written for.
//
// THE DEFECT WAS A BYPASS, NOT A MISSING MECHANISM — which is why these tests assert the shared
// classifier is consulted rather than that some new check exists. classifyDispatchIneligibility
// already gated the orphan-adopt tier, the draft tier and the coordinator sweep;
// recoverStrandedFinal was the one lane that claimed unguarded.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const checkin = require_('../../../scripts/worker-checkin.cjs');
const { recoverStrandedFinal, describeSoftHolds } = checkin;

const OLD = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // safely past STRANDED_MIN_AGE_MS

/**
 * Chainable Supabase stub. Query-builder methods return `this`; awaiting resolves to the payload
 * configured for the table. Permissive by default so tryClaim's helper fan-out (fence probe, track
 * resolution, claim stamp) does not need individual stubbing — only the two things under assertion
 * are pinned: which rows the scan returns, and which sd_key reaches claim_sd.
 */
function fakeSb({ stranded = [], claimed = [] }) {
  const payloads = { strategic_directives_v2: stranded };
  const make = (table) => {
    const b = {
      select: () => b, eq: () => b, is: () => b, lt: () => b, gt: () => b,
      order: () => b, limit: () => b, in: () => b, neq: () => b, not: () => b,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
      update: () => b, insert: () => b, upsert: () => b,
      then: (res) => res({ data: payloads[table] ?? [], error: null }),
    };
    return b;
  };
  return {
    from: (t) => make(t),
    rpc: async (fn, args) => {
      if (fn === 'claim_sd') { claimed.push(args.p_sd_id); return { data: { success: true }, error: null }; }
      return { data: null, error: null };
    },
  };
}

const row = (sd_key, metadata = null) => ({
  sd_key, status: 'pending_approval', current_phase: 'LEAD_FINAL',
  updated_at: OLD, metadata, sd_type: 'infrastructure',
  target_application: 'EHG_Engineer', parent_sd_id: null,
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('FR-1 — a structurally fenced row is REFUSED, and the refusal is loud', () => {
  it('does not claim a row carrying requires_human_action', async () => {
    const claimed = [];
    const sb = fakeSb({ stranded: [row('SD-FENCED-001', { requires_human_action: true })], claimed });
    const r = await recoverStrandedFinal(sb, 'sess-1', {});
    // The load-bearing assertion: the fenced key never reached the claim RPC.
    expect(claimed).not.toContain('SD-FENCED-001');
    expect(r?.action).not.toBe('resume_final');
  });

  it('SAYS WHY rather than returning a bare idle — silence is what let the original hold pass unread', async () => {
    const sb = fakeSb({ stranded: [row('SD-FENCED-001', { requires_human_action: true })] });
    const r = await recoverStrandedFinal(sb, 'sess-1', {});
    expect(r).not.toBeNull();
    expect(r.skipped_fenced).toEqual(expect.arrayContaining([expect.stringContaining('SD-FENCED-001')]));
    // Asserted on the MESSAGE, not only a field: an operator reads the message.
    expect(r.message).toMatch(/FENCED/);
    expect(r.message).toMatch(/refusal, not an absence/);
  });

  it('reaches an eligible row PAST a fenced one, and reports what it skipped', async () => {
    const claimed = [];
    const sb = fakeSb({
      stranded: [row('SD-FENCED-001', { requires_human_action: true }), row('SD-OK-002')],
      claimed,
    });
    const r = await recoverStrandedFinal(sb, 'sess-1', {});
    expect(r?.action).toBe('resume_final');
    expect(r.sd).toBe('SD-OK-002');
    expect(claimed).toEqual(['SD-OK-002']);
    expect(r.message).toMatch(/Skipped 1 fenced row/);
  });
});

describe('FR-1 negative control — the fix teaches the chain to LOOK, it does not turn it off', () => {
  // Without this, "nothing was adopted" would read as success and a fix that simply disabled
  // resume_final would satisfy every test above.
  it('an UNFENCED stranded row is still adopted exactly as before', async () => {
    const claimed = [];
    const sb = fakeSb({ stranded: [row('SD-PLAIN-003')], claimed });
    const r = await recoverStrandedFinal(sb, 'sess-1', {});
    expect(r?.action).toBe('resume_final');
    expect(r.sd).toBe('SD-PLAIN-003');
    expect(claimed).toEqual(['SD-PLAIN-003']);
  });

  it('a row with no metadata at all is adopted (null metadata must not be read as a hold)', async () => {
    const claimed = [];
    const sb = fakeSb({ stranded: [row('SD-NULLMETA-004', null)], claimed });
    expect((await recoverStrandedFinal(sb, 'sess-1', {}))?.action).toBe('resume_final');
    expect(claimed).toEqual(['SD-NULLMETA-004']);
  });
});

describe('FR-2 — a soft hold does not refuse, but it is never INVISIBLE', () => {
  it('adopts the row AND surfaces the hold note in the message text', async () => {
    // The exact metadata shape written to the incident row, so this pins the real case.
    const hold = {
      hold_do_not_finalize_20260803: {
        state: 'HOLD — do NOT run LEAD-FINAL-APPROVAL',
        blocked_on: 'chairman verbal on migration blob',
      },
    };
    const claimed = [];
    const sb = fakeSb({ stranded: [row('SD-SOFT-005', hold)], claimed });
    const r = await recoverStrandedFinal(sb, 'sess-1', {});
    expect(r?.action).toBe('resume_final');           // soft holds do not refuse …
    expect(claimed).toEqual(['SD-SOFT-005']);
    expect(r.message).toMatch(/SOFT HOLD/);           // … but they are impossible to miss
    expect(r.message).toMatch(/do NOT run LEAD-FINAL-APPROVAL/);
    expect(r.soft_holds).toHaveLength(1);
  });
});

describe('describeSoftHolds', () => {
  it('matches by hold_ PREFIX, not an enumerated allowlist', () => {
    // Deliberate: the note that would have prevented the incident was named by its author on the
    // day. A fixed key list would not have contained it, which is the whole point.
    const out = describeSoftHolds({ metadata: { hold_something_nobody_planned_for: 'careful' } });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/careful/);
  });

  it('ignores non-hold keys and missing metadata', () => {
    expect(describeSoftHolds({ metadata: { requires_human_action: true, notes: 'x' } })).toEqual([]);
    expect(describeSoftHolds({})).toEqual([]);
    expect(describeSoftHolds({ metadata: null })).toEqual([]);
  });

  it('reads string holds and object holds without requiring a schema', () => {
    expect(describeSoftHolds({ metadata: { hold_a: 'plain string' } })[0]).toMatch(/plain string/);
    expect(describeSoftHolds({ metadata: { hold_b: { reason: 'via reason' } } })[0]).toMatch(/via reason/);
    // No recognised field: still surfaced rather than dropped — an unreadable hold is still a hold.
    expect(describeSoftHolds({ metadata: { hold_c: { odd: 1 } } })[0]).toMatch(/odd/);
  });
});
