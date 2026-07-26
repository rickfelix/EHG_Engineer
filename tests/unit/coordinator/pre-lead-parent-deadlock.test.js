/**
 * QF-20260725-613 item 1 — the PRE-LEAD ORCHESTRATOR PARENT deadlock detector.
 *
 * THE DEADLOCK: a parent decomposed into children BEFORE its own LEAD-TO-PLAN ran is
 * unreachable by every automated path — dispatch refuses orchestrator parents, worker-checkin
 * filters them out of every self-claim pool, children stay parent_lead_pending until the parent
 * moves PAST LEAD, and sd-start's descent finds no buildable leaf.
 *
 * WHY THE DETECTOR MATTERS MORE THAN THE CYCLE: the cycle was SILENT. Six seats idled for hours
 * while every gauge read clean — including unranked_claimable_leaves=0 — because the blocked leaf
 * was excluded from the claimable population BY THE VERY FENCE THAT BLOCKED IT. A gauge that
 * cannot see the blocked item reports zero blocked items.
 *
 * So the controls here are the point: a detector that can only be shown NOT to fire is
 * indistinguishable from one that never fires, and that is precisely the failure it exists to
 * catch. Every negative case below is paired with the positive.
 */
import { describe, it, expect } from 'vitest';
import detectors from '../../../lib/coordinator/detectors.cjs';

const { detectPreLeadParentDeadlock, runDetectors } = detectors;

const PARENT_ID = 'a39d0d4c-0000-0000-0000-000000000000';

/** Shaped after the real SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001 family. */
function family({ parentPhase = 'LEAD', parentStatus = 'draft', childStatuses = ['draft', 'draft'] } = {}) {
  return [
    {
      id: PARENT_ID,
      sd_key: 'SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001',
      sd_type: 'orchestrator',
      parent_sd_id: null,
      current_phase: parentPhase,
      status: parentStatus,
      claiming_session_id: null,
    },
    ...childStatuses.map((status, i) => ({
      id: `child-${i}`,
      sd_key: `SD-LEO-INFRA-SESSION-SPAWN-AND-PROMPT-LIBRARY-001-${'ABCDEF'[i]}`,
      sd_type: 'infrastructure',
      parent_sd_id: PARENT_ID,
      current_phase: 'LEAD',
      status,
      claiming_session_id: null,
    })),
  ];
}

describe('QF-613: detectPreLeadParentDeadlock — the armed case', () => {
  it('FIRES on a pre-LEAD orchestrator parent with non-terminal children', () => {
    const r = detectPreLeadParentDeadlock({ sds: family() });
    expect(r.matched).toBe(true);
    expect(r.reason).toBe('pre_lead_parent_deadlock');
    expect(r.evidence.parent_count).toBe(1);
    expect(r.evidence.blocked_child_total).toBe(2);
    expect(r.evidence.parents[0].parent_sd_key).toContain('SESSION-SPAWN-AND-PROMPT-LIBRARY-001');
    // The evidence must carry the action, because handoff.js needs no claim and no seat —
    // a reader who cannot see the remedy is back to "nobody can reach this parent".
    expect(r.evidence.remedy).toContain('handoff.js execute LEAD-TO-PLAN');
  });

  it('FIRES at LEAD_APPROVAL too — the fence spans both pre-LEAD phases', () => {
    expect(detectPreLeadParentDeadlock({ sds: family({ parentPhase: 'LEAD_APPROVAL' }) }).matched).toBe(true);
  });
});

describe('QF-613: the controls — it must be able to say NO', () => {
  it('does NOT fire once the parent is PAST lead (the exclusions are correct there)', () => {
    // This is the post-LEAD parent the design intends: claimless while children build.
    const r = detectPreLeadParentDeadlock({ sds: family({ parentPhase: 'PLAN_PRD', parentStatus: 'in_progress' }) });
    expect(r.matched).toBe(false);
    expect(r.reason).toBe('no_pre_lead_parent_with_blocked_children');
  });

  it('does NOT fire when every child is terminal — nothing is actually blocked', () => {
    const r = detectPreLeadParentDeadlock({ sds: family({ childStatuses: ['cancelled', 'completed'] }) });
    expect(r.matched).toBe(false);
  });

  it('does NOT fire for a pre-LEAD parent with NO children (not yet decomposed)', () => {
    const r = detectPreLeadParentDeadlock({ sds: family({ childStatuses: [] }) });
    expect(r.matched).toBe(false);
  });

  it('does NOT fire for a non-orchestrator parent-shaped row', () => {
    const sds = family();
    sds[0].sd_type = 'infrastructure';
    expect(detectPreLeadParentDeadlock({ sds }).matched).toBe(false);
  });

  it('reports no_sd_data rather than a false clean when the input is absent', () => {
    // Distinguishing "nothing blocked" from "I could not see" is the whole lesson of this QF.
    expect(detectPreLeadParentDeadlock({}).reason).toBe('no_sd_data');
    expect(detectPreLeadParentDeadlock({ sds: [] }).reason).toBe('no_sd_data');
  });
});

describe('QF-613: it is WIRED, not merely exported', () => {
  it('runDetectors emits PRE_LEAD_PARENT_DEADLOCK for the armed family', () => {
    // A detector nobody dispatches is the defect one level up. Pin the registration.
    const matches = runDetectors({ sds: family() }, { now: Date.now() });
    const hit = matches.find((m) => m.event_type === 'PRE_LEAD_PARENT_DEADLOCK');
    expect(hit).toBeTruthy();
    expect(hit.severity).toBe('warning');
  });

  it('runDetectors does NOT emit it for a past-LEAD parent', () => {
    const matches = runDetectors({ sds: family({ parentPhase: 'PLAN_PRD' }) }, { now: Date.now() });
    expect(matches.find((m) => m.event_type === 'PRE_LEAD_PARENT_DEADLOCK')).toBeFalsy();
  });
});
