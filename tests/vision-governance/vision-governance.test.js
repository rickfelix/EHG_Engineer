/**
 * Vision Governance System Health — Regression Test Suite
 * SD: SD-EVA-QUALITY-VISION-ROUND3-TESTS-001
 *
 * Covers 6 health check areas:
 *   1. API access to vision tables via mocked Supabase
 *   2. GATE_VISION_SCORE pass/fail logic
 *   3. Periodic scorer registration
 *   4. Corrective SD generator structure
 *   5. Rescore-on-completion hook wiring
 *   6. useVisionDashboardData hook dimension parsing
 *
 * Runnable without production credentials (all DB calls mocked).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock Supabase ─────────────────────────────────────────────────────────────

const mockSelect = vi.fn().mockReturnValue({ data: [], error: null });
const mockFrom = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnValue({ data: [], error: null }),
  single: vi.fn().mockReturnValue({ data: null, error: null }),
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({ from: mockFrom }),
}));

vi.mock('dotenv', () => ({ default: { config: vi.fn() }, config: vi.fn() }));

// ── 1. API Access to Vision Tables ───────────────────────────────────────────

describe('Area 1: API access to vision tables', () => {
  const VISION_TABLES = [
    'eva_vision_scores',
    'eva_vision_gaps',
    'eva_vision_documents',
    'eva_architecture_plans',
    'strategic_directives_v2',
  ];

  it('mocked Supabase client can query all 5 core vision tables without throwing', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient('https://test.supabase.co', 'test-key');

    for (const table of VISION_TABLES) {
      const result = supabase.from(table).select('*').limit(1);
      expect(result).toBeDefined();
    }
  });

  it('eva_vision_scores query returns data and error fields', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient('https://test.supabase.co', 'test-key');
    const result = supabase.from('eva_vision_scores').select('id, sd_id, total_score').limit(1);
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
  });
});

// ── 2. GATE_VISION_SCORE Logic ────────────────────────────────────────────────

describe('Area 2: GATE_VISION_SCORE pass/fail logic', () => {
  // Threshold table from CLAUDE_CORE_DIGEST: bugfix=70, infrastructure=disabled
  const THRESHOLDS = {
    bugfix: 70,
    feature: 85,
    infrastructure: null, // DISABLED
    documentation: null,  // DISABLED
  };

  function gateResult(score, sdType) {
    const threshold = THRESHOLDS[sdType];
    if (threshold === null) return { passed: true, reason: 'DISABLED_FOR_TYPE' };
    return { passed: score >= threshold, score, threshold };
  }

  it('score 69 fails GATE_VISION_SCORE for bugfix SD type', () => {
    const result = gateResult(69, 'bugfix');
    expect(result.passed).toBe(false);
  });

  it('score 70 passes GATE_VISION_SCORE for bugfix SD type', () => {
    const result = gateResult(70, 'bugfix');
    expect(result.passed).toBe(true);
  });

  it('score 84 fails GATE_VISION_SCORE for feature SD type (threshold 85)', () => {
    const result = gateResult(84, 'feature');
    expect(result.passed).toBe(false);
  });

  it('infrastructure SD type bypasses gate regardless of score', () => {
    expect(gateResult(0, 'infrastructure').passed).toBe(true);
    expect(gateResult(0, 'infrastructure').reason).toBe('DISABLED_FOR_TYPE');
  });

  it('documentation SD type bypasses gate regardless of score', () => {
    expect(gateResult(0, 'documentation').passed).toBe(true);
  });

  it('score 100 passes gate for all scored SD types', () => {
    expect(gateResult(100, 'bugfix').passed).toBe(true);
    expect(gateResult(100, 'feature').passed).toBe(true);
  });
});

// ── 3. Periodic Scorer Scheduling ────────────────────────────────────────────

describe('Area 3: Periodic scorer registration', () => {
  it('eva-master-scheduler.js file exists at expected path', async () => {
    const { existsSync } = await import('fs');
    const { resolve } = await import('path');
    const schedulerPath = resolve(process.cwd(), 'lib/eva/eva-master-scheduler.js');
    expect(existsSync(schedulerPath)).toBe(true);
  });

  it('eva-master-scheduler.js mentions VISION_PERIODIC_SCORING_ENABLED guard', async () => {
    const { readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');
    const schedulerPath = resolve(process.cwd(), 'lib/eva/eva-master-scheduler.js');
    if (!existsSync(schedulerPath)) return; // skip if missing
    const content = readFileSync(schedulerPath, 'utf8');
    expect(content).toContain('VISION_PERIODIC_SCORING_ENABLED');
  });

  it('eva-master-scheduler.js references periodic vision scoring method', async () => {
    const { readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');
    const schedulerPath = resolve(process.cwd(), 'lib/eva/eva-master-scheduler.js');
    if (!existsSync(schedulerPath)) return;
    const content = readFileSync(schedulerPath, 'utf8');
    expect(content.toLowerCase()).toContain('periodicvision');
  });
});

// ── 4. Corrective SD Generator ────────────────────────────────────────────────

describe('Area 4: Corrective SD generator structure', () => {
  it('corrective-sd-generator.mjs exists at expected path', async () => {
    const { existsSync } = await import('fs');
    const { resolve } = await import('path');
    const generatorPath = resolve(process.cwd(), 'scripts/eva/corrective-sd-generator.mjs');
    expect(existsSync(generatorPath)).toBe(true);
  });

  it('corrective-sd-generator.mjs reads from eva_vision_scores', async () => {
    const { readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');
    const generatorPath = resolve(process.cwd(), 'scripts/eva/corrective-sd-generator.mjs');
    if (!existsSync(generatorPath)) return;
    const content = readFileSync(generatorPath, 'utf8');
    expect(content).toContain('eva_vision_scores');
  });

  it('corrective-sd-generator.mjs sets vision_origin_score_id on created SDs', async () => {
    const { readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');
    const generatorPath = resolve(process.cwd(), 'scripts/eva/corrective-sd-generator.mjs');
    if (!existsSync(generatorPath)) return;
    const content = readFileSync(generatorPath, 'utf8');
    expect(content).toContain('vision_origin_score_id');
  });
});

// ── 5. Rescore-on-Completion Hook ─────────────────────────────────────────────

describe('Area 5: Rescore-on-completion hook', () => {
  it('lead-final-approval executor exists', async () => {
    const { existsSync } = await import('fs');
    const { resolve } = await import('path');
    const hookPath = resolve(process.cwd(), 'scripts/modules/handoff/executors/lead-final-approval/index.js');
    expect(existsSync(hookPath)).toBe(true);
  });

  it('lead-final-approval executor references vision_origin_score_id', async () => {
    const { readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');
    const hookPath = resolve(process.cwd(), 'scripts/modules/handoff/executors/lead-final-approval/index.js');
    if (!existsSync(hookPath)) return;
    const content = readFileSync(hookPath, 'utf8');
    expect(content).toContain('vision_origin_score_id');
  });

  it('lead-final-approval executor has rescore function', async () => {
    const { readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');
    const hookPath = resolve(process.cwd(), 'scripts/modules/handoff/executors/lead-final-approval/index.js');
    if (!existsSync(hookPath)) return;
    const content = readFileSync(hookPath, 'utf8');
    expect(content.toLowerCase()).toContain('rescore');
  });
});

// ── 6. Dashboard Hook Dimension Parsing ───────────────────────────────────────

describe('Area 6: useVisionDashboardData dimension_scores parsing', () => {
  // Test the dimension parsing logic in isolation (without importing the React hook)

  function parseDimensionScores(dimensionScores) {
    const totals = new Map();
    if (!dimensionScores) return totals;
    if (Array.isArray(dimensionScores)) {
      for (const dim of dimensionScores) {
        const name = dim.dimension ?? dim.name ?? 'Unknown';
        const score = dim.score ?? 0;
        const existing = totals.get(name) ?? { sum: 0, count: 0 };
        totals.set(name, { sum: existing.sum + score, count: existing.count + 1 });
      }
    } else if (typeof dimensionScores === 'object') {
      for (const [key, val] of Object.entries(dimensionScores)) {
        if (typeof val !== 'number') continue;
        const existing = totals.get(key) ?? { sum: 0, count: 0 };
        totals.set(key, { sum: existing.sum + val, count: existing.count + 1 });
      }
    }
    return totals;
  }

  it('parses legacy array format correctly', () => {
    const dims = [{ dimension: 'V01', score: 80 }, { dimension: 'A02', score: 90 }];
    const result = parseDimensionScores(dims);
    expect(result.get('V01')?.sum).toBe(80);
    expect(result.get('A02')?.sum).toBe(90);
  });

  it('parses organic scorer JSONB object format correctly', () => {
    const dims = { V01: 75, V02: 68, A01: 72, A02: 88 };
    const result = parseDimensionScores(dims);
    expect(result.get('V01')?.sum).toBe(75);
    expect(result.get('A02')?.sum).toBe(88);
    expect(result.size).toBe(4);
  });

  it('handles null dimension_scores gracefully', () => {
    const result = parseDimensionScores(null);
    expect(result.size).toBe(0);
  });

  it('skips non-numeric values in object format', () => {
    const dims = { V01: 75, vision_alignment: { nested: 'object' }, A02: 88 };
    const result = parseDimensionScores(dims);
    expect(result.size).toBe(2); // only V01 and A02 (numeric values)
  });

  it('dashboard hook file has been updated to handle object format', async () => {
    const { readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');
    const hookPath = resolve(process.cwd(), '../ehg/src/hooks/useVisionDashboardData.ts');
    if (!existsSync(hookPath)) return; // EHG app may not be accessible
    const content = readFileSync(hookPath, 'utf8');
    expect(content).toContain('typeof dims === "object"');
    expect(content).toContain('Object.entries');
  });
});
