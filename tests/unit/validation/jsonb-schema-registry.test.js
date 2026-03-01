/**
 * Tests for JsonbSchemaRegistry — A02 JSONB Validation Layer
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-E
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JsonbSchemaRegistry } from '../../../lib/validation/jsonb-schema-registry.js';
import {
  createJsonbRegistry,
  getJsonbRegistry,
  validateBeforeInsert,
  verifyWriteback,
  isJsonbSafe,
} from '../../../lib/validation/jsonb-validation-index.js';

describe('JsonbSchemaRegistry Core', () => {
  let registry;

  beforeEach(() => {
    registry = new JsonbSchemaRegistry();
  });

  it('registers and validates a field', () => {
    registry.register('test_table', 'tags', { type: 'array' });
    const result = registry.validateField('test_table', 'tags', ['a', 'b']);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid=true for unregistered table/field', () => {
    const result = registry.validateField('unknown', 'field', 'anything');
    expect(result.valid).toBe(true);
  });

  it('detects JSON.stringify string passed as array (PAT-JSONB-STRING-TYPE)', () => {
    registry.register('test_table', 'items', { type: 'array' });
    const stringified = JSON.stringify([{ id: 1 }, { id: 2 }]);
    const result = registry.validateField('test_table', 'items', stringified);
    expect(result.valid).toBe(true); // auto-parsed is a warning, not blocking
    expect(result.errors.some(e => e.includes('PAT-JSONB-STRING-TYPE'))).toBe(true);
    expect(result.sanitized).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('rejects unparseable string for array field', () => {
    registry.register('test_table', 'items', { type: 'array' });
    const result = registry.validateField('test_table', 'items', 'not json');
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('unparseable string');
  });

  it('rejects object when array expected', () => {
    registry.register('test_table', 'items', { type: 'array' });
    const result = registry.validateField('test_table', 'items', { key: 'val' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('expected array');
  });

  it('rejects array when object expected', () => {
    registry.register('test_table', 'config', { type: 'object' });
    const result = registry.validateField('test_table', 'config', [1, 2, 3]);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('expected object');
  });

  it('validates required field missing', () => {
    registry.register('test_table', 'data', { type: 'array', required: true });
    const result = registry.validateField('test_table', 'data', null);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('required field is null');
  });

  it('validates optional null field as valid', () => {
    registry.register('test_table', 'data', { type: 'array', required: false });
    const result = registry.validateField('test_table', 'data', null);
    expect(result.valid).toBe(true);
  });

  it('validates minItems constraint', () => {
    registry.register('test_table', 'items', { type: 'array', minItems: 2 });
    const result = registry.validateField('test_table', 'items', [1]);
    expect(result.errors.some(e => e.includes('minimum is 2'))).toBe(true);
  });

  it('validates array item properties', () => {
    registry.register('test_table', 'metrics', {
      type: 'array',
      items: {
        properties: {
          metric: { type: 'string', required: true },
          target: { required: true },
        },
      },
    });
    const result = registry.validateField('test_table', 'metrics', [
      { metric: 'speed', target: 100 },
      { target: 50 }, // missing required 'metric'
    ]);
    expect(result.errors.some(e => e.includes('metric') && e.includes('required'))).toBe(true);
  });

  it('throws on invalid register arguments', () => {
    expect(() => registry.register('', 'field', {})).toThrow('Table name');
    expect(() => registry.register('table', '', {})).toThrow('Field name');
    expect(() => registry.register('table', 'field', null)).toThrow('Schema must be');
  });
});

describe('JsonbSchemaRegistry — validate(table, data)', () => {
  let registry;

  beforeEach(() => {
    registry = new JsonbSchemaRegistry();
    registry.register('sd', 'success_criteria', { type: 'array', required: true, minItems: 1 });
    registry.register('sd', 'metadata', { type: 'object', required: false });
  });

  it('validates a complete row', () => {
    const result = registry.validate('sd', {
      success_criteria: ['criterion 1'],
      metadata: { theme: 'test' },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports missing required fields', () => {
    const result = registry.validate('sd', { metadata: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('success_criteria') && e.includes('missing'))).toBe(true);
  });

  it('auto-parses stringified JSONB and reports as warning', () => {
    const result = registry.validate('sd', {
      success_criteria: JSON.stringify(['a', 'b']),
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('auto-parsed'))).toBe(true);
    expect(result.sanitized.success_criteria).toEqual(['a', 'b']);
  });

  it('returns warning for unregistered table', () => {
    const result = registry.validate('unknown_table', { foo: 'bar' });
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('No schemas registered'))).toBe(true);
  });
});

describe('JsonbSchemaRegistry — has/getStats/getRegisteredTables', () => {
  let registry;

  beforeEach(() => {
    registry = new JsonbSchemaRegistry();
  });

  it('has() checks table registration', () => {
    expect(registry.has('sd')).toBe(false);
    registry.register('sd', 'field1', { type: 'array' });
    expect(registry.has('sd')).toBe(true);
  });

  it('getRegisteredTables returns table names', () => {
    registry.register('table_a', 'f1', { type: 'array' });
    registry.register('table_b', 'f1', { type: 'object' });
    expect(registry.getRegisteredTables()).toEqual(['table_a', 'table_b']);
  });

  it('getFieldsForTable returns field names', () => {
    registry.register('sd', 'success_criteria', { type: 'array' });
    registry.register('sd', 'metadata', { type: 'object' });
    expect(registry.getFieldsForTable('sd')).toEqual(['success_criteria', 'metadata']);
    expect(registry.getFieldsForTable('unknown')).toEqual([]);
  });

  it('getStats returns correct counts', () => {
    registry.register('sd', 'f1', { type: 'array' });
    registry.register('sd', 'f2', { type: 'object' });
    registry.register('prd', 'f1', { type: 'array' });
    const stats = registry.getStats();
    expect(stats.totalTables).toBe(2);
    expect(stats.totalFields).toBe(3);
    expect(stats.byTable['sd']).toBe(2);
    expect(stats.byTable['prd']).toBe(1);
  });

  it('clear removes everything', () => {
    registry.register('sd', 'f1', { type: 'array' });
    registry.clear();
    expect(registry.has('sd')).toBe(false);
    expect(registry.getStats().totalTables).toBe(0);
  });
});

describe('createJsonbRegistry — factory with built-in schemas', () => {
  it('creates registry with SD and PRD schemas', () => {
    const registry = createJsonbRegistry();
    expect(registry.has('strategic_directives_v2')).toBe(true);
    expect(registry.has('product_requirements_v2')).toBe(true);
  });

  it('has SD schemas for critical fields', () => {
    const registry = createJsonbRegistry();
    const fields = registry.getFieldsForTable('strategic_directives_v2');
    expect(fields).toContain('success_criteria');
    expect(fields).toContain('success_metrics');
    expect(fields).toContain('delivers_capabilities');
  });

  it('has PRD schemas for critical fields', () => {
    const registry = createJsonbRegistry();
    const fields = registry.getFieldsForTable('product_requirements_v2');
    expect(fields).toContain('functional_requirements');
    expect(fields).toContain('acceptance_criteria');
    expect(fields).toContain('test_scenarios');
  });
});

describe('getJsonbRegistry — singleton', () => {
  it('returns same instance', () => {
    const a = getJsonbRegistry();
    const b = getJsonbRegistry();
    expect(a).toBe(b);
  });
});

describe('validateBeforeInsert — utility', () => {
  it('validates SD data against schemas', () => {
    const result = validateBeforeInsert('strategic_directives_v2', {
      success_criteria: ['criterion 1'],
      success_metrics: [{ metric: 'speed', target: 100 }],
    });
    expect(result.valid).toBe(true);
  });

  it('catches JSON.stringify strings', () => {
    const result = validateBeforeInsert('strategic_directives_v2', {
      success_criteria: JSON.stringify(['a']),
      success_metrics: [{ metric: 'm', target: 1 }],
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('auto-parsed'))).toBe(true);
    expect(result.sanitized.success_criteria).toEqual(['a']);
  });

  it('strict mode rejects auto-parsed strings', () => {
    const result = validateBeforeInsert('strategic_directives_v2', {
      success_criteria: JSON.stringify(['a']),
      success_metrics: [{ metric: 'm', target: 1 }],
    }, { strict: true });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('STRICT'))).toBe(true);
  });

  it('returns warning for unknown table', () => {
    const result = validateBeforeInsert('unknown_table', { foo: 'bar' });
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('verifyWriteback — read-back verification', () => {
  it('returns match=true when data matches', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: '123',
            success_criteria: ['a', 'b'],
          },
          error: null,
        }),
      })),
    };

    const result = await verifyWriteback(
      mockSupabase,
      'strategic_directives_v2',
      'id',
      '123',
      { success_criteria: ['a', 'b'] },
    );
    expect(result.match).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it('detects mismatches', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: '123',
            success_criteria: ['modified'],
          },
          error: null,
        }),
      })),
    };

    const result = await verifyWriteback(
      mockSupabase,
      'strategic_directives_v2',
      'id',
      '123',
      { success_criteria: ['original'] },
    );
    expect(result.match).toBe(false);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].field).toBe('success_criteria');
  });

  it('handles missing supabase client', async () => {
    const result = await verifyWriteback(null, 'table', 'id', '123', {});
    expect(result.match).toBe(false);
    expect(result.mismatches[0].field).toBe('_connection');
  });

  it('handles DB query error', async () => {
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'connection failed' },
        }),
      })),
    };

    const result = await verifyWriteback(
      mockSupabase,
      'strategic_directives_v2',
      'id',
      '123',
      { success_criteria: ['a'] },
    );
    expect(result.match).toBe(false);
    expect(result.mismatches[0].readBack).toContain('connection failed');
  });

  it('handles exception gracefully', async () => {
    const mockSupabase = {
      from: vi.fn(() => { throw new Error('DB down'); }),
    };

    const result = await verifyWriteback(
      mockSupabase,
      'strategic_directives_v2',
      'id',
      '123',
      { success_criteria: ['a'] },
    );
    expect(result.match).toBe(false);
    expect(result.mismatches[0].readBack).toContain('DB down');
  });
});

describe('isJsonbSafe — type guard', () => {
  it('accepts objects', () => {
    const result = isJsonbSafe({ key: 'value' }, 'metadata');
    expect(result.safe).toBe(true);
    expect(result.value).toEqual({ key: 'value' });
  });

  it('accepts arrays', () => {
    const result = isJsonbSafe([1, 2, 3], 'items');
    expect(result.safe).toBe(true);
  });

  it('accepts null', () => {
    const result = isJsonbSafe(null, 'optional_field');
    expect(result.safe).toBe(true);
  });

  it('accepts undefined', () => {
    const result = isJsonbSafe(undefined, 'optional_field');
    expect(result.safe).toBe(true);
  });

  it('rejects JSON.stringify string with parsed value', () => {
    const result = isJsonbSafe(JSON.stringify({ a: 1 }), 'field');
    expect(result.safe).toBe(false);
    expect(result.error).toContain('JSON.stringify');
    expect(result.parsed).toEqual({ a: 1 });
  });

  it('rejects non-JSON string', () => {
    const result = isJsonbSafe('plain text', 'field');
    expect(result.safe).toBe(false);
    expect(result.error).toContain('non-JSON string');
  });

  it('accepts numbers (valid JSONB primitive)', () => {
    const result = isJsonbSafe(42, 'score');
    expect(result.safe).toBe(true);
  });

  it('accepts booleans (valid JSONB primitive)', () => {
    const result = isJsonbSafe(true, 'flag');
    expect(result.safe).toBe(true);
  });
});

describe('Handoff schemas — sd_phase_handoffs', () => {
  it('registry includes sd_phase_handoffs table', () => {
    const registry = createJsonbRegistry();
    expect(registry.has('sd_phase_handoffs')).toBe(true);
  });

  it('validates valid handoff metadata', () => {
    const result = validateBeforeInsert('sd_phase_handoffs', {
      metadata: { theme: 'test' },
      validation_details: { reason: 'SD_COMPLETE', result: { message: 'ok', success: true } },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects string passed to validation_details', () => {
    const result = validateBeforeInsert('sd_phase_handoffs', {
      validation_details: JSON.stringify({ reason: 'test' }),
    });
    expect(result.warnings.some(w => w.includes('auto-parsed'))).toBe(true);
    expect(result.sanitized.validation_details).toEqual({ reason: 'test' });
  });
});

describe('Vision score schemas — eva_vision_scores', () => {
  it('registry includes eva_vision_scores table', () => {
    const registry = createJsonbRegistry();
    expect(registry.has('eva_vision_scores')).toBe(true);
  });

  it('validates valid dimension_scores', () => {
    const result = validateBeforeInsert('eva_vision_scores', {
      dimension_scores: {
        key_changes_delivered: { name: 'key_changes_delivered', score: 88, source: 'manual', reasoning: 'OK' },
      },
      rubric_snapshot: { mode: 'sd-heal', sd_key: 'SD-TEST-001', summary: 'Test', scored_by: 'test' },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects string passed to dimension_scores', () => {
    const result = validateBeforeInsert('eva_vision_scores', {
      dimension_scores: JSON.stringify({ a: 1 }),
    }, { strict: true });
    expect(result.valid).toBe(false);
  });

  it('validates missing required dimension_scores', () => {
    const registry = createJsonbRegistry();
    const result = registry.validate('eva_vision_scores', {
      rubric_snapshot: { mode: 'test' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('dimension_scores') && e.includes('missing'))).toBe(true);
  });
});
