/**
 * QF-20260904-344: quick_fixes.created_by DB-defaults to the literal 'UAT_AGENT' when the
 * INSERT omits the column (migration 20251117_create_quick_fixes_table.sql:48), so every
 * mint -- regardless of who actually sourced it -- read as UAT_AGENT-authored, and the
 * batch-mint detector false-grouped unrelated seats' mints into one batch.
 * resolveCreatedBy() stamps the real caller instead of ever falling through to that default.
 */
import { describe, it, expect } from 'vitest';
import { resolveCreatedBy } from '../../scripts/create-quick-fix.js';

function stubSupabase(metadata) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        async maybeSingle() { return { data: metadata === undefined ? null : { metadata } }; },
      };
    },
  };
}

describe('resolveCreatedBy (QF-20260904-344)', () => {
  it('an Adam-seat mint reads adam-<session>, never the UAT_AGENT default', async () => {
    const supabase = stubSupabase({ role: 'adam' });
    const result = await resolveCreatedBy({ supabase, sessionId: 'abc12345', override: null });
    expect(result).toBe('adam-abc12345');
  });

  it('a session with no role tag falls back to the raw session id', async () => {
    const supabase = stubSupabase({});
    const result = await resolveCreatedBy({ supabase, sessionId: 'abc12345', override: null });
    expect(result).toBe('abc12345');
  });

  it('--created-by override wins over any session lookup', async () => {
    const supabase = stubSupabase({ role: 'adam' });
    const result = await resolveCreatedBy({ supabase, sessionId: 'abc12345', override: 'scripted-cron-job' });
    expect(result).toBe('scripted-cron-job');
  });

  it('no session and no override resolves to a named, auditable marker (never UAT_AGENT)', async () => {
    const supabase = stubSupabase(undefined);
    const result = await resolveCreatedBy({ supabase, sessionId: null, override: null });
    expect(result).toBe('UNKNOWN_CALLER');
  });

  it('a session row with no matching claude_sessions row falls back to the raw session id', async () => {
    const supabase = stubSupabase(undefined);
    const result = await resolveCreatedBy({ supabase, sessionId: 'ghost-session', override: null });
    expect(result).toBe('ghost-session');
  });
});
