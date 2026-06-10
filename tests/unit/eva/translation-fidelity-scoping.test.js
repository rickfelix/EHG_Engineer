/**
 * SD-LEO-FIX-PHASE-SCOPE-TRANSLATION-001 — phase-scope the TRANSLATION_FIDELITY
 * gate for multi-phase / multi-SD architecture plans.
 *
 * Resolves PAT-AUTO-7d4450fb (18x) + PAT-AUTO-fc18634f (11x): the gate compared
 * the ENTIRE arch plan against ONE SD, so sibling-delivered plan content scored
 * as lost-in-translation. Now the engine accepts {archPhase, siblings}, the LLM
 * is instructed to score only the slice this SD claims (sibling-owned content
 * comes back sibling_covered:true), and the executors demote sibling-covered
 * gaps to informational warnings — while own-slice losses still fail.
 *
 * Mirrors the mock pattern of translation-fidelity-gate.test.js (hermetic).
 *
 * DB-guard note (audit-db-test-guards.mjs Stage 1.6): this suite is FULLY
 * HERMETIC — lib/supabase-client.js (createSupabaseServiceClient) and the LLM
 * client factory are vi.mock'd below, so no live DB or network is ever touched
 * and the suite cannot hang against the no-DB sentinel. The describeDb /
 * HAS_REAL_DB wrappers are intentionally NOT used: they would skip these tests
 * in no-DB CI, where they must run. The import-signal match on this file is a
 * false positive on mocked suites (guard improvement flagged to the harness
 * backlog).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('dotenv/config', () => ({}));

// --- Supabase mock: arch plan fetch + gate persistence ---
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockSingle = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table) => {
      if (table === 'eva_translation_gates') return { insert: mockInsert };
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: mockSingle };
    }),
  })),
}));

// lib/supabase-client.js wraps createClient — mock it directly too.
vi.mock('../../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: vi.fn(() => ({
    from: vi.fn((table) => {
      if (table === 'eva_translation_gates') return { insert: mockInsert };
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: mockSingle };
    }),
  })),
}));

// --- LLM mock: capture prompts, return canned gaps ---
const mockComplete = vi.fn();
vi.mock('../../../lib/llm/client-factory.js', () => ({
  getValidationClient: vi.fn(() => ({ complete: mockComplete, modelId: 'test-model' })),
}));

const ARCH_ROW = {
  id: 'arch-1',
  plan_key: 'ARCH-MULTI-001',
  content: 'Phase A: governance API. Phase B: chairman UI. Phase C: mobile PWA.',
  extracted_dimensions: [],
  vision_id: null,
  sections: { overview: '...' },
};

const SIBLINGS = [
  { sd_key: 'SD-SIB-001', title: 'Phase B: chairman UI shell' },
  { sd_key: 'SD-SIB-002', title: 'Phase C: mobile PWA wrapper' },
];

const SD_DATA = {
  id: 'sd-1',
  sd_key: 'SD-ME-001',
  title: 'Phase A: governance API surface',
  description: 'Implements the governance API surface from the plan',
  key_changes: [],
  success_criteria: [],
};

function llmJson(payload) {
  return JSON.stringify(payload);
}

describe('translation-fidelity phase scoping (engine)', () => {
  let mod;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mod = await import('../../../scripts/eva/translation-fidelity-gate.js');
    mockSingle.mockResolvedValue({ data: ARCH_ROW, error: null });
  });

  it('FR-1: scoped run injects the MULTI-SD PLAN SCOPING block with siblings + arch_phase', async () => {
    mockComplete.mockResolvedValueOnce(llmJson({ score: 95, reasoning: 'ok', gaps: [] }));
    await mod.runArchitectureToSDGate('ARCH-MULTI-001', SD_DATA, { archPhase: 'Phase A', siblings: SIBLINGS });

    const [, userPrompt] = mockComplete.mock.calls[0];
    expect(userPrompt).toContain('MULTI-SD PLAN SCOPING');
    expect(userPrompt).toContain('delivered by 3 Strategic Directives');
    expect(userPrompt).toContain('"Phase A"');
    expect(userPrompt).toContain('SD-SIB-001');
    expect(userPrompt).toContain('SD-SIB-002');
    expect(userPrompt).toContain('sibling_covered');
  });

  it('FR-1 backward-compat: no opts produces NO scoping block (legacy prompt)', async () => {
    mockComplete.mockResolvedValueOnce(llmJson({ score: 95, reasoning: 'ok', gaps: [] }));
    await mod.runArchitectureToSDGate('ARCH-MULTI-001', SD_DATA);

    const [, userPrompt] = mockComplete.mock.calls[0];
    expect(userPrompt).not.toContain('MULTI-SD PLAN SCOPING');
    expect(userPrompt).not.toContain('sibling_covered');
  });

  it('FR-2: sibling_covered survives parsing and defaults to false when absent', async () => {
    mockComplete.mockResolvedValueOnce(llmJson({
      score: 80,
      reasoning: 'mixed',
      gaps: [
        { item: 'chairman UI shell', source: 'plan', severity: 'critical', sibling_covered: true },
        { item: 'governance rate limiting', source: 'plan', severity: 'critical' },
      ],
    }));
    const result = await mod.runArchitectureToSDGate('ARCH-MULTI-001', SD_DATA, { siblings: SIBLINGS });

    const covered = result.gaps.find(g => g.item === 'chairman UI shell');
    const own = result.gaps.find(g => g.item === 'governance rate limiting');
    expect(covered.sibling_covered).toBe(true);
    expect(own.sibling_covered).toBe(false);
    // Engine-level demotion: sibling-covered criticals are warnings, not issues.
    expect(result.issues.map(g => g.item)).toEqual(['governance rate limiting']);
    expect(result.warnings.map(g => g.item)).toContain('chairman UI shell');
  });

  it('FR-2: scoped and unscoped evaluations use different cache keys (no cross-contamination)', async () => {
    mockComplete
      .mockResolvedValueOnce(llmJson({ score: 95, reasoning: 'scoped', gaps: [] }))
      .mockResolvedValueOnce(llmJson({ score: 40, reasoning: 'unscoped', gaps: [] }));

    const scoped = await mod.runArchitectureToSDGate('ARCH-MULTI-001', SD_DATA, { siblings: SIBLINGS });
    const unscoped = await mod.runArchitectureToSDGate('ARCH-MULTI-001', SD_DATA);

    // If the cache leaked, the second call would return the first's result (95).
    expect(scoped.score).toBe(95);
    expect(unscoped.score).toBe(40);
    expect(mockComplete).toHaveBeenCalledTimes(2);
  });
});

describe('executor twins (source assertions — anti-drift)', () => {
  const LEAD = path.resolve(process.cwd(), 'scripts/modules/handoff/executors/lead-to-plan/gates/translation-fidelity.js');
  const PLAN = path.resolve(process.cwd(), 'scripts/modules/handoff/executors/plan-to-exec/gates/translation-fidelity.js');

  for (const [name, p] of [['lead-to-plan', LEAD], ['plan-to-exec', PLAN]]) {
    const src = readFileSync(p, 'utf8');

    it(`${name}: queries siblings sharing arch_key and passes {archPhase, siblings} to the engine`, () => {
      expect(src).toMatch(/metadata->>arch_key/);
      expect(src).toMatch(/runArchitectureToSDGate\(archKey, sdData, \{ archPhase, siblings \}\)/);
    });

    it(`${name}: demotes sibling-covered gaps out of criticalGaps (true positives retained)`, () => {
      expect(src).toMatch(/g\.severity === 'critical' && !g\.sibling_covered/);
      expect(src).toMatch(/\[sibling-covered\]/);
    });

    it(`${name}: fail-toward-current — sibling-query errors degrade to unscoped`, () => {
      expect(src).toMatch(/Sibling query failed \(running unscoped\)/);
    });
  }

  it('twins carry the identical scoping diff (anti-drift)', () => {
    const a = readFileSync(LEAD, 'utf8');
    const b = readFileSync(PLAN, 'utf8');
    for (const marker of [
      "filter('metadata->>arch_key', 'eq', archKey)",
      'const archPhase = sd?.metadata?.arch_phase || null;',
      'sibling_covered_count: siblingCoveredGaps.length',
    ]) {
      expect(a).toContain(marker);
      expect(b).toContain(marker);
    }
  });
});
