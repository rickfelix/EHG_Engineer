/**
 * Event Schema Registry Tests
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-01-A
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerSchema,
  validate,
  getSchema,
  getLatestVersion,
  listSchemas,
  hasSchema,
  clearSchemas,
  getSchemaCount,
  registerDefaultSchemas,
} from '../../../lib/eva/event-bus/event-schema-registry.js';

describe('Event Schema Registry', () => {
  beforeEach(() => {
    clearSchemas();
  });

  describe('registerSchema', () => {
    it('should register a schema for an event type', () => {
      const result = registerSchema('stage.completed', '1.0.0', {
        required: { ventureId: 'string', stageId: 'string' },
      });
      expect(result.registered).toBe(true);
      expect(result.eventType).toBe('stage.completed');
      expect(result.version).toBe('1.0.0');
    });

    it('should support multiple versions for same event type', () => {
      registerSchema('stage.completed', '1.0.0', {
        required: { ventureId: 'string', stageId: 'string' },
      });
      registerSchema('stage.completed', '2.0.0', {
        required: { ventureId: 'string', stageId: 'string', status: 'string' },
      });
      expect(getSchemaCount()).toBe(2);
    });

    it('should throw on invalid eventType', () => {
      expect(() => registerSchema('', '1.0.0', { required: {} })).toThrow();
      expect(() => registerSchema(null, '1.0.0', { required: {} })).toThrow();
    });

    it('should throw on invalid schema (missing required)', () => {
      expect(() => registerSchema('test.event', '1.0.0', {})).toThrow();
    });
  });

  describe('getLatestVersion', () => {
    it('should return the latest semver version', () => {
      registerSchema('test.event', '1.0.0', { required: { a: 'string' } });
      registerSchema('test.event', '2.0.0', { required: { a: 'string' } });
      registerSchema('test.event', '1.5.0', { required: { a: 'string' } });
      expect(getLatestVersion('test.event')).toBe('2.0.0');
    });

    it('should return null for unregistered event type', () => {
      expect(getLatestVersion('unknown.event')).toBeNull();
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      registerSchema('stage.completed', '1.0.0', {
        required: { ventureId: 'string', stageId: 'string' },
        optional: { metadata: 'object', completedAt: 'string' },
      });
    });

    it('should pass for valid payload', () => {
      const result = validate('stage.completed', { ventureId: 'v1', stageId: 's1' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.schemaVersion).toBe('1.0.0');
    });

    it('should fail for missing required field', () => {
      const result = validate('stage.completed', { ventureId: 'v1' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: stageId');
    });

    it('should fail for wrong field type', () => {
      const result = validate('stage.completed', { ventureId: 123, stageId: 's1' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('expected type "string"');
    });

    it('should pass for payload with extra fields (backward-compatible)', () => {
      const result = validate('stage.completed', {
        ventureId: 'v1',
        stageId: 's1',
        newField: 'extra',
      });
      expect(result.valid).toBe(true);
    });

    it('should fail in strict mode for unknown fields', () => {
      const result = validate('stage.completed', {
        ventureId: 'v1',
        stageId: 's1',
        newField: 'extra',
      }, { strict: true });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Unknown field');
    });

    it('should pass for unregistered event types (open schema)', () => {
      const result = validate('unknown.event', { anything: 'goes' });
      expect(result.valid).toBe(true);
      expect(result.schemaVersion).toBeNull();
    });

    it('should fail for null payload', () => {
      const result = validate('stage.completed', null);
      expect(result.valid).toBe(false);
    });

    it('should validate optional fields only when present', () => {
      const result = validate('stage.completed', {
        ventureId: 'v1',
        stageId: 's1',
        metadata: 'not_an_object', // should fail - metadata should be object
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('metadata');
    });

    it('should validate against specific version', () => {
      registerSchema('stage.completed', '2.0.0', {
        required: { ventureId: 'string', stageId: 'string', status: 'string' },
      });

      // Valid for v1 but missing required 'status' for v2
      const v1Result = validate('stage.completed', { ventureId: 'v1', stageId: 's1' }, { version: '1.0.0' });
      expect(v1Result.valid).toBe(true);

      const v2Result = validate('stage.completed', { ventureId: 'v1', stageId: 's1' }, { version: '2.0.0' });
      expect(v2Result.valid).toBe(false);
    });
  });

  describe('registerDefaultSchemas', () => {
    it('should register schemas for all known event types', () => {
      registerDefaultSchemas();
      expect(hasSchema('stage.completed')).toBe(true);
      expect(hasSchema('decision.submitted')).toBe(true);
      expect(hasSchema('gate.evaluated')).toBe(true);
      expect(hasSchema('sd.completed')).toBe(true);
      expect(hasSchema('venture.created')).toBe(true);
      expect(hasSchema('venture.killed')).toBe(true);
      expect(hasSchema('budget.exceeded')).toBe(true);
      expect(hasSchema('chairman.override')).toBe(true);
      expect(hasSchema('stage.failed')).toBe(true);
      expect(hasSchema('vision.scored')).toBe(true);
      expect(hasSchema('vision.gap_detected')).toBe(true);
      expect(hasSchema('leo.pattern_resolved')).toBe(true);
      expect(hasSchema('feedback.quality_updated')).toBe(true);
      expect(getSchemaCount()).toBeGreaterThanOrEqual(16);
    });
  });

  describe('listSchemas', () => {
    it('should return all registered schemas', () => {
      registerSchema('a.event', '1.0.0', { required: { x: 'string' } });
      registerSchema('b.event', '1.0.0', { required: { y: 'number' } });
      const schemas = listSchemas();
      expect(schemas).toHaveLength(2);
      expect(schemas[0].eventType).toBe('a.event');
    });
  });
});
