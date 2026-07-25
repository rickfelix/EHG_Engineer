// SD-LEO-INFRA-LIVE-FLEET-SESSIONS-ROWCAP-CANONICAL-001 (FR-4).
// The guard flags UNFILTERED claude_sessions/v_active_sessions selects (the 1000-row-cap shape)
// and leaves any server-side-narrowed/bounded/scoped read alone.
import { describe, it, expect } from 'vitest';
import { extractUnboundedLivenessSelects, stripComments, loadAllowlist, orderIsRecencyBound } from '../../../scripts/lint/fleet-liveness-select-lint.mjs';

describe('extractUnboundedLivenessSelects', () => {
  it('FLAGS a bare unfiltered v_active_sessions select (the assessFleetActivity-class bug)', () => {
    const src = `const { data } = await sb.from('v_active_sessions').select('session_id, computed_status');`;
    const hits = extractUnboundedLivenessSelects(src);
    expect(hits).toHaveLength(1);
    expect(hits[0].table).toBe('v_active_sessions');
  });

  it('FLAGS a bare unfiltered claude_sessions select', () => {
    const src = `await supabase.from("claude_sessions").select('session_id, status, heartbeat_at, metadata');`;
    expect(extractUnboundedLivenessSelects(src)).toHaveLength(1);
  });

  it('does NOT flag a select ordered by a RECENCY column (cap drops only the stalest)', () => {
    const ts = `await sb.from('claude_sessions').select('session_id').order('heartbeat_at', { ascending: false });`;
    const age = `await sb.from('v_active_sessions').select('session_id').order('heartbeat_age_seconds', { ascending: true });`;
    expect(extractUnboundedLivenessSelects(ts)).toHaveLength(0);
    expect(extractUnboundedLivenessSelects(age)).toHaveLength(0);
  });

  // QF-20260725-423 — the regression this guard MISSED. server/routes/fleet-panel.js ordered by
  // heartbeat_age_human, a rendered string, so the page was lexicographic and the cap returned
  // 1000 rows of which 994 were dead. The old rule accepted any `.order(` and passed it.
  it('FLAGS a select ordered by a _human display string — that is not a recency bound', () => {
    const src = `await sb.from('v_active_sessions').select('session_id, metadata').order('heartbeat_age_human', { ascending: true });`;
    const hits = extractUnboundedLivenessSelects(src);
    expect(hits).toHaveLength(1);
    expect(hits[0].table).toBe('v_active_sessions');
  });

  it('FLAGS a select ordered by an unrelated column (session_id orders the page arbitrarily)', () => {
    const src = `await sb.from('claude_sessions').select('session_id, metadata').order('session_id');`;
    expect(extractUnboundedLivenessSelects(src)).toHaveLength(1);
  });

  it('orderIsRecencyBound: accepts real recency columns, rejects display strings and other columns', () => {
    expect(orderIsRecencyBound(`.order('heartbeat_at', { ascending: false })`)).toBe(true);
    expect(orderIsRecencyBound(`.order('heartbeat_age_seconds', { ascending: true })`)).toBe(true);
    expect(orderIsRecencyBound(`.order("created_at")`)).toBe(true);
    expect(orderIsRecencyBound(`.order('heartbeat_age_human')`)).toBe(false);
    expect(orderIsRecencyBound(`.order('session_id')`)).toBe(false);
    expect(orderIsRecencyBound(`.select('session_id')`)).toBe(false);
  });

  it('does NOT flag a select bounded by .gte(heartbeat_at) or .limit()', () => {
    const gte = `await sb.from('claude_sessions').select('*').gte('heartbeat_at', since);`;
    const lim = `await sb.from('v_active_sessions').select('*').limit(200);`;
    expect(extractUnboundedLivenessSelects(gte)).toHaveLength(0);
    expect(extractUnboundedLivenessSelects(lim)).toHaveLength(0);
  });

  it('does NOT flag a status-filtered select (out of scope — filtered, not the unfiltered bug)', () => {
    const src = `await sb.from('v_active_sessions').select('session_id').in('computed_status', ['active','idle']);`;
    expect(extractUnboundedLivenessSelects(src)).toHaveLength(0);
  });

  it('does NOT flag a single-session lookup or a count-head query', () => {
    const single = `await sb.from('claude_sessions').select('metadata').eq('session_id', id).maybeSingle();`;
    const count = `await sb.from('claude_sessions').select('session_id', { count: 'exact', head: true }).eq('status','active');`;
    expect(extractUnboundedLivenessSelects(single)).toHaveLength(0);
    expect(extractUnboundedLivenessSelects(count)).toHaveLength(0);
  });

  it('does NOT flag a non-read (insert/update/delete) on the table', () => {
    const src = `await sb.from('claude_sessions').update({ status: 'released' }).eq('session_id', id);`;
    expect(extractUnboundedLivenessSelects(src)).toHaveLength(0);
  });

  it('reports the ORIGINAL source line (stripComments preserves line count)', () => {
    const src = [
      "// line 1 comment",
      "/* a",
      "   multi-line block comment",
      "*/",
      "await sb.from('v_active_sessions').select('session_id, computed_status');",
    ].join('\n');
    const hits = extractUnboundedLivenessSelects(src);
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(5);
  });

  it('does NOT flag a commented-out query', () => {
    const src = `// await sb.from('claude_sessions').select('session_id');`;
    expect(extractUnboundedLivenessSelects(stripComments(src))).toHaveLength(0);
  });
});

describe('loadAllowlist', () => {
  it('loads the real allowlist and enforces the non-empty-reason contract', () => {
    // The shipped allowlist is valid (each entry, if any, has a reason). Should not throw.
    expect(() => loadAllowlist()).not.toThrow();
  });
});
