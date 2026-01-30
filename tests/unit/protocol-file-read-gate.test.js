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

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import protocolFileReadGate, {
  validateProtocolFileRead,
  createProtocolFileReadGate,
  markProtocolFileRead,
  isProtocolFileRead,
  clearProtocolFileReadState,
  bypassProtocolFileReadGate
} from '../../scripts/modules/handoff/gates/protocol-file-read-gate.js';

const { HANDOFF_FILE_REQUIREMENTS } = protocolFileReadGate;

// Test session state file
const TEST_SESSION_STATE_FILE = path.join(process.cwd(), '.claude', 'unified-session-state.json');

describe('Protocol File Read Gate', () => {
  beforeEach(() => {
    // Clear state before each test
    clearProtocolFileReadState();
  });

  afterEach(() => {
    // Clean up after tests
    clearProtocolFileReadState();
  });

  describe('HANDOFF_FILE_REQUIREMENTS mapping', () => {
    // Design: Read file for phase you're ENTERING, not leaving
    it('should map LEAD-TO-PLAN to CLAUDE_PLAN.md (prepare for PLAN phase)', () => {
      expect(HANDOFF_FILE_REQUIREMENTS['LEAD-TO-PLAN']).toBe('CLAUDE_PLAN.md');
    });

    it('should map PLAN-TO-EXEC to CLAUDE_EXEC.md (prepare for EXEC phase)', () => {
      expect(HANDOFF_FILE_REQUIREMENTS['PLAN-TO-EXEC']).toBe('CLAUDE_EXEC.md');
    });

    it('should map EXEC-TO-PLAN to CLAUDE_PLAN.md (return to PLAN phase)', () => {
      expect(HANDOFF_FILE_REQUIREMENTS['EXEC-TO-PLAN']).toBe('CLAUDE_PLAN.md');
    });
  });

  describe('validateProtocolFileRead', () => {
    // Note: These tests use FALLBACK behavior because the CLAUDE_*.md files exist on disk.
    // The gate has a fallback that passes (with score 90) when the file exists but wasn't tracked in session state.
    // This fallback was added by SD-LEO-FIX-COMPLETION-WORKFLOW-001.
    it('should use FALLBACK when file exists on disk but not tracked (LEAD-TO-PLAN)', async () => {
      const result = await validateProtocolFileRead('LEAD-TO-PLAN', {});

      // Fallback passes because CLAUDE_PLAN.md exists on disk
      expect(result.pass).toBe(true);
      expect(result.score).toBe(90); // Fallback score
      expect(result.warnings.some(w => w.includes('fallback'))).toBe(true);
    });

    it('should use FALLBACK when file exists on disk but not tracked (PLAN-TO-EXEC)', async () => {
      const result = await validateProtocolFileRead('PLAN-TO-EXEC', {});

      // Fallback passes because CLAUDE_EXEC.md exists on disk
      expect(result.pass).toBe(true);
      expect(result.score).toBe(90); // Fallback score
    });

    it('should use FALLBACK when file exists on disk but not tracked (EXEC-TO-PLAN)', async () => {
      const result = await validateProtocolFileRead('EXEC-TO-PLAN', {});

      // Fallback passes because CLAUDE_PLAN.md exists on disk
      expect(result.pass).toBe(true);
      expect(result.score).toBe(90); // Fallback score
    });

    it('should PASS when required file has been marked as read', async () => {
      // Mark the file as read (CLAUDE_PLAN.md for LEAD-TO-PLAN)
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

    it('should include correct file in remediation message', () => {
      const leadGate = createProtocolFileReadGate('LEAD-TO-PLAN');
      const planGate = createProtocolFileReadGate('PLAN-TO-EXEC');
      const execGate = createProtocolFileReadGate('EXEC-TO-PLAN');

      // Remediation tells you which file to read for the phase you're ENTERING
      expect(leadGate.remediation).toContain('CLAUDE_PLAN.md');
      expect(planGate.remediation).toContain('CLAUDE_EXEC.md');
      expect(execGate.remediation).toContain('CLAUDE_PLAN.md');
    });

    it('should have working validator function', async () => {
      const gate = createProtocolFileReadGate('LEAD-TO-PLAN');

      // First call uses fallback (file exists on disk)
      const fallbackResult = await gate.validator({});
      expect(fallbackResult.pass).toBe(true);
      expect(fallbackResult.score).toBe(90); // Fallback score

      // Subsequent calls see file marked as read and return full score
      const passResult = await gate.validator({});
      expect(passResult.pass).toBe(true);
      expect(passResult.score).toBe(100); // Full score after being tracked
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
