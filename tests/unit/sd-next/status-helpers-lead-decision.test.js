/**
 * QF-20260511-565: Queue engine respects metadata.lead_decision.verdict
 *
 * Closes feedback 89fedaad — SDs paused at LEAD via metadata.lead_decision
 * (verdict ∈ {deferred, paused_pending_*}) must not surface as READY in
 * /leo next RECOMMENDED STARTING POINTS.
 */
import { describe, it, expect } from 'vitest';
import {
  isLeadDecisionPaused,
  getPhaseAwareStatus,
  isActionableForLead,
} from '../../../scripts/modules/sd-next/status-helpers.js';

// ────────────────────────────────────────────────────────────────────────
// Realistic fixtures mirroring real DB rows on 2026-05-11:
// - SD-EVA-SUPPORT-CLI-SKILL-ORCH-001     (parent, paused_pending_phase_3_unlock)
// - SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C   (Phase 3 child, deferred)
// Captured from project_sd_eva_support_*.md memory entries.
// ────────────────────────────────────────────────────────────────────────
const parentOrchestratorPaused = {
  id: 'sd-eva-support-cli-skill-orch-001',
  sd_key: 'SD-EVA-SUPPORT-CLI-SKILL-ORCH-001',
  status: 'in_progress',
  current_phase: 'PLAN_PRD',
  progress_percentage: 0,
  deps_resolved: true,
  metadata: {
    is_parent: true,
    is_orchestrator: true,
    arch_key: 'EVA-SUPPORT',
    vision_key: 'EVA',
    child_count: 3,
    lead_decision: {
      verdict: 'paused_pending_phase_3_unlock',
      decided_at: '2026-05-11T13:57:31Z',
      decided_by_session: '6c112cf6',
      reopen_when: '2026-05-25 OR chairman go-ahead',
    },
  },
};

const phase3ChildDeferred = {
  id: 'sd-eva-support-cli-skill-orch-001-c',
  sd_key: 'SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C',
  status: 'draft',
  current_phase: 'LEAD',
  progress_percentage: 0,
  deps_resolved: true,
  metadata: {
    parent_sd_id: 'SD-EVA-SUPPORT-CLI-SKILL-ORCH-001',
    lead_decision: {
      verdict: 'deferred',
      decided_at: '2026-05-11T13:36:00Z',
      reopen_when: '2026-05-25',
    },
  },
};

describe('isLeadDecisionPaused', () => {
  it('returns true for verdict="deferred"', () => {
    expect(isLeadDecisionPaused(phase3ChildDeferred)).toBe(true);
  });

  it('returns true for verdict="paused_pending_phase_3_unlock"', () => {
    expect(isLeadDecisionPaused(parentOrchestratorPaused)).toBe(true);
  });

  it('returns true for verdict="paused_pending_unlock" (sibling variant)', () => {
    expect(isLeadDecisionPaused({ metadata: { lead_decision: { verdict: 'paused_pending_unlock' } } })).toBe(true);
  });

  it('returns true for bare verdict="paused_pending"', () => {
    expect(isLeadDecisionPaused({ metadata: { lead_decision: { verdict: 'paused_pending' } } })).toBe(true);
  });

  it('returns false for verdict="in_progress" (not a pause verdict)', () => {
    expect(isLeadDecisionPaused({ metadata: { lead_decision: { verdict: 'in_progress' } } })).toBe(false);
  });

  it('returns false for verdict="approved" or other non-pause string', () => {
    expect(isLeadDecisionPaused({ metadata: { lead_decision: { verdict: 'approved' } } })).toBe(false);
  });

  it('returns false when lead_decision is missing', () => {
    expect(isLeadDecisionPaused({ metadata: { is_parent: true } })).toBe(false);
  });

  it('returns false when metadata is missing entirely', () => {
    expect(isLeadDecisionPaused({ id: 'sd-x', status: 'draft' })).toBe(false);
  });

  it('returns false when verdict is non-string (defensive)', () => {
    expect(isLeadDecisionPaused({ metadata: { lead_decision: { verdict: 123 } } })).toBe(false);
    expect(isLeadDecisionPaused({ metadata: { lead_decision: { verdict: null } } })).toBe(false);
    expect(isLeadDecisionPaused({ metadata: { lead_decision: { verdict: {} } } })).toBe(false);
  });

  it('returns false for null/undefined item without throwing', () => {
    expect(isLeadDecisionPaused(null)).toBe(false);
    expect(isLeadDecisionPaused(undefined)).toBe(false);
  });
});

describe('getPhaseAwareStatus: lead_decision.verdict downgrades', () => {
  it('returns DEFERRED badge for verdict="deferred"', () => {
    const out = getPhaseAwareStatus(phase3ChildDeferred);
    expect(out).toMatch(/DEFERRED/);
    // Must NOT return READY/DRAFT despite deps_resolved+status=draft
    expect(out).not.toMatch(/READY|DRAFT/);
  });

  it('returns PAUSED badge for verdict="paused_pending_phase_3_unlock"', () => {
    const out = getPhaseAwareStatus(parentOrchestratorPaused);
    expect(out).toMatch(/PAUSED/);
    // Must NOT return PLANNING despite current_phase=PLAN_PRD
    expect(out).not.toMatch(/PLANNING|READY/);
  });

  it('preserves existing DEFERRED branch for do_not_advance_without_trigger', () => {
    const out = getPhaseAwareStatus({
      status: 'draft',
      current_phase: 'LEAD',
      deps_resolved: true,
      metadata: { do_not_advance_without_trigger: true },
    });
    expect(out).toMatch(/DEFERRED/);
  });

  it('falls through to existing logic when no lead_decision is present', () => {
    const out = getPhaseAwareStatus({
      status: 'draft',
      current_phase: 'LEAD',
      deps_resolved: true,
      metadata: { other_key: 'foo' },
    });
    // No verdict → status=draft hits DRAFT branch
    expect(out).toMatch(/DRAFT/);
  });
});

describe('isActionableForLead: lead_decision.verdict suppression', () => {
  it('returns false when verdict="deferred"', () => {
    expect(isActionableForLead(phase3ChildDeferred)).toBe(false);
  });

  it('returns false when verdict="paused_pending_phase_3_unlock"', () => {
    expect(isActionableForLead(parentOrchestratorPaused)).toBe(false);
  });

  it('returns true when verdict absent and other conditions OK (LEAD phase, no review)', () => {
    expect(isActionableForLead({
      current_phase: 'LEAD',
      status: 'draft',
      metadata: {},
    })).toBe(true);
  });

  it('returns true with no metadata at all and LEAD phase', () => {
    expect(isActionableForLead({ current_phase: 'LEAD', status: 'draft' })).toBe(true);
  });
});
