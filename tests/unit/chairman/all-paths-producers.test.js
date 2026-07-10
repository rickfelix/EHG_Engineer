/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-SURFACING-001 FR-6 — ALL-PATHS producer enumeration.
 *
 * Every producer that inserts pending chairman decisions is enumerated in PRODUCERS below
 * with the row shape it mints. The invariant: a pending BLOCKING row from EVERY producer
 * reaches escalation via at least one of the two paths —
 *   creation-path: routed through recordPendingDecision → widened shouldAutoEscalate
 *   sweep-path:    direct insert → scheduled sweep's selectBlockingSweepRows selection
 * The Stage-0 ready-venture pause (blocking stage_gate row, paused venture) is the pinned
 * regression fixture: with escalation formerly gated on raisedBy==='adam' and the SLA
 * machinery never dispatched, exactly this shape died silently.
 *
 * Adding a new producer that inserts into chairman_decisions? Add it to PRODUCERS — the
 * count pin below makes an unenumerated producer visible in review.
 */
import { describe, it, expect } from 'vitest';
import { shouldAutoEscalate } from '../../../lib/chairman/record-pending-decision.mjs';
import { selectBlockingSweepRows } from '../../../scripts/cron/chairman-decision-sla-sweep.mjs';
import { isEscalationActionable, isConsoleActionable, TELEMETRY_DECISION_TYPES } from '../../../lib/chairman/chairman-actionable.mjs';

const NOW = Date.parse('2026-07-11T15:00:00Z');
const AGED = new Date(NOW - 2 * 60 * 60 * 1000).toISOString(); // 2h old — past any grace period
const CUTOFF = '2026-07-10T00:00:00Z';
const GRACE = 30 * 60 * 1000;

/** One entry per producer class that mints pending chairman_decisions rows (enumerated 2026-07-10). */
const PRODUCERS = [
  // —— routed through recordPendingDecision (creation-path escalation) ——
  { producer: 'lib/adam/stall-alert.js', path: 'creation', shape: { decision_type: 'session_question', blocking: true, raised_by: 'adam' } },
  { producer: 'scripts/coordinator-escalate-question.mjs (critical)', path: 'creation', shape: { decision_type: 'session_question', blocking: true, raised_by: undefined } },
  // —— direct inserts into chairman_decisions (sweep-path escalation) ——
  { producer: 'lib/eva/event-bus/handlers/budget-exceeded.js', path: 'sweep', shape: { decision_type: 'budget_override', blocking: true } },
  { producer: 'lib/eva/event-bus/handlers/stage-failed.js', path: 'sweep', shape: { decision_type: 'stage_failure_review', blocking: true } },
  { producer: 'lib/eva/gate-failure-recovery.js', path: 'sweep', shape: { decision_type: 'gate_failure_escalation', blocking: true } },
  { producer: 'lib/eva/dfe-gate-escalation-router.js', path: 'sweep', shape: { decision_type: 'gate_escalation', blocking: true } },
  { producer: 'lib/eva/guardrail-enforcement-engine.js', path: 'sweep', shape: { decision_type: 'guardrail_override', blocking: true } },
  { producer: 'lib/eva/venture-monitor.js', path: 'sweep', shape: { decision_type: 'gate', blocking: true } },
  { producer: 'lib/eva/stage-execution-worker.js (review path)', path: 'sweep', shape: { decision_type: 'review', blocking: true } },
  { producer: 'lib/eva/stage-execution-worker.js (product review)', path: 'sweep', shape: { decision_type: 'product_review', blocking: true } },
  { producer: 'lib/governance/chairman-escalation.js', path: 'sweep', shape: { decision_type: 'DFE_ESCALATION', blocking: true } },
  { producer: 'lib/venture-acquisition/decision-packet.js', path: 'sweep', shape: { decision_type: 'chairman_approval', blocking: true } },
  { producer: 'lib/integrations/okr-wave-linker.js', path: 'sweep', shape: { decision_type: 'roadmap_approval', blocking: true } },
  { producer: 'scripts/modules/governance/cascade-validator.js', path: 'sweep', shape: { decision_type: 'cascade_override', blocking: true } },
  { producer: 'scripts/modules/guardrails/guardrail-validator.js', path: 'sweep', shape: { decision_type: 'guardrail_override', blocking: true } },
  // —— pinned regression fixture: the Stage-0 ready-venture pause ——
  { producer: 'stage-zero review gate (ready-venture pause, PINNED FIXTURE)', path: 'sweep', shape: { decision_type: 'stage_gate', blocking: true } },
];

describe('ALL-PATHS: a blocking pending row from EVERY enumerated producer reaches escalation (FR-6)', () => {
  it('enumeration pin: 16 producer shapes (update deliberately when adding a producer)', () => {
    expect(PRODUCERS.length).toBe(16);
  });

  for (const { producer, path: escalationPath, shape } of PRODUCERS) {
    it(`${escalationPath}-path: ${producer}`, () => {
      if (escalationPath === 'creation') {
        expect(
          shouldAutoEscalate({ decisionType: shape.decision_type, blocking: shape.blocking, raisedBy: shape.raised_by }),
          `${producer}: creation-path predicate must fire for its blocking shape`
        ).toBe(true);
      } else {
        const row = { id: 'r1', status: 'pending', created_at: AGED, venture_id: null, brief_data: {}, ...shape };
        const due = selectBlockingSweepRows([row], { cutoffIso: CUTOFF, graceMs: GRACE, nowMs: NOW });
        expect(due.length, `${producer}: sweep selection must pick up its blocking shape`).toBe(1);
      }
    });
  }

  it('creation-path shapes are ALSO sweep-selectable (belt-and-suspenders when the on-creation email fails soft)', () => {
    for (const { shape } of PRODUCERS.filter((p) => p.path === 'creation')) {
      const row = { id: 'r1', status: 'pending', created_at: AGED, venture_id: null, brief_data: {}, ...shape };
      expect(selectBlockingSweepRows([row], { cutoffIso: CUTOFF, graceMs: GRACE, nowMs: NOW }).length).toBe(1);
    }
  });
});

describe('chairman-actionable mirror (FR-5)', () => {
  it('console predicate mirrors the RPC allowlist exactly', () => {
    expect(isConsoleActionable({ status: 'pending', decision_type: 'chairman_approval' })).toBe(true);
    expect(isConsoleActionable({ status: 'pending', decision_type: 'gate_decision' })).toBe(true);
    expect(isConsoleActionable({ status: 'pending', decision_type: 'escalation', blocking: true })).toBe(true);
    expect(isConsoleActionable({ status: 'pending', decision_type: 'escalation', blocking: false })).toBe(false);
    expect(isConsoleActionable({ status: 'pending', decision_type: 'okr_acceptance', blocking: true })).toBe(true);
    expect(isConsoleActionable({ status: 'pending', decision_type: 'stage_gate', blocking: true })).toBe(false); // console does NOT admit stage_gate
    expect(isConsoleActionable({ status: 'resolved', decision_type: 'chairman_approval' })).toBe(false);
  });

  it('escalation predicate = console set PLUS any blocking non-telemetry row (documented superset)', () => {
    expect(isEscalationActionable({ status: 'pending', decision_type: 'stage_gate', blocking: true })).toBe(true);
    expect(isEscalationActionable({ status: 'pending', decision_type: 'session_question', blocking: true })).toBe(true);
    expect(isEscalationActionable({ status: 'pending', decision_type: 'stage_gate', blocking: false })).toBe(false);
  });

  it('telemetry types never escalate, blocking or not (the C7 noise guard)', () => {
    for (const t of TELEMETRY_DECISION_TYPES) {
      expect(isEscalationActionable({ status: 'pending', decision_type: t, blocking: true })).toBe(false);
      expect(isEscalationActionable({ status: 'pending', decision_type: t, blocking: false })).toBe(false);
    }
  });
});
