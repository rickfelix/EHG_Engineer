/**
 * QF-20260829-440 — two-sided acceptance for the ilike/like-on-uuid lint.
 * (a) alone would pass a lint that fires on everything; (b) alone would pass today's no-op.
 */
import { describe, it, expect } from 'vitest';
import { findIlikeOnUuid } from '../../../scripts/lint/ilike-on-uuid-lint.mjs';

const UUID_COLUMNS = new Set(['id', 'session_id', 'sd_id']);

describe('findIlikeOnUuid', () => {
  it('(a) FIRES on .ilike(uuid-column, ...)', () => {
    const src = "await supabase.from('t').select('*').ilike('id', 'abc%');";
    const findings = findIlikeOnUuid(src, UUID_COLUMNS, 'fixture.js');
    expect(findings).toHaveLength(1);
    expect(findings[0].column).toBe('id');
  });

  it('(a) FIRES on .like(uuid-column, ...) too', () => {
    const src = "await supabase.from('t').select('*').like('session_id', 'abc%');";
    expect(findIlikeOnUuid(src, UUID_COLUMNS, 'fixture.js')).toHaveLength(1);
  });

  it('(b) PASSES a legitimate .ilike(text-column, ...)', () => {
    const src = "await supabase.from('t').select('*').ilike('title', 'abc%');";
    expect(findIlikeOnUuid(src, UUID_COLUMNS, 'fixture.js')).toHaveLength(0);
  });

  it('zero-subjects-collected is treated as a real result, not a silent skip — an empty uuid-column set finds nothing even on an obvious uuid literal', () => {
    const src = "await supabase.from('t').select('*').ilike('id', 'abc%');";
    expect(findIlikeOnUuid(src, new Set(), 'fixture.js')).toHaveLength(0);
  });

  it('a comment mentioning .ilike("id", ...) as an example is not a live defect', () => {
    const src = "// e.g. never write .ilike('id', 'x') here\nawait supabase.from('t').select('*').ilike('title', 'x');";
    expect(findIlikeOnUuid(src, UUID_COLUMNS, 'fixture.js')).toHaveLength(0);
  });

  it('escape hatch: a trailing ilike-uuid-lint-disable-line comment suppresses the finding', () => {
    const src = "await supabase.from('t').select('*').ilike('id', 'x'); // ilike-uuid-lint-disable-line: this table's 'id' is a slug, not the uuid PK";
    expect(findIlikeOnUuid(src, UUID_COLUMNS, 'fixture.js')).toHaveLength(0);
  });

  it('reports the correct line number for a finding past line 1', () => {
    const src = "const x = 1;\nconst y = 2;\nawait supabase.from('t').ilike('sd_id', 'x');";
    const findings = findIlikeOnUuid(src, UUID_COLUMNS, 'fixture.js');
    expect(findings[0].line).toBe(3);
  });
});
