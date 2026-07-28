/**
 * FR-2: insertCoordinationRow refuses a WORK_ASSIGNMENT whose target nothing can resolve.
 * SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001.
 *
 * Sibling of DISPATCH_WORK_ASSIGNMENT_TYPE_MISMATCH: that guard catches a MISTYPED assignment,
 * this one catches an UNREADABLE one. Both exist because such a row inserts cleanly, is skipped
 * in silence by the worker, and is then misread by the coordinator as worker capacity.
 *
 * Ships OBSERVE-ONLY per the Observe-Only-First protocol default — these tests pin BOTH modes,
 * because an observe-only guard that silently never warns is the same fail-green class this SD
 * exists to end.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');
const { insertCoordinationRow } = require_(path.join(REPO, 'lib/coordinator/dispatch.cjs'));

/** Minimal supabase stub: every guard that reaches the DB resolves permissively. */
function stubSupabase() {
  const chain = {
    select: () => chain, eq: () => chain, in: () => chain, is: () => chain,
    order: () => chain, limit: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    then: undefined
  };
  return {
    from: () => ({
      ...chain,
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'row-1' }, error: null }) }) })
    }),
    rpc: async () => ({ data: null, error: null })
  };
}

const LIVE_TARGET = '11111111-2222-3333-4444-555555555555';

function unreadableRow(over = {}) {
  return {
    target_session: LIVE_TARGET,
    message_type: 'WORK_ASSIGNMENT',
    subject: 'VOID — DO NOT git stash',
    body: 'advisory prose, no work item named',
    payload: { kind: 'coordinator_note', body: 'prose' },
    ...over
  };
}

describe('FR-2 — unresolvable WORK_ASSIGNMENT at the dispatch choke point', () => {
  let warn;
  beforeEach(() => { warn = vi.fn(); delete process.env.DISPATCH_ASSIGNMENT_TARGET_GUARD; });
  afterEach(() => { delete process.env.DISPATCH_ASSIGNMENT_TARGET_GUARD; vi.restoreAllMocks(); });

  it('OBSERVE-ONLY (default): warns with the payload keys, and does NOT throw', async () => {
    await insertCoordinationRow(stubSupabase(), unreadableRow(), { logger: { warn } })
      .catch(() => { /* later guards may reject on the stub; the assertion below is what matters */ });
    const line = warn.mock.calls.map(c => String(c[0])).find(s => s.includes('assignment_target_unresolvable'));
    expect(line, 'expected an observe-only warning naming the event').toBeTruthy();
    const parsed = JSON.parse(line);
    expect(parsed.mode).toBe('observe_only');
    expect(parsed.ambiguous).toBe(false);
    // The payload keys are the diagnostic that was missing for three incidents — a coordinator
    // could not tell WHY a dispatch was ignored. Name them.
    expect(parsed.payload_keys).toContain('kind');
  });

  it('BINDING (promoted): throws DISPATCH_ASSIGNMENT_TARGET_UNRESOLVABLE', async () => {
    process.env.DISPATCH_ASSIGNMENT_TARGET_GUARD = 'block';
    await expect(insertCoordinationRow(stubSupabase(), unreadableRow(), { logger: { warn } }))
      .rejects.toMatchObject({ code: 'DISPATCH_ASSIGNMENT_TARGET_UNRESOLVABLE' });
  });

  it('MULTI-KEY text is reported as ambiguous with BOTH candidates, never auto-picked', async () => {
    // The live shape: a supersede notice. First-match would select the SUPERSEDED key.
    const row = unreadableRow({
      subject: 'SUPERSEDES my QF-20260725-630 dispatch — take QF-20260726-459 instead'
    });
    await insertCoordinationRow(stubSupabase(), row, { logger: { warn } }).catch(() => {});
    const line = warn.mock.calls.map(c => String(c[0])).find(s => s.includes('assignment_target_unresolvable'));
    const parsed = JSON.parse(line);
    expect(parsed.ambiguous).toBe(true);
    expect(parsed.candidates).toEqual(['QF-20260725-630', 'QF-20260726-459']);
  });

  it('a RESOLVABLE assignment is not flagged — including via the top-level column', async () => {
    // The 10-row cohort: target only in the top-level target_sd column.
    await insertCoordinationRow(stubSupabase(), unreadableRow({ target_sd: 'QF-20260726-642' }), { logger: { warn } })
      .catch(() => {});
    const line = warn.mock.calls.map(c => String(c[0])).find(s => s.includes('assignment_target_unresolvable'));
    expect(line, 'a row with a resolvable target must not be flagged').toBeFalsy();
  });

  it('non-WORK_ASSIGNMENT rows are untouched by this guard', async () => {
    await insertCoordinationRow(stubSupabase(), unreadableRow({ message_type: 'INFO', payload: { kind: 'note' } }), { logger: { warn } })
      .catch(() => {});
    const line = warn.mock.calls.map(c => String(c[0])).find(s => s.includes('assignment_target_unresolvable'));
    expect(line).toBeFalsy();
  });
});
