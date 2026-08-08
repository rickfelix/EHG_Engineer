/**
 * The evidence helper must answer from the GATE, not from a replica of its policy.
 * QF-20260807-736 (remainder of QF-20260804-048).
 *
 * WHY THIS EXISTS. The helper restated gate policy as its own frozen ACCEPTED_VERDICTS list and
 * decided acceptance with `accepted.includes(verdict)`. A replica agrees with the authority only
 * until one side changes, and this one had ALREADY DRIFTED: the gate classifies an UNRECOGNISED
 * verdict as accepted — fail-open with a warning (subagent-evidence-gate.js:430) — while the
 * helper rejected it. A worker asking the helper got a red the gate would have passed. That is
 * silent drift in the direction nobody checks: not a false green, a false BLOCKER.
 *
 * WHY askGate DOES NOT CALL validateSubagentEvidence. That function is the authority but it is
 * EFFECTFUL — it logs a gate banner and, under LEO_DISABLE_SUBAGENT_EVIDENCE_GATE, INSERTS an
 * audit_log gate_bypass row. Re-running an instrument to display its answer re-runs its side
 * effects, so a worker's "would this pass?" would forge a record of a bypass that never happened.
 * askGate therefore consumes the gate's PURE exports (REQUIRED_SUBAGENTS, classifyVerdict) — the
 * authority's own policy, one representation, zero writes. The last test pins that.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ACCEPTED_VERDICTS, askGate, hasEvidenceFor } from '../../../lib/sub-agents/evidence-status.js';
import { REQUIRED_SUBAGENTS, _internals } from '../../../scripts/modules/handoff/gates/subagent-evidence-gate.js';

const SD_UUID = 'd0129bf6-1b4d-49be-a7be-97b761029f55';

/** Minimal fake: resolves the SD, then returns the given evidence rows. Records every insert. */
function makeSupabase(rows, capture = { inserts: [] }) {
  return {
    capture,
    from(table) {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: SD_UUID }, error: null }) }) }) };
      }
      if (table === 'audit_log') {
        return { insert: async (r) => { capture.inserts.push(r); return { data: null, error: null }; } };
      }
      const q = {
        select: () => q,
        eq: () => q,
        gte: () => q,
        order: () => Promise.resolve({ data: rows, error: null }),
        then: (res) => Promise.resolve({ data: rows, error: null }).then(res)
      };
      return q;
    }
  };
}

const row = (code, verdict) => ({ id: `${code}-1`, sub_agent_code: code, verdict, phase: 'LEAD', created_at: '2099-01-01T00:00:00Z' });

describe('QF-20260807-736: ask the gate, do not replicate it', () => {
  afterEach(() => { delete process.env.LEO_DISABLE_SUBAGENT_EVIDENCE_GATE; vi.restoreAllMocks(); });

  it('ACCEPTED_VERDICTS is DERIVED from the gate, not restated', () => {
    // Pins the single-representation contract: re-hardcoding a divergent list reds this.
    expect([...ACCEPTED_VERDICTS]).toEqual([..._internals.ACCEPT_VERDICTS]);
  });

  it('THE DRIFT: an unrecognised verdict is accepted, matching the gate fail-open', async () => {
    // The regression this file exists for. Pre-fix, `includes()` rejected it while the gate
    // accepted it — the helper manufactured a blocker the gate would never have raised.
    const required = REQUIRED_SUBAGENTS['LEAD-TO-PLAN'];
    const rows = required.map((c) => row(c, 'SOME_NEW_VERDICT'));
    const r = await hasEvidenceFor(SD_UUID, required, { supabase: makeSupabase(rows) });

    expect(r.rejected, 'an unknown verdict was rejected — stricter than the gate is still wrong').toEqual([]);
    expect(r.satisfied).toBe(true);
  });

  it('CONTROL: a genuinely REJECTing verdict is still rejected', async () => {
    // Two-sided. Without this, "accept unknown" could have become "accept everything", which
    // would satisfy the drift test while destroying the gate's actual purpose.
    const required = REQUIRED_SUBAGENTS['LEAD-TO-PLAN'];
    const rows = required.map((c, i) => row(c, i === 0 ? 'FAIL' : 'PASS'));
    const r = await hasEvidenceFor(SD_UUID, required, { supabase: makeSupabase(rows) });

    expect(r.satisfied, 'a FAIL row was treated as satisfying the gate').toBe(false);
    expect(r.rejected.map((x) => x.verdict)).toContain('FAIL');
  });

  it('askGate uses the GATE\'s required set for the handoff type', async () => {
    const required = REQUIRED_SUBAGENTS['LEAD-TO-PLAN'];
    const rows = required.map((c) => row(c, 'PASS'));
    const r = await askGate(SD_UUID, 'LEAD-TO-PLAN', { supabase: makeSupabase(rows) });

    expect(r.required).toEqual([...required]);
    expect(r.wouldPass).toBe(true);
    expect(r.handoffType).toBe('LEAD-TO-PLAN');
  });

  it('askGate THROWS on an unknown handoff type instead of answering "you pass"', async () => {
    // The false-zero this module exists to abolish, wearing a different name: an unrecognised
    // handoff must never resolve to an empty requirement set and a confident green.
    await expect(
      askGate(SD_UUID, 'NOT-A-REAL-HANDOFF', { supabase: makeSupabase([]) })
    ).rejects.toThrow(/unknown handoff type/i);
  });

  it('askGate reports the MISSING agents rather than a bare false', async () => {
    const required = REQUIRED_SUBAGENTS['LEAD-TO-PLAN'];
    const r = await askGate(SD_UUID, 'LEAD-TO-PLAN', { supabase: makeSupabase([row(required[0], 'PASS')]) });

    expect(r.wouldPass).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r.present).toContain(required[0]);
  });

  it('NO SIDE EFFECTS: asking never writes an audit_log row, even with the kill-switch set', async () => {
    // The reason askGate consumes pure exports instead of calling validateSubagentEvidence: that
    // path inserts a gate_bypass audit row when this env var is set. A read-only question must
    // not forge evidence of a bypass that did not happen.
    process.env.LEO_DISABLE_SUBAGENT_EVIDENCE_GATE = '1';
    const capture = { inserts: [] };
    const required = REQUIRED_SUBAGENTS['LEAD-TO-PLAN'];
    const sb = makeSupabase(required.map((c) => row(c, 'PASS')), capture);

    await askGate(SD_UUID, 'LEAD-TO-PLAN', { supabase: sb });

    expect(capture.inserts, 'asking the gate forged an audit_log record').toEqual([]);
  });
});
