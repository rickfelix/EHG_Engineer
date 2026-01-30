/**
 * Unit Tests for Continuation State Management
 *
 * Part of SD-LEO-INFRA-STOP-HOOK-ENHANCEMENT-001
 *
 * Tests the continuation state module:
 * - Schema validation
 * - Read/write operations
 * - State transitions
 * - Circuit breaker logic
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import module under test
import {
  readState,
  writeState,
  validateState,
  markIncomplete,
  markComplete,
  markPaused,
  markError,
  incrementRetry,
  resetRetryCount,
  addPendingCommands,
  removePendingCommand,
  needsContinuation,
  shouldPause,
  isCircuitBreakerTripped,
  DEFAULT_STATE,
  VALID_STATUSES,
  VALID_REASONS
} from '../../scripts/modules/handoff/continuation-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock the state file path
const TEST_STATE_FILE = path.join(__dirname, '../fixtures/test-continuation-state.json');

// Ensure fixtures directory exists
const fixturesDir = path.join(__dirname, '../fixtures');

describe('Continuation State Module', () => {
  beforeEach(() => {
    // Ensure fixtures directory exists
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    // Clean up any existing test state file
    if (fs.existsSync(TEST_STATE_FILE)) {
      fs.unlinkSync(TEST_STATE_FILE);
    }
  });

  afterEach(() => {
    // Clean up test state file
    if (fs.existsSync(TEST_STATE_FILE)) {
      fs.unlinkSync(TEST_STATE_FILE);
    }
  });

  describe('validateState', () => {
    it('should validate a correct state object', () => {
      const state = {
        version: '1.0.0',
        status: 'incomplete',
        reason: 'session_end',
        sd: { id: 'SD-TEST-001', phase: 'EXEC', progress: 50, type: 'feature' },
        pendingCommands: ['document', 'ship'],
        lastAction: 'Working on implementation',
        retryCount: 0,
        maxRetries: 10,
        consecutiveErrors: 0,
        errorDetails: null
      };

      const result = validateState(state);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid status', () => {
      const state = {
        ...DEFAULT_STATE,
        status: 'invalid_status'
      };

      const result = validateState(state);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid status'))).toBe(true);
    });

    it('should reject missing reason when status is incomplete', () => {
      const state = {
        ...DEFAULT_STATE,
        status: 'incomplete',
        reason: 'invalid_reason'
      };

      const result = validateState(state);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid reason'))).toBe(true);
    });

    it('should reject negative retryCount', () => {
      const state = {
        ...DEFAULT_STATE,
        retryCount: -1
      };

      const result = validateState(state);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('retryCount'))).toBe(true);
    });

    it('should reject non-array pendingCommands', () => {
      const state = {
        ...DEFAULT_STATE,
        pendingCommands: 'not-an-array'
      };

      const result = validateState(state);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pendingCommands'))).toBe(true);
    });
  });

  describe('VALID_STATUSES', () => {
    it('should contain all expected statuses', () => {
      expect(VALID_STATUSES).toContain('incomplete');
      expect(VALID_STATUSES).toContain('complete');
      expect(VALID_STATUSES).toContain('error');
      expect(VALID_STATUSES).toContain('paused');
    });
  });

  describe('VALID_REASONS', () => {
    it('should contain all expected reasons', () => {
      expect(VALID_REASONS).toContain('context_limit');
      expect(VALID_REASONS).toContain('session_end');
      expect(VALID_REASONS).toContain('user_interrupt');
      expect(VALID_REASONS).toContain('error');
    });
  });

  describe('readState', () => {
    it('should return default state when file does not exist', () => {
      const state = readState();
      expect(state.version).toBe(DEFAULT_STATE.version);
      expect(state.status).toBe(DEFAULT_STATE.status);
    });
  });

  describe('writeState', () => {
    it('should write valid state and return success', () => {
      const state = {
        status: 'incomplete',
        reason: 'session_end',
        sd: { id: 'SD-TEST-001', phase: 'EXEC', progress: 50, type: 'feature' },
        pendingCommands: ['document'],
        retryCount: 0,
        maxRetries: 10,
        consecutiveErrors: 0
      };

      // Note: This test modifies the actual state file, not the test fixture
      const result = writeState(state);
      expect(result.success).toBe(true);
    });

    it('should fail for invalid state', () => {
      const state = {
        status: 'invalid'
      };

      const result = writeState(state);
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('markIncomplete', () => {
    it('should mark state as incomplete with valid reason', () => {
      const result = markIncomplete('session_end', {
        sd: { id: 'SD-TEST-001', phase: 'EXEC' },
        lastAction: 'Working on feature'
      });

      expect(result.success).toBe(true);

      const state = readState();
      expect(state.status).toBe('incomplete');
      expect(state.reason).toBe('session_end');
    });

    it('should fail with invalid reason', () => {
      const result = markIncomplete('invalid_reason');
      expect(result.success).toBe(false);
    });
  });

  describe('markComplete', () => {
    it('should mark state as complete', () => {
      // First mark as incomplete
      markIncomplete('session_end');

      // Then mark complete
      const result = markComplete();
      expect(result.success).toBe(true);

      const state = readState();
      expect(state.status).toBe('complete');
      expect(state.reason).toBeNull();
    });
  });

  describe('markPaused', () => {
    it('should mark state as paused with error details', () => {
      const result = markPaused('Non-recoverable error occurred');
      expect(result.success).toBe(true);

      const state = readState();
      expect(state.status).toBe('paused');
      expect(state.errorDetails).toBe('Non-recoverable error occurred');
    });
  });

  describe('markError', () => {
    it('should mark state as error and increment consecutiveErrors', () => {
      markError('First error');
      let state = readState();
      expect(state.consecutiveErrors).toBe(1);

      markError('Second error');
      state = readState();
      expect(state.consecutiveErrors).toBe(2);
    });
  });

  describe('incrementRetry', () => {
    it('should increment retry count', () => {
      const result1 = incrementRetry();
      expect(result1.retryCount).toBe(1);
      expect(result1.shouldContinue).toBe(true);

      const result2 = incrementRetry();
      expect(result2.retryCount).toBe(2);
    });

    it('should indicate when max retries reached', () => {
      // Set maxRetries to 2
      writeState({ ...DEFAULT_STATE, maxRetries: 2, retryCount: 1 });

      const result = incrementRetry();
      expect(result.retryCount).toBe(2);
      expect(result.shouldContinue).toBe(false);
    });
  });

  describe('resetRetryCount', () => {
    it('should reset retry and error counts', () => {
      writeState({ ...DEFAULT_STATE, retryCount: 5, consecutiveErrors: 3 });

      const result = resetRetryCount();
      expect(result.success).toBe(true);

      const state = readState();
      expect(state.retryCount).toBe(0);
      expect(state.consecutiveErrors).toBe(0);
    });
  });

  describe('addPendingCommands', () => {
    it('should add commands to pending list', () => {
      const result = addPendingCommands(['document', 'ship']);
      expect(result.success).toBe(true);

      const state = readState();
      expect(state.pendingCommands).toContain('document');
      expect(state.pendingCommands).toContain('ship');
    });

    it('should not add duplicates', () => {
      addPendingCommands(['document']);
      addPendingCommands(['document', 'ship']);

      const state = readState();
      const docCount = state.pendingCommands.filter(c => c === 'document').length;
      expect(docCount).toBe(1);
    });

    it('should fail for non-array input', () => {
      const result = addPendingCommands('not-an-array');
      expect(result.success).toBe(false);
    });
  });

  describe('removePendingCommand', () => {
    it('should remove a command from pending list', () => {
      addPendingCommands(['document', 'ship', 'learn']);
      removePendingCommand('ship');

      const state = readState();
      expect(state.pendingCommands).toContain('document');
      expect(state.pendingCommands).not.toContain('ship');
      expect(state.pendingCommands).toContain('learn');
    });
  });

  describe('needsContinuation', () => {
    it('should return true when status is incomplete', () => {
      markIncomplete('session_end');
      expect(needsContinuation()).toBe(true);
    });

    it('should return false when status is complete', () => {
      markComplete();
      expect(needsContinuation()).toBe(false);
    });
  });

  describe('shouldPause', () => {
    it('should return true when status is paused', () => {
      markPaused('Error');
      expect(shouldPause()).toBe(true);
    });

    it('should return true when status is error', () => {
      markError('Error');
      expect(shouldPause()).toBe(true);
    });

    it('should return false when status is incomplete', () => {
      markIncomplete('session_end');
      expect(shouldPause()).toBe(false);
    });
  });

  describe('isCircuitBreakerTripped', () => {
    it('should return false when consecutiveErrors below threshold', () => {
      writeState({ ...DEFAULT_STATE, consecutiveErrors: 2 });
      expect(isCircuitBreakerTripped(3)).toBe(false);
    });

    it('should return true when consecutiveErrors equals threshold', () => {
      writeState({ ...DEFAULT_STATE, consecutiveErrors: 3 });
      expect(isCircuitBreakerTripped(3)).toBe(true);
    });

    it('should return true when consecutiveErrors exceeds threshold', () => {
      writeState({ ...DEFAULT_STATE, consecutiveErrors: 5 });
      expect(isCircuitBreakerTripped(3)).toBe(true);
    });
  });

  describe('DEFAULT_STATE', () => {
    it('should have expected default values', () => {
      expect(DEFAULT_STATE.version).toBe('1.0.0');
      expect(DEFAULT_STATE.status).toBe('complete');
      expect(DEFAULT_STATE.reason).toBeNull();
      expect(DEFAULT_STATE.retryCount).toBe(0);
      expect(DEFAULT_STATE.maxRetries).toBe(10);
      expect(DEFAULT_STATE.consecutiveErrors).toBe(0);
      expect(DEFAULT_STATE.pendingCommands).toEqual([]);
    });
  });
});
