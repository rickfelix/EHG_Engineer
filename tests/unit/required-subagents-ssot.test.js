/**
 * SD-MAN-ORCH-LEO-HARNESS-EFFICIENCY-001-C — required-subagents SSOT + collect wrapper.
 *
 * Pins the canonical phase→required-agents mapping so drift in either consumer
 * (subagent-evidence-gate, phase-subagent-orchestrator) fails CI, proves the
 * gate re-export is the SAME object (no second copy), validates the
 * handoff→orchestrator-phase mapping against VALID_PHASES, and unit-tests the
 * pure arg parser of scripts/collect-subagent-evidence.js.
 */
import { describe, it, expect } from 'vitest';
import {
  REQUIRED_SUBAGENTS,
  HANDOFF_TO_ORCHESTRATOR_PHASE,
  getRequiredSubAgents
} from '../../scripts/modules/handoff/required-subagents.js';
import { REQUIRED_SUBAGENTS as GATE_REQUIRED } from '../../scripts/modules/handoff/gates/subagent-evidence-gate.js';
import { VALID_PHASES } from '../../scripts/modules/phase-subagent-orchestrator/phase-config.js';
import { parseCollectArgs } from '../../scripts/collect-subagent-evidence.js';

describe('required-subagents SSOT (FR-3)', () => {
  it('pins the canonical blocking mapping (gate contract — change deliberately)', () => {
    expect(REQUIRED_SUBAGENTS).toEqual({
      'LEAD-TO-PLAN': ['VALIDATION', 'Explore'],
      'PLAN-TO-EXEC': ['TESTING'],
      'EXEC-TO-PLAN': ['TESTING', 'SECURITY'],
      'PLAN-TO-LEAD': ['RETRO'],
      'LEAD-FINAL-APPROVAL': []
    });
  });

  it('gate re-exports the SAME object — no drifted second copy', () => {
    expect(GATE_REQUIRED).toBe(REQUIRED_SUBAGENTS);
  });

  it('every handoff maps to a valid orchestrator phase', () => {
    expect(Object.keys(HANDOFF_TO_ORCHESTRATOR_PHASE).sort())
      .toEqual(Object.keys(REQUIRED_SUBAGENTS).sort());
    for (const phase of Object.values(HANDOFF_TO_ORCHESTRATOR_PHASE)) {
      expect(VALID_PHASES).toContain(phase);
    }
  });

  it('getRequiredSubAgents returns the set for known handoffs, [] for unknown', () => {
    expect(getRequiredSubAgents('EXEC-TO-PLAN')).toEqual(['TESTING', 'SECURITY']);
    expect(getRequiredSubAgents('NOT-A-HANDOFF')).toEqual([]);
  });
});

describe('parseCollectArgs (FR-2 wrapper)', () => {
  it('translates a handoff type to its orchestrator phase and keeps handoffType', () => {
    expect(parseCollectArgs(['--sd', 'SD-X-001', '--phase', 'EXEC-TO-PLAN'])).toEqual({
      sd: 'SD-X-001', phase: 'PLAN_VERIFY', handoffType: 'EXEC-TO-PLAN'
    });
  });

  it('passes a raw orchestrator phase through with null handoffType', () => {
    expect(parseCollectArgs(['--sd', 'SD-X-001', '--phase', 'PLAN_VERIFY'])).toEqual({
      sd: 'SD-X-001', phase: 'PLAN_VERIFY', handoffType: null
    });
  });

  it('fails loud with the valid-phase list on an unknown phase', () => {
    expect(() => parseCollectArgs(['--sd', 'SD-X-001', '--phase', 'VERIFY']))
      .toThrow(/Handoffs: .*EXEC-TO-PLAN.*\n.*Phases: .*PLAN_VERIFY/s);
  });

  it('fails loud when --sd or --phase is missing', () => {
    expect(() => parseCollectArgs(['--phase', 'EXEC-TO-PLAN'])).toThrow(/Usage:/);
    expect(() => parseCollectArgs(['--sd', 'SD-X-001'])).toThrow(/Usage:/);
    expect(() => parseCollectArgs(['--sd', '--phase', 'EXEC-TO-PLAN'])).toThrow(/Usage:/);
  });
});
