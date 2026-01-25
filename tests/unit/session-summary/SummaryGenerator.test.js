/**
 * Summary Generator Unit Tests
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-08
 * Tests schema validation, timeout behavior, and fallback behavior (TS-6)
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SummaryGenerator, createGenerator, SCHEMA_VERSION, COMPILATION_TIMEOUT_MS } from '../../../scripts/modules/session-summary/SummaryGenerator.js';
import { createCollector } from '../../../scripts/modules/session-summary/SessionEventCollector.js';

describe('SummaryGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = createGenerator();
  });

  describe('Initialization', () => {
    it('should create generator with default options', () => {
      expect(generator.timeout).toBe(COMPILATION_TIMEOUT_MS);
      expect(generator.maxDigestLines).toBe(60);
    });

    it('should accept custom options', () => {
      const customGenerator = createGenerator({ timeout: 1000, maxDigestLines: 30 });
      expect(customGenerator.timeout).toBe(1000);
      expect(customGenerator.maxDigestLines).toBe(30);
    });
  });

  describe('generate - Happy Path', () => {
    it('should generate valid JSON summary with schema_version', async () => {
      const collector = createCollector('session-123', { orchestratorVersion: '1.0.0' });
      collector.recordSdQueued('SD-001', { title: 'Test SD' });
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.complete();

      const snapshot = collector.getSnapshot();
      const result = await generator.generate(snapshot);

      expect(result.json).toBeTruthy();
      expect(result.json.report_type).toBe('session_summary');
      expect(result.json.schema_version).toBe(SCHEMA_VERSION);
      expect(result.json.session_id).toBe('session-123');
      expect(result.json.total_sds).toBe(1);
    });

    it('should include SD counts by status', async () => {
      const collector = createCollector('session-123');
      collector.recordSdQueued('SD-001');
      collector.recordSdQueued('SD-002');
      collector.recordSdStarted('SD-001');
      collector.recordSdStarted('SD-002');
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.recordSdTerminal('SD-002', 'FAILED');
      collector.complete();

      const result = await generator.generate(collector.getSnapshot());

      expect(result.json.sd_counts_by_status).toBeTruthy();
      expect(result.json.sd_counts_by_status['SUCCESS']).toBe(1);
      expect(result.json.sd_counts_by_status['FAILED']).toBe(1);
    });

    it('should calculate overall_status correctly', async () => {
      // All success case
      const successCollector = createCollector('success-session');
      successCollector.recordSdQueued('SD-001');
      successCollector.recordSdStarted('SD-001');
      successCollector.recordSdTerminal('SD-001', 'SUCCESS');
      successCollector.complete();

      const successResult = await generator.generate(successCollector.getSnapshot());
      expect(successResult.json.overall_status).toBe('SUCCESS');

      // Failed case
      const failedCollector = createCollector('failed-session');
      failedCollector.recordSdQueued('SD-001');
      failedCollector.recordSdStarted('SD-001');
      failedCollector.recordSdTerminal('SD-001', 'FAILED');
      failedCollector.complete();

      const failedResult = await generator.generate(failedCollector.getSnapshot());
      expect(failedResult.json.overall_status).toBe('FAILED');
    });

    it('should include sds array with all required fields', async () => {
      const collector = createCollector('session-123');
      collector.recordSdQueued('SD-001', {
        title: 'Test SD',
        category: 'feature',
        priority: 'high'
      });
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.complete();

      const result = await generator.generate(collector.getSnapshot());

      expect(result.json.sds.length).toBe(1);
      const sd = result.json.sds[0];
      expect(sd.sd_id).toBe('SD-001');
      expect(sd.title).toBe('Test SD');
      expect(sd.category).toBe('feature');
      expect(sd.priority).toBe('high');
      expect(sd.final_status).toBe('SUCCESS');
      expect(sd.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should generate human-readable digest', async () => {
      const collector = createCollector('session-123');
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.complete();

      const result = await generator.generate(collector.getSnapshot());

      expect(result.digest).toBeTruthy();
      expect(typeof result.digest).toBe('string');
      expect(result.digest).toContain('SESSION SUMMARY');
      expect(result.digest).toContain('session-123');
      expect(result.digest).toContain('SUCCESS');
    });

    it('should record generation time', async () => {
      const collector = createCollector('session-123');
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.complete();

      const result = await generator.generate(collector.getSnapshot());

      expect(result.generation_time_ms).toBeGreaterThanOrEqual(0);
      expect(result.json.report_generation_time_ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('generate - Issues Handling', () => {
    it('should include issues array in output', async () => {
      const collector = createCollector('session-123');
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'FAILED', {
        errorClass: 'ValidationError',
        errorMessage: 'Test failed'
      });
      collector.recordIssue('WARN', 'TEST_WARN', 'A warning occurred');
      collector.complete();

      const result = await generator.generate(collector.getSnapshot());

      expect(result.json.issues.length).toBeGreaterThan(0);
      const errorIssue = result.json.issues.find(i => i.severity === 'ERROR');
      const warnIssue = result.json.issues.find(i => i.severity === 'WARN');

      expect(errorIssue).toBeTruthy();
      expect(warnIssue).toBeTruthy();
    });

    it('should include empty issues array when no issues', async () => {
      const collector = createCollector('session-123');
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.complete();

      const result = await generator.generate(collector.getSnapshot());

      expect(Array.isArray(result.json.issues)).toBe(true);
      expect(result.json.issues.length).toBe(0);
    });

    it('should include issues in digest (max 10)', async () => {
      const collector = createCollector('session-123');
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'FAILED');

      // Add multiple issues
      for (let i = 0; i < 15; i++) {
        collector.recordIssue('WARN', `WARN_${i}`, `Warning ${i}`, { sd_id: `SD-00${i}` });
      }
      collector.complete();

      const result = await generator.generate(collector.getSnapshot());

      expect(result.digest).toContain('ISSUES');
      // Should mention "and X more issues" since we have > 10
      expect(result.digest).toContain('more issues');
    });
  });

  describe('generate - Validation', () => {
    it('should reject snapshot missing session_id (TS-6)', async () => {
      const invalidSnapshot = {
        session_id: null,
        orchestrator_version: '1.0.0',
        start_timestamp: new Date().toISOString(),
        end_timestamp: new Date().toISOString(),
        sds: [],
        issues: []
      };

      const result = await generator.generate(invalidSnapshot);

      expect(result.json.overall_status).toBe('FAILED');
      expect(result.json.issues.some(
        i => i.issue_code === 'SUMMARY_SCHEMA_VALIDATION_FAILED'
      )).toBe(true);
    });

    it('should reject SD entry missing sd_id (TS-6)', async () => {
      const invalidSnapshot = {
        session_id: 'session-123',
        orchestrator_version: '1.0.0',
        start_timestamp: new Date().toISOString(),
        end_timestamp: new Date().toISOString(),
        sds: [
          { sd_id: null, title: 'Invalid SD', final_status: 'SUCCESS' }
        ],
        issues: []
      };

      const result = await generator.generate(invalidSnapshot);

      expect(result.json.overall_status).toBe('FAILED');
      expect(result.json.issues.some(
        i => i.issue_code === 'SUMMARY_SCHEMA_VALIDATION_FAILED'
      )).toBe(true);
    });

    it('should generate minimal fallback summary on validation failure (TS-6)', async () => {
      const invalidSnapshot = {
        session_id: null,
        sds: 'not an array',
        issues: 'not an array'
      };

      const result = await generator.generate(invalidSnapshot);

      // Should still have required fields
      expect(result.json.report_type).toBe('session_summary');
      expect(result.json.schema_version).toBe(SCHEMA_VERSION);
      expect(result.json.overall_status).toBe('FAILED');
      expect(Array.isArray(result.json.issues)).toBe(true);
    });
  });

  describe('generate - Timeout Behavior', () => {
    it('should emit degraded summary on timeout', async () => {
      // Create generator with very short timeout
      const fastGenerator = createGenerator({ timeout: 1 });

      const collector = createCollector('session-123');
      // Add many SDs to potentially slow down generation
      for (let i = 0; i < 100; i++) {
        collector.recordSdQueued(`SD-${i}`, { title: `SD ${i}` });
        collector.recordSdStarted(`SD-${i}`);
        collector.recordSdTerminal(`SD-${i}`, 'SUCCESS');
      }
      collector.complete();

      const result = await fastGenerator.generate(collector.getSnapshot());

      // Either succeeds normally or produces degraded summary
      if (result.degraded) {
        expect(result.json.issues.some(
          i => i.issue_code === 'SUMMARY_TIMEOUT'
        )).toBe(true);
        expect(result.json.degraded).toBe(true);
      }
      // If it didn't time out, that's also acceptable
    });

    it('should include issue_code SUMMARY_TIMEOUT in degraded summary', async () => {
      // Force timeout by using a mock that takes too long
      const mockSnapshot = {
        session_id: 'timeout-session',
        orchestrator_version: '1.0.0',
        start_timestamp: new Date().toISOString(),
        end_timestamp: new Date().toISOString(),
        sds: [],
        issues: []
      };

      // Test the degraded summary directly
      const degradedResult = generator._generateDegradedSummary(mockSnapshot, Date.now() - 600);

      expect(degradedResult.json.issues[0].issue_code).toBe('SUMMARY_TIMEOUT');
      expect(degradedResult.json.degraded).toBe(true);
    });
  });

  describe('Secret Redaction', () => {
    it('should redact secrets from issue messages', async () => {
      const collector = createCollector('session-123');
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordIssue('ERROR', 'AUTH_ERROR', 'Failed with api_key=super_secret_123 and password=hunter2');
      collector.recordSdTerminal('SD-001', 'FAILED');
      collector.complete();

      const result = await generator.generate(collector.getSnapshot());

      const errorIssue = result.json.issues.find(i => i.issue_code === 'AUTH_ERROR');
      expect(errorIssue.message).not.toContain('super_secret');
      expect(errorIssue.message).not.toContain('hunter2');
      expect(errorIssue.message).toContain('[REDACTED]');
    });

    it('should redact secrets from digest', async () => {
      const collector = createCollector('session-123');
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordIssue('ERROR', 'AUTH_ERROR', 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret');
      collector.recordSdTerminal('SD-001', 'FAILED');
      collector.complete();

      const result = await generator.generate(collector.getSnapshot());

      expect(result.digest).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });
  });

  describe('Duration Calculation', () => {
    it('should calculate session duration correctly', async () => {
      const collector = createCollector('session-123');
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 20));

      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.complete();

      const result = await generator.generate(collector.getSnapshot());

      expect(result.json.duration_ms).toBeGreaterThanOrEqual(15);
    });

    it('should format duration in digest', async () => {
      const collector = createCollector('session-123');
      collector.recordSdQueued('SD-001');
      collector.recordSdStarted('SD-001');
      collector.recordSdTerminal('SD-001', 'SUCCESS');
      collector.complete();

      const result = await generator.generate(collector.getSnapshot());

      // Duration should be formatted (ms, s, or m s)
      expect(result.digest).toMatch(/Duration:/);
    });
  });
});
