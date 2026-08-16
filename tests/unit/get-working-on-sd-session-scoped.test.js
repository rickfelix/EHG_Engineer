/**
 * Regression test for QF-20260703-742: getWorkingOnSD() resolved the GLOBAL
 * is_working_on/claiming_session_id spotlight with no session filter, so under
 * concurrency the /leo complete post-completion tail could silently run
 * document/heal/learn/completion-flags against ANOTHER session's SD. It must
 * now resolve THIS session's own claim first, only falling back to the
 * spotlight when exactly one session is live, and refuse otherwise.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The terminal-status guard is modeled faithfully: .not('status','in','(cancelled,completed)')
// filters out rows whose status is terminal, mirroring the PostgREST behavior. This lets
// the tests assert the guard's EFFECT, not just its presence in source.
const TERMINAL = ['cancelled', 'completed'];
function applyTerminalGuard(result) {
  if (!result?.data) return result;
  return { ...result, data: result.data.filter((r) => !TERMINAL.includes(r.status)) };
}

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
                return { not: () => ({ lt: () => Promise.resolve(applyTerminalGuard(ownClaimResult)) }) };
              }
              throw new Error(`Unexpected eq column: ${col}`);
            },
            or: () => ({ not: () => ({ lt: () => Promise.resolve(applyTerminalGuard(spotlightResult)) }) }),
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

  // feedback d19f7f7e: terminal-status guard. A CANCELLED/COMPLETED SD with a stale
  // is_working_on=true / claim must not be reported as resume-eligible.
  it('own-claim path: a CANCELLED SD with a stale claim is filtered out (not resumable)', async () => {
    process.env.CLAUDE_SESSION_ID = 'session-mine';
    mockSupabase = buildSupabaseMock({
      ownClaimResult: { data: [{ id: 'sd-x', sd_key: 'SD-CANCELLED', title: 'Cancelled scope', status: 'cancelled', progress: 40, claiming_session_id: 'session-mine' }], error: null },
      liveCountResult: { count: 3, error: null }, // multiple live → spotlight would refuse anyway
      spotlightResult: { data: null, error: new Error('must not be reached') },
    });

    const { default: getWorkingOnSD } = await import('../../scripts/get-working-on-sd.js');
    const result = await getWorkingOnSD();

    expect(result).toBeNull();
  });

  it('spotlight path: a CANCELLED SD with stale is_working_on is filtered out (not resumable)', async () => {
    process.env.CLAUDE_SESSION_ID = 'session-mine';
    mockSupabase = buildSupabaseMock({
      ownClaimResult: { data: [], error: null },
      liveCountResult: { count: 1, error: null }, // sole live session → spotlight is consulted
      spotlightResult: { data: [{ id: 'sd-y', sd_key: 'SD-CANCELLED-SPOT', title: 'Cancelled', status: 'cancelled', progress: 20, is_working_on: true }], error: null },
    });

    const { default: getWorkingOnSD } = await import('../../scripts/get-working-on-sd.js');
    const result = await getWorkingOnSD();

    expect(result).toBeNull();
  });
});
