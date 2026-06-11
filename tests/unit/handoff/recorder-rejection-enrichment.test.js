/**
 * SD-PAT-FIX-LEAD-PLAN-REJECTED-004 (FR-3): recordFailure persists per-field
 * deficits into the rejected sd_phase_handoffs row.
 *
 * Before: rejection_reason = generic message only ("Strategic Directive does
 * not meet completeness standards"); the actionable error list lived in
 * console output + leo_handoff_rejections, producing blind retry loops
 * (7 rejections on SD e756f97d in 8 minutes, 2026-05-16).
 */
import { describe, it, expect, vi } from 'vitest';
import { HandoffRecorder } from '../../../scripts/modules/handoff/recording/HandoffRecorder.js';

function buildRecorder(captured) {
  const supabase = {
    from: vi.fn(() => ({
      insert: vi.fn((row) => {
        captured.push(row);
        return { select: vi.fn(async () => ({ data: [row], error: null })) };
      }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: 'sd-uuid-1' }, error: null })),
          limit: vi.fn(async () => ({ data: [{ id: 'sd-uuid-1' }], error: null }))
        })),
        or: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: [{ id: 'sd-uuid-1' }], error: null })),
          single: vi.fn(async () => ({ data: { id: 'sd-uuid-1' }, error: null }))
        }))
      }))
    }))
  };
  const recorder = new HandoffRecorder(supabase, {
    contentBuilder: { buildRejection: () => ({ executive_summary: 'rejected' }) },
    validationOrchestrator: { preValidateData: async () => ({ valid: true, errors: [] }) }
  });
  // Bypass the DB lookup inside _resolveToUUID — unit scope is row shaping.
  recorder._resolveToUUID = async (id) => id;
  return recorder;
}

const SD_INCOMPLETE_RESULT = {
  success: false,
  rejected: true,
  reasonCode: 'SD_INCOMPLETE',
  message: 'Strategic Directive does not meet completeness standards',
  improvements: {
    required: [
      'Missing required field: scope',
      'Insufficient strategic objectives: 0/3',
      'Missing success_metrics or success_criteria'
    ],
    actions: [],
    timeEstimate: '2-3 hours',
    instructions: ''
  },
  details: {
    sdValidation: { errors: ['Missing required field: scope'] },
    actualScore: 0,
    requiredScore: 85
  }
};

describe('FR-3: recordFailure rejection enrichment', () => {
  it('persists per-field deficits + scores in rejection_reason and validation_details', async () => {
    const captured = [];
    const recorder = buildRecorder(captured);
    await recorder.recordFailure('LEAD-TO-PLAN', 'SD-TEST-001', SD_INCOMPLETE_RESULT);

    const row = captured.find(r => r.status === 'rejected');
    expect(row).toBeTruthy();
    expect(row.rejection_reason).toContain('does not meet completeness standards');
    expect(row.rejection_reason).toContain('deficits:');
    expect(row.rejection_reason).toContain('Insufficient strategic objectives: 0/3');
    expect(row.rejection_reason).toContain('(score 0%, required 85%)');
    expect(row.rejection_reason.length).toBeLessThanOrEqual(1000);
    expect(row.validation_details.summary.required_improvements).toHaveLength(3);
    expect(row.validation_details.summary.required_score).toBe(85);
  });

  it('caps rejection_reason at 1000 chars', async () => {
    const captured = [];
    const recorder = buildRecorder(captured);
    const longResult = {
      ...SD_INCOMPLETE_RESULT,
      improvements: { required: Array.from({ length: 50 }, (_, i) => `Missing very long descriptive field number ${i} with extra explanatory text`) }
    };
    await recorder.recordFailure('LEAD-TO-PLAN', 'SD-TEST-001', longResult);
    const row = captured.find(r => r.status === 'rejected');
    expect(row.rejection_reason.length).toBeLessThanOrEqual(1000);
  });

  it('legacy result shape (no improvements/details) persists exactly the prior message', async () => {
    const captured = [];
    const recorder = buildRecorder(captured);
    await recorder.recordFailure('LEAD-TO-PLAN', 'SD-TEST-001', {
      success: false,
      reasonCode: 'ENV_NOT_READY',
      message: 'Development environment not ready for planning phase'
    });
    const row = captured.find(r => r.status === 'rejected');
    expect(row.rejection_reason).toBe('Development environment not ready for planning phase');
    expect(row.validation_details.summary.required_improvements).toBeUndefined();
  });
});
