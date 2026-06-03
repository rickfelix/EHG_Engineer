/**
 * Tests for Architecture Plan Upsert Module
 * SD: SD-LEO-INFRA-VENTURE-BUILD-READINESS-001-C
 */
import { describe, test, expect, vi } from 'vitest';
import { upsertArchPlan } from '../archplan-upsert.js';

// Mock supabase with chainable query builder
function mockSupabase({ visionDoc = null, visionErr = null, existing = null, upsertResult = null, upsertError = null } = {}) {
  const captured = { upsertRecord: null };
  const chainable = (finalData, finalError) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => ({ data: finalData, error: finalError })),
        maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
      })),
    })),
    upsert: vi.fn((record) => {
      captured.upsertRecord = record;
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: upsertResult, error: upsertError })),
        })),
      };
    }),
  });

  return {
    from: vi.fn((table) => {
      if (table === 'eva_vision_documents') return chainable(visionDoc, visionErr);
      if (table === 'eva_architecture_plans') return chainable(existing, null);
      return chainable(null, null);
    }),
    __captured: captured,
  };
}

describe('upsertArchPlan', () => {
  test('throws if supabase is missing', async () => {
    await expect(upsertArchPlan({ planKey: 'A-1', visionKey: 'V-1', content: 'test' }))
      .rejects.toThrow('supabase client is required');
  });

  test('throws if planKey is missing', async () => {
    await expect(upsertArchPlan({ supabase: {}, visionKey: 'V-1', content: 'test' }))
      .rejects.toThrow('planKey is required');
  });

  test('throws if visionKey is missing', async () => {
    await expect(upsertArchPlan({ supabase: {}, planKey: 'A-1', content: 'test' }))
      .rejects.toThrow('visionKey is required');
  });

  test('throws if content is missing', async () => {
    await expect(upsertArchPlan({ supabase: {}, planKey: 'A-1', visionKey: 'V-1' }))
      .rejects.toThrow('content is required');
  });

  test('returns error when vision document not found', async () => {
    const supabase = mockSupabase({ visionDoc: null, visionErr: { message: 'not found' } });

    const { data, error } = await upsertArchPlan({
      supabase,
      planKey: 'A-1',
      visionKey: 'V-MISSING',
      content: 'test',
    });

    expect(data).toBeNull();
    expect(error).toBeTruthy();
  });

  test('parses markdown sections from content when none provided', async () => {
    const visionDoc = { id: 'vision-uuid', vision_key: 'V-1', level: 'L2', status: 'active' };
    const result = { id: 'arch-uuid', plan_key: 'A-1', version: 1, status: 'active', vision_id: 'vision-uuid' };
    const supabase = mockSupabase({ visionDoc, upsertResult: result });

    const content = '## Stack And Repository\n\nReact + Node\n\n## Data Layer\n\nPostgreSQL + Supabase';
    const { data, error } = await upsertArchPlan({
      supabase,
      planKey: 'A-1',
      visionKey: 'V-1',
      content,
    });

    // Should succeed (mock returns result)
    expect(supabase.from).toHaveBeenCalledWith('eva_vision_documents');
    expect(supabase.from).toHaveBeenCalledWith('eva_architecture_plans');
  });

  // QF-20260602-607: arch plans must inherit venture_id from their linked vision
  // (the archplan sibling of the vision-side fix QF-20260527-948), else they orphan.
  test('inherits venture_id from the linked vision when ventureId is not passed', async () => {
    const visionDoc = { id: 'vision-uuid', vision_key: 'V-1', level: 'L2', status: 'active', version: 1, venture_id: 'venture-xyz' };
    const result = { id: 'arch-uuid', plan_key: 'A-1', version: 1, status: 'active', vision_id: 'vision-uuid' };
    const supabase = mockSupabase({ visionDoc, upsertResult: result });

    await upsertArchPlan({ supabase, planKey: 'A-1', visionKey: 'V-1', content: 'x' });

    expect(supabase.__captured.upsertRecord).toBeTruthy();
    expect(supabase.__captured.upsertRecord.venture_id).toBe('venture-xyz');
  });

  test('explicit ventureId overrides the vision venture_id', async () => {
    const visionDoc = { id: 'vision-uuid', vision_key: 'V-1', level: 'L2', status: 'active', version: 1, venture_id: 'venture-from-vision' };
    const result = { id: 'arch-uuid', plan_key: 'A-1', version: 1, status: 'active', vision_id: 'vision-uuid' };
    const supabase = mockSupabase({ visionDoc, upsertResult: result });

    await upsertArchPlan({ supabase, planKey: 'A-1', visionKey: 'V-1', content: 'x', ventureId: 'explicit-venture' });

    expect(supabase.__captured.upsertRecord.venture_id).toBe('explicit-venture');
  });

  test('omits venture_id when neither ventureId nor vision.venture_id is present (no regression for platform plans)', async () => {
    const visionDoc = { id: 'vision-uuid', vision_key: 'V-1', level: 'L2', status: 'active', version: 1 }; // no venture_id
    const result = { id: 'arch-uuid', plan_key: 'A-1', version: 1, status: 'active', vision_id: 'vision-uuid' };
    const supabase = mockSupabase({ visionDoc, upsertResult: result });

    await upsertArchPlan({ supabase, planKey: 'A-1', visionKey: 'V-1', content: 'x' });

    expect('venture_id' in supabase.__captured.upsertRecord).toBe(false);
  });
});
