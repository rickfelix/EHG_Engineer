// QF-20260510-387: tests for phase-aware /compact nudge flag-write.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  HANDOFF_COMPACT_TIERS,
  resolveCompactAfterHandoffMode,
  getHandoffTier,
  getHandoffFlagPath,
  writeCompactAfterHandoffFlag
} from './compact-after-handoff.js';

const TEST_FLAG_DIR = path.join(os.tmpdir(), `leo-compact-after-handoff-test-${process.pid}`);
const TEST_ENV = { LEO_COMPACT_FLAG_DIR: TEST_FLAG_DIR };
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
  it('returns path under user home .claude/flags', () => {
    const p = getHandoffFlagPath();
    expect(p).toContain(path.join('.claude', 'flags', 'compact-after-handoff.json'));
    expect(p.startsWith(os.homedir())).toBe(true);
  });
});
