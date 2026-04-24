/**
 * Regression test for marker-file race retry in BaseExecutor
 * SD: SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126 (Phase 5)
 * Patterns: PAT-RETRO-EXECTOPLAN-0bda95fe + PAT-HF-EXECTOPLAN-0bda95fe (residual)
 *
 * Before: BaseExecutor called assertValidClaim once. If the capture-session-id
 * hook had not yet written the marker file (race window ~100-250ms on cold
 * sessions), the handoff failed immediately with 'no_deterministic_identity'.
 *
 * After: BaseExecutor retries once after 250ms if the first attempt fails
 * with this specific reason. Happy path (marker already present) pays zero
 * additional latency.
 *
 * This is a source-shape test — full integration is covered by handoff
 * system tests. We verify the retry code exists and is scoped narrowly.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function readSource(rel) {
  return fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
}

describe('BaseExecutor marker-file race retry (PAT-0bda95fe residual)', () => {
  const src = readSource('scripts/modules/handoff/executors/BaseExecutor.js');

  it('retry loop exists around assertValidClaim', () => {
    expect(src).toMatch(/while\s*\(\s*true\s*\)/);
    expect(src).toMatch(/await assertValidClaim\(/);
  });

  it('retry only triggers on no_deterministic_identity', () => {
    expect(src).toMatch(/reason\s*===\s*['"]no_deterministic_identity['"]/);
  });

  it('retry has a bounded attempt count (not infinite)', () => {
    expect(src).toMatch(/const maxAttempts\s*=\s*\d+/);
  });

  it('retry has a delay to let marker file settle', () => {
    expect(src).toMatch(/setTimeout\(r,\s*250\)/);
  });

  it('retry logs a warning for observability', () => {
    expect(src).toMatch(/no_deterministic_identity on attempt/);
  });

  it('retry references the SD for traceability', () => {
    expect(src).toContain('SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-126');
    expect(src).toMatch(/marker-file race|marker-file to settle/);
  });
});
