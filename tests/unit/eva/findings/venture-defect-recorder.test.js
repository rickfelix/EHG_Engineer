/**
 * Unit tests for lib/eva/findings/venture-defect-recorder.js.
 * SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (FR-4). Mirrors factory-defect-recorder.test.js's
 * structure -- covers venture_defect_class validation, dedup lookup correctly scoped to
 * category='venture_defect' (never false-hitting a factory_defect or corrective_finding row),
 * and insert-on-no-match.
 */
import { describe, it, expect, vi } from 'vitest';
import { recordVentureDefect } from '../../../../lib/eva/findings/venture-defect-recorder.js';

function buildSupabase({ existing = null, insertedRows = [] } = {}) {
  return {
    from: vi.fn((table) => {
      expect(table).toBe('feedback');
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
                })),
              })),
            })),
          })),
        })),
        insert: vi.fn((row) => {
          insertedRows.push(row);
          return {
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { id: 'new-feedback-id' }, error: null }),
            })),
          };
        }),
      };
    }),
  };
}

describe('recordVentureDefect', () => {
  it('rejects an unratified venture_defect_class', async () => {
    const supabase = buildSupabase();
    await expect(recordVentureDefect(supabase, { venture_defect_class: 'NOT_REAL', title: 't' })).rejects.toThrow(/ratified/);
  });

  it('rejects a GAP_CLASS value passed as venture_defect_class (cross-taxonomy misuse)', async () => {
    const supabase = buildSupabase();
    await expect(recordVentureDefect(supabase, { venture_defect_class: 'GATE_CANNOT_FAIL', title: 't' })).rejects.toThrow(/ratified/);
  });

  it('requires a title', async () => {
    const supabase = buildSupabase();
    await expect(recordVentureDefect(supabase, { venture_defect_class: 'CONTENT_DATA_DEFECT' })).rejects.toThrow(/title/);
  });

  it('inserts a new row with category=venture_defect when no existing dedup hit', async () => {
    const insertedRows = [];
    const supabase = buildSupabase({ existing: null, insertedRows });
    const result = await recordVentureDefect(supabase, {
      venture_defect_class: 'APPLICATION_BEHAVIOR_DEFECT',
      title: 'Checkout button broken',
      description: 'boom',
      venture_id: 'venture-1',
      source_sd_id: 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C',
    });
    expect(result.recorded).toBe(true);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].category).toBe('venture_defect');
    expect(insertedRows[0].metadata.venture_defect_class).toBe('APPLICATION_BEHAVIOR_DEFECT');
    expect(insertedRows[0].metadata.venture_id).toBe('venture-1');
  });

  it('a dedup hit returns recorded:false with the existing feedbackId (no insert)', async () => {
    const insertedRows = [];
    const supabase = buildSupabase({ existing: { id: 'existing-row-id' }, insertedRows });
    const result = await recordVentureDefect(supabase, { venture_defect_class: 'INTEGRATION_FAILURE', title: 't' });
    expect(result.recorded).toBe(false);
    expect(result.feedbackId).toBe('existing-row-id');
    expect(insertedRows).toHaveLength(0);
  });

  it('cross-category dedup isolation: the lookup is scoped to category=venture_defect', async () => {
    const supabase = buildSupabase({ existing: null });
    let capturedFilters = [];
    supabase.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((col, val) => {
          capturedFilters.push([col, val]);
          return {
            eq: vi.fn((col2, val2) => {
              capturedFilters.push([col2, val2]);
              return { in: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) })) })) };
            }),
          };
        }),
      })),
      insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }) })) })),
    }));
    await recordVentureDefect(supabase, { venture_defect_class: 'CONTENT_DATA_DEFECT', title: 't' });
    expect(capturedFilters).toContainEqual(['category', 'venture_defect']);
  });
});
