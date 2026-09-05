/**
 * Unit tests for lib/coordinator/reaper-cadence-gauge.cjs
 * SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 FR-2 (AC-2: last_spawn_at is ground truth,
 * never Task Scheduler's self-reported health).
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const {
  evaluateCadenceHealth,
  readCadenceHealth,
  DEFAULT_SWEEP_INTERVAL_MINUTES,
  DEFAULT_STALE_MULTIPLIER,
} = require('../../../lib/coordinator/reaper-cadence-gauge.cjs');

const NOW = Date.parse('2026-09-04T12:00:00.000Z');

describe('evaluateCadenceHealth()', () => {
  it('is unhealthy (never_spawned) when last_spawn_at has never been recorded', () => {
    const r = evaluateCadenceHealth({ lastSpawnAt: null, nowMs: NOW });
    expect(r.healthy).toBe(false);
    expect(r.reason).toBe('never_spawned');
  });

  it('is healthy when the last spawn is well within the expected cadence window', () => {
    // cadence=12, sweepIntervalMinutes=5 -> expected ~60min; spawned 10min ago is comfortably fresh.
    const lastSpawnAt = new Date(NOW - 10 * 60000).toISOString();
    const r = evaluateCadenceHealth({ lastSpawnAt, nowMs: NOW });
    expect(r.healthy).toBe(true);
    expect(r.reason).toBe('within_expected_cadence');
    expect(r.expectedIntervalMinutes).toBe(60);
  });

  it('is stale when last_spawn_at has not advanced within 2x the expected sweep-piggyback interval', () => {
    // 2x60 = 120min threshold; 130min ago exceeds it.
    const lastSpawnAt = new Date(NOW - 130 * 60000).toISOString();
    const r = evaluateCadenceHealth({ lastSpawnAt, nowMs: NOW });
    expect(r.healthy).toBe(false);
    expect(r.reason).toBe('stale');
  });

  it('is healthy exactly at the 2x-cadence boundary (not yet exceeded)', () => {
    const lastSpawnAt = new Date(NOW - 119 * 60000).toISOString();
    const r = evaluateCadenceHealth({ lastSpawnAt, nowMs: NOW });
    expect(r.healthy).toBe(true);
  });

  it('reports unparseable_last_spawn_at for garbage input, never throws', () => {
    const r = evaluateCadenceHealth({ lastSpawnAt: 'not-a-date', nowMs: NOW });
    expect(r.healthy).toBe(false);
    expect(r.reason).toBe('unparseable_last_spawn_at');
  });

  it('reports last_spawn_at_in_future for a clock anomaly, distinct from stale', () => {
    const lastSpawnAt = new Date(NOW + 10 * 60000).toISOString();
    const r = evaluateCadenceHealth({ lastSpawnAt, nowMs: NOW });
    expect(r.healthy).toBe(false);
    expect(r.reason).toBe('last_spawn_at_in_future');
  });

  it('honors an overridden cadence/sweep interval/multiplier', () => {
    // cadence=1, sweepIntervalMinutes=5, multiplier=1 -> 5min threshold.
    const lastSpawnAt = new Date(NOW - 6 * 60000).toISOString();
    const r = evaluateCadenceHealth({ lastSpawnAt, nowMs: NOW, cadence: 1, sweepIntervalMinutes: 5, staleMultiplier: 1 });
    expect(r.healthy).toBe(false);
    expect(r.expectedIntervalMinutes).toBe(5);
  });

  it('exports the documented defaults', () => {
    expect(DEFAULT_SWEEP_INTERVAL_MINUTES).toBe(5);
    expect(DEFAULT_STALE_MULTIPLIER).toBe(2);
  });
});

describe('readCadenceHealth() — reads worktree-reaper-tick.cjs\'s own state file as ground truth', () => {
  it('reads a real .claude/worktree-reaper-state.json and reports health from its last_spawn_at', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-gauge-'));
    fs.mkdirSync(path.join(tmp, '.claude'), { recursive: true });
    const lastSpawnAt = new Date(NOW - 5 * 60000).toISOString();
    fs.writeFileSync(
      path.join(tmp, '.claude', 'worktree-reaper-state.json'),
      JSON.stringify({ schema_version: 1, sweep_counter: 5, last_spawn_at: lastSpawnAt }),
      'utf8'
    );
    const r = readCadenceHealth({ repoRoot: tmp, nowMs: NOW });
    expect(r.healthy).toBe(true);
    expect(r.state_path).toBe(path.join(tmp, '.claude', 'worktree-reaper-state.json'));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('reports never_spawned (never throws) when no state file exists at all', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-gauge-'));
    const r = readCadenceHealth({ repoRoot: tmp, nowMs: NOW });
    expect(r.healthy).toBe(false);
    expect(r.reason).toBe('never_spawned');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('requires repoRoot', () => {
    expect(() => readCadenceHealth({})).toThrow(/repoRoot required/);
  });
});
