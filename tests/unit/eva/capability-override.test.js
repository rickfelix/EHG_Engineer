/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-I FR-3: capability override read/write,
 * and the extracted shared validateOverrideReason rule.
 */
import { describe, it, expect } from 'vitest';
import {
  validateOverrideReason,
  recordCapabilityOverride,
  readCapabilityOverrides,
} from '../../../lib/eva/utils/validate-venture-default-capabilities.js';

const silentLogger = { info: () => {}, warn: () => {}, log: () => {}, error: () => {} };

function buildMockSupabase({ overrideRows = [], existingOverride = null, insertShouldFail = false } = {}) {
  const upserts = [];
  return {
    _upserts: upserts,
    from(table) {
      if (table === 'venture_capability_overrides') {
        return {
          select() {
            return {
              eq() { return this; },
              limit: () => Promise.resolve({ data: overrideRows, error: null }),
              maybeSingle: () => Promise.resolve({ data: existingOverride, error: null }),
            };
          },
          update(row) {
            upserts.push({ op: 'update', row });
            return { eq: () => Promise.resolve({ error: null }) };
          },
          insert(row) {
            upserts.push({ op: 'insert', row });
            if (insertShouldFail) {
              return { select() { return this; }, single: () => Promise.resolve({ data: null, error: { message: 'insert failed' } }) };
            }
            return { select() { return this; }, single: () => Promise.resolve({ data: { id: 'new-override-1' }, error: null }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe('validateOverrideReason', () => {
  it('accepts a non-empty trimmed reason', () => {
    expect(validateOverrideReason('B2B-only venture, no consumer feedback channel')).toEqual({
      valid: true,
      trimmed: 'B2B-only venture, no consumer feedback channel',
    });
  });

  it('rejects null, undefined, empty, and whitespace-only', () => {
    expect(validateOverrideReason(null).valid).toBe(false);
    expect(validateOverrideReason(undefined).valid).toBe(false);
    expect(validateOverrideReason('').valid).toBe(false);
    expect(validateOverrideReason('   ').valid).toBe(false);
  });

  it('trims surrounding whitespace from a valid reason', () => {
    expect(validateOverrideReason('  a real reason  ')).toEqual({ valid: true, trimmed: 'a real reason' });
  });
});

describe('recordCapabilityOverride', () => {
  it('rejects an empty or whitespace-only reason', async () => {
    const supabase = buildMockSupabase();
    const result = await recordCapabilityOverride({ supabase, ventureId: 'v1', capabilityId: 'cost-instrumentation', overrideReason: '   ', logger: silentLogger });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty_or_whitespace_reason');
    expect(supabase._upserts).toHaveLength(0);
  });

  it('inserts a new override with the trimmed reason', async () => {
    const supabase = buildMockSupabase();
    const result = await recordCapabilityOverride({ supabase, ventureId: 'v1', capabilityId: 'cost-instrumentation', overrideReason: '  no cost data available pre-revenue  ', logger: silentLogger });
    expect(result.ok).toBe(true);
    expect(supabase._upserts[0].op).toBe('insert');
    expect(supabase._upserts[0].row.override_reason).toBe('no cost data available pre-revenue');
  });

  it('updates (not duplicates) an existing override', async () => {
    const supabase = buildMockSupabase({ existingOverride: { id: 'existing-1' } });
    const result = await recordCapabilityOverride({ supabase, ventureId: 'v1', capabilityId: 'cost-instrumentation', overrideReason: 'updated reason', logger: silentLogger });
    expect(result.ok).toBe(true);
    expect(result.id).toBe('existing-1');
    expect(supabase._upserts[0].op).toBe('update');
  });

  it('does not throw when required fields are missing', async () => {
    await expect(recordCapabilityOverride({ supabase: null, ventureId: 'v1', capabilityId: 'x', overrideReason: 'y' })).resolves.toEqual({ ok: false, reason: 'missing_required_fields' });
  });
});

describe('readCapabilityOverrides', () => {
  it('returns a Map keyed by capability_id', async () => {
    const supabase = buildMockSupabase({
      overrideRows: [
        { capability_id: 'cost-instrumentation', override_reason: 'pre-revenue' },
        { capability_id: 'calm-decision-card', override_reason: 'not yet designed' },
      ],
    });
    const result = await readCapabilityOverrides({ supabase, ventureId: 'v1', logger: silentLogger });
    expect(result.get('cost-instrumentation')).toEqual({ override_reason: 'pre-revenue' });
    expect(result.get('calm-decision-card')).toEqual({ override_reason: 'not yet designed' });
    expect(result.has('health-uptime-probe')).toBe(false);
  });

  it('returns an empty Map (never throws) on missing supabase/ventureId or a DB error', async () => {
    expect((await readCapabilityOverrides({ supabase: null, ventureId: 'v1' })).size).toBe(0);
    const erroring = { from: () => ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) }) }) };
    expect((await readCapabilityOverrides({ supabase: erroring, ventureId: 'v1', logger: silentLogger })).size).toBe(0);
  });
});
