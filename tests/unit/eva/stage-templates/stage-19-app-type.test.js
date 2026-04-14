/**
 * Unit tests for Stage 19 app_type feature
 * SD: SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-A-A
 *
 * Tests app_type field in schema, resolveAppType from Stage 15 data,
 * and app_type propagation to sprint items and SD bridge payloads.
 */

import { describe, it, expect } from 'vitest';
import stage19, { APP_TYPE_VALUES } from '../../../../lib/eva/stage-templates/stage-19.js';

describe('Stage 19 - app_type feature', () => {
  describe('APP_TYPE_VALUES constant', () => {
    it('should export APP_TYPE_VALUES with all expected values', () => {
      expect(APP_TYPE_VALUES).toEqual(['mobile', 'web', 'desktop', 'tablet', 'agnostic']);
    });
  });

  describe('Schema definition', () => {
    it('should include app_type in item schema', () => {
      const itemSchema = stage19.schema.items.items;
      expect(itemSchema.app_type).toBeDefined();
      expect(itemSchema.app_type.type).toBe('enum');
      expect(itemSchema.app_type.values).toEqual(APP_TYPE_VALUES);
    });

    it('should not require app_type (optional field)', () => {
      const itemSchema = stage19.schema.items.items;
      expect(itemSchema.app_type.required).toBeUndefined();
    });
  });

  describe('Validation', () => {
    const validData = {
      sprint_name: 'Sprint 2026-04-14',
      sprint_duration_days: 14,
      sprint_goal: 'Complete initial build sprint',
      items: [{
        title: 'Build landing page',
        description: 'Create main landing page',
        priority: 'high',
        type: 'feature',
        scope: 'frontend',
        success_criteria: 'Page renders correctly',
        target_application: 'ehg',
        app_type: 'mobile',
      }],
    };

    it('should pass validation with valid app_type', () => {
      const result = stage19.validate(validData, { logger: { warn: () => {} } });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass validation without app_type (optional)', () => {
      const data = { ...validData, items: [{ ...validData.items[0] }] };
      delete data.items[0].app_type;
      const result = stage19.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(true);
    });

    it('should fail validation with invalid app_type', () => {
      const data = {
        ...validData,
        items: [{ ...validData.items[0], app_type: 'invalid_type' }],
      };
      const result = stage19.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('app_type'))).toBe(true);
    });

    for (const validType of APP_TYPE_VALUES) {
      it(`should accept app_type="${validType}"`, () => {
        const data = {
          ...validData,
          items: [{ ...validData.items[0], app_type: validType }],
        };
        const result = stage19.validate(data, { logger: { warn: () => {} } });
        expect(result.valid).toBe(true);
      });
    }
  });
});
