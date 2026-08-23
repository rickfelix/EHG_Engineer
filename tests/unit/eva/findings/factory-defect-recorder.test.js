/**
 * Unit tests for lib/eva/findings/factory-defect-recorder.js.
 *
 * SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001 (FR-5)
 *
 * Covers: gap_class validation, dedup lookup correctly scoped to category='factory_defect'
 * (never false-hitting an existing corrective_finding row), and insert-on-no-match.
 */
import { describe, it, expect, vi } from 'vitest';
import { recordFactoryDefect } from '../../../../lib/eva/findings/factory-defect-recorder.js';

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

describe('recordFactoryDefect', () => {
  it('rejects an unratified gap_class', async () => {
    const supabase = buildSupabase();
    await expect(recordFactoryDefect(supabase, { gap_class: 'NOT_REAL', title: 't' })).rejects.toThrow(/ratified/);
  });

  it('requires a title', async () => {
    const supabase = buildSupabase();
    await expect(recordFactoryDefect(supabase, { gap_class: 'INSTRUMENT_LIE' })).rejects.toThrow(/title/);
  });

  it('inserts a new row with category=factory_defect when no existing dedup hit', async () => {
    const insertedRows = [];
    const supabase = buildSupabase({ existing: null, insertedRows });
    const result = await recordFactoryDefect(supabase, {
      gap_class: 'INSTRUMENT_LIE',
      title: 'Resolver threw',
      description: 'boom',
      source_sd_id: 'SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001',
    });
    expect(result.recorded).toBe(true);
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].category).toBe('factory_defect');
    expect(insertedRows[0].metadata.gap_class).toBe('INSTRUMENT_LIE');
  });

  it('cross-category dedup isolation: the lookup is scoped to category=factory_defect, never matching an existing corrective_finding row on the same natural key', async () => {
    // buildSupabase's mock scopes .eq('category', ...) into the chain itself — this test
    // documents the CONTRACT (the dedup query includes an .eq('category','factory_defect')
    // filter distinct from corrective-finding-recorder's .eq('category','corrective_finding'))
    // by asserting the query chain is actually invoked with that filter.
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
    await recordFactoryDefect(supabase, { gap_class: 'GATE_BYPASSED', title: 't' });
    expect(capturedFilters).toContainEqual(['category', 'factory_defect']);
  });

  it('a dedup hit returns recorded:false with the existing feedbackId (no insert)', async () => {
    const insertedRows = [];
    const supabase = buildSupabase({ existing: { id: 'existing-row-id' }, insertedRows });
    const result = await recordFactoryDefect(supabase, { gap_class: 'GATE_CANNOT_FAIL', title: 't' });
    expect(result.recorded).toBe(false);
    expect(result.feedbackId).toBe('existing-row-id');
    expect(insertedRows).toHaveLength(0);
  });
});
