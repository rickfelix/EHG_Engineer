/**
 * Unit tests for AUTO-PROCEED State Management
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-04
 *
 * Tests:
 * - State read/write operations
 * - Execution context updates
 * - Interruption/resume tracking
 * - Resume message generation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(__filename);

// Use a temp directory for testing instead of mocking fs
const TEST_DIR = path.join(os.tmpdir(), 'auto-proceed-test-' + Date.now());
const TEST_STATE_FILE = path.join(TEST_DIR, 'auto-proceed-state.json');

// Helper to clear test state
function clearTestState() {
  if (fs.existsSync(TEST_STATE_FILE)) {
    fs.unlinkSync(TEST_STATE_FILE);
  }
}

describe('AUTO-PROCEED State Management', () => {
  let autoProceedState;

  beforeEach(async () => {
    // Create test directory
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }

    // Clear any existing test state
    clearTestState();

    // Import fresh module
    // Note: We test the actual functions but use the module's real file path
    // This tests the logic even though we can't easily change STATE_FILE
    autoProceedState = await import('../../scripts/modules/handoff/auto-proceed-state.js');
  });

  afterEach(() => {
    // Clean up test files
    clearTestState();
    if (fs.existsSync(TEST_DIR)) {
      try {
        fs.rmdirSync(TEST_DIR);
      } catch (_e) {
        // Ignore - may have other files
      }
    }
  });

  describe('readState', () => {
    it('returns default state when file does not exist', () => {
      // The module's readState uses its own path, but we test the default behavior
      const state = autoProceedState.readState();

      // Default state should have these properties
      expect(state).toHaveProperty('isActive');
      expect(state).toHaveProperty('wasInterrupted');
      expect(state).toHaveProperty('currentSd');
      expect(state).toHaveProperty('version', '1.0.0');
    });

    it('has correct default state structure', () => {
      // DEFAULT_STATE is now a named export
      const defaultState = autoProceedState.DEFAULT_STATE;

      expect(defaultState.isActive).toBe(false);
      expect(defaultState.wasInterrupted).toBe(false);
      expect(defaultState.currentSd).toBeNull();
      expect(defaultState.currentPhase).toBeNull();
      expect(defaultState.currentTask).toBeNull();
      expect(defaultState.resumeCount).toBe(0);
      expect(defaultState.version).toBe('1.0.0');
    });
  });

  describe('updateExecutionContext', () => {
    it('updates state with new execution context', () => {
      const result = autoProceedState.updateExecutionContext({
        sdKey: 'SD-TEST-002',
        phase: 'EXEC',
        task: 'Implementing feature'
      });

      expect(result).toBe(true);

      // Read back the state to verify
      const state = autoProceedState.readState();
      expect(state.currentSd).toBe('SD-TEST-002');
      expect(state.currentPhase).toBe('EXEC');
      expect(state.currentTask).toBe('Implementing feature');
      expect(state.isActive).toBe(true);
    });

    it('preserves existing values when not provided', () => {
      // First set some values
      autoProceedState.updateExecutionContext({
        sdKey: 'SD-TEST-003',
        phase: 'PLAN',
        task: 'Planning'
      });

      // Update only the phase
      autoProceedState.updateExecutionContext({
        phase: 'EXEC'
      });

      const state = autoProceedState.readState();
      expect(state.currentSd).toBe('SD-TEST-003'); // Preserved
      expect(state.currentPhase).toBe('EXEC'); // Updated
      expect(state.currentTask).toBe('Planning'); // Preserved
    });
  });

  describe('markInterrupted', () => {
    it('marks state as interrupted when active with current SD', () => {
      // Set up active state
      autoProceedState.updateExecutionContext({
        sdKey: 'SD-TEST-004',
        phase: 'EXEC',
        isActive: true
      });

      const result = autoProceedState.markInterrupted();

      expect(result).toBe(true);

      const state = autoProceedState.readState();
      expect(state.wasInterrupted).toBe(true);
      expect(state.lastInterruptedAt).toBeDefined();
    });

    it('returns false when not active', () => {
      // Clear state to make inactive
      autoProceedState.clearState(false);

      const result = autoProceedState.markInterrupted();

      expect(result).toBe(false);
    });
  });

  describe('markResumed', () => {
    it('clears interrupted flag and increments resume count', () => {
      // Set up interrupted state
      autoProceedState.updateExecutionContext({
        sdKey: 'SD-TEST-005',
        phase: 'EXEC'
      });
      autoProceedState.markInterrupted();

      const stateBefore = autoProceedState.readState();
      const resumeCountBefore = stateBefore.resumeCount || 0;

      const result = autoProceedState.markResumed();

      expect(result).toBe(true);

      const stateAfter = autoProceedState.readState();
      expect(stateAfter.wasInterrupted).toBe(false);
      expect(stateAfter.resumeCount).toBe(resumeCountBefore + 1);
      expect(stateAfter.lastResumedAt).toBeDefined();
    });
  });

  describe('getResumeMessage', () => {
    it('returns formatted message when should resume', () => {
      // Set up state for resume message
      autoProceedState.updateExecutionContext({
        sdKey: 'SD-TEST-006',
        phase: 'EXEC',
        task: 'Unit testing'
      });
      autoProceedState.markInterrupted();

      const message = autoProceedState.getResumeMessage();

      expect(message).toBe('🤖 Resuming: SD-TEST-006 EXEC phase, Unit testing...');
    });

    it('returns null when not interrupted', () => {
      // Set up active but not interrupted state
      autoProceedState.updateExecutionContext({
        sdKey: 'SD-TEST-007',
        phase: 'EXEC'
      });
      // Don't mark as interrupted

      // Clear any previous interrupted state
      autoProceedState.markResumed();

      const message = autoProceedState.getResumeMessage();

      expect(message).toBeNull();
    });

    it('returns null when no current SD', () => {
      // Clear state
      autoProceedState.clearState(false);

      const message = autoProceedState.getResumeMessage();

      expect(message).toBeNull();
    });
  });

  describe('clearState', () => {
    it('resets state while keeping resume count when requested', () => {
      // Set up state with resume count
      autoProceedState.updateExecutionContext({
        sdKey: 'SD-TEST-008',
        phase: 'EXEC'
      });
      autoProceedState.markInterrupted();
      autoProceedState.markResumed();
      autoProceedState.markInterrupted();
      autoProceedState.markResumed();

      const stateBefore = autoProceedState.readState();
      const resumeCountBefore = stateBefore.resumeCount;

      const result = autoProceedState.clearState(true);

      expect(result).toBe(true);

      const stateAfter = autoProceedState.readState();
      expect(stateAfter.isActive).toBe(false);
      expect(stateAfter.currentSd).toBeNull();
      expect(stateAfter.resumeCount).toBe(resumeCountBefore); // Preserved
      expect(stateAfter.clearedAt).toBeDefined();
    });

    it('resets resume count when not keeping history', () => {
      // Set up state with resume count
      autoProceedState.updateExecutionContext({
        sdKey: 'SD-TEST-009',
        phase: 'EXEC'
      });
      autoProceedState.markInterrupted();
      autoProceedState.markResumed();

      const result = autoProceedState.clearState(false);

      expect(result).toBe(true);

      const stateAfter = autoProceedState.readState();
      expect(stateAfter.resumeCount).toBe(0);
    });
  });

  describe('shouldShowResumeMessage', () => {
    it('returns true when all conditions met', () => {
      autoProceedState.updateExecutionContext({
        sdKey: 'SD-TEST-010',
        phase: 'EXEC',
        isActive: true
      });
      autoProceedState.markInterrupted();

      expect(autoProceedState.shouldShowResumeMessage()).toBe(true);
    });

    it('returns false when not active', () => {
      autoProceedState.clearState(false);

      expect(autoProceedState.shouldShowResumeMessage()).toBe(false);
    });

    it('returns false when not interrupted', () => {
      autoProceedState.updateExecutionContext({
        sdKey: 'SD-TEST-011',
        phase: 'EXEC',
        isActive: true
      });
      // Not interrupted

      expect(autoProceedState.shouldShowResumeMessage()).toBe(false);
    });
  });
});
