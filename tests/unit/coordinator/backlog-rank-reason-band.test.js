/**
 * SD-LEO-INFRA-ADAM-WORK-SELECTION-001 / FR-2 — the reason band must be able to FALSIFY
 * "we are working the plan".
 *
 * deriveReasonBand is exported and pure and had NO TEST AT ALL: 30 test files reference
 * coordinator-backlog-rank.mjs, none imported it. That absence is why an unconditional
 * `return 'now-wave-remainder'` fallthrough survived — the residual bucket was indistinguishable
 * from a derived fact, so a HIGH now-wave-remainder share was the null hypothesis being reported
 * as plan adherence. Measured 2026-07-28 over 134 stamped SDs: 86 of 104 stamped
 * now-wave-remainder were linked to NO wave.
 */
import { describe, it, expect } from 'vitest';
import { deriveReasonBand } from '../../../scripts/coordinator-backlog-rank.mjs';
import { classifyDispatchReason } from '../../../lib/oversight/coordinator-health-sharpenings.mjs';

describe('FR-2: deriveReasonBand cannot produce now-wave-remainder by fallthrough', () => {
  it('an SD with NO provenance and NO roadmap markers is unclassified, NOT roadmap-remainder', () => {
    // The load-bearing assertion. Before the fix this returned 'now-wave-remainder', which is what
    // made 82.7% of stamped rows claim roadmap work while linked to nothing.
    expect(deriveReasonBand({ sd_key: 'SD-PLAIN-001', metadata: {} })).toBe('unclassified');
    expect(deriveReasonBand({ sd_key: 'SD-PLAIN-001', metadata: { source: 'somewhere-else' } })).toBe('unclassified');
    expect(deriveReasonBand({})).toBe('unclassified');
  });

  it('now-wave-remainder requires ROADMAP EVIDENCE on the row', () => {
    for (const md of [
      { wave_id: 'w-1' },
      { roadmap_item_id: 'ri-1' },
      { promoted_from_roadmap: true },
      { plan_key: 'PLAN-1' },
      { wave_disposition: 'selected' },
      { source: 'roadmap_item' },
      { source: 'plan' },
    ]) {
      expect(deriveReasonBand({ sd_key: 'SD-X-001', metadata: md })).toBe('now-wave-remainder');
    }
  });

  it('the existing provenance vocabulary is unchanged (no regression)', () => {
    expect(deriveReasonBand({ sd_key: 'SD-X-001', metadata: { provenance: 'chairman directive' } })).toBe('chairman-directed');
    expect(deriveReasonBand({ sd_key: 'SD-FDBK-X-001', metadata: {} })).toBe('feedback');
    expect(deriveReasonBand({ sd_key: 'SD-X-001', metadata: { provenance: 'rca corrective' } })).toBe('incident');
  });

  it('chairman/feedback/incident still WIN over roadmap markers (precedence unchanged)', () => {
    // Guards against the roadmap-evidence branch being placed too early in a future edit.
    expect(deriveReasonBand({ sd_key: 'SD-X-001', metadata: { provenance: 'chairman', wave_id: 'w-1' } })).toBe('chairman-directed');
  });
});

describe('FR-2: observed linkage BEATS the self-asserted stamp', () => {
  it('a row with a real wave_id classifies from LINKAGE even when the stamp contradicts it', () => {
    // Before the fix the stamp short-circuited first, so stamping made the gauge STRICTLY BLINDER
    // than the heuristics it was meant to improve.
    expect(classifyDispatchReason({
      sd_key: 'SD-PLAIN-001',
      metadata: { wave_id: 'w-1', dispatch_reason_band: 'incident' },
    })).toBe('now_wave_remainder');
  });

  it('the stamp still governs when there is NO linkage to observe (back-compat)', () => {
    expect(classifyDispatchReason({ sd_key: 'SD-PLAIN-001', metadata: { dispatch_reason_band: 'incident' } })).toBe('incident');
    // Legacy rows stamped before this change are still understood — the reader was NOT renamed in
    // lockstep with the writer on purpose, so historical stamps keep classifying as they did.
    expect(classifyDispatchReason({ sd_key: 'SD-PLAIN-001', metadata: { dispatch_reason_band: 'now-wave-remainder' } })).toBe('now_wave_remainder');
  });

  it('the new unclassified band is recognised by the reader, not silently degraded to other', () => {
    // Writer and reader keep two independent string lists in two files; if this drifts, every
    // unclassifiable row falls through to 'other' and the split becomes invisible.
    expect(classifyDispatchReason({ sd_key: 'SD-PLAIN-001', metadata: { dispatch_reason_band: 'unclassified' } })).toBe('unclassified');
  });
});
