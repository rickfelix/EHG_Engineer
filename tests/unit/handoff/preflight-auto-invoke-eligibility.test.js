// SD-LEO-INFRA-HANDOFF-PREFLIGHT-AUTO-001 FR-2 / TR-7 — pure eligibility gate
// for auto-invoke. TS-9: a SUBAGENT_EVIDENCE_BAD_VERDICT or
// SUBAGENT_EVIDENCE_NOT_RUN issue (alone or mixed with MISSING) must never
// yield eligible agents — only an all-MISSING preflight is eligible.

import { describe, it, expect } from 'vitest';
import { resolveMissingAgentsForAutoInvoke } from '../../../scripts/modules/handoff/HandoffOrchestrator.js';

describe('resolveMissingAgentsForAutoInvoke', () => {
  it('all-MISSING preflight with agent codes is eligible', () => {
    const preflight = {
      passed: false,
      issues: [{ code: 'SUBAGENT_EVIDENCE_MISSING', message: 'x', missingAgents: ['TESTING', 'SECURITY'] }]
    };
    expect(resolveMissingAgentsForAutoInvoke(preflight)).toEqual(['TESTING', 'SECURITY']);
  });

  it('SD-LEO-INFRA-CLOSE-PHASE-TRANSITION-001 TS-1: an info-severity issue coexisting with a real MISSING blocker is still eligible, using blockingIssues', () => {
    const preflight = {
      passed: false,
      issues: [
        { code: 'USER_STORIES_BYPASSED', severity: 'info', message: 'exempt' },
        { code: 'SUBAGENT_EVIDENCE_MISSING', message: 'x', missingAgents: ['TESTING'] }
      ],
      blockingIssues: [
        { code: 'SUBAGENT_EVIDENCE_MISSING', message: 'x', missingAgents: ['TESTING'] }
      ]
    };
    expect(resolveMissingAgentsForAutoInvoke(preflight)).toEqual(['TESTING']);
  });

  it('SD-LEO-INFRA-CLOSE-PHASE-TRANSITION-001 TS-6: legacy shape without blockingIssues falls back to issues (backward compatible)', () => {
    const preflight = {
      passed: false,
      issues: [{ code: 'SUBAGENT_EVIDENCE_MISSING', message: 'x', missingAgents: ['TESTING', 'SECURITY'] }]
      // no blockingIssues field -- must not crash, must reproduce pre-fix behavior
    };
    expect(resolveMissingAgentsForAutoInvoke(preflight)).toEqual(['TESTING', 'SECURITY']);
  });

  it('dedupes missing agent codes across multiple issues', () => {
    const preflight = {
      passed: false,
      issues: [
        { code: 'SUBAGENT_EVIDENCE_MISSING', missingAgents: ['TESTING'] },
        { code: 'SUBAGENT_EVIDENCE_MISSING', missingAgents: ['TESTING', 'SECURITY'] }
      ]
    };
    expect(resolveMissingAgentsForAutoInvoke(preflight)).toEqual(['TESTING', 'SECURITY']);
  });

  it('TS-9: a SUBAGENT_EVIDENCE_BAD_VERDICT issue alone is never eligible', () => {
    const preflight = { passed: false, issues: [{ code: 'SUBAGENT_EVIDENCE_BAD_VERDICT', message: 'x' }] };
    expect(resolveMissingAgentsForAutoInvoke(preflight)).toEqual([]);
  });

  it('TS-9: a SUBAGENT_EVIDENCE_NOT_RUN issue alone is never eligible', () => {
    const preflight = { passed: false, issues: [{ code: 'SUBAGENT_EVIDENCE_NOT_RUN', message: 'x' }] };
    expect(resolveMissingAgentsForAutoInvoke(preflight)).toEqual([]);
  });

  it('TS-9: a MIX of MISSING and BAD_VERDICT/NOT_RUN is never eligible (never partial auto-invoke)', () => {
    const preflight = {
      passed: false,
      issues: [
        { code: 'SUBAGENT_EVIDENCE_MISSING', missingAgents: ['TESTING'] },
        { code: 'SUBAGENT_EVIDENCE_BAD_VERDICT', message: 'x' }
      ]
    };
    expect(resolveMissingAgentsForAutoInvoke(preflight)).toEqual([]);
  });

  it('an unrelated preflight failure code is never eligible', () => {
    const preflight = { passed: false, issues: [{ code: 'USER_STORIES_MISSING', message: 'x' }] };
    expect(resolveMissingAgentsForAutoInvoke(preflight)).toEqual([]);
  });

  it('a passed preflight is never eligible', () => {
    expect(resolveMissingAgentsForAutoInvoke({ passed: true, issues: [] })).toEqual([]);
  });

  it('null/undefined preflight is never eligible', () => {
    expect(resolveMissingAgentsForAutoInvoke(null)).toEqual([]);
    expect(resolveMissingAgentsForAutoInvoke(undefined)).toEqual([]);
  });

  it('all-MISSING but with no enumerated agent codes yields empty (nothing to invoke)', () => {
    const preflight = { passed: false, issues: [{ code: 'SUBAGENT_EVIDENCE_MISSING', missingAgents: [] }] };
    expect(resolveMissingAgentsForAutoInvoke(preflight)).toEqual([]);
  });
});
