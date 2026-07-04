/**
 * Regression test for QF-20260703-742: getWorkingOnSD() resolved the GLOBAL
 * is_working_on/claiming_session_id spotlight with no session filter, so under
 * concurrency the /leo complete post-completion tail could silently run
 * document/heal/learn/completion-flags against ANOTHER session's SD. It must
 * now resolve THIS session's own claim first, only falling back to the
 * spotlight when exactly one session is live, and refuse otherwise.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function buildSupabaseMock({ ownClaimResult, liveCountResult, spotlightResult }) {
  return {
    from(table) {
      if (table === 'v_active_sessions') {
        return { select: () => ({ eq: () => Promise.resolve(liveCountResult) }) };
      }
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: (col) => {
              if (col === 'claiming_session_id') {
                return { lt: () => Promise.resolve(ownClaimResult) };
              }
              throw new Error(`Unexpected eq column: ${col}`);
            },
            or: () => ({ lt: () => Promise.resolve(spotlightResult) }),
          }),
        };
      }
      if (table === 'sd_phase_handoffs') {
        return {
          select: () => ({
            eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

let mockSupabase;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

describe('QF-20260703-742: session-scoped getWorkingOnSD resolution', () => {
  const priorSessionId = process.env.CLAUDE_SESSION_ID;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (priorSessionId === undefined) delete process.env.CLAUDE_SESSION_ID;
    else process.env.CLAUDE_SESSION_ID = priorSessionId;
  });

  it('resolves the calling session\'s own claim without touching the global spotlight', async () => {
    process.env.CLAUDE_SESSION_ID = 'session-mine';
    mockSupabase = buildSupabaseMock({
      ownClaimResult: { data: [{ id: 'sd-1', sd_key: 'SD-MINE', title: 'Mine', progress: 40, claiming_session_id: 'session-mine' }], error: null },
      liveCountResult: { count: null, error: new Error('should not be called') },
      spotlightResult: { data: null, error: new Error('should not be called') },
    });

    const { default: getWorkingOnSD } = await import('../../scripts/get-working-on-sd.js');
    const result = await getWorkingOnSD();

    expect(result.sd_key).toBe('SD-MINE');
  });

  it('falls back to the global spotlight only when exactly one session is live', async () => {
    process.env.CLAUDE_SESSION_ID = 'session-mine';
    mockSupabase = buildSupabaseMock({
      ownClaimResult: { data: [], error: null },
      liveCountResult: { count: 1, error: null },
      spotlightResult: { data: [{ id: 'sd-2', sd_key: 'SD-SOLO', title: 'Solo', progress: 10, claiming_session_id: 'session-mine' }], error: null },
    });

    const { default: getWorkingOnSD } = await import('../../scripts/get-working-on-sd.js');
    const result = await getWorkingOnSD();

    expect(result.sd_key).toBe('SD-SOLO');
  });

  it('refuses (returns null) rather than guessing when no own claim exists and multiple sessions are live', async () => {
    process.env.CLAUDE_SESSION_ID = 'session-mine';
    mockSupabase = buildSupabaseMock({
      ownClaimResult: { data: [], error: null },
      liveCountResult: { count: 3, error: null },
      spotlightResult: { data: null, error: new Error('must not be reached') },
    });

    const { default: getWorkingOnSD } = await import('../../scripts/get-working-on-sd.js');
    const result = await getWorkingOnSD();

    expect(result).toBeNull();
  });
});
