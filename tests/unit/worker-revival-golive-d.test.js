/**
 * SD-LEO-INFRA-WORKER-REVIVAL-GOLIVE-READINESS-001-D (CHILD C) — ops wiring.
 * Locks the launch-shape-INDEPENDENT deliverables. The launch model itself is
 * deferred to CHILD A and is intentionally NOT asserted here.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repo = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(repo, p), 'utf8');

describe('SD-...-001-D: worker-revival go-live ops wiring', () => {
  it('FR-1: fleet:spawn-executor npm script is present (assert-present, not re-add)', () => {
    const pkg = require(path.join(repo, 'package.json'));
    expect(pkg.scripts['fleet:spawn-executor']).toBe('node scripts/fleet/worker-spawn-executor.cjs');
  });

  it('FR-2: .env.example documents both executor flags with safe defaults + operator gate', () => {
    const env = read('.env.example');
    expect(env).toMatch(/WORKER_SPAWN_EXECUTOR_LIVE=false/);
    expect(env).toMatch(/WORKER_SPAWN_EXECUTOR_PER_TICK_CAP=2/);
    expect(env).toMatch(/OPERATOR GATE/);
  });

  it('FR-3: supersede npm script wired and wraps the canonical reaper (no duplicate DB logic)', () => {
    const pkg = require(path.join(repo, 'package.json'));
    expect(pkg.scripts['fleet:supersede-expired-spawns']).toBe('node scripts/fleet/supersede-expired-spawn-requests.mjs');
    const src = read('scripts/fleet/supersede-expired-spawn-requests.mjs');
    expect(src).toMatch(/reapExpiredPendingRequests/);
    expect(src).toMatch(/coordinator-revive\.cjs/);
    // must NOT hand-roll its own UPDATE — it reuses the canonical reaper
    expect(src).not.toMatch(/\.update\(\s*\{\s*status:\s*['"]expired['"]/);
  });

  it('FR-3: the canonical reaper is exported and idempotently scoped to expired-pending', () => {
    const revive = require(path.join(repo, 'scripts/coordinator-revive.cjs'));
    expect(typeof revive.reapExpiredPendingRequests).toBe('function');
    const src = read('scripts/coordinator-revive.cjs');
    expect(src).toMatch(/\.eq\('status',\s*'pending'\)/);
    expect(src).toMatch(/\.lte\('expires_at'/);
  });

  it('FR-4: doc carries the fulfilled-live-vs-dead validation query on the authoritative liveness surface', () => {
    const doc = read('docs/protocol/coordinator-worker-revival.md');
    expect(doc).toMatch(/fulfilled_live/);
    expect(doc).toMatch(/fulfilled_dead/);
    expect(doc).toMatch(/v_active_sessions/);
    expect(doc).not.toMatch(/age\s*[<>]=?\s*\d+\s*(?:second|minute|hour)/i); // not row-age based
  });

  it('FR-5: doc marks the launch model DEFERRED to CHILD A (no launch-model commitment here)', () => {
    const doc = read('docs/protocol/coordinator-worker-revival.md');
    expect(doc).toMatch(/DEFERRED to CHILD A/);
    expect(doc).toMatch(/fleet:supersede-expired-spawns/);
  });
});
