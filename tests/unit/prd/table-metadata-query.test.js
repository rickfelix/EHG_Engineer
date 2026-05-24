/**
 * SD-FDBK-ENH-PRD-AUTHORING-QUERY-001 — live table metadata grounding for PRD generation.
 *
 * Verifies extraction (DATABASE sub-agent output + multi-segment scope regex), live
 * lookup with PostgREST-native probes (existence + columns + count), hallucinated-name
 * filtering, fail-soft behavior, and markdown formatting — all with a mocked supabase.
 */
import { describe, it, expect } from 'vitest';
import {
  extractTableNamesFromSD,
  queryLiveTableMetadata,
  formatTableMetadataSection,
  buildLiveTableMetadataSection
} from '../../../scripts/prd/table-metadata-query.js';

// Mock supabase mirroring live PostgREST behavior:
//  - select('*').limit(1)            → { data:[row] | [], error } ; PGRST205 for unknown table
//  - select('*',{count,head:true})   → { count, error }
// `tables` maps existing table name → { count, columns }. Absent name ⇒ does not exist.
function makeSupabase(tables) {
  return {
    from(table) {
      const t = tables[table];
      return {
        select(_cols, opts) {
          if (opts && opts.head) {
            return Promise.resolve(t ? { count: t.count, error: null } : { count: null, error: null });
          }
          const result = t
            ? { data: t.columns && t.columns.length ? [Object.fromEntries(t.columns.map((c) => [c, null]))] : [], error: null }
            : { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache` } };
          return { limit: () => Promise.resolve(result) };
        }
      };
    }
  };
}

describe('table-metadata-query (SD-FDBK-ENH-PRD-AUTHORING-QUERY-001)', () => {
  it('TS-5: extracts tables from DATABASE sub-agent output + multi-segment scope regex', () => {
    const sd = { scope: 'Touches venture_briefs and stage_zero_requests during intake.' };
    const ctx = { databaseAnalysis: '{"affected_tables":["ventures","accounts"],"new_tables":[]}' };
    const names = extractTableNamesFromSD(sd, ctx);
    expect(names).toContain('ventures');          // single-word via sub-agent output
    expect(names).toContain('accounts');           // single-word via sub-agent output
    expect(names).toContain('venture_briefs');     // multi-segment via scope regex
    expect(names).toContain('stage_zero_requests');
  });

  it('TS-1: real table → section with live row count + actual columns', async () => {
    const supa = makeSupabase({ ventures: { count: 4, columns: ['id', 'name', 'industry', 'vertical_category', 'tags'] } });
    const section = await buildLiveTableMetadataSection(supa, { scope: 'venture work' }, { databaseAnalysis: '{"affected_tables":["ventures"]}' });
    expect(section).toContain('LIVE TABLE METADATA');
    expect(section).toContain('`ventures` — 4 row(s)');
    expect(section).toContain('`industry`');
    expect(section).toContain('`vertical_category`');
    // grounds against the assumed-but-nonexistent columns from the origin defect:
    expect(section).not.toContain('industry_tags');
  });

  it('TS-2: fail-soft when supabase is absent', async () => {
    const section = await buildLiveTableMetadataSection(null, { scope: 'uses ventures' }, { databaseAnalysis: '{"affected_tables":["ventures"]}' });
    expect(section).toBe('');
  });

  it('TS-3: fail-soft when no tables are referenced', async () => {
    const supa = makeSupabase({ ventures: { count: 4, columns: ['id'] } });
    const section = await buildLiveTableMetadataSection(supa, { scope: 'A purely textual change with no table references at all.' }, {});
    expect(section).toBe('');
  });

  it('TS-4: hallucinated / non-existent table is filtered out', async () => {
    const supa = makeSupabase({ venture_briefs: { count: 2, columns: ['id', 'title'] } }); // bogus_fake_table absent
    const results = await queryLiveTableMetadata(supa, ['venture_briefs', 'bogus_fake_table']);
    expect(results.map((r) => r.table)).toEqual(['venture_briefs']); // bogus filtered out (PGRST205)
    const section = formatTableMetadataSection(results);
    expect(section).toContain('venture_briefs');
    expect(section).not.toContain('bogus_fake_table');
  });

  it('empty table → row count shown, columns noted unavailable (fail-soft)', async () => {
    const supa = makeSupabase({ audit_log: { count: 0, columns: [] } });
    const results = await queryLiveTableMetadata(supa, ['audit_log']);
    expect(results[0]).toMatchObject({ table: 'audit_log', rowCount: 0, columns: [] });
    expect(formatTableMetadataSection(results)).toContain('`audit_log` — 0 row(s)');
  });
});
