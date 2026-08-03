// QF-20260510-387: integration tests for handoff-flag consumption in context-compact-nudge.
// Uses LEO_COMPACT_FLAG_DIR override to isolate from real ~/.claude/flags/.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { getHandoffFlagPath } from '../modules/handoff/cli/compact-after-handoff.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_SCRIPT = path.join(__dirname, 'context-compact-nudge.js');

const TEST_FLAG_DIR = path.join(os.tmpdir(), `leo-compact-test-${process.pid}`);
const STATE_DIR = path.join(os.tmpdir(), 'leo-context-nudge');
const SESSION_ID = `test-handoff-flag-${process.pid}`;
const STATE_FILE = path.join(STATE_DIR, `session-${SESSION_ID}.json`);
// SD-LEO-INFRA-COMPACT-NUDGE-RACES-001: derived from the writer, not a fourth
// hardcoded copy of the filename. When this was a literal, a change to the
// writer's path would have left these tests writing where the hook never looks
// — and every "expect no nudge" test below would have passed for that reason.
const HANDOFF_FLAG = getHandoffFlagPath(
  { LEO_COMPACT_FLAG_DIR: TEST_FLAG_DIR, CLAUDE_SESSION_ID: SESSION_ID }
);
const COMPACTION_MARKER = path.join(TEST_FLAG_DIR, 'last-compaction.json');

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
    // Load-bearing: the hook UNLINKS a stale flag. If the reader stopped
    // looking at this path, the file would survive and this line would fail —
    // which is what keeps the assertion above from passing vacuously.
    expect(fs.existsSync(HANDOFF_FLAG)).toBe(false);
  });

  // SD-LEO-INFRA-COMPACT-NUDGE-RACES-001 — the next two tests carry a positive
  // control. Asserting only the ABSENCE of nudge text is satisfied just as well
  // by a reader that never found the flag at all, so a filename change would
  // have left them green while silently disconnecting writer from reader. Phase
  // B removes the disqualifying condition and proves the same file DOES nudge.
  it('skips nudge when compaction marker is recent (cooldown), but the flag itself is live', () => {
    if (!fs.existsSync(TEST_FLAG_DIR)) fs.mkdirSync(TEST_FLAG_DIR, { recursive: true });
    fs.writeFileSync(COMPACTION_MARKER, JSON.stringify({ timestamp: new Date().toISOString() }));
    writeHandoffFlag({
      sd_id: 'SD-COOL',
      handoff_type: 'LEAD-TO-PLAN',
      tier: 'soft',
      mode: 'nudge',
      timestamp: new Date().toISOString()
    });
    expect(runHook()).not.toContain('LEAD-TO-PLAN complete');
    expect(fs.existsSync(HANDOFF_FLAG)).toBe(true);

    // Phase B: same flag, marker gone, state reset.
    fs.unlinkSync(COMPACTION_MARKER);
    try { fs.unlinkSync(STATE_FILE); } catch { /* may not exist */ }
    expect(runHook()).toContain('LEAD-TO-PLAN complete (SD SD-COOL)');
  });

  it('does nothing when flag is absent (regression: existing behavior preserved)', () => {
    const stdout = runHook();
    expect(stdout).not.toContain('LEAD-TO-PLAN');
    expect(stdout).not.toContain('LEAD-FINAL-APPROVAL');
  });

  it('ignores flag with malformed payload (no tier), and is not merely blind to the path', () => {
    writeHandoffFlag({ sd_id: 'SD-BAD', timestamp: new Date().toISOString() });
    expect(runHook()).not.toContain('complete');

    // Phase B: same path, valid payload — proves the rejection above was a
    // decision about the payload, not an inability to see the file.
    try { fs.unlinkSync(STATE_FILE); } catch { /* may not exist */ }
    writeHandoffFlag({
      sd_id: 'SD-BAD',
      handoff_type: 'LEAD-TO-PLAN',
      tier: 'soft',
      mode: 'nudge',
      timestamp: new Date().toISOString()
    });
    expect(runHook()).toContain('LEAD-TO-PLAN complete (SD SD-BAD)');
  });
});
