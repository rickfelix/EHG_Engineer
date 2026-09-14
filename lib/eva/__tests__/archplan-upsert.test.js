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

// SD-LEO-INFRA-VISION-ARCHITECTURE-DIMENSION-001 (FR-3/FR-7): stable dimension id assignment.
describe('upsertArchPlan — stable dimension id assignment (FR-3)', () => {
  test('assigns a fresh id to a dimension with no prior id', async () => {
    const visionDoc = { id: 'vision-uuid', vision_key: 'V-1', level: 'L2', status: 'active', version: 1 };
    const result = { id: 'arch-uuid', plan_key: 'A-1', version: 1, status: 'active', vision_id: 'vision-uuid' };
    const supabase = mockSupabase({ visionDoc, upsertResult: result, existing: null });

    await upsertArchPlan({
      supabase,
      planKey: 'A-1',
      visionKey: 'V-1',
      content: 'x',
      dimensions: [{ name: 'Stateless Shared Services', weight: 0.5, description: 'y' }],
    });

    expect(supabase.__captured.upsertRecord.extracted_dimensions[0].id).toBe('stateless-shared-services');
  });

  test('preserves the existing id for an unchanged dimension name on re-extraction', async () => {
    const visionDoc = { id: 'vision-uuid', vision_key: 'V-1', level: 'L2', status: 'active', version: 1 };
    const existing = {
      id: 'arch-uuid',
      version: 1,
      extracted_dimensions: [{ name: 'Stateless Shared Services', id: 'stateless-shared-services', weight: 0.5, description: 'y' }],
    };
    const result = { id: 'arch-uuid', plan_key: 'A-1', version: 2, status: 'active', vision_id: 'vision-uuid' };
    const supabase = mockSupabase({ visionDoc, upsertResult: result, existing });

    await upsertArchPlan({
      supabase,
      planKey: 'A-1',
      visionKey: 'V-1',
      content: 'revised',
      dimensions: [{ name: 'Stateless Shared Services', weight: 0.5, description: 'y' }],
    });

    expect(supabase.__captured.upsertRecord.extracted_dimensions[0].id).toBe('stateless-shared-services');
  });

  test('leaves extracted_dimensions as null when dimensions is omitted (unchanged pre-existing behavior)', async () => {
    const visionDoc = { id: 'vision-uuid', vision_key: 'V-1', level: 'L2', status: 'active', version: 1 };
    const result = { id: 'arch-uuid', plan_key: 'A-1', version: 1, status: 'active', vision_id: 'vision-uuid' };
    const supabase = mockSupabase({ visionDoc, upsertResult: result });

    await upsertArchPlan({ supabase, planKey: 'A-1', visionKey: 'V-1', content: 'x' });

    expect(supabase.__captured.upsertRecord.extracted_dimensions).toBeNull();
  });
});

// SD-LEO-INFRA-ARCHITECTURE-PLANS-GET-001 (FR-1, FR-4): approved param controls
// status/chairman_approved/chairman_approved_at on the written record. Direct
// unit coverage on this file itself (EXEC-TO-PLAN TESTING review finding M1/M1b/M3 —
// prior coverage only exercised this indirectly via stage-17-doc-generation.test.js,
// which never asserted the approved:true branch or chairman_approved_at at all).
describe('upsertArchPlan — approved param controls status/chairman_approved (FR-1)', () => {
  test('approved:true (explicit) writes status=active, chairman_approved=true, chairman_approved_at set', async () => {
    const visionDoc = { id: 'vision-uuid', vision_key: 'V-1', level: 'L2', status: 'active', version: 1 };
    const result = { id: 'arch-uuid', plan_key: 'A-1', version: 1, status: 'active', vision_id: 'vision-uuid' };
    const supabase = mockSupabase({ visionDoc, upsertResult: result });

    await upsertArchPlan({ supabase, planKey: 'A-1', visionKey: 'V-1', content: 'x', approved: true });

    const record = supabase.__captured.upsertRecord;
    expect(record.status).toBe('active');
    expect(record.chairman_approved).toBe(true);
    expect(record.chairman_approved_at).not.toBeNull();
  });

  test('approved omitted (default) writes status=active, chairman_approved=true, chairman_approved_at set (backward-compat)', async () => {
    const visionDoc = { id: 'vision-uuid', vision_key: 'V-1', level: 'L2', status: 'active', version: 1 };
    const result = { id: 'arch-uuid', plan_key: 'A-1', version: 1, status: 'active', vision_id: 'vision-uuid' };
    const supabase = mockSupabase({ visionDoc, upsertResult: result });

    await upsertArchPlan({ supabase, planKey: 'A-1', visionKey: 'V-1', content: 'x' });

    const record = supabase.__captured.upsertRecord;
    expect(record.status).toBe('active');
    expect(record.chairman_approved).toBe(true);
    expect(record.chairman_approved_at).not.toBeNull();
  });

  test('approved:false writes status=draft, chairman_approved=false, chairman_approved_at=null', async () => {
    const visionDoc = { id: 'vision-uuid', vision_key: 'V-1', level: 'L2', status: 'active', version: 1 };
    const result = { id: 'arch-uuid', plan_key: 'A-1', version: 1, status: 'draft', vision_id: 'vision-uuid' };
    const supabase = mockSupabase({ visionDoc, upsertResult: result });

    await upsertArchPlan({ supabase, planKey: 'A-1', visionKey: 'V-1', content: 'x', approved: false });

    const record = supabase.__captured.upsertRecord;
    expect(record.status).toBe('draft');
    expect(record.chairman_approved).toBe(false);
    expect(record.chairman_approved_at).toBeNull();
  });
});
