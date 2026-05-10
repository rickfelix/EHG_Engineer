// QF-20260510-387: integration tests for handoff-flag consumption in context-compact-nudge.
// Uses LEO_COMPACT_FLAG_DIR override to isolate from real ~/.claude/flags/.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_SCRIPT = path.join(__dirname, 'context-compact-nudge.js');

const TEST_FLAG_DIR = path.join(os.tmpdir(), `leo-compact-test-${process.pid}`);
const HANDOFF_FLAG = path.join(TEST_FLAG_DIR, 'compact-after-handoff.json');
const COMPACTION_MARKER = path.join(TEST_FLAG_DIR, 'last-compaction.json');
const STATE_DIR = path.join(os.tmpdir(), 'leo-context-nudge');
const SESSION_ID = `test-handoff-flag-${process.pid}`;
const STATE_FILE = path.join(STATE_DIR, `session-${SESSION_ID}.json`);

function writeHandoffFlag(payload) {
  if (!fs.existsSync(TEST_FLAG_DIR)) fs.mkdirSync(TEST_FLAG_DIR, { recursive: true });
  fs.writeFileSync(HANDOFF_FLAG, JSON.stringify(payload, null, 2));
}

function clearAll() {
  for (const f of [HANDOFF_FLAG, COMPACTION_MARKER, STATE_FILE]) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
  }
}

function runHook(extraArgs = []) {
  return execFileSync('node', [HOOK_SCRIPT, ...extraArgs], {
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: SESSION_ID,
      LEO_COMPACT_NUDGE_ENABLED: 'true',
      LEO_COMPACT_FLAG_DIR: TEST_FLAG_DIR
    },
    encoding: 'utf8'
  });
}

describe('context-compact-nudge — handoff flag consumption', () => {
  beforeEach(() => clearAll());
  afterEach(() => clearAll());

  it('surfaces soft-tier nudge for LEAD-TO-PLAN flag', () => {
    writeHandoffFlag({
      sd_id: 'SD-X-001',
      handoff_type: 'LEAD-TO-PLAN',
      tier: 'soft',
      mode: 'nudge',
      timestamp: new Date().toISOString()
    });
    const stdout = runHook();
    expect(stdout).toContain('LEAD-TO-PLAN complete (SD SD-X-001)');
    expect(stdout).toContain('Optional /compact');
    expect(fs.existsSync(HANDOFF_FLAG)).toBe(false);
  });

  it('surfaces medium-tier nudge with caveat for EXEC-TO-PLAN', () => {
    writeHandoffFlag({
      sd_id: 'SD-Y-002',
      handoff_type: 'EXEC-TO-PLAN',
      tier: 'medium',
      mode: 'nudge',
      timestamp: new Date().toISOString()
    });
    const stdout = runHook();
    expect(stdout).toContain('EXEC-TO-PLAN complete');
    expect(stdout).toContain('recommended');
    expect(stdout).toContain('deliberation chains will be lost');
    expect(fs.existsSync(HANDOFF_FLAG)).toBe(false);
  });

  it('surfaces strong-tier nudge for LEAD-FINAL-APPROVAL', () => {
    writeHandoffFlag({
      sd_id: 'SD-Z-003',
      handoff_type: 'LEAD-FINAL-APPROVAL',
      tier: 'strong',
      mode: 'nudge',
      timestamp: new Date().toISOString()
    });
    const stdout = runHook();
    expect(stdout).toContain('LEAD-FINAL-APPROVAL complete');
    expect(stdout).toContain('SAFE to /compact');
    expect(fs.existsSync(HANDOFF_FLAG)).toBe(false);
  });

  it('discards stale flag (>60 min) without nudge', () => {
    const stale = new Date(Date.now() - 61 * 60 * 1000).toISOString();
    writeHandoffFlag({
      sd_id: 'SD-OLD',
      handoff_type: 'LEAD-TO-PLAN',
      tier: 'soft',
      mode: 'nudge',
      timestamp: stale
    });
    const stdout = runHook();
    expect(stdout).not.toContain('LEAD-TO-PLAN complete');
    expect(fs.existsSync(HANDOFF_FLAG)).toBe(false);
  });

  it('skips nudge when compaction marker is recent (cooldown)', () => {
    if (!fs.existsSync(TEST_FLAG_DIR)) fs.mkdirSync(TEST_FLAG_DIR, { recursive: true });
    fs.writeFileSync(COMPACTION_MARKER, JSON.stringify({ timestamp: new Date().toISOString() }));
    writeHandoffFlag({
      sd_id: 'SD-COOL',
      handoff_type: 'LEAD-TO-PLAN',
      tier: 'soft',
      mode: 'nudge',
      timestamp: new Date().toISOString()
    });
    const stdout = runHook();
    expect(stdout).not.toContain('LEAD-TO-PLAN complete');
  });

  it('does nothing when flag is absent (regression: existing behavior preserved)', () => {
    const stdout = runHook();
    expect(stdout).not.toContain('LEAD-TO-PLAN');
    expect(stdout).not.toContain('LEAD-FINAL-APPROVAL');
  });

  it('ignores flag with malformed payload (no tier)', () => {
    writeHandoffFlag({ sd_id: 'SD-BAD', timestamp: new Date().toISOString() });
    const stdout = runHook();
    expect(stdout).not.toContain('complete');
  });
});
