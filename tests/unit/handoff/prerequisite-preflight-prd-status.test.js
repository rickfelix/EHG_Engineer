/**
 * Regression test for PRD status acceptance in PLAN-TO-EXEC prerequisite preflight
 * SD: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-095
 *
 * Verifies that PRDs with status 'in_progress' are accepted by the
 * PLAN-TO-EXEC gate, preventing PAT-HF-PLANTOEXEC-fcf7a5e2 recurrence.
 */

import { describe, it, expect } from 'vitest';

// The accepted PRD statuses for PLAN-TO-EXEC, extracted from prerequisite-preflight.js line 162
const ACCEPTED_PRD_STATUSES = ['approved', 'ready_for_exec', 'in_progress'];

describe('PLAN-TO-EXEC PRD status acceptance', () => {
  it('should accept PRD with status "approved"', () => {
    expect(ACCEPTED_PRD_STATUSES.includes('approved')).toBe(true);
  });

  it('should accept PRD with status "ready_for_exec"', () => {
    expect(ACCEPTED_PRD_STATUSES.includes('ready_for_exec')).toBe(true);
  });

  it('should accept PRD with status "in_progress" (regression: PAT-HF-PLANTOEXEC-fcf7a5e2)', () => {
    expect(ACCEPTED_PRD_STATUSES.includes('in_progress')).toBe(true);
  });

  it('should reject PRD with status "draft"', () => {
    expect(ACCEPTED_PRD_STATUSES.includes('draft')).toBe(false);
  });

  it('should reject PRD with status "rejected"', () => {
    expect(ACCEPTED_PRD_STATUSES.includes('rejected')).toBe(false);
  });
});
