// QF-20260510-387: tests for phase-aware /compact nudge flag-write.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  HANDOFF_COMPACT_TIERS,
  HANDOFF_FLAG_PREFIX,
  resolveCompactAfterHandoffMode,
  getHandoffTier,
  getHandoffFlagPath,
  sanitizeSessionId,
  sweepStaleHandoffFlags,
  writeCompactAfterHandoffFlag
} from './compact-after-handoff.js';

const TEST_FLAG_DIR = path.join(os.tmpdir(), `leo-compact-after-handoff-test-${process.pid}`);
const TEST_SESSION_ID = `writer-test-${process.pid}`;
// SD-LEO-INFRA-COMPACT-NUDGE-RACES-001: CLAUDE_SESSION_ID is now part of the
// contract, not incidental. It is set EXPLICITLY here rather than inherited —
// the ambient process env carries a real session id under Claude Code, which
// would make these tests pass for a reason that has nothing to do with the code.
const TEST_ENV = { LEO_COMPACT_FLAG_DIR: TEST_FLAG_DIR, CLAUDE_SESSION_ID: TEST_SESSION_ID };
const FLAG_PATH = getHandoffFlagPath(TEST_ENV);

function clearFlag() {
  try { if (fs.existsSync(FLAG_PATH)) fs.unlinkSync(FLAG_PATH); } catch { /* ignore */ }
}

describe('HANDOFF_COMPACT_TIERS — tier mapping for all 5 LEO handoffs', () => {
  it('maps LEAD-TO-PLAN and PLAN-TO-EXEC to soft', () => {
    expect(HANDOFF_COMPACT_TIERS['LEAD-TO-PLAN']).toBe('soft');
    expect(HANDOFF_COMPACT_TIERS['PLAN-TO-EXEC']).toBe('soft');
  });

  it('maps EXEC-TO-PLAN and PLAN-TO-LEAD to medium', () => {
    expect(HANDOFF_COMPACT_TIERS['EXEC-TO-PLAN']).toBe('medium');
    expect(HANDOFF_COMPACT_TIERS['PLAN-TO-LEAD']).toBe('medium');
  });

  it('maps LEAD-FINAL-APPROVAL to strong (safest compact point)', () => {
    expect(HANDOFF_COMPACT_TIERS['LEAD-FINAL-APPROVAL']).toBe('strong');
  });

  it('is frozen — cannot be mutated by callers', () => {
    expect(() => { HANDOFF_COMPACT_TIERS['LEAD-TO-PLAN'] = 'strong'; }).toThrow();
  });
});

describe('resolveCompactAfterHandoffMode', () => {
  it('defaults to nudge when env unset', () => {
    expect(resolveCompactAfterHandoffMode({})).toBe('nudge');
  });

  it('honors valid values: off, nudge, auto', () => {
    expect(resolveCompactAfterHandoffMode({ ...TEST_ENV, LEO_COMPACT_AFTER_HANDOFF: 'off' })).toBe('off');
    expect(resolveCompactAfterHandoffMode({ ...TEST_ENV, LEO_COMPACT_AFTER_HANDOFF: 'nudge' })).toBe('nudge');
    expect(resolveCompactAfterHandoffMode({ LEO_COMPACT_AFTER_HANDOFF: 'auto' })).toBe('auto');
  });

  it('lowercases input (case-insensitive)', () => {
    expect(resolveCompactAfterHandoffMode({ LEO_COMPACT_AFTER_HANDOFF: 'OFF' })).toBe('off');
    expect(resolveCompactAfterHandoffMode({ LEO_COMPACT_AFTER_HANDOFF: 'Nudge' })).toBe('nudge');
  });

  it('falls back to nudge for invalid values', () => {
    expect(resolveCompactAfterHandoffMode({ LEO_COMPACT_AFTER_HANDOFF: 'garbage' })).toBe('nudge');
  });
});

describe('getHandoffTier', () => {
  it('returns tier for known handoff types', () => {
    expect(getHandoffTier('LEAD-TO-PLAN')).toBe('soft');
    expect(getHandoffTier('EXEC-TO-PLAN')).toBe('medium');
    expect(getHandoffTier('LEAD-FINAL-APPROVAL')).toBe('strong');
  });

  it('is case-insensitive', () => {
    expect(getHandoffTier('lead-to-plan')).toBe('soft');
  });

  it('returns null for unknown handoff types', () => {
    expect(getHandoffTier('GARBAGE-HANDOFF')).toBeNull();
    expect(getHandoffTier('')).toBeNull();
    expect(getHandoffTier(null)).toBeNull();
  });
});

describe('writeCompactAfterHandoffFlag', () => {
  beforeEach(() => clearFlag());
  afterEach(() => clearFlag());

  it('writes flag with tier, mode, sd_id, timestamp on valid handoff', () => {
    const result = writeCompactAfterHandoffFlag('LEAD-TO-PLAN', 'SD-X-001', { ...TEST_ENV, LEO_COMPACT_AFTER_HANDOFF: 'nudge' });
    expect(result.written).toBe(true);
    expect(result.tier).toBe('soft');
    expect(fs.existsSync(FLAG_PATH)).toBe(true);
    const flag = JSON.parse(fs.readFileSync(FLAG_PATH, 'utf8'));
    expect(flag.handoff_type).toBe('LEAD-TO-PLAN');
    expect(flag.tier).toBe('soft');
    expect(flag.sd_id).toBe('SD-X-001');
    expect(flag.mode).toBe('nudge');
    expect(flag.timestamp).toBeTruthy();
  });

  it('skips write when mode=off', () => {
    const result = writeCompactAfterHandoffFlag('LEAD-TO-PLAN', 'SD-X-001', { ...TEST_ENV, LEO_COMPACT_AFTER_HANDOFF: 'off' });
    expect(result.written).toBe(false);
    expect(result.reason).toBe('mode_off');
    expect(fs.existsSync(FLAG_PATH)).toBe(false);
  });

  it('skips write for unknown handoff type', () => {
    const result = writeCompactAfterHandoffFlag('GARBAGE', 'SD-X-001', TEST_ENV);
    expect(result.written).toBe(false);
    expect(result.reason).toBe('unknown_handoff_type');
    expect(fs.existsSync(FLAG_PATH)).toBe(false);
  });

  it('writes strong tier for LEAD-FINAL-APPROVAL', () => {
    const result = writeCompactAfterHandoffFlag('LEAD-FINAL-APPROVAL', 'SD-X-001', TEST_ENV);
    expect(result.written).toBe(true);
    expect(result.tier).toBe('strong');
  });

  it('accepts null sd_id and persists null in payload', () => {
    const result = writeCompactAfterHandoffFlag('PLAN-TO-EXEC', null, TEST_ENV);
    expect(result.written).toBe(true);
    expect(JSON.parse(fs.readFileSync(FLAG_PATH, 'utf8')).sd_id).toBeNull();
  });
});

describe('getHandoffFlagPath', () => {
  it('returns a SESSION-SCOPED path under user home .claude/flags', () => {
    const p = getHandoffFlagPath({ CLAUDE_SESSION_ID: 'abc123' });
    expect(p).toBe(path.join(os.homedir(), '.claude', 'flags', 'compact-after-handoff-abc123.json'));
  });

  // The whole defect was one shared filename. If this ever returns a path with
  // no session token, every session reads and deletes the same file again.
  it('never returns an unscoped filename', () => {
    expect(getHandoffFlagPath({ CLAUDE_SESSION_ID: 'abc123' }))
      .not.toBe(path.join(os.homedir(), '.claude', 'flags', 'compact-after-handoff.json'));
  });

  it('returns null when there is no session identity — never a shared fallback', () => {
    expect(getHandoffFlagPath({})).toBeNull();
    expect(getHandoffFlagPath({ CLAUDE_SESSION_ID: '' })).toBeNull();
    expect(getHandoffFlagPath({ CLAUDE_SESSION_ID: '   ' })).toBeNull();
  });

  it('explicit sessionId argument overrides the environment', () => {
    const p = getHandoffFlagPath({ CLAUDE_SESSION_ID: 'from-env' }, 'from-arg');
    expect(p).toContain('compact-after-handoff-from-arg.json');
    expect(p).not.toContain('from-env');
  });
});

describe('sanitizeSessionId — this value reaches path.join()', () => {
  it('accepts uuid-shaped ids', () => {
    expect(sanitizeSessionId('06521203-f370-4666-a40c-7801bcc192ef'))
      .toBe('06521203-f370-4666-a40c-7801bcc192ef');
  });

  it('rejects traversal and separators outright rather than escaping them', () => {
    for (const bad of ['../../etc/passwd', 'a/b', 'a\\b', 'a.b', 'a b', 'a:b', '..']) {
      expect(sanitizeSessionId(bad)).toBeNull();
    }
  });

  it('rejects non-strings and empties', () => {
    for (const bad of [null, undefined, 42, {}, '', '   ']) {
      expect(sanitizeSessionId(bad)).toBeNull();
    }
  });

  it('caps length so a hostile id cannot blow the filename limit', () => {
    expect(sanitizeSessionId('a'.repeat(500))).toHaveLength(64);
  });

  // NTFS and APFS are case-insensitive by default, so without folding, two ids
  // differing only in case resolve to ONE file on disk — one session reading
  // and deleting another's flag, which is the defect this SD exists to remove.
  it('folds case so two ids differing only in case cannot alias to one file', () => {
    expect(sanitizeSessionId('ABC123')).toBe('abc123');
    expect(getHandoffFlagPath({ CLAUDE_SESSION_ID: 'ABC123' }))
      .toBe(getHandoffFlagPath({ CLAUDE_SESSION_ID: 'abc123' }));
  });
});

describe('writeCompactAfterHandoffFlag — session identity is explicit, not swallowed', () => {
  it('stamps session_id into the payload', () => {
    clearFlag();
    const result = writeCompactAfterHandoffFlag('LEAD-TO-PLAN', 'SD-X-001', TEST_ENV);
    expect(result.written).toBe(true);
    expect(JSON.parse(fs.readFileSync(FLAG_PATH, 'utf8')).session_id).toBe(TEST_SESSION_ID);
    clearFlag();
  });

  it('reports no_session_id rather than a bare written:false', () => {
    const result = writeCompactAfterHandoffFlag('LEAD-TO-PLAN', 'SD-X-001', { LEO_COMPACT_FLAG_DIR: TEST_FLAG_DIR });
    expect(result.written).toBe(false);
    // A bare written:false would be indistinguishable from mode_off or a
    // write error — the caller must be able to tell identity was the problem.
    expect(result.reason).toBe('no_session_id');
  });

  it('two sessions completing handoffs do not overwrite each other', () => {
    const envA = { LEO_COMPACT_FLAG_DIR: TEST_FLAG_DIR, CLAUDE_SESSION_ID: 'sess-A' };
    const envB = { LEO_COMPACT_FLAG_DIR: TEST_FLAG_DIR, CLAUDE_SESSION_ID: 'sess-B' };
    writeCompactAfterHandoffFlag('LEAD-TO-PLAN', 'SD-A', envA);
    writeCompactAfterHandoffFlag('EXEC-TO-PLAN', 'SD-B', envB);

    const a = JSON.parse(fs.readFileSync(getHandoffFlagPath(envA), 'utf8'));
    const b = JSON.parse(fs.readFileSync(getHandoffFlagPath(envB), 'utf8'));
    expect(a.sd_id).toBe('SD-A');
    expect(b.sd_id).toBe('SD-B');

    fs.unlinkSync(getHandoffFlagPath(envA));
    fs.unlinkSync(getHandoffFlagPath(envB));
  });
});

describe('sweepStaleHandoffFlags — replaces the self-healing single-path unlink', () => {
  const sweepDir = path.join(os.tmpdir(), `leo-compact-sweep-test-${process.pid}`);
  const sweepEnv = { LEO_COMPACT_FLAG_DIR: sweepDir };

  function seed(name, ageMinutes) {
    fs.mkdirSync(sweepDir, { recursive: true });
    const full = path.join(sweepDir, name);
    fs.writeFileSync(full, '{}');
    const when = new Date(Date.now() - ageMinutes * 60 * 1000);
    fs.utimesSync(full, when, when);
    return full;
  }

  beforeEach(() => { fs.rmSync(sweepDir, { recursive: true, force: true }); });
  afterEach(() => { fs.rmSync(sweepDir, { recursive: true, force: true }); });

  it('sweeps an orphan left by a session that never prompted again', () => {
    const orphan = seed(`${HANDOFF_FLAG_PREFIX}gone-forever.json`, 90);
    const { swept } = sweepStaleHandoffFlags(sweepEnv, 60);
    expect(swept).toContain(`${HANDOFF_FLAG_PREFIX}gone-forever.json`);
    expect(fs.existsSync(orphan)).toBe(false);
  });

  it('leaves a fresh flag belonging to a live session alone', () => {
    const fresh = seed(`${HANDOFF_FLAG_PREFIX}still-working.json`, 5);
    sweepStaleHandoffFlags(sweepEnv, 60);
    expect(fs.existsSync(fresh)).toBe(true);
  });

  it('touches nothing outside the handoff-flag namespace', () => {
    const marker = seed('last-compaction.json', 999);
    const needed = seed('context-compact-needed.json', 999);
    const { swept } = sweepStaleHandoffFlags(sweepEnv, 60);
    expect(swept).toEqual([]);
    expect(fs.existsSync(marker)).toBe(true);
    expect(fs.existsSync(needed)).toBe(true);
  });

  it('sweeps a corrupt flag too — mtime is the clock, not the payload', () => {
    const corrupt = seed(`${HANDOFF_FLAG_PREFIX}corrupt.json`, 120);
    fs.writeFileSync(corrupt, 'not json at all');
    const when = new Date(Date.now() - 120 * 60 * 1000);
    fs.utimesSync(corrupt, when, when);
    sweepStaleHandoffFlags(sweepEnv, 60);
    expect(fs.existsSync(corrupt)).toBe(false);
  });

  it('is a no-op on a missing directory rather than throwing', () => {
    const { swept, errors } = sweepStaleHandoffFlags({ LEO_COMPACT_FLAG_DIR: path.join(sweepDir, 'nope') }, 60);
    expect(swept).toEqual([]);
    expect(errors).toBe(0);
  });
});
