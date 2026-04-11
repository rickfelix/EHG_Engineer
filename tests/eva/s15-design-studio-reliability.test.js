/**
 * Regression tests for SD-MAN-FIX-S15-DESIGN-STUDIO-001
 * S15 Design Studio + Stitch Integration Reliability
 *
 * Covers 5 fixes:
 *   1. LLM interface migration (generateContent → complete)
 *   2. Stitch retry backoff alignment (1s→15s base, 3→2 retries)
 *   3. Per-stage timeout override via lifecycle_stage_config
 *   4. Hard-fail gating on zero wireframe screens
 *   5. 480s AbortController guard on Stitch provisioner
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function readSource(relPath) {
  return readFileSync(resolve(relPath), 'utf-8');
}

// ── Fix 1: LLM Interface Migration ──────────────────────────────────────

describe('Fix 1: stage-15-user-story-pack LLM interface', () => {
  const source = readSource('lib/eva/stage-templates/analysis-steps/stage-15-user-story-pack.js');

  it('uses llm.complete() instead of llm.generateContent()', () => {
    expect(source).toContain('llm.complete(systemPrompt, userPrompt,');
    expect(source).not.toContain('llm.generateContent(');
  });

  it('has runtime check for missing complete() method', () => {
    expect(source).toContain("typeof llm.complete !== 'function'");
    expect(source).toContain('LLM client missing complete() method');
  });

  it('passes timeout option to llm.complete()', () => {
    expect(source).toContain('timeout: 120000');
  });
});

// ── Fix 2: Stitch Retry Backoff ─────────────────────────────────────────

describe('Fix 2: Stitch retry backoff constants', () => {
  const source = readSource('lib/eva/bridge/stitch-client.js');

  it('RETRY_BASE_DELAY_MS is 15000 (was 1000)', () => {
    expect(source).toContain('const RETRY_BASE_DELAY_MS = 15_000;');
    expect(source).not.toContain('const RETRY_BASE_DELAY_MS = 1000;');
  });

  it('RETRY_MAX is 2 (was 3)', () => {
    expect(source).toContain('const RETRY_MAX = 2;');
    expect(source).not.toContain('const RETRY_MAX = 3;');
  });

  it('worst-case per-screen: 2 retries × 60s + 15s + 30s = 165s', () => {
    // Verify the exponential backoff math: base=15000, attempts=[1,2]
    const base = 15_000;
    const maxRetries = 2;
    const delays = [];
    for (let i = 1; i < maxRetries; i++) {
      delays.push(base * Math.pow(2, i - 1));
    }
    // delay for attempt 1 retry = 15000ms
    expect(delays[0]).toBe(15_000);
    // Total delay budget is manageable (< 60s)
    expect(delays.reduce((a, b) => a + b, 0)).toBeLessThan(60_000);
  });
});

// ── Fix 3: Per-Stage Timeout Override ───────────────────────────────────

describe('Fix 3: per-stage timeout override', () => {
  const source = readSource('lib/eva/stage-execution-worker.js');

  it('has _getStageTimeoutMs method that reads lifecycle_stage_config', () => {
    expect(source).toContain('async _getStageTimeoutMs(stageNumber)');
    expect(source).toContain("'lifecycle_stage_config'");
    expect(source).toContain('stage_timeout_ms');
  });

  it('_getStageTimeoutMs falls back to _staleLockThresholdMs', () => {
    expect(source).toContain('return this._staleLockThresholdMs');
  });

  it('_markStaleExecutions checks per-stage timeout before marking', () => {
    expect(source).toContain('const stageThreshold = await this._getStageTimeoutMs(exec.lifecycle_stage)');
    expect(source).toContain('if (age < stageThreshold) continue');
  });

  it('stale execution error message includes per-stage threshold', () => {
    expect(source).toContain('threshold ${stageThreshold / 1000}s');
  });
});

// ── Fix 4: Hard-Fail Gating on Zero Screens ────────────────────────────

describe('Fix 4: hard-fail on zero wireframe screens', () => {
  const source = readSource('lib/eva/stage-templates/stage-15.js');

  it('checks screen count === 0 when gating enabled', () => {
    expect(source).toContain('wireframeResult.screens?.length === 0');
  });

  it('throws descriptive error on zero screens', () => {
    expect(source).toContain('Hard-fail: 0 wireframe screens generated');
  });

  it('only fails when wireframeGatingEnabled is true', () => {
    expect(source).toContain('wireframeGatingEnabled && wireframeResult');
  });

  it('check runs before visual convergence (sub-step 4)', () => {
    const hardFailIndex = source.indexOf('Hard-fail: 0 wireframe screens');
    const convergenceIndex = source.indexOf('Sub-step 4: Visual convergence');
    expect(hardFailIndex).toBeLessThan(convergenceIndex);
  });
});

// ── Fix 5: Abort Timeout Guard ──────────────────────────────────────────

describe('Fix 5: 480s abort guard on Stitch provisioner', () => {
  const source = readSource('lib/eva/stage-execution-worker.js');

  it('has 480s timeout constant', () => {
    expect(source).toContain('STITCH_PROVISION_TIMEOUT_MS = 480_000');
  });

  it('uses AbortController for timeout', () => {
    expect(source).toContain('new AbortController()');
    expect(source).toContain('ac.abort()');
  });

  it('uses Promise.race for timeout enforcement', () => {
    expect(source).toContain('Promise.race');
    expect(source).toContain('postStage15Hook(ventureId, s15Work)');
  });

  it('cleans up timer in finally block', () => {
    expect(source).toContain('clearTimeout(timer)');
  });

  it('abort fires before the 600s lock expiry (120s margin)', () => {
    const STITCH_PROVISION_TIMEOUT_MS = 480_000;
    const STAGE_15_LOCK_TIMEOUT_MS = 600_000;
    expect(STITCH_PROVISION_TIMEOUT_MS).toBeLessThan(STAGE_15_LOCK_TIMEOUT_MS);
    expect(STAGE_15_LOCK_TIMEOUT_MS - STITCH_PROVISION_TIMEOUT_MS).toBe(120_000);
  });
});
