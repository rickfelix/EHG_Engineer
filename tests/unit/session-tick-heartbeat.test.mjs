/**
 * Regression tests for scripts/session-tick.cjs
 * SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001 FR-4
 *
 * Asserts the tick updates both heartbeat_at and process_alive_at.
 * claim-guard.mjs keys claim TTL on heartbeat_at (300s stale threshold).
 * If the tick only patches process_alive_at, long Edit/Write/Read bursts
 * that don't invoke any CLI script will lose the claim.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');
const tickPath = resolve(repoRoot, 'scripts/session-tick.cjs');
const claimGuardPath = resolve(repoRoot, 'lib/claim-guard.mjs');

describe('session-tick.cjs — heartbeat update (FR-4)', () => {
  const src = readFileSync(tickPath, 'utf8');

  it('tickOnce() PATCH body includes heartbeat_at', () => {
    // The PATCH body was previously { process_alive_at: ... } which left
    // heartbeat_at to decay. claim-guard's stale threshold is 300s on
    // heartbeat_at, so a 60-min Edit/Write session would lose its claim.
    expect(src).toMatch(/heartbeat_at:\s*now\b/);
  });

  it('tickOnce() PATCH body still includes process_alive_at', () => {
    // process_alive_at is consumed by source-side fleet liveness dashboards.
    // Keep it — FR-4 adds heartbeat_at, doesn't replace process_alive_at.
    expect(src).toMatch(/process_alive_at:\s*now\b/);
  });

  it('both timestamps come from a single "now" so they match exactly', () => {
    // Minimize drift across consumers inspecting both columns.
    const m = src.match(/const\s+now\s*=\s*new\s+Date\(\)\.toISOString\(\)/);
    expect(m, 'tickOnce should compute `const now = new Date().toISOString()` once').not.toBeNull();
  });
});

describe('session-tick.cjs — FR-4 alignment with claim-guard', () => {
  it('claim-guard still keys TTL on heartbeat_at (sanity check)', () => {
    // If someone changes claim-guard to use a different column, this test
    // will fire a reminder to re-check the tick's PATCH body.
    const guardSrc = readFileSync(claimGuardPath, 'utf8');
    expect(guardSrc).toMatch(/heartbeat_at/);
  });
});
