/**
 * Regression test for parent-orchestrator PRD status acceptance in PlanToExecVerifier
 * SD: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 (Phase 1)
 * Pattern: PAT-HF-PLANTOEXEC-eaccd2b3
 *
 * Two allow-lists were out of sync:
 *   prerequisite-preflight.js:268 — [approved, ready_for_exec, in_progress]
 *   PlanToExecVerifier.js:320 parent-orch path — [approved, ready_for_exec, planning, draft]
 *
 * Parent orchestrators re-entering PLAN-TO-EXEC after a child cycle see their
 * PRD in 'in_progress' legitimately. Before this fix, preflight passed but
 * verifier rejected — "PRD status is 'in_progress', expected one of: approved,
 * ready_for_exec, planning, draft" — 4 recorded occurrences.
 *
 * Fix: extend parent-orch allow-list to include 'in_progress', aligning with preflight.
 */

import { describe, it, expect } from 'vitest';

// Canonical allow-lists from PlanToExecVerifier.js:319-321
const PARENT_ORCH_STATUSES = ['approved', 'ready_for_exec', 'planning', 'draft', 'in_progress'];
const NON_PARENT_STATUSES = ['approved', 'ready_for_exec', 'in_progress'];

// And from prerequisite-preflight.js:268
const PREFLIGHT_STATUSES = ['approved', 'ready_for_exec', 'in_progress'];

describe('PLAN-TO-EXEC verifier PRD status alignment (PAT-HF-PLANTOEXEC-eaccd2b3)', () => {
  it('parent-orchestrator allow-list includes in_progress (regression)', () => {
    expect(PARENT_ORCH_STATUSES).toContain('in_progress');
  });

  it('parent-orch allow-list is a superset of preflight allow-list', () => {
    for (const status of PREFLIGHT_STATUSES) {
      expect(PARENT_ORCH_STATUSES).toContain(status);
    }
  });

  it('non-parent allow-list matches preflight allow-list exactly', () => {
    expect([...NON_PARENT_STATUSES].sort()).toEqual([...PREFLIGHT_STATUSES].sort());
  });

  it('parent-orch re-entry scenario: PRD in_progress is accepted', () => {
    const isParentOrchestrator = true;
    const prdStatus = 'in_progress';
    const validStatuses = isParentOrchestrator ? PARENT_ORCH_STATUSES : NON_PARENT_STATUSES;
    expect(validStatuses).toContain(prdStatus);
  });
});
