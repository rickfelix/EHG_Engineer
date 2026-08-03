/**
 * SD-LEO-INFRA-RELEASED-MID-PHASE-001 / FR-4 — THE CONTROL MUST REFUSE IN BOTH DIRECTIONS.
 *
 * The SD's own acceptance (c): "a deliberately held row stays held and does NOT get re-dispatched
 * by FR-2 — the control must refuse in both directions." A control that only fires one way admits
 * a field that lies: if every row is adopted, "adopted" carries no information; if every row is
 * refused, neither does "refused".
 *
 * WHY THE ROSTER IS ITERATED RATHER THAN LISTED. A test that hard-codes the axis names is the
 * defect this SD keeps meeting: it agrees with the implementation on the day it is written and
 * drifts silently afterwards. That is not hypothetical here — the first probe written for this SD
 * hard-coded a GUESSED hold-key list and over-counted the orphan class by 50% (reported 6, actual
 * 4), and a later review found the PRD itself had named six axes when there are EIGHTEEN, two of
 * which were not axes at all. So the roster is DERIVED from the axis functions' own names, and this
 * suite iterates it: adding a nineteenth axis fails here until a case exists for it.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  INELIGIBILITY_AXIS_NAMES,
  classifyAllDispatchIneligibility,
} = require('../../../lib/fleet/claim-eligibility.cjs');
const { heldReason, reachableBy, classifyRow } = await import('../../../scripts/audit-unreachable-midphase-sds.mjs');

const CTX = { cwd: process.cwd() };

/** A plain unclaimed mid-phase row — the shape FR-2 widened the adoption tier to reach. */
const orphan = (over = {}) => ({
  sd_key: 'SD-TWO-SIDED-PROBE-001',
  status: 'active',
  current_phase: 'PLAN_PRD',
  sd_type: 'infrastructure',
  metadata: {},
  updated_at: '2026-08-01T00:00:00',
  ...over,
});

/**
 * Rows that trigger each axis. Keyed by the axis FUNCTION NAME so the iteration below can prove
 * coverage. An axis with no entry is NOT silently skipped — it fails the roster test.
 *
 * `null` means: this axis is UNREACHABLE at the adoption call site, which passes only {cwd}.
 * Asserting it blocks would be asserting against a call it never receives; the honest test is the
 * inverse — that it no-ops here. Recorded per-axis with the reason rather than omitted.
 */
const AXIS_FIXTURES = {
  orchestratorParent: { row: orphan({ sd_type: 'orchestrator' }), blocks: true },
  testFixtureKey: { row: orphan({ sd_key: 'SD-TEST-FIXTURE-001' }), blocks: true },
  humanActionRequired: { row: orphan({ metadata: { requires_human_action: true } }), blocks: true },
  notBeforeHold: { row: orphan({ metadata: { not_before: '2099-01-01T00:00:00Z' } }), blocks: true },
  oneWayDoor: { row: orphan({ metadata: { door_class_note: 'one_way' } }), blocks: true },
  coAuthorPending: { row: orphan({ metadata: { co_author_pending: true } }), blocks: true },
  chairmanRatificationPending: { row: orphan({ metadata: { chairman_ratified: false } }), blocks: true },
  needsCoordinatorReview: { row: orphan({ metadata: { needs_coordinator_review: true } }), blocks: true },
  leadBlockerActive: { row: orphan({ metadata: { lead_blocker: { reason: 'awaiting chairman' } } }), blocks: true },
  testCloneBuildTree: { row: orphan({ sd_key: 'SD-DEMO-CLONE-001' }), blocks: true },
  // NOT a metadata flag — I guessed one and the iteration caught it. The real predicate is an
  // SD-key PREFIX plus a target_application pointing outside this repo, which is exactly the kind
  // of detail a hard-coded roster would have let me get wrong silently.
  unactionableVentureRemediation: {
    row: orphan({ sd_key: 'SD-LEO-FIX-REMEDIATION-001', target_application: 'ehg' }),
    blocks: true,
  },
  sdDeferred: { row: orphan({ status: 'deferred' }), blocks: true },
  sdTerminal: { row: orphan({ status: 'completed' }), blocks: true },
  // Unreachable at this call site — the adoption path passes ctx={cwd} only.
  coordinatorReservation: { row: null, why: 'seat-scoped; drain-reservations deliberately runs AFTER adopt-orphan so orphan recovery is unaffected' },
  tierAxes: { row: null, why: 'requires tier context the adoption call site does not supply' },
  workClassAxes: { row: null, why: 'requires work-class context the adoption call site does not supply' },
  fitnessAxes: { row: null, why: 'checkout-dependent; not derivable from the row alone' },
  inflightGitAxes: { row: null, why: 'requires git state the adoption call site does not supply' },
};

describe('FR-4: every ineligibility axis is accounted for (roster is DERIVED, not listed)', () => {
  it('the roster is non-trivial and comes from the axis functions themselves', () => {
    expect(INELIGIBILITY_AXIS_NAMES.length).toBeGreaterThan(10);
    expect(Object.isFrozen(INELIGIBILITY_AXIS_NAMES)).toBe(true);
  });

  it('EVERY axis in the live roster has an explicit disposition — adding one fails until covered', () => {
    const uncovered = INELIGIBILITY_AXIS_NAMES.filter((n) => !(n in AXIS_FIXTURES));
    expect(uncovered, `axes with no case: ${uncovered.join(', ')}`).toEqual([]);
  });

  it('no fixture names an axis that no longer exists (drift in the other direction)', () => {
    const stale = Object.keys(AXIS_FIXTURES).filter((n) => !INELIGIBILITY_AXIS_NAMES.includes(n));
    expect(stale, `fixtures for removed axes: ${stale.join(', ')}`).toEqual([]);
  });

  for (const name of Object.keys(AXIS_FIXTURES)) {
    const fx = AXIS_FIXTURES[name];
    if (fx.blocks) {
      it(`REFUSES on ${name}`, () => {
        expect(heldReason(fx.row), `${name} should hold the row`).toBeTruthy();
        expect(classifyRow(fx.row).unreachable_and_unheld).toBe(false);
      });
    } else {
      it(`no-ops at this call site: ${name} (${fx.why})`, () => {
        // The honest assertion for an axis the adoption path cannot feed: a bare orphan is NOT
        // held by it. Asserting it blocks would test a call the code never makes.
        expect(classifyAllDispatchIneligibility(orphan(), CTX) || []).not.toContain(name);
      });
    }
  }
});

describe('FR-4: the OTHER direction — a genuine orphan is still adopted', () => {
  // In the SAME suite, deliberately. If the refusals above ever became blanket, this fails —
  // which is the only thing that distinguishes a working control from a stuck one.
  it('an unclaimed active mid-phase row with no hold IS reachable', () => {
    const row = orphan();
    expect(heldReason(row)).toBeNull();
    expect(reachableBy(row)).toBe('resume_orphan');
    expect(classifyRow(row).unreachable_and_unheld).toBe(false);
  });

  it('the pre-fix shape is what the widening changed — status=active was reachable by NOTHING', () => {
    // Reconstructs the defect: with the adoption tier restricted to in_progress, an active
    // mid-phase row was vetoed by the draft tier's phase check and ignored by the orphan tier.
    const row = orphan();
    const preFixReachable = (r) =>
      (r.status === 'pending_approval' && r.current_phase === 'LEAD_FINAL') ? 'resume_final'
        : (r.status === 'in_progress') ? 'resume_orphan'
        : (!r.current_phase || r.current_phase === 'LEAD') ? 'draft_tier'
        : null;
    expect(preFixReachable(row)).toBeNull();     // the bug
    expect(reachableBy(row)).toBe('resume_orphan'); // the fix
  });

  it('pending_approval/LEAD_FINAL still belongs to resume_final — no double-dispatch', () => {
    const row = orphan({ status: 'pending_approval', current_phase: 'LEAD_FINAL' });
    expect(reachableBy(row)).toBe('resume_final');
  });
});
