/**
 * SD-LEO-INFRA-SUB-AGENT-EVIDENCE-001 — session-scoped SD resolution (FR-1/2/3).
 *
 * Proves the fix for the evidence mis-attribution bug: getActiveSD() must resolve from the
 * INVOKING session's own claim, so two concurrent sessions never contaminate each other via
 * the shared .claude/unified-session-state.json. All I/O is injected (no real DB/fs).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

// This is a PURE unit test — all I/O (supabase + fs) is injected via deps; a live client is
// never reached. The mock is a belt-and-suspenders guarantee: if any path ever falls back to
// the real module, it throws instead of touching a live DB.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => { throw new Error('unit test must never reach a live supabase client'); },
}));

const require = createRequire(import.meta.url);
const { getActiveSD } = require('../../../scripts/hooks/task-subagent-recorder.cjs');

// fake fs whose existsSync/readFileSync match by path suffix (filename)
function fakeFs(files) {
  const keyFor = (p) => Object.keys(files).find((k) => String(p).endsWith(k));
  return {
    existsSync: (p) => keyFor(p) !== undefined,
    readFileSync: (p) => JSON.stringify(files[keyFor(p)]),
  };
}
// fake supabase client whose claim-lookup chain resolves to { id: sdId } (or null)
function fakeClient(sdId) {
  const chain = {
    select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
    maybeSingle: async () => ({ data: sdId ? { id: sdId } : null }),
  };
  return { from: () => chain };
}
function throwingClient() { return { from: () => { throw new Error('db down'); } }; }

describe('getActiveSD — session-scoped attribution (SD-LEO-INFRA-SUB-AGENT-EVIDENCE-001)', () => {
  const savedEnv = { ...process.env };
  beforeEach(() => { process.env.SUPABASE_URL = 'http://test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'; });
  afterEach(() => { process.env = { ...savedEnv }; });

  it('FR-3: two concurrent sessions each resolve to their OWN claimed SD, never the racy shared file', async () => {
    // The shared file holds a stale/other value (the exact contamination vector) — the claim must win.
    const fs = fakeFs({ 'unified-session-state.json': { sd: { id: 'SD-SHARED-CONTAMINANT' } } });

    process.env.CLAUDE_SESSION_ID = 'sess-A';
    const a = await getActiveSD({ fs, createClient: () => fakeClient('SD-A') });
    process.env.CLAUDE_SESSION_ID = 'sess-B';
    const b = await getActiveSD({ fs, createClient: () => fakeClient('SD-B') });

    expect(a).toEqual({ sdId: 'SD-A', attributionSource: 'claim-lookup' });
    expect(b).toEqual({ sdId: 'SD-B', attributionSource: 'claim-lookup' });
    expect(a.sdId).not.toBe(b.sdId);               // no cross-session contamination
    expect(a.sdId).not.toBe('SD-SHARED-CONTAMINANT'); // claim beat the shared file
  });

  it('FR-2: no session identity → shared-file fallback, STAMPED as shared-file-fallback', async () => {
    delete process.env.CLAUDE_SESSION_ID;
    const fs = fakeFs({ 'unified-session-state.json': { sd: { id: 'SD-SHARED' } } });
    const r = await getActiveSD({ fs, createClient: () => fakeClient('SD-A') });
    expect(r).toEqual({ sdId: 'SD-SHARED', attributionSource: 'shared-file-fallback' });
  });

  it('FR-1 fail-soft: a claim-lookup error falls through to the next source, never throws', async () => {
    process.env.CLAUDE_SESSION_ID = 'sess-A';
    const fs = fakeFs({ 'unified-session-state.json': { sd: { id: 'SD-SHARED' } } });
    const r = await getActiveSD({ fs, createClient: () => throwingClient() });
    expect(r.sdId).toBe('SD-SHARED');
    expect(r.attributionSource).toBe('shared-file-fallback');
  });

  it('FR-1: a per-session state file is preferred over the shared file', async () => {
    process.env.CLAUDE_SESSION_ID = 'sess-A';
    const fs = fakeFs({
      'session-state-sess-A.json': { sd: { id: 'SD-SESSFILE' } },
      'unified-session-state.json': { sd: { id: 'SD-SHARED' } },
    });
    const r = await getActiveSD({ fs, createClient: () => fakeClient(null) }); // no claim → session-file
    expect(r).toEqual({ sdId: 'SD-SESSFILE', attributionSource: 'session-file' });
  });

  it('resolves { null, none } when nothing is available', async () => {
    process.env.CLAUDE_SESSION_ID = 'sess-A';
    const r = await getActiveSD({ fs: fakeFs({}), createClient: () => fakeClient(null) });
    expect(r).toEqual({ sdId: null, attributionSource: 'none' });
  });
});
