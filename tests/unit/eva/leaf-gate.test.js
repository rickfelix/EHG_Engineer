/**
 * Unit tests for the PLAN->EXEC evidence gate.
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 5 (FR-012)
 */
import { describe, it, expect } from 'vitest';
import { evaluateLeafReadiness } from '../../../lib/eva/bridge/leaf-gate.js';

const OK = { verification: { survives: true }, dag: { valid: true } };

describe('evaluateLeafReadiness', () => {
  it('is ready when all required agents have evidence, verification passed, DAG valid', () => {
    const r = evaluateLeafReadiness({ required: ['DATABASE', 'VENTURE_STACK'], present: ['DATABASE', 'VENTURE_STACK', 'API'], ...OK });
    expect(r.ready).toBe(true);
    expect(r.missingAgents).toEqual([]);
    expect(r.reason).toBe('ready');
  });

  it('BLOCKS with SUBAGENT_EVIDENCE_MISSING when a required agent has no evidence', () => {
    const r = evaluateLeafReadiness({ required: ['DATABASE', 'VENTURE_STACK'], present: ['VENTURE_STACK'], ...OK });
    expect(r.ready).toBe(false);
    expect(r.missingAgents).toEqual(['DATABASE']);
    expect(r.reason).toBe('SUBAGENT_EVIDENCE_MISSING');
  });

  it('blocks when verification did not pass (or is absent)', () => {
    expect(evaluateLeafReadiness({ required: [], present: [], verification: { survives: false }, dag: { valid: true } }).ready).toBe(false);
    expect(evaluateLeafReadiness({ required: [], present: [], verification: null, dag: { valid: true } }).ready).toBe(false);
  });

  it('blocks when the dependency DAG is invalid (or absent)', () => {
    expect(evaluateLeafReadiness({ required: [], present: [], verification: { survives: true }, dag: { valid: false } }).ready).toBe(false);
    expect(evaluateLeafReadiness({ required: [], present: [], verification: { survives: true }, dag: null }).ready).toBe(false);
  });

  it('a leaf with no required agents still needs verification + a valid DAG', () => {
    expect(evaluateLeafReadiness({ required: [], present: [], ...OK }).ready).toBe(true);
    expect(evaluateLeafReadiness({}).ready).toBe(false); // nothing supplied => blocked, fail-closed
  });

  it('collects every failing reason (not just the first)', () => {
    const r = evaluateLeafReadiness({ required: ['DATABASE'], present: [], verification: { survives: false }, dag: { valid: false } });
    expect(r.reasons.length).toBe(3);
  });
});
