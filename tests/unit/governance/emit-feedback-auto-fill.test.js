// SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 FR-2 unit tests for emit-feedback.js auto-fill.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { emitFeedback } from '../../../lib/governance/emit-feedback.js';

const ACTIVE_SD_KEY = 'SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001';
const SESSION_ID = '29c96e94-2edc-4e30-bf89-5aa8ec0f28b4';

// Mock supabase that:
//   - .from('v_active_sessions').select('sd_key').eq(...).eq(...).not(...) → activeSessionRows
//   - .from('feedback').select(...).eq(...).eq(...).maybeSingle() → no dup
//   - .from('feedback').insert(...).select(...).single() → returns inserted id
function makeMockSupabase({ activeSessionRows = [], activeSessionError = null, dedupHit = null, insertId = 'NEW' } = {}) {
  const captured = { lastInsert: null, lastInsertMetadata: null };
  const sb = {
    _captured: captured,
    from(table) {
      if (table === 'v_active_sessions') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      not() {
                        return Promise.resolve({ data: activeSessionRows, error: activeSessionError });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (table === 'feedback') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle() { return Promise.resolve({ data: dedupHit, error: null }); },
                    };
                  },
                };
              },
            };
          },
          insert(payload) {
            captured.lastInsert = payload;
            captured.lastInsertMetadata = payload?.metadata;
            return {
              select() {
                return {
                  single() { return Promise.resolve({ data: { id: insertId }, error: null }); },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return sb;
}

describe('emitFeedback metadata.deferred_from_sd_key auto-fill (FR-2)', () => {
  let warns;
  let warnSpy;
  beforeEach(() => {
    warns = [];
    warnSpy = vi.spyOn(console, 'warn').mockImplementation((m) => warns.push(m));
    process.env.CLAUDE_SESSION_ID = SESSION_ID;
    delete process.env.AUTO_FILL_DEFERRED_FROM_SD_KEY;
  });
  afterEach(() => {
    warnSpy.mockRestore();
    delete process.env.CLAUDE_SESSION_ID;
    delete process.env.AUTO_FILL_DEFERRED_FROM_SD_KEY;
  });

  it('fills metadata.deferred_from_sd_key from active claim when caller did not set it (active=1)', async () => {
    const sb = makeMockSupabase({ activeSessionRows: [{ sd_key: ACTIVE_SD_KEY }] });
    await emitFeedback({ supabase: sb, title: 't', description: 'd', metadata: {} });
    expect(sb._captured.lastInsertMetadata.deferred_from_sd_key).toBe(ACTIVE_SD_KEY);
  });

  it('caller-supplied metadata.deferred_from_sd_key WINS over auto-fill', async () => {
    const sb = makeMockSupabase({ activeSessionRows: [{ sd_key: ACTIVE_SD_KEY }] });
    await emitFeedback({ supabase: sb, title: 't', description: 'd', metadata: { deferred_from_sd_key: 'SD-EXPLICIT-WIN' } });
    expect(sb._captured.lastInsertMetadata.deferred_from_sd_key).toBe('SD-EXPLICIT-WIN');
  });

  it('leaves field UNSET when 0 active claims, no warn', async () => {
    const sb = makeMockSupabase({ activeSessionRows: [] });
    await emitFeedback({ supabase: sb, title: 't', description: 'd', metadata: {} });
    expect(sb._captured.lastInsertMetadata.deferred_from_sd_key).toBeUndefined();
    expect(warns).toHaveLength(0);
  });

  it('leaves field UNSET when >1 active claims AND emits ONE warn', async () => {
    const sb = makeMockSupabase({
      activeSessionRows: [{ sd_key: ACTIVE_SD_KEY }, { sd_key: 'SD-OTHER' }],
    });
    await emitFeedback({ supabase: sb, title: 't', description: 'd', metadata: {} });
    expect(sb._captured.lastInsertMetadata.deferred_from_sd_key).toBeUndefined();
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatch(/auto-fill skipped: 2 active claims/);
  });

  it('leaves field UNSET on DB error (single warn) and does NOT throw', async () => {
    const sb = makeMockSupabase({ activeSessionError: { message: 'boom' } });
    const r = await emitFeedback({ supabase: sb, title: 't', description: 'd', metadata: {} });
    expect(sb._captured.lastInsertMetadata.deferred_from_sd_key).toBeUndefined();
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatch(/auto-fill skipped: boom/);
    expect(r.id).toBe('NEW');
  });

  it('opts out when AUTO_FILL_DEFERRED_FROM_SD_KEY=0 (active=1, but no auto-fill)', async () => {
    process.env.AUTO_FILL_DEFERRED_FROM_SD_KEY = '0';
    const sb = makeMockSupabase({ activeSessionRows: [{ sd_key: ACTIVE_SD_KEY }] });
    await emitFeedback({ supabase: sb, title: 't', description: 'd', metadata: {} });
    expect(sb._captured.lastInsertMetadata.deferred_from_sd_key).toBeUndefined();
  });

  it('leaves field UNSET when CLAUDE_SESSION_ID is not set in env', async () => {
    delete process.env.CLAUDE_SESSION_ID;
    const sb = makeMockSupabase({ activeSessionRows: [{ sd_key: ACTIVE_SD_KEY }] });
    await emitFeedback({ supabase: sb, title: 't', description: 'd', metadata: {} });
    expect(sb._captured.lastInsertMetadata.deferred_from_sd_key).toBeUndefined();
  });

  it('preserves caller-supplied other metadata keys alongside auto-fill', async () => {
    const sb = makeMockSupabase({ activeSessionRows: [{ sd_key: ACTIVE_SD_KEY }] });
    await emitFeedback({
      supabase: sb,
      title: 't',
      description: 'd',
      metadata: { source_location: 'lib/foo.js', logged_via: 'log-harness-bug.js' },
    });
    const md = sb._captured.lastInsertMetadata;
    expect(md.deferred_from_sd_key).toBe(ACTIVE_SD_KEY);
    expect(md.source_location).toBe('lib/foo.js');
    expect(md.logged_via).toBe('log-harness-bug.js');
    expect(md.dedup_hash).toBeDefined();
    expect(md.emitted_at).toBeDefined();
  });
});
