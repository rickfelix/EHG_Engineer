// SD-LEO-INFRA-LIVE-FLEET-SESSIONS-ROWCAP-CANONICAL-001 (FR-4).
// The guard flags UNFILTERED claude_sessions/v_active_sessions selects (the 1000-row-cap shape)
// and leaves any server-side-narrowed/bounded/scoped read alone.
import { describe, it, expect } from 'vitest';
import { extractUnboundedLivenessSelects, stripComments, loadAllowlist } from '../../../scripts/lint/fleet-liveness-select-lint.mjs';

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

  it('does NOT flag a select bounded by .order() (newest-first => cap drops only the stalest)', () => {
    const src = `await sb.from('claude_sessions').select('session_id').order('heartbeat_at', { ascending: false });`;
    expect(extractUnboundedLivenessSelects(src)).toHaveLength(0);
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
