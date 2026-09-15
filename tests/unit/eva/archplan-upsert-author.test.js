/**
 * SD-LEO-INFRA-GOVERNANCE-ARTIFACTS-RECORD-001, FR-5, TS-5.
 *
 * upsertArchPlan()'s createdBy parameter already threads a caller-supplied author into the
 * upserted record (verified against current main by LEAD-phase investigation) -- this is a
 * regression test only, closing the "writer records the author it was given, not the tool
 * name" success criterion with evidence, not a new mechanism.
 */
import { describe, it, expect } from 'vitest';
import { upsertArchPlan } from '../../../lib/eva/archplan-upsert.js';

function makeSupabase() {
  const capture = { upserted: null };
  return {
    capture,
    from(table) {
      if (table === 'eva_vision_documents') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'vision-1', vision_key: 'VISION-X', level: 'L1', status: 'active', version: 1, venture_id: null },
                error: null,
              }),
            }),
          }),
        };
      }
      // eva_architecture_plans
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }), // no existing plan -> version 1
          }),
        }),
        upsert: (record) => {
          capture.upserted = record;
          return {
            select: () => ({
              single: async () => ({ data: { id: 'plan-1', ...record }, error: null }),
            }),
          };
        },
      };
    },
  };
}

describe('upsertArchPlan (FR-5, TS-5): honors a caller-supplied real author', () => {
  it('a caller-supplied createdBy is recorded verbatim, not a tool-name default', async () => {
    const sb = makeSupabase();
    await upsertArchPlan({
      supabase: sb,
      planKey: 'PLAN-X',
      visionKey: 'VISION-X',
      content: '# Some content',
      createdBy: 'some-real-seat',
    });

    expect(sb.capture.upserted.created_by).toBe('some-real-seat');
  });

  it('omitting createdBy still falls back to the existing tool-name default (non-regressive)', async () => {
    const sb = makeSupabase();
    await upsertArchPlan({
      supabase: sb,
      planKey: 'PLAN-X',
      visionKey: 'VISION-X',
      content: '# Some content',
    });

    expect(sb.capture.upserted.created_by).toBe('eva-archplan-upsert');
  });
});
