import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const feed = require('../../.claude/context-usage-feed.cjs');

describe('buildUsageEntry loop_name (existing behavior, unchanged)', () => {
  const ORIGINAL_ENV = process.env.CLAUDE_LOOP_NAME;
  afterEach(() => { process.env.CLAUDE_LOOP_NAME = ORIGINAL_ENV; });

  it('omits loop_name when the env var is unset', () => {
    delete process.env.CLAUDE_LOOP_NAME;
    const entry = feed.buildUsageEntry({ sessionId: 's1', usagePercent: 10 });
    expect('loop_name' in entry).toBe(false);
  });

  it('includes loop_name when the env var is set', () => {
    process.env.CLAUDE_LOOP_NAME = 'fleet-loop';
    const entry = feed.buildUsageEntry({ sessionId: 's1', usagePercent: 10 });
    expect(entry.loop_name).toBe('fleet-loop');
  });
});

describe('buildUsageEntry sd_key/leo_phase (SD-LEO-INFRA-LEO-PHASE-TAGGED-001 FR-2)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'leo-status-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads sd_key/leo_phase from the state file at the injected leoStatusCwd, not process.cwd()', () => {
    fs.writeFileSync(path.join(tmpDir, '.leo-status.json'), JSON.stringify({ sd_key: 'SD-X-001', leo_phase: 'EXEC' }));
    // process.cwd() deliberately does NOT contain a matching state file — proves the function
    // uses leoStatusCwd, not process.cwd(), closing the ambiguity PLAN-phase TESTING flagged.
    const entry = feed.buildUsageEntry({ sessionId: 's1', usagePercent: 10, leoStatusCwd: tmpDir });
    expect(entry.sd_key).toBe('SD-X-001');
    expect(entry.leo_phase).toBe('EXEC');
  });

  it('omits sd_key/leo_phase (never emits null) when no state file exists at leoStatusCwd', () => {
    const entry = feed.buildUsageEntry({ sessionId: 's1', usagePercent: 10, leoStatusCwd: tmpDir });
    expect('sd_key' in entry).toBe(false);
    expect('leo_phase' in entry).toBe(false);
  });

  it('omits sd_key/leo_phase when leoStatusCwd is not provided at all', () => {
    const entry = feed.buildUsageEntry({ sessionId: 's1', usagePercent: 10 });
    expect('sd_key' in entry).toBe(false);
    expect('leo_phase' in entry).toBe(false);
  });

  it('omits sd_key/leo_phase when the state file was cleared (fields explicitly null)', () => {
    fs.writeFileSync(path.join(tmpDir, '.leo-status.json'), JSON.stringify({ sd_key: null, leo_phase: null }));
    const entry = feed.buildUsageEntry({ sessionId: 's1', usagePercent: 10, leoStatusCwd: tmpDir });
    expect('sd_key' in entry).toBe(false);
    expect('leo_phase' in entry).toBe(false);
  });

  it('does not throw on a truncated/corrupt state file (torn-read protection)', () => {
    fs.writeFileSync(path.join(tmpDir, '.leo-status.json'), '{"sd_key": "SD-X-001", "leo_p'); // truncated JSON
    expect(() => feed.buildUsageEntry({ sessionId: 's1', usagePercent: 10, leoStatusCwd: tmpDir })).not.toThrow();
    const entry = feed.buildUsageEntry({ sessionId: 's1', usagePercent: 10, leoStatusCwd: tmpDir });
    expect('sd_key' in entry).toBe(false);
  });
});
