/**
 * Tests for vision-repair-loop module
 *
 * SD: SD-LEO-INFRA-EVA-STAGE-WORKER-001 — bounded LLM repair loop for
 * eva_vision_documents that fail trigger-validated quality_checked.
 *
 * Test scenarios mapped to PRD acceptance criteria (AC-1 through AC-9):
 *   TS-1: success on first regen → AC-1, AC-2
 *   TS-2: success on second regen → AC-1, AC-2
 *   TS-3: attempt cap exhausted → AC-4
 *   TS-4: stub exemption respected → AC-3
 *   TS-5: feature flag off → AC-5
 *   TS-6: idempotency on already-passing rows → AC-6
 *   TS-7: token budget exhausted → AC-7
 *   TS-8: unknown-check fallback routing → FR-2 fallback
 *   TS-11: regen throws — counted as failed attempt (DATABASE finding R-7)
 *
 * @see PRD-SD-LEO-INFRA-EVA-STAGE-WORKER-001
 */

import { describe, test, expect, vi } from 'vitest';
import {
  repairVision,
  isRepairLoopEnabled,
  routeRepairPrompt,
  __test__,
} from '../vision-repair-loop.js';

// Reset env vars between tests so flag state never leaks
function clearEnv() {
  delete process.env.LEO_VISION_REPAIR_LOOP_ENABLED;
  delete process.env.LEO_VISION_REPAIR_LOOP_TOKEN_BUDGET;
}

/**
 * Build a Supabase mock that returns a sequence of upsert results.
 * Each call to upsert() consumes one entry from upsertSequence.
 */
function mockSupabase({ upsertSequence = [], configRows = {} } = {}) {
  let upsertIdx = 0;
  return {
    from: vi.fn((table) => ({
      select: vi.fn(() => ({
        eq: vi.fn((col, val) => ({
          maybeSingle: vi.fn(async () => {
            if (table === 'eva_venture_config') {
              return { data: configRows[val] || null, error: null };
            }
            // For vision-upsert's existing-version probe — return null = new row
            return { data: null, error: null };
          }),
        })),
      })),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => {
            const next = upsertSequence[upsertIdx] || upsertSequence[upsertSequence.length - 1];
            upsertIdx += 1;
            return next || { data: null, error: { message: 'no upsert result configured' } };
          }),
        })),
      })),
    })),
  };
}

const PASSING_DATA = {
  id: 'uuid-1',
  vision_key: 'V-1',
  level: 'L2',
  version: 2,
  status: 'active',
  quality_checked: true,
  quality_issues: [],
  created_by: 'stage-17-doc-generation',
};

const FAILING_DATA_CONTENT_LENGTH = {
  id: 'uuid-1',
  vision_key: 'V-1',
  level: 'L2',
  version: 2,
  status: 'active',
  quality_checked: false,
  quality_issues: [{ check: 'content_length', message: 'Content is 100 chars (minimum 5,000).' }],
  created_by: 'stage-17-doc-generation',
};

describe('vision-repair-loop / routeRepairPrompt', () => {
  test('routes content_length to expand_content', () => {
    const route = routeRepairPrompt({ check: 'content_length' }, { content: 'short', sections: {} });
    expect(route.strategy).toBe('expand_content');
    expect(route.knownCheck).toBe(true);
  });

  test('routes section_coverage to fill_missing_sections', () => {
    const route = routeRepairPrompt({ check: 'section_coverage' }, { sections: {} });
    expect(route.strategy).toBe('fill_missing_sections');
    expect(route.knownCheck).toBe(true);
  });

  test('unknown check falls through to expand_all_sections (TS-8 / FR-2 fallback)', () => {
    const route = routeRepairPrompt({ check: 'completely_new_check_name' }, { sections: {} });
    expect(route.strategy).toBe('expand_all_sections');
    expect(route.knownCheck).toBe(false);
  });
});

describe('vision-repair-loop / isRepairLoopEnabled', () => {
  test('env LEO_VISION_REPAIR_LOOP_ENABLED=true returns true without DB hit', async () => {
    clearEnv();
    process.env.LEO_VISION_REPAIR_LOOP_ENABLED = 'true';
    const result = await isRepairLoopEnabled({ supabase: null });
    expect(result).toBe(true);
    clearEnv();
  });

  test('per-venture override beats global flag (per-venture OFF wins)', async () => {
    clearEnv();
    const supabase = mockSupabase({
      configRows: {
        'venture:vid-1:vision_repair_loop_enabled': { value: false },
        vision_repair_loop_enabled: { value: true },
      },
    });
    const result = await isRepairLoopEnabled({ supabase, ventureId: 'vid-1' });
    expect(result).toBe(false);
    clearEnv();
  });

  test('global DB flag returns true when set', async () => {
    clearEnv();
    const supabase = mockSupabase({
      configRows: { vision_repair_loop_enabled: { value: true } },
    });
    const result = await isRepairLoopEnabled({ supabase });
    expect(result).toBe(true);
    clearEnv();
  });

  test('default OFF when env unset and DB has no row', async () => {
    clearEnv();
    const supabase = mockSupabase({ configRows: {} });
    const result = await isRepairLoopEnabled({ supabase });
    expect(result).toBe(false);
  });
});

describe('vision-repair-loop / repairVision', () => {
  test('TS-1: success on first regen [AC-1, AC-2]', async () => {
    clearEnv();
    const supabase = mockSupabase({ upsertSequence: [{ data: PASSING_DATA, error: null }] });
    const regenerate = vi.fn(async () => ({
      sections: { executive_summary: 'A'.repeat(5500) },
      content: 'B'.repeat(5500),
      tokensUsed: 8000,
    }));

    const result = await repairVision({
      supabase,
      visionKey: 'V-1',
      qualityIssues: FAILING_DATA_CONTENT_LENGTH.quality_issues,
      sections: { executive_summary: 'short' },
      content: 'short',
      createdBy: 'stage-17-doc-generation',
      regenerate,
      logger: { log: () => {}, warn: () => {} },
    });

    expect(result.exitReason).toBe('success');
    expect(result.attempts).toBe(1);
    expect(result.tokensUsed).toBe(8000);
    expect(result.finalQualityChecked).toBe(true);
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  test('TS-2: success on second regen [AC-1, AC-2]', async () => {
    clearEnv();
    const supabase = mockSupabase({
      upsertSequence: [
        { data: { ...FAILING_DATA_CONTENT_LENGTH }, error: null },
        { data: PASSING_DATA, error: null },
      ],
    });
    const regenerate = vi.fn(async () => ({ sections: {}, content: 'x', tokensUsed: 4000 }));

    const result = await repairVision({
      supabase,
      visionKey: 'V-1',
      qualityIssues: FAILING_DATA_CONTENT_LENGTH.quality_issues,
      sections: {},
      content: 'short',
      createdBy: 'stage-17-doc-generation',
      regenerate,
      logger: { log: () => {}, warn: () => {} },
    });

    expect(result.exitReason).toBe('success');
    expect(result.attempts).toBe(2);
    expect(result.tokensUsed).toBe(8000);
    expect(regenerate).toHaveBeenCalledTimes(2);
  });

  test('TS-3: attempt cap exhausted [AC-4]', async () => {
    clearEnv();
    const supabase = mockSupabase({
      upsertSequence: [
        { data: { ...FAILING_DATA_CONTENT_LENGTH }, error: null },
        { data: { ...FAILING_DATA_CONTENT_LENGTH }, error: null },
      ],
    });
    const regenerate = vi.fn(async () => ({ sections: {}, content: 'x', tokensUsed: 1000 }));
    const warnings = [];
    const logger = { log: () => {}, warn: (m, ctx) => warnings.push({ m, ctx }) };

    const result = await repairVision({
      supabase,
      visionKey: 'V-1',
      qualityIssues: FAILING_DATA_CONTENT_LENGTH.quality_issues,
      sections: {},
      content: 'short',
      createdBy: 'stage-17-doc-generation',
      regenerate,
      logger,
    });

    expect(result.exitReason).toBe('attempt_cap');
    expect(result.attempts).toBe(2);
    expect(result.finalQualityChecked).toBe(false);
    expect(warnings.some((w) => w.m.includes('attempt_cap'))).toBe(true);
    expect(warnings[0].ctx.finalQualityIssues).toBeTruthy();
  });

  test('TS-4: stub exemption respected — created_by=seed-l1-vision [AC-3]', async () => {
    clearEnv();
    const regenerate = vi.fn();
    const result = await repairVision({
      supabase: {},
      visionKey: 'V-1',
      qualityIssues: FAILING_DATA_CONTENT_LENGTH.quality_issues,
      sections: {},
      content: 'short',
      createdBy: 'seed-l1-vision',
      regenerate,
      logger: { log: () => {}, warn: () => {} },
    });

    expect(result.exitReason).toBe('stub_exempt');
    expect(result.attempts).toBe(0);
    expect(result.tokensUsed).toBe(0);
    expect(regenerate).not.toHaveBeenCalled();
  });

  test('TS-5: idempotency — empty quality_issues short-circuits [AC-6]', async () => {
    clearEnv();
    const regenerate = vi.fn();
    const result = await repairVision({
      supabase: {},
      visionKey: 'V-1',
      qualityIssues: [],
      sections: {},
      content: 'fine',
      createdBy: 'stage-17-doc-generation',
      regenerate,
      logger: { log: () => {}, warn: () => {} },
    });

    expect(result.exitReason).toBe('idempotent');
    expect(result.finalQualityChecked).toBe(true);
    expect(regenerate).not.toHaveBeenCalled();
  });

  test('TS-7: token budget exhausted [AC-7]', async () => {
    clearEnv();
    const supabase = mockSupabase({
      upsertSequence: [{ data: { ...FAILING_DATA_CONTENT_LENGTH }, error: null }],
    });
    const regenerate = vi.fn(async () => ({ sections: {}, content: 'x', tokensUsed: 100 }));
    const warnings = [];
    const logger = { log: () => {}, warn: (m, ctx) => warnings.push({ m, ctx }) };

    // Pre-populate cumulative usage past the budget
    const result = await repairVision({
      supabase,
      visionKey: 'V-1',
      qualityIssues: FAILING_DATA_CONTENT_LENGTH.quality_issues,
      sections: {},
      content: 'short',
      createdBy: 'stage-17-doc-generation',
      regenerate,
      tokenBudget: 1000,
      tokenUsage: { used: 1500 }, // already over budget
      logger,
    });

    expect(result.exitReason).toBe('token_budget');
    expect(result.attempts).toBe(0);
    expect(regenerate).not.toHaveBeenCalled();
    expect(warnings.some((w) => w.m.includes('budget'))).toBe(true);
  });

  test('TS-8: unknown check encountered → exitReason=unknown_check on cap [FR-2 fallback]', async () => {
    clearEnv();
    const supabase = mockSupabase({
      upsertSequence: [
        {
          data: {
            ...FAILING_DATA_CONTENT_LENGTH,
            quality_issues: [{ check: 'totally_new_check', message: 'unknown' }],
          },
          error: null,
        },
        {
          data: {
            ...FAILING_DATA_CONTENT_LENGTH,
            quality_issues: [{ check: 'totally_new_check', message: 'unknown' }],
          },
          error: null,
        },
      ],
    });
    const regenerate = vi.fn(async () => ({ sections: {}, content: 'x', tokensUsed: 100 }));

    const result = await repairVision({
      supabase,
      visionKey: 'V-1',
      qualityIssues: [{ check: 'totally_new_check', message: 'unknown' }],
      sections: {},
      content: 'short',
      createdBy: 'stage-17-doc-generation',
      regenerate,
      logger: { log: () => {}, warn: () => {} },
    });

    expect(result.exitReason).toBe('unknown_check');
    expect(result.attempts).toBe(2);
  });

  test('TS-11: regen throws — counted as failed attempt, loop continues [DATABASE R-7]', async () => {
    clearEnv();
    const supabase = mockSupabase({
      upsertSequence: [{ data: PASSING_DATA, error: null }],
    });
    let callCount = 0;
    const regenerate = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) throw new Error('LLM timeout');
      return { sections: {}, content: 'x', tokensUsed: 1000 };
    });

    const result = await repairVision({
      supabase,
      visionKey: 'V-1',
      qualityIssues: FAILING_DATA_CONTENT_LENGTH.quality_issues,
      sections: {},
      content: 'short',
      createdBy: 'stage-17-doc-generation',
      regenerate,
      logger: { log: () => {}, warn: () => {} },
    });

    expect(result.exitReason).toBe('success');
    expect(callCount).toBe(2); // first throw, second succeeds
  });

  test('throws when regenerate is not a function', async () => {
    clearEnv();
    await expect(
      repairVision({
        supabase: {},
        visionKey: 'V-1',
        qualityIssues: FAILING_DATA_CONTENT_LENGTH.quality_issues,
        regenerate: null,
      })
    ).rejects.toThrow('regenerate callable is required');
  });
});

describe('vision-repair-loop / __test__ exports', () => {
  test('exposes STUB_EXEMPT_VALUES for downstream check alignment', () => {
    expect(__test__.STUB_EXEMPT_VALUES).toContain('seed-l1-vision');
  });

  test('exposes KNOWN_CHECKS list aligned with trigger', () => {
    expect(__test__.KNOWN_CHECKS).toEqual([
      'content_length',
      'section_coverage',
      'section_content',
      'sections_missing',
    ]);
  });

  test('default constants are sensible', () => {
    expect(__test__.DEFAULT_ATTEMPT_CAP).toBe(2);
    expect(__test__.DEFAULT_TOKEN_BUDGET).toBe(540800);
  });
});
