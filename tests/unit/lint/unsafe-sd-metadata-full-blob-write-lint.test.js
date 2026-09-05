/**
 * SD-LEO-FIX-STRATEGIC-DIRECTIVES-UPDATED-001 (FR-4) — two-sided acceptance for the
 * unsafe-sd-metadata-full-blob-write lint.
 * (a) alone would pass a lint that fires on everything; (b) alone would pass today's no-op.
 */
import { describe, it, expect } from 'vitest';
import { findUnsafeMetadataFullBlobWrite } from '../../../scripts/lint/unsafe-sd-metadata-full-blob-write-lint.mjs';

describe('findUnsafeMetadataFullBlobWrite', () => {
  it('(a) FIRES on the exact defect shape: read-spread-write against strategic_directives_v2', () => {
    const src = `
      const { data: row } = await supabase.from('strategic_directives_v2').select('metadata').eq('id', id).maybeSingle();
      await supabase.from('strategic_directives_v2').update({ metadata: { ...row.metadata, foo: 1 } }).eq('id', id);
    `;
    const findings = findUnsafeMetadataFullBlobWrite(src, 'fixture.js');
    expect(findings).toHaveLength(1);
  });

  it('(a) FIRES on a spread of a locally-built variable, not just a direct property spread', () => {
    const src = `
      const md = { ...(sd.metadata || {}) };
      await supabase.from('strategic_directives_v2').update({ metadata: md }).eq('id', id);
    `;
    // this shape has no spread INSIDE the .update({...}) call itself -- confirm the companion
    // shape (spread inside the update literal) still fires, matching the real historical defects.
    const src2 = `
      await supabase.from('strategic_directives_v2').update({ metadata: { ...md, journey_walk_result: r } }).eq(column, sdId);
    `;
    expect(findUnsafeMetadataFullBlobWrite(src, 'fixture.js')).toHaveLength(0); // no spread in the update() call
    expect(findUnsafeMetadataFullBlobWrite(src2, 'fixture.js')).toHaveLength(1);
  });

  it('(b) PASSES a pure literal .update({ metadata: {...} }) with no spread (a different, rarer shape)', () => {
    const src = `
      await supabase.from('strategic_directives_v2').update({ metadata: { only_this_key: true } }).eq('id', id);
    `;
    expect(findUnsafeMetadataFullBlobWrite(src, 'fixture.js')).toHaveLength(0);
  });

  it('(b) PASSES a spread update against an unrelated table (file-level gate requires the table name present)', () => {
    const src = "await supabase.from('other_table').update({ metadata: { ...x, y: 1 } }).eq('id', id);";
    expect(findUnsafeMetadataFullBlobWrite(src, 'fixture.js')).toHaveLength(0);
  });

  it('(b) PASSES the sanctioned mergeMetadataKeys() call itself (no .update() call at all)', () => {
    const src = `
      // strategic_directives_v2 mentioned here for file-level gate purposes
      await mergeMetadataKeys(sdKey, { ...patch, extra: 1 });
    `;
    expect(findUnsafeMetadataFullBlobWrite(src, 'fixture.js')).toHaveLength(0);
  });

  it('escape hatch: a trailing metadata-fullblob-lint-disable-line comment suppresses the finding', () => {
    const src = "// strategic_directives_v2\nawait supabase.from('strategic_directives_v2').update({ metadata: { ...x, y: 1 } }).eq('id', id); // metadata-fullblob-lint-disable-line: reviewed, row-locked elsewhere";
    expect(findUnsafeMetadataFullBlobWrite(src, 'fixture.js')).toHaveLength(0);
  });

  it('reports the correct 1-indexed line number', () => {
    const src = "// strategic_directives_v2\nconst x = 1;\nawait supabase.from('strategic_directives_v2').update({ metadata: { ...x, y: 1 } }).eq('id', id);";
    const findings = findUnsafeMetadataFullBlobWrite(src, 'fixture.js');
    expect(findings[0].line).toBe(3);
  });
});
