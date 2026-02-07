/**
 * Unit Tests for RCA Trigger SDK
 * SD-LEO-ENH-ENHANCE-RCA-SUB-001
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TRIGGER_TYPES,
  CLASSIFICATIONS,
  buildTriggerEvent,
  buildHandoffContext,
  buildGateContext,
  buildApiContext,
  buildMigrationContext,
  buildStateMismatchContext,
  redactSecrets,
  truncateContext,
  generateFingerprint,
  checkRateLimit
} from '../../lib/rca/trigger-sdk.js';

describe('RCA Trigger SDK', () => {
  describe('TRIGGER_TYPES', () => {
    it('should define all required trigger types', () => {
      expect(TRIGGER_TYPES.HANDOFF_FAILURE).toBe('handoff_failure');
      expect(TRIGGER_TYPES.GATE_VALIDATION_FAILURE).toBe('gate_validation_failure');
      expect(TRIGGER_TYPES.API_FAILURE).toBe('api_failure');
      expect(TRIGGER_TYPES.MIGRATION_FAILURE).toBe('migration_failure');
      expect(TRIGGER_TYPES.SCRIPT_CRASH).toBe('script_crash');
      expect(TRIGGER_TYPES.TEST_FAILURE_RETRY_EXHAUSTED).toBe('test_failure_retry_exhausted');
      expect(TRIGGER_TYPES.PRD_VALIDATION_FAILURE).toBe('prd_validation_failure');
      expect(TRIGGER_TYPES.STATE_MISMATCH).toBe('state_mismatch');
    });
  });

  describe('CLASSIFICATIONS', () => {
    it('should define all required classifications', () => {
      expect(CLASSIFICATIONS.CODE_BUG).toBe('code_bug');
      expect(CLASSIFICATIONS.PROCESS_ISSUE).toBe('process_issue');
      expect(CLASSIFICATIONS.INFRASTRUCTURE).toBe('infrastructure');
      expect(CLASSIFICATIONS.DATA_QUALITY).toBe('data_quality');
      expect(CLASSIFICATIONS.ENCODING).toBe('encoding');
      expect(CLASSIFICATIONS.CROSS_CUTTING).toBe('cross_cutting');
      expect(CLASSIFICATIONS.PROTOCOL_PROCESS).toBe('protocol_process');
      expect(CLASSIFICATIONS.CONFIGURATION).toBe('configuration');
    });
  });

  describe('redactSecrets', () => {
    it('should redact API keys', () => {
      const text = 'Using api_key: sk-test-fake-key-for-unit-test-only';
      expect(redactSecrets(text)).toContain('[REDACTED]');
      expect(redactSecrets(text)).not.toContain('sk-test-fake');
    });

    it('should redact Authorization headers', () => {
      const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc123';
      expect(redactSecrets(text)).toContain('[REDACTED]');
      expect(redactSecrets(text)).not.toContain('eyJ');
    });

    it('should redact SUPABASE env vars', () => {
      const text = 'SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiJ9.test';
      expect(redactSecrets(text)).toContain('[REDACTED]');
    });

    it('should pass through non-string values', () => {
      expect(redactSecrets(42)).toBe(42);
      expect(redactSecrets(null)).toBe(null);
    });

    it('should not redact safe text', () => {
      const text = 'This is a normal error message with no secrets';
      expect(redactSecrets(text)).toBe(text);
    });
  });

  describe('truncateContext', () => {
    it('should return short strings unchanged', () => {
      const short = 'Hello world';
      expect(truncateContext(short)).toBe(short);
    });

    it('should truncate long strings', () => {
      const long = 'x'.repeat(30000);
      const result = truncateContext(long, 1000);
      expect(result.length).toBeLessThan(long.length);
      expect(result).toContain('truncated');
    });

    it('should handle non-string values', () => {
      expect(truncateContext(123)).toBe(123);
    });
  });

  describe('generateFingerprint', () => {
    it('should generate consistent fingerprints for same input', () => {
      const fp1 = generateFingerprint('handoff_failure', 'Gate XYZ failed', 'handoff.js');
      const fp2 = generateFingerprint('handoff_failure', 'Gate XYZ failed', 'handoff.js');
      expect(fp1).toBe(fp2);
    });

    it('should generate different fingerprints for different inputs', () => {
      const fp1 = generateFingerprint('handoff_failure', 'Gate XYZ failed', 'handoff.js');
      const fp2 = generateFingerprint('api_failure', 'Timeout error', 'provider.js');
      expect(fp1).not.toBe(fp2);
    });

    it('should normalize UUIDs in error messages', () => {
      const fp1 = generateFingerprint('api_failure', 'Failed for ID 12345678-1234-1234-1234-123456789abc', 'test');
      const fp2 = generateFingerprint('api_failure', 'Failed for ID aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'test');
      expect(fp1).toBe(fp2);
    });

    it('should normalize timestamps in error messages', () => {
      const fp1 = generateFingerprint('api_failure', 'Error at 2026-02-07T11:30:00.000Z', 'test');
      const fp2 = generateFingerprint('api_failure', 'Error at 2026-02-08T14:00:00.000Z', 'test');
      expect(fp1).toBe(fp2);
    });

    it('should return a 16-character hex string', () => {
      const fp = generateFingerprint('test', 'error', 'module');
      expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow first request', () => {
      const fp = 'unique-test-' + Date.now();
      expect(checkRateLimit(fp)).toBe(true);
    });

    it('should allow requests within limit', () => {
      const fp = 'rate-test-' + Date.now();
      expect(checkRateLimit(fp)).toBe(true);
      expect(checkRateLimit(fp)).toBe(true);
      expect(checkRateLimit(fp)).toBe(true);
    });

    it('should block requests exceeding limit', () => {
      const fp = 'limit-test-' + Date.now();
      checkRateLimit(fp); // 1
      checkRateLimit(fp); // 2
      checkRateLimit(fp); // 3 (at limit)
      expect(checkRateLimit(fp)).toBe(false); // 4 - blocked
    });
  });

  describe('buildTriggerEvent', () => {
    it('should build a valid trigger event', () => {
      const event = buildTriggerEvent({
        triggerType: TRIGGER_TYPES.HANDOFF_FAILURE,
        errorMessage: 'Gate validation failed',
        sdId: 'SD-TEST-001',
        module: 'handoff.js'
      });

      expect(event.trigger_type).toBe('handoff_failure');
      expect(event.sd_id).toBe('SD-TEST-001');
      expect(event.module).toBe('handoff.js');
      expect(event.fingerprint).toMatch(/^[0-9a-f]{16}$/);
      expect(event.timestamp).toBeDefined();
      expect(event.classification).toBeDefined();
      expect(event.classification_confidence).toBeGreaterThan(0);
    });

    it('should redact secrets in error messages', () => {
      const event = buildTriggerEvent({
        triggerType: TRIGGER_TYPES.API_FAILURE,
        errorMessage: 'Failed with api_key: sk-test-fake-key-for-unit-test-only',
        module: 'api.js'
      });

      expect(event.error_message).toContain('[REDACTED]');
      expect(event.error_message).not.toContain('sk-test-fake');
    });

    it('should auto-classify encoding errors', () => {
      const event = buildTriggerEvent({
        triggerType: TRIGGER_TYPES.API_FAILURE,
        errorMessage: 'invalid high surrogate in string: invalid Unicode encoding',
        module: 'provider.js'
      });

      expect(event.classification).toBe('encoding');
      expect(event.classification_confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should auto-classify infrastructure errors', () => {
      const event = buildTriggerEvent({
        triggerType: TRIGGER_TYPES.API_FAILURE,
        errorMessage: 'ECONNREFUSED: Connection to database timed out',
        module: 'db.js'
      });

      expect(event.classification).toBe('infrastructure');
    });

    it('should auto-classify protocol/process errors', () => {
      const event = buildTriggerEvent({
        triggerType: TRIGGER_TYPES.GATE_VALIDATION_FAILURE,
        errorMessage: 'Gate validation failed for handoff LEAD-TO-PLAN',
        module: 'gate.js'
      });

      expect(event.classification).toBe('protocol_process');
    });
  });

  describe('buildHandoffContext', () => {
    it('should build a handoff failure context', () => {
      const event = buildHandoffContext({
        command: 'handoff.js execute',
        args: 'LEAD-TO-PLAN SD-TEST-001',
        exitCode: 1,
        sdId: 'SD-TEST-001',
        handoffType: 'LEAD-TO-PLAN',
        stderr: 'SMOKE_TEST_SPECIFICATION validation failed'
      });

      expect(event.trigger_type).toBe('handoff_failure');
      expect(event.exit_code).toBe(1);
      expect(event.context.handoff_type).toBe('LEAD-TO-PLAN');
    });
  });

  describe('buildGateContext', () => {
    it('should build a gate failure context', () => {
      const event = buildGateContext({
        gateName: 'SMOKE_TEST_SPECIFICATION',
        score: 0,
        threshold: 100,
        sdId: 'SD-TEST-001',
        handoffType: 'LEAD-TO-PLAN'
      });

      expect(event.trigger_type).toBe('gate_validation_failure');
      expect(event.context.gate_name).toBe('SMOKE_TEST_SPECIFICATION');
      expect(event.context.score).toBe(0);
      expect(event.context.threshold).toBe(100);
    });
  });

  describe('buildApiContext', () => {
    it('should build an API failure context', () => {
      const event = buildApiContext({
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        httpStatus: 400,
        errorMessage: 'invalid high surrogate in string'
      });

      expect(event.trigger_type).toBe('api_failure');
      expect(event.context.provider).toBe('anthropic');
      expect(event.context.http_status).toBe(400);
      expect(event.classification).toBe('encoding');
    });
  });

  describe('buildMigrationContext', () => {
    it('should build a migration failure context', () => {
      const event = buildMigrationContext({
        migrationFile: '20260207_test.sql',
        errorMessage: 'relation already exists',
        sdId: 'SD-TEST-001'
      });

      expect(event.trigger_type).toBe('migration_failure');
      expect(event.context.migration_file).toBe('20260207_test.sql');
    });
  });

  describe('buildStateMismatchContext', () => {
    it('should build a state mismatch context', () => {
      const event = buildStateMismatchContext({
        entityType: 'SD',
        entityId: 'SD-TEST-001',
        dbState: 'completed',
        gitState: 'in_progress',
        sdId: 'SD-TEST-001'
      });

      expect(event.trigger_type).toBe('state_mismatch');
      expect(event.context.db_state).toBe('completed');
      expect(event.context.git_state).toBe('in_progress');
    });
  });
});
