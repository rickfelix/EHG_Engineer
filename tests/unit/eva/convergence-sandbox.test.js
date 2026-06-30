/**
 * SD-LEO-INFRA-CONVERGENCE-SUBJECT-LIFECYCLE-001-B (FR-3) — sandbox repo lifecycle + deterministic
 * teardown. Tests inject a fake `run` spy so REAL gh is NEVER called; the destructive guards
 * (parseRepoSlug / isProtectedRepo) run for real (reused from lib/deleteVentureFully.js).
 */
import { describe, it, expect, vi } from 'vitest';
import { provisionSandboxRepo, teardownSandboxRepo } from '../../../lib/eva/clean-clone/convergence-sandbox.js';

const silent = () => {};
// assertNoDelete-style invariant: NO gh 'repo delete' was ever invoked through the run spy.
const noDelete = (run) => run.mock.calls.every(([cmd, args]) => !(cmd === 'gh' && Array.isArray(args) && args[0] === 'repo' && args[1] === 'delete'));

// Minimal supabase stub for the ledger writes/reads used by the module.
function makeLedgerStub({ activeRun = null } = {}) {
  const calls = { inserted: [], updated: [] };
  const sb = {
    from() {
      const b = {
        insert(row) { calls.inserted.push(row); return b; },
        update(row) { calls.updated.push(row); return b; },
        select() { return b; },
        eq() { return b; },
        order() { return b; },
        limit() { return b; },
        single: async () => ({ data: { run_id: 'run-1' }, error: null }),
        maybeSingle: async () => ({ data: activeRun, error: null }),
      };
      return b;
    },
  };
  return { sb, calls };
}

describe('FR-1: provisionSandboxRepo', () => {
  it('creates a PRIVATE repo via the injected run and records sandbox_repo on the ledger', async () => {
    const run = vi.fn(() => '');
    const { sb, calls } = makeLedgerStub();
    const r = await provisionSandboxRepo(
      { ventureId: 'v-1', repoName: 'rickfelix/conv-sandbox-1', dryRun: false },
      { run, log: silent, supabase: sb }
    );
    expect(r.ok).toBe(true);
    expect(r.stage).toBe('provisioned');
    expect(r.slug).toBe('rickfelix/conv-sandbox-1');
    const [cmd, args] = run.mock.calls[0];
    expect(cmd).toBe('gh');
    expect(args.slice(0, 4)).toEqual(['repo', 'create', 'rickfelix/conv-sandbox-1', '--private']);
    expect(calls.inserted[0].sandbox_repo).toBe('rickfelix/conv-sandbox-1'); // ledger recorded
  });

  it('FR-3 (SD-LEO-INFRA-CONVERGENCE-DUMMYKIND-CHECK-DIVERGENCE-001): ledger startRun receives dummy_kind non_clone, not convergence_subject', async () => {
    const run = vi.fn(() => '');
    const { sb, calls } = makeLedgerStub();
    await provisionSandboxRepo(
      { ventureId: 'v-2', repoName: 'rickfelix/conv-dummykind-test', dryRun: false },
      { run, log: silent, supabase: sb }
    );
    const inserted = calls.inserted[0];
    expect(inserted.dummy_kind).toBe('non_clone');
    expect(inserted.dummy_kind).not.toBe('convergence_subject');
  });

  it('refuses an invalid/unsafe slug WITHOUT invoking run', async () => {
    const run = vi.fn(() => '');
    const r = await provisionSandboxRepo({ repoName: 'not a/valid slug; rm -rf', dryRun: false }, { run, log: silent });
    expect(r.ok).toBe(false);
    expect(r.stage).toBe('validate_slug');
    expect(run).not.toHaveBeenCalled();
  });

  it('dry-run performs NO run invocation and no ledger mutation', async () => {
    const run = vi.fn(() => '');
    const { sb, calls } = makeLedgerStub();
    const r = await provisionSandboxRepo({ repoName: 'rickfelix/conv-sandbox-2', dryRun: true }, { run, log: silent, supabase: sb });
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(calls.inserted).toHaveLength(0);
  });
});

describe('FR-2: teardownSandboxRepo', () => {
  it('deletes a valid sandbox repo via the injected run and closes the ledger run', async () => {
    const run = vi.fn(() => '');
    const { sb, calls } = makeLedgerStub({ activeRun: { run_id: 'run-1', sandbox_repo: 'rickfelix/conv-sandbox-1' } });
    const r = await teardownSandboxRepo({ dryRun: false }, { run, log: silent, supabase: sb });
    expect(r.ok).toBe(true);
    expect(r.stage).toBe('torn_down');
    const [cmd, args] = run.mock.calls[0];
    expect(cmd).toBe('gh');
    expect(args).toEqual(['repo', 'delete', '--yes', '--', 'rickfelix/conv-sandbox-1']);
    expect(calls.updated.some((u) => u.status === 'clean' && u.ended_at)).toBe(true); // run closed
  });

  it('is idempotent: an already-gone (ENOENT) repo is classified SUCCESS', async () => {
    const run = vi.fn(() => { const e = new Error('not found'); e.code = 'ENOENT'; throw e; });
    const { sb } = makeLedgerStub({ activeRun: { run_id: 'run-1', sandbox_repo: 'rickfelix/conv-gone' } });
    const r = await teardownSandboxRepo({ repoSlug: 'rickfelix/conv-gone', dryRun: false }, { run, log: silent, supabase: sb });
    expect(r.ok).toBe(true);
    expect(r.stage).toBe('already_gone');
  });

  it('REFUSES a PROTECTED repo fail-loud with NO delete invoked', async () => {
    const run = vi.fn(() => '');
    const r = await teardownSandboxRepo({ repoSlug: 'rickfelix/EHG_Engineer', dryRun: false }, { run, log: silent });
    expect(r.ok).toBe(false);
    expect(r.stage).toBe('guard_refused');
    expect(r.reason).toBe('protected_repo');
    expect(run).not.toHaveBeenCalled();
    expect(noDelete(run)).toBe(true);
  });

  it('REFUSES a malformed/unsafe slug fail-loud with NO delete invoked', async () => {
    const run = vi.fn(() => '');
    const r = await teardownSandboxRepo({ repoSlug: '-rf/--no-preserve-root', dryRun: false }, { run, log: silent });
    expect(r.ok).toBe(false);
    expect(r.stage).toBe('guard_refused');
    expect(run).not.toHaveBeenCalled();
  });

  it('resolves the slug from the active ledger run when not passed', async () => {
    const run = vi.fn(() => '');
    const { sb } = makeLedgerStub({ activeRun: { run_id: 'run-1', sandbox_repo: 'rickfelix/conv-from-ledger' } });
    const r = await teardownSandboxRepo({ dryRun: false }, { run, log: silent, supabase: sb });
    expect(r.slug).toBe('rickfelix/conv-from-ledger');
    expect(run.mock.calls[0][1]).toEqual(['repo', 'delete', '--yes', '--', 'rickfelix/conv-from-ledger']);
  });

  it('dry-run performs NO delete', async () => {
    const run = vi.fn(() => '');
    const r = await teardownSandboxRepo({ repoSlug: 'rickfelix/conv-sandbox-1', dryRun: true }, { run, log: silent });
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(run).not.toHaveBeenCalled();
    expect(noDelete(run)).toBe(true);
  });

  it('returns no_sandbox when there is no slug and no active run', async () => {
    const run = vi.fn(() => '');
    const { sb } = makeLedgerStub({ activeRun: null });
    const r = await teardownSandboxRepo({ dryRun: false }, { run, log: silent, supabase: sb });
    expect(r.ok).toBe(false);
    expect(r.stage).toBe('no_sandbox');
    expect(run).not.toHaveBeenCalled();
  });
});
