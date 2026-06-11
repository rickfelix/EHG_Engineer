/**
 * SD-PAT-FIX-PLAN-EXEC-REJECTED-001 — designed fast-fail rejections must not
 * feed session-retro pattern math.
 *
 * Pattern PAT-RETRO-PLANTOEXEC-3741735a ("rejected 11 times, avg 0%") was
 * generated from ONE April SD whose rejections were mostly prerequisite
 * fast-fails + claim-validity mechanics (score 0 by construction). These
 * tests replay that exact shape and pin: no pattern from fast-fails alone,
 * genuine quality failures still counted, excluded counts surfaced in
 * metadata (segmented, not hidden).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  analyzeSDRejections,
  FAST_FAIL_EXCLUDED_REASONS,
  isFastFailRejection,
} from '../../scripts/modules/learning/session-retrospective.js';

function mockSupabase({ rejections, existingPatterns = [] }) {
  const inserted = [];
  const sb = {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'sd_phase_handoffs') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: rejections, error: null }),
        };
      }
      if (table === 'issue_patterns') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: existingPatterns, error: null }),
          insert: vi.fn().mockImplementation((row) => {
            inserted.push(row);
            return Promise.resolve({ error: null });
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { sb, inserted };
}

const fastFail = (overrides = {}) => ({
  id: 'r', handoff_type: 'PLAN-TO-EXEC', validation_score: 0,
  rejection_reason: 'Prerequisite preflight failed: PRD_MISSING, USER_STORIES_MISSING',
  validation_details: { reason: 'PREREQUISITE_PREFLIGHT_FAILED' },
  created_at: '2026-04-13T11:06:00Z',
  ...overrides,
});

const claimFail = (overrides = {}) => ({
  id: 'r', handoff_type: 'PLAN-TO-EXEC', validation_score: 0,
  rejection_reason: 'GATE_CLAIM_VALIDITY validation failed - no_deterministic_identity',
  validation_details: {},
  created_at: '2026-04-13T11:17:00Z',
  ...overrides,
});

const qualityFail = (overrides = {}) => ({
  id: 'r', handoff_type: 'PLAN-TO-EXEC', validation_score: 45,
  rejection_reason: 'PRD does not meet quality standards',
  validation_details: { reason: 'PRD_QUALITY_FAILED' },
  created_at: '2026-04-13T12:47:00Z',
  ...overrides,
});

describe('isFastFailRejection', () => {
  it('matches the three designed fast-fail classes (reason code or rejection text)', () => {
    expect(isFastFailRejection(fastFail())).toBe(true);
    expect(isFastFailRejection(claimFail())).toBe(true);
    expect(isFastFailRejection({ rejection_reason: 'Artifact preflight failed: success_metrics', validation_details: { reason: 'ARTIFACT_PREFLIGHT_FAILED' } })).toBe(true);
    expect(isFastFailRejection(qualityFail())).toBe(false);
  });

  it('exclusion list is exported with the three classes', () => {
    expect(FAST_FAIL_EXCLUDED_REASONS).toEqual(
      expect.arrayContaining(['PREREQUISITE_PREFLIGHT_FAILED', 'ARTIFACT_PREFLIGHT_FAILED', 'GATE_CLAIM_VALIDITY'])
    );
  });
});

describe('analyzeSDRejections fast-fail segmentation', () => {
  it('April-incident replay: 8 fast-fails + 1 quality rejection -> NO pattern, excluded count returned', async () => {
    const rejections = [
      fastFail(), fastFail(), fastFail({ rejection_reason: 'Prerequisite preflight failed: USER_STORIES_MISSING' }),
      claimFail(), claimFail({ rejection_reason: 'GATE_CLAIM_VALIDITY validation failed - foreign_claim: [claim]' }),
      claimFail(), claimFail(),
      fastFail({ validation_details: { reason: 'ARTIFACT_PREFLIGHT_FAILED' }, rejection_reason: 'Artifact preflight failed: success_metrics' }),
      qualityFail(), // only ONE genuine quality failure — below MIN_REJECTIONS_FOR_PATTERN
    ];
    const { sb, inserted } = mockSupabase({ rejections });

    const result = await analyzeSDRejections('3741735a-9d49-4080-bda2-eb3f5dde3f04', { supabaseClient: sb });

    expect(result.analyzed).toBe(true);
    expect(result.patternsCreated).toBe(0);
    expect(result.excludedFastFails).toBe(8);
    expect(inserted).toEqual([]);
  });

  it('all-fast-fail SD: returns clean with zero patterns', async () => {
    const { sb, inserted } = mockSupabase({ rejections: [fastFail(), fastFail(), claimFail()] });
    const result = await analyzeSDRejections('sd-uuid', { supabaseClient: sb });
    expect(result.patternsCreated).toBe(0);
    expect(result.excludedFastFails).toBe(3);
    expect(inserted).toEqual([]);
  });

  it('genuine repeated quality failures still produce a pattern with correct count/avg + excluded metadata', async () => {
    const rejections = [
      fastFail(), // 1 fast-fail on the same gate — must appear ONLY in metadata
      qualityFail({ validation_score: 40 }),
      qualityFail({ validation_score: 50 }),
      qualityFail({ validation_score: 60 }),
      qualityFail({ validation_score: 50 }),
    ];
    const { sb, inserted } = mockSupabase({ rejections });

    const result = await analyzeSDRejections('sd-uuid-2', { supabaseClient: sb });

    expect(result.patternsCreated).toBe(1);
    expect(inserted).toHaveLength(1);
    const pattern = inserted[0];
    expect(pattern.occurrence_count).toBe(4);            // quality failures only
    expect(pattern.metadata.avg_score).toBe(50);          // not dragged to 0 by fast-fails
    expect(pattern.metadata.excluded_fast_fails).toBe(1); // segmented, not hidden
    expect(pattern.severity).toBe('high');                // 4 genuine rejections
  });
});
