/**
 * Unit Tests for Protocol File Read Gate
 * Part of SD-LEO-INFRA-ENFORCE-PROTOCOL-FILE-001
 *
 * Tests:
 * - Gate blocks when protocol file not read
 * - Gate passes when protocol file is read
 * - Correct file mapping per handoff type
 * - Session state persistence
 * - Structured logging
 */

import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// SD-FDBK-FIX-FIX-STALE-HARNESS-001: hermetic session-state isolation. The gate resolves
// its state file via session-state-resolver.cjs (scoped path, SD-FDBK-ENH-SESSION-STATE-
// SCOPING-001). Without this, the gate read/wrote a scoped path the tests didn't control,
// causing stale failures. Mock the resolver to a unique temp file so these tests control
// state deterministically and never touch the real .claude/ session state.
const hoisted = vi.hoisted(() => {
  const tmpDir = process.env.RUNNER_TEMP || process.env.TEMP || process.env.TMP || process.env.TMPDIR || '.';
  return { stateFile: `${tmpDir}/pfrg-hermetic-${process.pid}-${Date.now()}.json` };
});
vi.mock('../../scripts/hooks/lib/session-state-resolver.cjs', () => ({
  getSessionStateFilePath: () => hoisted.stateFile,
  resolveStateReadPath: () => hoisted.stateFile,
}));

import protocolFileReadGate, {
  validateProtocolFileRead,
  createProtocolFileReadGate,
  markProtocolFileRead,
  isProtocolFileRead,
  clearProtocolFileReadState,
  bypassProtocolFileReadGate
} from '../../scripts/modules/handoff/gates/protocol-file-read-gate.js';

const { HANDOFF_FILE_REQUIREMENTS } = protocolFileReadGate;

// Test session state file (hermetic temp path — see vi.mock above)
const TEST_SESSION_STATE_FILE = hoisted.stateFile;

describe('Protocol File Read Gate', () => {
  beforeEach(() => {
    // Clear state before each test
    clearProtocolFileReadState();
  });

  afterEach(() => {
    // Clean up after tests
    clearProtocolFileReadState();
  });

  // SD-LEO-INFRA-DUAL-GENERATION-CLAUDE-001 remapped each handoff to its DESTINATION
  // phase's protocol file (the phase you're going TO), not the source phase.
  describe('HANDOFF_FILE_REQUIREMENTS mapping', () => {
    it('should map LEAD-TO-PLAN to CLAUDE_PLAN.md (destination phase)', () => {
      expect(HANDOFF_FILE_REQUIREMENTS['LEAD-TO-PLAN']).toBe('CLAUDE_PLAN.md');
    });

    it('should map PLAN-TO-EXEC to CLAUDE_EXEC.md (destination phase)', () => {
      expect(HANDOFF_FILE_REQUIREMENTS['PLAN-TO-EXEC']).toBe('CLAUDE_EXEC.md');
    });

    it('should map EXEC-TO-PLAN to CLAUDE_PLAN.md (destination phase)', () => {
      expect(HANDOFF_FILE_REQUIREMENTS['EXEC-TO-PLAN']).toBe('CLAUDE_PLAN.md');
    });
  });

  describe('validateProtocolFileRead', () => {
    // SD-LEO-FIX-COMPLETION-WORKFLOW-001 added a fallback PASS: when the required file is
    // untracked in session state but EXISTS on disk (it always does for CLAUDE_*.md), the
    // gate passes with score 90 + a "fallback validation used" warning rather than blocking.
    // (The hard-BLOCK path still exists only for a genuinely missing file.)
    it('should FALLBACK-PASS when required file is untracked but exists on disk (LEAD-TO-PLAN)', async () => {
      const result = await validateProtocolFileRead('LEAD-TO-PLAN', {});

      expect(result.pass).toBe(true);
      expect(result.score).toBe(90);
      expect(result.warnings.some(w => w.toLowerCase().includes('fallback'))).toBe(true);
    });

    it('should FALLBACK-PASS when required file is untracked but exists on disk (PLAN-TO-EXEC)', async () => {
      const result = await validateProtocolFileRead('PLAN-TO-EXEC', {});

      expect(result.pass).toBe(true);
      expect(result.score).toBe(90);
    });

    it('should FALLBACK-PASS when required file is untracked but exists on disk (EXEC-TO-PLAN)', async () => {
      const result = await validateProtocolFileRead('EXEC-TO-PLAN', {});

      expect(result.pass).toBe(true);
      expect(result.score).toBe(90);
    });

    it('should PASS with score 100 when the destination file has been marked as read', async () => {
      // LEAD-TO-PLAN requires the destination file CLAUDE_PLAN.md (not CLAUDE_LEAD.md).
      markProtocolFileRead('CLAUDE_PLAN.md');

      const result = await validateProtocolFileRead('LEAD-TO-PLAN', {});

      expect(result.pass).toBe(true);
      expect(result.score).toBe(100);
      expect(result.issues).toHaveLength(0);
    });

    it('should PASS for unknown handoff types with warning', async () => {
      const result = await validateProtocolFileRead('UNKNOWN-HANDOFF', {});

      expect(result.pass).toBe(true);
      expect(result.warnings.some(w => w.includes('No protocol file requirement'))).toBe(true);
    });
  });

  describe('markProtocolFileRead / isProtocolFileRead', () => {
    it('should correctly mark and check file read status', () => {
      expect(isProtocolFileRead('CLAUDE_LEAD.md')).toBe(false);

      markProtocolFileRead('CLAUDE_LEAD.md');

      expect(isProtocolFileRead('CLAUDE_LEAD.md')).toBe(true);
    });

    it('should not duplicate entries when marking same file twice', () => {
      markProtocolFileRead('CLAUDE_PLAN.md');
      markProtocolFileRead('CLAUDE_PLAN.md');

      // Read state directly to verify
      const state = JSON.parse(fs.readFileSync(TEST_SESSION_STATE_FILE, 'utf8'));
      const count = state.protocolFilesRead.filter(f => f === 'CLAUDE_PLAN.md').length;

      expect(count).toBe(1);
    });

    it('should track multiple different files', () => {
      markProtocolFileRead('CLAUDE_LEAD.md');
      markProtocolFileRead('CLAUDE_PLAN.md');
      markProtocolFileRead('CLAUDE_EXEC.md');

      expect(isProtocolFileRead('CLAUDE_LEAD.md')).toBe(true);
      expect(isProtocolFileRead('CLAUDE_PLAN.md')).toBe(true);
      expect(isProtocolFileRead('CLAUDE_EXEC.md')).toBe(true);
    });
  });

  describe('clearProtocolFileReadState', () => {
    it('should clear all protocol file read state', () => {
      markProtocolFileRead('CLAUDE_LEAD.md');
      markProtocolFileRead('CLAUDE_PLAN.md');

      expect(isProtocolFileRead('CLAUDE_LEAD.md')).toBe(true);

      clearProtocolFileReadState();

      expect(isProtocolFileRead('CLAUDE_LEAD.md')).toBe(false);
      expect(isProtocolFileRead('CLAUDE_PLAN.md')).toBe(false);
    });
  });

  describe('createProtocolFileReadGate', () => {
    it('should create gate with correct name', () => {
      const gate = createProtocolFileReadGate('LEAD-TO-PLAN');

      expect(gate.name).toBe('GATE_PROTOCOL_FILE_READ');
      expect(gate.required).toBe(true);
      expect(gate.blocking).toBe(true);
    });

    it('should include correct destination file in remediation message', () => {
      const leadGate = createProtocolFileReadGate('LEAD-TO-PLAN');
      const planGate = createProtocolFileReadGate('PLAN-TO-EXEC');
      const execGate = createProtocolFileReadGate('EXEC-TO-PLAN');

      // Destination-phase mapping (SD-LEO-INFRA-DUAL-GENERATION-CLAUDE-001).
      expect(leadGate.remediation).toContain('CLAUDE_PLAN.md');
      expect(planGate.remediation).toContain('CLAUDE_EXEC.md');
      expect(execGate.remediation).toContain('CLAUDE_PLAN.md');
    });

    it('should have working validator function (fallback-pass then tracked-pass)', async () => {
      const gate = createProtocolFileReadGate('LEAD-TO-PLAN');

      // Untracked but file exists on disk → fallback PASS (score 90).
      const fallbackResult = await gate.validator({});
      expect(fallbackResult.pass).toBe(true);
      expect(fallbackResult.score).toBe(90);

      // Mark the destination file (CLAUDE_PLAN.md) as fully read → score 100.
      markProtocolFileRead('CLAUDE_PLAN.md');

      const passResult = await gate.validator({});
      expect(passResult.pass).toBe(true);
      expect(passResult.score).toBe(100);
    });
  });

  describe('bypassProtocolFileReadGate', () => {
    it('should reject bypass with reason shorter than 20 chars', () => {
      const result = bypassProtocolFileReadGate('LEAD-TO-PLAN', 'too short');

      expect(result.success).toBe(false);
      expect(result.error).toContain('20 characters');
    });

    it('should accept bypass with sufficient reason', () => {
      const result = bypassProtocolFileReadGate(
        'LEAD-TO-PLAN',
        'Production emergency fix - JIRA-12345 - time-sensitive outage'
      );

      expect(result.success).toBe(true);
      expect(result.bypassed).toBe(true);
    });
  });

  describe('Session state persistence', () => {
    it('should persist state across function calls', () => {
      markProtocolFileRead('CLAUDE_LEAD.md');

      // Simulate a "restart" by clearing memory and reading from file
      const freshCheck = isProtocolFileRead('CLAUDE_LEAD.md');

      expect(freshCheck).toBe(true);
    });

    it('should record timestamp when file is marked as read', () => {
      const beforeMark = new Date().toISOString();
      markProtocolFileRead('CLAUDE_EXEC.md');
      const afterMark = new Date().toISOString();

      const state = JSON.parse(
        fs.readFileSync(TEST_SESSION_STATE_FILE, 'utf8').replace(/^\uFEFF/, '')
      );

      expect(state.protocolFilesReadAt).toBeDefined();
      expect(state.protocolFilesReadAt['CLAUDE_EXEC.md']).toBeDefined();

      const timestamp = state.protocolFilesReadAt['CLAUDE_EXEC.md'];
      expect(timestamp >= beforeMark).toBe(true);
      expect(timestamp <= afterMark).toBe(true);
    });
  });
});
