/**
 * Session Event Collector Unit Tests
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-08
 * Tests collector invariants: no negative durations, terminal set once, attempt_count increments
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionEventCollector, createCollector, VALID_STATUSES, VALID_SEVERITIES } from '../../../scripts/modules/session-summary/SessionEventCollector.js';

describe('SessionEventCollector', () => {
  let collector;

  beforeEach(() => {
    collector = createCollector('test-session-123', {
      orchestratorVersion: '1.0.0'
    });
  });

  describe('Initialization', () => {
    it('should create collector with session ID', () => {
      expect(collector.sessionId).toBe('test-session-123');
      expect(collector.orchestratorVersion).toBe('1.0.0');
      expect(collector.startTimestamp).toBeTruthy();
      expect(collector.endTimestamp).toBeNull();
    });

    it('should initialize with empty SD and issues collections', () => {
      expect(collector.sds.size).toBe(0);
      expect(collector.issues.length).toBe(0);
    });
  });

  describe('recordSdQueued', () => {
    it('should record SD queued event with metadata', () => {
      const result = collector.recordSdQueued('SD-001', {
        title: 'Test SD',
        category: 'feature',
        priority: 'high'
      });

      expect(result).toBe(true);
      expect(collector.sds.size).toBe(1);

      const sd = collector.sds.get('SD-001');
      expect(sd.sd_id).toBe('SD-001');
      expect(sd.title).toBe('Test SD');
      expect(sd.category).toBe('feature');
      expect(sd.priority).toBe('high');
      expect(sd.queued_at).toBeTruthy();
      expect(sd.final_status).toBe('NOT_STARTED');
      expect(sd.attempt_count).toBe(0);
    });

    it('should return false for missing sd_id', () => {
      const result = collector.recordSdQueued(null);
      expect(result).toBe(false);
      expect(collector.storeWriteFailures).toBe(1);
    });
  });

  describe('recordSdStarted', () => {
    it('should record SD started and increment attempt count', () => {
      collector.recordSdQueued('SD-001');
      const result = collector.recordSdStarted('SD-001');

      expect(result).toBe(true);

      const sd = collector.sds.get('SD-001');
      expect(sd.start_timestamp).toBeTruthy();
      expect(sd.final_status).toBe('IN_PROGRESS');
      expect(sd.attempt_count).toBe(1);
    });

    it('should increment attempt count on multiple starts (retries)', () => {
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordSdStarted('SD-001');

      const sd = collector.sds.get('SD-001');
      expect(sd.attempt_count).toBe(3);
    });

    it('should auto-queue SD if not already queued', () => {
      const result = collector.recordSdStarted('SD-NEW');

      expect(result).toBe(true);
      expect(collector.sds.has('SD-NEW')).toBe(true);
    });
  });

  describe('recordSdTerminal', () => {
    it('should record terminal status and calculate duration', async () => {
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');

      // Small delay to ensure measurable duration
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = collector.recordSdTerminal('SD-001', 'SUCCESS');

      expect(result).toBe(true);

      const sd = collector.sds.get('SD-001');
      expect(sd.final_status).toBe('SUCCESS');
      expect(sd.end_timestamp).toBeTruthy();
      expect(sd.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should prevent duplicate terminal state assignments', () => {
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.recordSdTerminal('SD-001', 'FAILED');

      const sd = collector.sds.get('SD-001');
      expect(sd.final_status).toBe('SUCCESS'); // Should remain SUCCESS
    });

    it('should reject invalid status', () => {
      collector.recordSdQueued('SD-001');
      const result = collector.recordSdTerminal('SD-001', 'INVALID_STATUS');

      expect(result).toBe(false);
      expect(collector.storeWriteFailures).toBe(1);
    });

    it('should auto-record issue for FAILED status with error info', () => {
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'FAILED', {
        errorClass: 'ValidationError',
        errorMessage: 'Validation failed'
      });

      expect(collector.issues.length).toBe(1);
      expect(collector.issues[0].issue_code).toBe('SD_FAILED');
      expect(collector.issues[0].severity).toBe('ERROR');
    });
  });

  describe('recordIssue', () => {
    it('should record new issue', () => {
      const result = collector.recordIssue('ERROR', 'TEST_ERROR', 'Something went wrong', {
        sd_id: 'SD-001',
        correlation_ids: ['corr-123']
      });

      expect(result).toBe(true);
      expect(collector.issues.length).toBe(1);

      const issue = collector.issues[0];
      expect(issue.severity).toBe('ERROR');
      expect(issue.issue_code).toBe('TEST_ERROR');
      expect(issue.message).toBe('Something went wrong');
      expect(issue.sd_id).toBe('SD-001');
      expect(issue.correlation_ids).toContain('corr-123');
      expect(issue.occurrences_count).toBe(1);
    });

    it('should aggregate duplicate issues', () => {
      collector.recordIssue('WARN', 'RATE_LIMIT', 'Rate limit hit');
      collector.recordIssue('WARN', 'RATE_LIMIT', 'Rate limit hit');
      collector.recordIssue('WARN', 'RATE_LIMIT', 'Rate limit hit');

      expect(collector.issues.length).toBe(1);
      expect(collector.issues[0].occurrences_count).toBe(3);
    });

    it('should default invalid severity to ERROR', () => {
      collector.recordIssue('INVALID', 'CODE', 'message');
      expect(collector.issues[0].severity).toBe('ERROR');
    });

    it('should redact secrets from messages', () => {
      collector.recordIssue('ERROR', 'AUTH_ERROR', 'api_key=super_secret_key_12345');
      expect(collector.issues[0].message).not.toContain('super_secret_key');
      expect(collector.issues[0].message).toContain('[REDACTED]');
    });
  });

  describe('getSnapshot', () => {
    it('should return complete snapshot with all collected data', () => {
      collector.recordSdQueued('SD-001', { title: 'First SD' });
      collector.recordSdQueued('SD-002', { title: 'Second SD' });
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.recordIssue('WARN', 'TEST_WARN', 'Test warning');

      const snapshot = collector.getSnapshot();

      expect(snapshot.session_id).toBe('test-session-123');
      expect(snapshot.orchestrator_version).toBe('1.0.0');
      expect(snapshot.start_timestamp).toBeTruthy();
      expect(snapshot.sds.length).toBe(2);
      expect(snapshot.issues.length).toBe(1);
    });

    it('should include store write failure issue if any', () => {
      collector.recordSdQueued(null); // Force a write failure
      const snapshot = collector.getSnapshot();

      const storeFailureIssue = snapshot.issues.find(
        i => i.issue_code === 'SESSION_STORE_WRITE_FAILED'
      );
      expect(storeFailureIssue).toBeTruthy();
      expect(storeFailureIssue.severity).toBe('WARN');
    });
  });

  describe('getSdCountsByStatus', () => {
    it('should return correct counts by status', () => {
      collector.recordSdQueued('SD-001');
      collector.recordSdQueued('SD-002');
      collector.recordSdQueued('SD-003');
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.recordSdStarted('SD-002');
      collector.recordSdTerminal('SD-002', 'FAILED');

      const counts = collector.getSdCountsByStatus();

      expect(counts['SUCCESS']).toBe(1);
      expect(counts['FAILED']).toBe(1);
      expect(counts['NOT_STARTED']).toBe(1);
    });
  });

  describe('getOverallStatus', () => {
    it('should return SUCCESS when all SDs succeed', () => {
      collector.recordSdQueued('SD-001');
      collector.recordSdQueued('SD-002');
      collector.recordSdStarted('SD-001');
      collector.recordSdStarted('SD-002');
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.recordSdTerminal('SD-002', 'SUCCESS');

      expect(collector.getOverallStatus()).toBe('SUCCESS');
    });

    it('should return FAILED when any SD fails', () => {
      collector.recordSdQueued('SD-001');
      collector.recordSdQueued('SD-002');
      collector.recordSdStarted('SD-001');
      collector.recordSdStarted('SD-002');
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.recordSdTerminal('SD-002', 'FAILED');

      expect(collector.getOverallStatus()).toBe('FAILED');
    });

    it('should return CANCELLED when any SD is cancelled', () => {
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'CANCELLED');

      expect(collector.getOverallStatus()).toBe('CANCELLED');
    });

    it('should return SUCCESS for empty session', () => {
      expect(collector.getOverallStatus()).toBe('SUCCESS');
    });
  });

  describe('validate', () => {
    it('should return valid for proper data', () => {
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'SUCCESS');

      const validation = collector.validate();
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });

    it('should detect invalid status', () => {
      collector.recordSdQueued('SD-001');
      // Manually set invalid status for testing
      collector.sds.get('SD-001').final_status = 'INVALID';

      const validation = collector.validate();
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('invalid status'))).toBe(true);
    });
  });

  describe('Invariants', () => {
    it('should never produce negative durations', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordSdQueued(`SD-${i}`);
        collector.recordSdStarted(`SD-${i}`);
        collector.recordSdTerminal(`SD-${i}`, 'SUCCESS');
      }

      const snapshot = collector.getSnapshot();
      for (const sd of snapshot.sds) {
        expect(sd.duration_ms).toBeGreaterThanOrEqual(0);
      }
    });

    it('should set terminal status exactly once', () => {
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');

      // First terminal call sets status
      collector.recordSdTerminal('SD-001', 'FAILED');
      expect(collector.sds.get('SD-001').final_status).toBe('FAILED');

      // Subsequent calls should not change status
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.recordSdTerminal('SD-001', 'CANCELLED');

      expect(collector.sds.get('SD-001').final_status).toBe('FAILED');
    });
  });
});
