/**
 * SD-LEO-INFRA-RESTORE-AGENT-TOOL-001 (scope addition, coordinator b8b8be6f / Golf-3 finding
 * ed112fd5) — restores the THIRD dead sub-agent evidence recorder.
 *
 * scripts/hooks/task-recorder.js had NEVER written a live row for TWO independent reasons:
 * (1) it read process.env.CLAUDE_TOOL_INPUT, which the verified hook contract confirms is not
 * propagated (session-id-propagation-canary.test.js:29-30) -- fixed by reading stdin instead,
 * matching task-subagent-recorder.cjs's own channel; (2) even with stdin fixed, its record shape
 * named columns (agent_type, triggered_by, activation_time, context) that do not exist on the
 * live subagent_activations table -- verified empirically: the corrected stdin-reading code
 * produced a REAL, different insert failure ("Could not find the 'activation_time' column") the
 * first time an insert was actually attempted in this hook's history. The real schema and its
 * CHECK constraints (activating_agent IN (LEAD,PLAN,EXEC), phase IN
 * (planning,implementation,verification)) were confirmed via direct PostgREST column probes
 * against database/schema-reference-snapshot.json's documented shape, and by an end-to-end smoke
 * test against the live DB (a real row inserted, then deleted as test cleanup).
 */
import { describe, it, expect } from 'vitest';
import {
  buildActivationRecord, mapToActivatingAgent, mapToPhaseBucket,
} from '../../../scripts/hooks/task-recorder.js';

describe('mapToActivatingAgent — subagent_activations.activating_agent CHECK vocabulary (LEAD|PLAN|EXEC)', () => {
  it('maps every live LEAD-family current_phase value to LEAD', () => {
    for (const phase of ['LEAD', 'LEAD_APPROVAL', 'LEAD_COMPLETE', 'LEAD_FINAL', 'LEAD_FINAL_APPROVAL']) {
      expect(mapToActivatingAgent(phase)).toBe('LEAD');
    }
  });

  it('maps every live PLAN-family current_phase value to PLAN', () => {
    expect(mapToActivatingAgent('PLAN_PRD')).toBe('PLAN');
    expect(mapToActivatingAgent('PLAN_VERIFICATION')).toBe('PLAN');
  });

  it('maps every live EXEC-family current_phase value to EXEC', () => {
    expect(mapToActivatingAgent('EXEC')).toBe('EXEC');
    expect(mapToActivatingAgent('EXEC_COMPLETE')).toBe('EXEC');
  });

  it('returns null for terminal or unrecognized phases -- the caller must skip the insert, never guess', () => {
    expect(mapToActivatingAgent('CANCELLED')).toBeNull();
    expect(mapToActivatingAgent('COMPLETED')).toBeNull();
    expect(mapToActivatingAgent(null)).toBeNull();
    expect(mapToActivatingAgent('SOME_FUTURE_PHASE_NOT_YET_SEEN')).toBeNull();
  });
});

describe('mapToPhaseBucket — subagent_activations.phase CHECK vocabulary (planning|implementation|verification)', () => {
  it('maps LEAD-family and PLAN_PRD to planning', () => {
    for (const phase of ['LEAD', 'LEAD_APPROVAL', 'LEAD_COMPLETE', 'LEAD_FINAL', 'LEAD_FINAL_APPROVAL', 'PLAN_PRD']) {
      expect(mapToPhaseBucket(phase)).toBe('planning');
    }
  });

  it('maps PLAN_VERIFICATION to verification', () => {
    expect(mapToPhaseBucket('PLAN_VERIFICATION')).toBe('verification');
  });

  it('maps EXEC-family to implementation', () => {
    expect(mapToPhaseBucket('EXEC')).toBe('implementation');
    expect(mapToPhaseBucket('EXEC_COMPLETE')).toBe('implementation');
  });

  it('returns null for terminal or unrecognized phases', () => {
    expect(mapToPhaseBucket('CANCELLED')).toBeNull();
    expect(mapToPhaseBucket('COMPLETED')).toBeNull();
    expect(mapToPhaseBucket(undefined)).toBeNull();
  });
});

describe('buildActivationRecord — the REAL live schema, not the phantom columns the old code used', () => {
  const baseArgs = {
    sdId: 'sd-uuid-1',
    phaseBucket: 'implementation',
    activatingAgent: 'EXEC',
    subagentType: 'testing-agent',
    input: { description: 'run tests', model: 'sonnet' },
  };

  it('writes only real columns -- never agent_type/triggered_by/activation_time/context (verified-absent on the live table)', () => {
    const record = buildActivationRecord(baseArgs);
    expect(record).not.toHaveProperty('agent_type');
    expect(record).not.toHaveProperty('triggered_by');
    expect(record).not.toHaveProperty('activation_time');
    expect(record).not.toHaveProperty('context');
    expect(record).not.toHaveProperty('result');
  });

  it('populates the real columns with CHECK-constraint-satisfying values', () => {
    const record = buildActivationRecord(baseArgs);
    expect(record.sd_id).toBe('sd-uuid-1');
    expect(record.phase).toBe('implementation');
    expect(record.activating_agent).toBe('EXEC');
    expect(record.subagent_code).toBe('TESTING-AGENT');
    expect(record.subagent_name).toBe('TESTING-AGENT');
    expect(record.status).toBe('activated'); // a valid member of the status CHECK vocabulary
    expect(typeof record.activated_at).toBe('string');
  });

  it('carries description/model inside activation_context (a JSONB column), not as top-level fields', () => {
    const record = buildActivationRecord(baseArgs);
    expect(record.activation_context).toEqual({ description: 'run tests', model: 'sonnet' });
  });

  it('falls back to a truncated prompt when description is absent, and "default" when model is absent', () => {
    const record = buildActivationRecord({
      ...baseArgs,
      input: { prompt: 'x'.repeat(200) },
    });
    expect(record.activation_context.description).toHaveLength(100);
    expect(record.activation_context.model).toBe('default');
  });
});
