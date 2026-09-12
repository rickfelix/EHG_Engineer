/**
 * Unit tests for claim-md-claude-sessions-column-lint.mjs — QF-20260912-810.
 *
 * Pure-function tests over the exported extractor (no fs/DB): the regression case is a fixture
 * skill-file string with a phantom `sd_id` reference on claude_sessions (fails), and the fixed
 * shape using `sd_key` (passes). Also covers the nested-metadata false-positive this lint's own
 * updateColumns() extractor was found and fixed to avoid during this QF.
 */
import { describe, it, expect } from 'vitest';
import { extractUnknownColumns } from '../../scripts/lint/claim-md-claude-sessions-column-lint.mjs';

describe('extractUnknownColumns', () => {
  it('flags a phantom column referenced via .select() on claude_sessions', () => {
    const src = `
      const { data: session } = await supabase
        .from('claude_sessions')
        .select('session_id, sd_id, heartbeat_at, status')
        .eq('status', 'active');
    `;
    const hits = extractUnknownColumns(src);
    expect(hits).toContainEqual(expect.objectContaining({ table: 'claude_sessions', method: 'select', column: 'sd_id' }));
  });

  it('does not flag the fixed shape using the real sd_key column', () => {
    const src = `
      const { data: session } = await supabase
        .from('claude_sessions')
        .select('session_id, sd_key, heartbeat_at, status')
        .eq('status', 'active');
    `;
    expect(extractUnknownColumns(src)).toEqual([]);
  });

  it('flags a phantom column referenced via .update() on claude_sessions', () => {
    const src = `
      await supabase.from('claude_sessions').update({ sd_id: null }).eq('session_id', sessionId);
    `;
    const hits = extractUnknownColumns(src);
    expect(hits).toContainEqual(expect.objectContaining({ table: 'claude_sessions', method: 'update', column: 'sd_id' }));
  });

  it('does not flag a jsonb value nested inside a legitimate metadata column write (regression: false-positive found and fixed during this QF)', () => {
    const src = `
      await supabase.from('claude_sessions')
        .update({ metadata: { proving_venture_id: 'x', proving_last_gate: 0 } })
        .eq('status', 'active');
    `;
    expect(extractUnknownColumns(src)).toEqual([]);
  });

  it('accepts sd_id on v_active_sessions (a real, aliased view column, unlike the base table)', () => {
    const src = `
      const { data: claim } = await supabase
        .from('v_active_sessions')
        .select('session_id, sd_id, sd_title')
        .eq('session_id', sessionId);
    `;
    expect(extractUnknownColumns(src)).toEqual([]);
  });

  it('flags a phantom column referenced via .eq() on claude_sessions', () => {
    const src = `
      await supabase.from('claude_sessions').select('session_id').eq('sd_id', 'X-001');
    `;
    const hits = extractUnknownColumns(src);
    expect(hits).toContainEqual(expect.objectContaining({ table: 'claude_sessions', method: 'eq', column: 'sd_id' }));
  });

  it('flags a phantom .update() key that comes AFTER a nested-paren call like new Date().toISOString() (regression: VALIDATION found this lint’s original non-greedy arg-capture truncated right after new Date(, silently dropping every key that followed)', () => {
    const src = `
      await supabase.from('claude_sessions')
        .update({ released_at: new Date().toISOString(), sd_id: null })
        .eq('session_id', sessionId);
    `;
    const hits = extractUnknownColumns(src);
    expect(hits).toContainEqual(expect.objectContaining({ table: 'claude_sessions', method: 'update', column: 'sd_id' }));
  });

  it('does not misread a second sibling object argument (e.g. .upsert(row, { onConflict: ’col’ })) as more row-data keys (regression: found and fixed during this QF)', () => {
    const src = `
      supabase.from('claude_sessions')
        .upsert({
          session_id: 'x',
          status: 'active',
          metadata: { auto_proceed: true }
        }, { onConflict: 'session_id' });
    `;
    expect(extractUnknownColumns(src)).toEqual([]);
  });
});
