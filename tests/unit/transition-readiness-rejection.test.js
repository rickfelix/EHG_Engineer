/**
 * Tests for PAT-HANDOFF-PHZ-001 fix: Transition readiness rejection check
 *
 * Validates that the transition readiness gate correctly queries sd_phase_handoffs
 * (not the non-existent sd_handoffs table) and uses correct lowercase status values.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateTransitionReadiness } from '../../scripts/modules/handoff/executors/lead-to-plan/gates/transition-readiness.js';

// Mock quickPreflightCheck to avoid import side effects
vi.mock('../../scripts/lib/handoff-preflight.js', () => ({
  quickPreflightCheck: vi.fn().mockResolvedValue({ ready: true })
}));

// Helper: create a valid SD object
function createSD(overrides = {}) {
  return {
    id: 'test-sd-uuid',
    sd_key: 'SD-TEST-001',
    title: 'Test SD',
    description: 'A test strategic directive',
    status: 'active',
    success_metrics: [{ metric: 'test', target: '100%' }],
    ...overrides
  };
}

// Helper: mock Supabase with chainable API
// Chain: from → select → eq → eq → in → is → order → limit
// The .is() call filters resolved_at IS NULL (RCA-MULTI-SESSION-CASCADE-001)
function createMockSupabase(handoffs = [], handoffError = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: handoffs,
                    error: handoffError
                  })
                })
              })
            })
          })
        })
      })
    })
  };
}

describe('PAT-HANDOFF-PHZ-001: Transition Readiness Rejection Check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should query sd_phase_handoffs table (not sd_handoffs)', async () => {
    const supabase = createMockSupabase([]);
    const sd = createSD();

    await validateTransitionReadiness(sd, supabase);

    // Verify the correct table is queried
    expect(supabase.from).toHaveBeenCalledWith('sd_phase_handoffs');
  });

  it('should PASS when no previous rejected handoffs exist', async () => {
    const supabase = createMockSupabase([]);
    const sd = createSD();

    const result = await validateTransitionReadiness(sd, supabase);

    expect(result.pass).toBe(true);
    expect(result.issues.filter(i => i.includes('REJECTED'))).toHaveLength(0);
  });

  it('should BLOCK when previous LEAD-TO-PLAN handoff was rejected (lowercase)', async () => {
    const rejectedHandoffs = [{
      id: 'handoff-123',
      status: 'rejected',
      created_at: new Date().toISOString(),
      rejection_reason: 'Gate validation failed'
    }];

    const supabase = createMockSupabase(rejectedHandoffs);
    const sd = createSD();

    const result = await validateTransitionReadiness(sd, supabase);

    // Should have blocking issues due to rejected handoff
    expect(result.pass).toBe(false);
    expect(result.issues.some(i => i.includes('REJECTED'))).toBe(true);
  });

  it('should handle database errors gracefully', async () => {
    // Make the chain throw to exercise the catch block
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockRejectedValue(new Error('Connection refused'))
                  })
                })
              })
            })
          })
        })
      })
    };
    const sd = createSD();

    const result = await validateTransitionReadiness(sd, supabase);

    // Should not crash - adds warning instead
    expect(result.warnings.some(w => w.includes('Could not check'))).toBe(true);
  });
});
