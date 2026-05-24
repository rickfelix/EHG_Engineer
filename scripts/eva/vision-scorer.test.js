import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  resolveDefaultKeysFromSD,
  tierKeysFromSDKey,
  DEFAULT_VISION_KEY,
  DEFAULT_ARCH_KEY,
  _emitQualityCheckWarningIfNeeded,
} from './vision-scorer.js';
import { OpenAIAdapter } from '../../lib/sub-agents/vetting/provider-adapters.js';

function fakeSupabase(row) {
  return {
    from() { return this; },
    select() { return this; },
    or() { return this; },
    maybeSingle: async () => ({ data: row, error: null })
  };
}

describe('resolveDefaultKeysFromSD', () => {
  it('returns nulls when sdKey is empty', async () => {
    const result = await resolveDefaultKeysFromSD(null, null);
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('returns nulls when SD has no metadata and no tier suffix', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-X');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('returns vision_key + arch_key from SD metadata (metadata wins)', async () => {
    const supabase = fakeSupabase({ metadata: { vision_key: 'VISION-X-L2-001', arch_key: 'ARCH-X-001' } });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-X');
    expect(result).toEqual({ vision_key: 'VISION-X-L2-001', arch_key: 'ARCH-X-001' });
  });

  it('returns nulls when row not found and no tier suffix', async () => {
    const supabase = fakeSupabase(null);
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-MISSING');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('exports L1 fallback constants', () => {
    expect(DEFAULT_VISION_KEY).toBe('VISION-EHG-L1-001');
    expect(DEFAULT_ARCH_KEY).toBe('ARCH-EHG-L1-001');
  });

  it('returns vision_key only when arch_key missing in metadata (metadata wins, no suffix fallback)', async () => {
    const supabase = fakeSupabase({ metadata: { vision_key: 'VISION-X-L2-001' } });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-X');
    expect(result).toEqual({ vision_key: 'VISION-X-L2-001', arch_key: null });
  });

  // SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001: suffix autodetection (TS-4)
  it('falls back to suffix-derived L2 keys when metadata is null and sd_key matches /-L2-/', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-VISION-S17-SIMPLIFY-L2-001');
    expect(result).toEqual({ vision_key: 'VISION-EHG-L2-001', arch_key: 'ARCH-EHG-L2-001' });
  });

  // SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001: suffix autodetection — L1 + L3
  it('falls back to suffix-derived L1 keys', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-FOO-L1-001');
    expect(result).toEqual({ vision_key: 'VISION-EHG-L1-001', arch_key: 'ARCH-EHG-L1-001' });
  });

  it('falls back to suffix-derived L3 keys', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-FOO-L3-007');
    expect(result).toEqual({ vision_key: 'VISION-EHG-L3-001', arch_key: 'ARCH-EHG-L3-001' });
  });

  // SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001: suffix autodetect MISS (TS-5)
  it('returns nulls when sd_key has no tier suffix', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-LEO-INFRA-FOO-001');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('does not match unrelated L4-L9 substrings', async () => {
    const supabase = fakeSupabase({ metadata: null });
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-FOO-L4-001');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });

  it('does not match without hyphen guards (e.g. L2 inside word)', async () => {
    const supabase = fakeSupabase({ metadata: null });
    // 'SD-XL2X-001' contains 'L2' but not bounded by hyphens — must NOT match
    const result = await resolveDefaultKeysFromSD(supabase, 'SD-XL2X-001');
    expect(result).toEqual({ vision_key: null, arch_key: null });
  });
});

describe('tierKeysFromSDKey', () => {
  it('returns nulls for empty input', () => {
    expect(tierKeysFromSDKey('')).toEqual({ vision_key: null, arch_key: null, tier: null });
    expect(tierKeysFromSDKey(null)).toEqual({ vision_key: null, arch_key: null, tier: null });
    expect(tierKeysFromSDKey(undefined)).toEqual({ vision_key: null, arch_key: null, tier: null });
  });

  it('extracts L1 from sd_key', () => {
    expect(tierKeysFromSDKey('SD-A-L1-001')).toEqual({
      vision_key: 'VISION-EHG-L1-001',
      arch_key: 'ARCH-EHG-L1-001',
      tier: 'L1'
    });
  });

  it('extracts L2 from sd_key', () => {
    expect(tierKeysFromSDKey('SD-VISION-S17-SIMPLIFY-L2-001')).toEqual({
      vision_key: 'VISION-EHG-L2-001',
      arch_key: 'ARCH-EHG-L2-001',
      tier: 'L2'
    });
  });

  it('extracts L3 from sd_key', () => {
    expect(tierKeysFromSDKey('SD-A-L3-042')).toEqual({
      vision_key: 'VISION-EHG-L3-001',
      arch_key: 'ARCH-EHG-L3-001',
      tier: 'L3'
    });
  });

  it('returns nulls when no tier suffix matches', () => {
    expect(tierKeysFromSDKey('SD-LEO-INFRA-FOO-001')).toEqual({
      vision_key: null,
      arch_key: null,
      tier: null
    });
  });

  it('rejects non-string input gracefully', () => {
    expect(tierKeysFromSDKey(42)).toEqual({ vision_key: null, arch_key: null, tier: null });
    expect(tierKeysFromSDKey({})).toEqual({ vision_key: null, arch_key: null, tier: null });
  });
});

// SD-FDBK-INFRA-EVA-VISION-DOCUMENTS-001 (Option A NARROWED) — quality_checked
// wiring tests. Static-guard tests pin the SELECT projection literal in the
// source file (FR-1, FR-2). Behavior tests cover the warn helper directly
// (FR-3, FR-4) without spinning up the full scoreSD pipeline.

describe('SELECT projection regression-pin (FR-1, FR-2)', () => {
  const SCORER_SOURCE = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'vision-scorer.js'),
    'utf8'
  );

  it('loadVisionDimensions SELECT includes quality_checked', () => {
    // Pin the eva_vision_documents .select() projection so a future refactor
    // cannot silently drop quality_checked observability.
    const visionSelectMatch = SCORER_SOURCE.match(
      /\.from\(['"]eva_vision_documents['"]\)[\s\S]*?\.select\(['"]([^'"]+)['"]\)/
    );
    expect(visionSelectMatch, 'eva_vision_documents .select() projection').not.toBeNull();
    expect(visionSelectMatch[1]).toContain('quality_checked');
    expect(visionSelectMatch[1]).toContain('quality_issues');
  });

  it('loadArchDimensions SELECT includes quality_checked', () => {
    // Symmetric pin for the eva_architecture_plans .select() projection.
    const archSelectMatch = SCORER_SOURCE.match(
      /\.from\(['"]eva_architecture_plans['"]\)[\s\S]*?\.select\(['"]([^'"]+)['"]\)/
    );
    expect(archSelectMatch, 'eva_architecture_plans .select() projection').not.toBeNull();
    expect(archSelectMatch[1]).toContain('quality_checked');
    expect(archSelectMatch[1]).toContain('quality_issues');
  });
});

describe('_emitQualityCheckWarningIfNeeded (FR-3, FR-4)', () => {
  function makeLogger() {
    return { warn: vi.fn() };
  }

  it('does NOT warn when both qc=true (FR-4)', () => {
    const logger = makeLogger();
    const emitted = _emitQualityCheckWarningIfNeeded('SD-X', true, true, logger);
    expect(emitted).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns once when vision qc=false, arch qc=true (FR-3)', () => {
    const logger = makeLogger();
    const emitted = _emitQualityCheckWarningIfNeeded('SD-X', false, true, logger);
    expect(emitted).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const msg = logger.warn.mock.calls[0][0];
    expect(msg).toContain('[VisionScorer][QC-WARN]');
    expect(msg).toContain('sd_key=SD-X');
    expect(msg).toContain('vision_qc=false');
    expect(msg).toContain('arch_qc=true');
  });

  it('warns once when arch qc=false, vision qc=true', () => {
    const logger = makeLogger();
    const emitted = _emitQualityCheckWarningIfNeeded('SD-Y', true, false, logger);
    expect(emitted).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('vision_qc=true');
    expect(logger.warn.mock.calls[0][0]).toContain('arch_qc=false');
  });

  it('warns ONCE (not twice) when both qc=false (FR-3 dedup)', () => {
    const logger = makeLogger();
    const emitted = _emitQualityCheckWarningIfNeeded('SD-Z', false, false, logger);
    expect(emitted).toBe(true);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('does NOT warn when qc is null/undefined (unknown is not actionable)', () => {
    const logger = makeLogger();
    expect(_emitQualityCheckWarningIfNeeded('SD-Q', null, null, logger)).toBe(false);
    expect(_emitQualityCheckWarningIfNeeded('SD-Q', undefined, undefined, logger)).toBe(false);
    expect(_emitQualityCheckWarningIfNeeded('SD-Q', null, true, logger)).toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('falls back sd_key="unknown" when sdKey is empty string or null', () => {
    const logger = makeLogger();
    _emitQualityCheckWarningIfNeeded('', false, true, logger);
    _emitQualityCheckWarningIfNeeded(null, false, true, logger);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn.mock.calls[0][0]).toContain('sd_key=unknown');
    expect(logger.warn.mock.calls[1][0]).toContain('sd_key=unknown');
  });
});

// SD-FDBK-FIX-VISION-SCORER-DETERMINISM-001 — determinism wiring.
// Source-pin the scoreSD call sites + programmatic path (the established
// "don't spin up the full pipeline" convention above), plus a behavioral test
// of the additive adapter seed guard.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCORER_SRC = readFileSync(join(ROOT, 'scripts/eva/vision-scorer.js'), 'utf8');
const ADAPTERS_SRC = readFileSync(join(ROOT, 'lib/sub-agents/vetting/provider-adapters.js'), 'utf8');
const OLLAMA_TOOL_SRC = readFileSync(join(ROOT, 'lib/programmatic/tools/ollama-tool.js'), 'utf8');
const PROG_SCORER_SRC = readFileSync(join(ROOT, 'scripts/programmatic/vision-scorer.js'), 'utf8');

describe('FR-1/FR-2: scoreSD pins temperature:0 + seed on both validation calls', () => {
  it('defines a fixed VISION_SCORE_SEED constant', () => {
    expect(SCORER_SRC).toMatch(/const VISION_SCORE_SEED\s*=\s*\d+/);
  });

  it('passes temperature:0 and seed on BOTH complete() calls (main + repair retry)', () => {
    // TS-A/TS-B/TS-C: both llmClient.complete() option objects carry the pins.
    const matches = SCORER_SRC.match(/temperature:\s*0,\s*seed:\s*VISION_SCORE_SEED/g) || [];
    expect(matches.length).toBe(2);
  });

  it('does NOT pass a per-call thinkingBudget (FR-3: so Anthropic honors temperature:0)', () => {
    // The thinking-mode temperature-delete branch only fires on a per-call
    // options.thinkingBudget>0; scoreSD must never set it (the instance-level
    // adapter.thinkingBudget in client-factory does not reach complete()).
    const completeCalls = SCORER_SRC.match(/llmClient\.complete\([^;]*?\)/gs) || [];
    expect(completeCalls.length).toBeGreaterThanOrEqual(2);
    for (const c of completeCalls) expect(c).not.toMatch(/thinkingBudget/);
  });

  it('documents the per-provider determinism matrix (FR-7)', () => {
    expect(SCORER_SRC).toMatch(/determinism matrix/i);
    expect(SCORER_SRC).toMatch(/Anthropic.*no seed|no seed/i);
  });
});

describe('FR-2: adapter seed guards (source pins for non-OpenAI providers)', () => {
  it('GoogleAdapter sets generationConfig.seed only when options.seed is defined', () => {
    expect(ADAPTERS_SRC).toMatch(/if \(options\.seed !== undefined\)\s*\{\s*generationConfig\.seed = options\.seed/);
  });

  it('OllamaAdapter spreads seed only when defined (not the temperature ?? idiom)', () => {
    expect(ADAPTERS_SRC).toMatch(/options\.seed !== undefined \? \{ seed: options\.seed \} : \{\}/);
  });

  it('AnthropicAdapter never forwards a seed (no seed key in the adapter)', () => {
    // Anthropic SDK has no seed param; ensure we did not add one.
    const anthropicBlock = ADAPTERS_SRC.slice(
      ADAPTERS_SRC.indexOf('class AnthropicAdapter'),
      ADAPTERS_SRC.indexOf('class OpenAIAdapter')
    );
    expect(anthropicBlock).not.toMatch(/\.seed\b|seed:/);
  });
});

describe('FR-2: OpenAIAdapter seed guard (behavioral)', () => {
  function spyFetch(captured) {
    return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      captured.body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) };
    });
  }

  it('includes body.seed + temperature only as passed; omits seed when undefined', async () => {
    const adapter = new OpenAIAdapter({ apiKey: 'test-key', model: 'gpt-test' });

    const withSeed = {};
    let spy = spyFetch(withSeed);
    try {
      await adapter.complete('sys', 'usr', { temperature: 0, seed: 99, maxTokens: 10 });
      expect(withSeed.body.seed).toBe(99);
      expect(withSeed.body.temperature).toBe(0);
    } finally { spy.mockRestore(); }

    const noSeed = {};
    spy = spyFetch(noSeed);
    try {
      await adapter.complete('sys', 'usr', { temperature: 0, maxTokens: 10 });
      expect(noSeed.body).not.toHaveProperty('seed');
      expect(noSeed.body.temperature).toBe(0);
    } finally { spy.mockRestore(); }
  });
});

describe('FR-4: programmatic scoring path pins sampling', () => {
  it('createOllamaTool threads optional temperature/seed into the inner complete()', () => {
    expect(OLLAMA_TOOL_SRC).toMatch(/samplingTemperature\s*=\s*options\.temperature/);
    expect(OLLAMA_TOOL_SRC).toMatch(/samplingSeed\s*=\s*options\.seed/);
    expect(OLLAMA_TOOL_SRC).toMatch(/samplingTemperature !== undefined \? \{ temperature: samplingTemperature \}/);
    expect(OLLAMA_TOOL_SRC).toMatch(/samplingSeed !== undefined \? \{ seed: samplingSeed \}/);
  });

  it('the programmatic vision-scorer constructs the ollama tool with temperature:0 + a fixed seed', () => {
    expect(PROG_SCORER_SRC).toMatch(/createOllamaTool\(\{\s*temperature:\s*0,\s*seed:\s*\d+\s*\}\)/);
  });
});
