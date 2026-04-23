/**
 * Regression tests for scripts/session-tick.cjs
 * SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001 FR-4
 *
 * Asserts the tick updates both heartbeat_at and process_alive_at.
 * claim-guard.mjs keys claim TTL on heartbeat_at (300s stale threshold).
 * If the tick only patches process_alive_at, long Edit/Write/Read bursts
 * that don't invoke any CLI script will lose the claim.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '../..');
const tickPath = resolve(repoRoot, 'scripts/session-tick.cjs');
const claimGuardPath = resolve(repoRoot, 'lib/claim-guard.mjs');

const tickSrc = readFileSync(tickPath, 'utf8');
const guardSrc = readFileSync(claimGuardPath, 'utf8');

test('FR-4: tickOnce() PATCH body includes heartbeat_at', () => {
  // The PATCH body was previously { process_alive_at: ... } which left
  // heartbeat_at to decay. claim-guard's stale threshold is 300s on
  // heartbeat_at, so a 60-min Edit/Write session would lose its claim.
  assert.match(tickSrc, /heartbeat_at:\s*now\b/);
});

test('FR-4: tickOnce() PATCH body still includes process_alive_at', () => {
  // process_alive_at is consumed by source-side fleet liveness dashboards.
  // Keep it — FR-4 adds heartbeat_at, doesn't replace process_alive_at.
  assert.match(tickSrc, /process_alive_at:\s*now\b/);
});

test('FR-4: both timestamps come from a single "now" so they match exactly', () => {
  // Minimize drift across consumers inspecting both columns.
  assert.match(
    tickSrc,
    /const\s+now\s*=\s*new\s+Date\(\)\.toISOString\(\)/,
    'tickOnce should compute `const now = new Date().toISOString()` once'
  );
});

test('FR-4: claim-guard still keys TTL on heartbeat_at (alignment sanity check)', () => {
  // If someone changes claim-guard to use a different column, this test
  // will fire a reminder to re-check the tick's PATCH body.
  assert.match(guardSrc, /heartbeat_at/);
});
