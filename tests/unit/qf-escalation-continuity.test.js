/**
 * SD-LEO-INFRA-ESCALATION-CONTINUITY-AUTO-001 — QF→SD escalation continuity.
 *
 * Pins the three-part fix that closes the witnessed 11s same-host race + duplicate
 * rebuild when a quick-fix escalates to an SD (RCA on cancelled QF-20260712-254):
 *   FR-1  born-claim the escalated SD for the QF's live worker via the claim_sd RPC
 *   FR-2  seed metadata.escalated_from_branch = qf/<qf-id> on the created SD
 *   FR-3  base the SD worktree off that LOCAL QF branch when the ref exists
 *
 * Hermetic: supabase (both the createFromQF client and the resolveEscalatedBaseRef
 * client) is mocked; the branch-existence check runs against a throwaway git fixture
 * under os.tmpdir — no live DB/network, no main-repo mutation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';

// ── Mutable mock state (vi.hoisted so the mock factories can close over it) ──────────
const h = vi.hoisted(() => ({
  cfg: null,            // per-test config for the createFromQF (context.js) supabase mock
  createSDArgs: null,   // captures the args createSDOrThrow was called with
  sdMeta: { data: null } // return value for the resolveEscalatedBaseRef metadata lookup
}));

// createFromQF's supabase client (lib/sd-creation/context.js)
// Real column sets — the mock reproduces PostgREST's HTTP-400 on an unknown column so a
// select against a non-existent column (e.g. the sd_id->sd_key migration trap) fails the
// test instead of silently returning null and shipping dead code green.
const REAL_COLUMNS = {
  claude_sessions: new Set(['id', 'session_id', 'status', 'sd_key', 'worktree_path', 'heartbeat_at', 'metadata']),
  quick_fixes: null // not column-validated in these tests
};

function validateSelect(table, cols) {
  const known = REAL_COLUMNS[table];
  if (!known || !cols || cols === '*') return null;
  for (const raw of cols.split(',')) {
    const col = raw.trim();
    if (col && !known.has(col)) {
      return { message: `column ${table}.${col} does not exist`, code: '42703' };
    }
  }
  return null;
}

vi.mock('../../lib/sd-creation/context.js', () => ({
  supabase: {
    from(table) {
      const b = {
        _cols: null,
        select: (cols) => { b._cols = cols; return b; },
        eq: () => b,
        in: () => b,
        update: (payload) => { h.cfg?.onUpdate?.(payload); return b; },
        maybeSingle: async () => {
          const colErr = validateSelect(table, b._cols);
          if (colErr) return { data: null, error: colErr };
          if (table === 'quick_fixes') return { data: h.cfg?.qfRow ?? null, error: null };
          if (table === 'claude_sessions') return { data: h.cfg?.sessionRow ?? null, error: null };
          return { data: null, error: null };
        },
        // The QF-retirement path awaits `.update(...).eq(...)` directly (no maybeSingle),
        // so the builder must be thenable, resolving to a write result.
        then: (resolve) => resolve({ error: null })
      };
      return b;
    },
    rpc: async (name, args) => {
      if (name === 'claim_sd') {
        h.cfg?.onClaim?.(args);
        return { data: h.cfg?.claimResult ?? { success: true }, error: null };
      }
      return { data: null, error: null };
    }
  }
}));

vi.mock('../../lib/sd-creation/pipeline.js', () => ({
  resolveVenturePrefix: async () => 'LEO',
  createSDOrThrow: async (args) => { h.createSDArgs = args; return { id: 'SD-UUID-1' }; }
}));

vi.mock('../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: async () => 'SD-LEO-FIX-TEST-001'
}));

vi.mock('../../lib/eva/stage-zero/data-pollers/retry.js', () => ({
  withRetry: async (fn) => fn()
}));

// resolveEscalatedBaseRef's supabase client (lib/supabase-client.js)
vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => h.sdMeta }) }) })
  })
}));

// SUTs imported AFTER the mocks are registered.
const { createFromQF } = await import('../../lib/sd-creation/source-adapters/qf.js');
const { resolveEscalatedBaseRef } = await import('../../scripts/resolve-sd-workdir.js');

function baseQfRow(overrides = {}) {
  return {
    id: 'QF-TEST-1',
    title: 'Test QF',
    description: 'desc',
    type: 'bug',
    severity: 'medium',
    estimated_loc: 120,
    target_application: 'EHG_Engineer',
    status: 'open',
    escalated_to_sd_id: null,
    claiming_session_id: null,
    ...overrides
  };
}

function createFixtureRepo() {
  const dir = join(tmpdir(), `esc-cont-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "t@t.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "T"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'README.md'), '# test');
  execSync('git add . && git commit -m init', { cwd: dir, stdio: 'pipe' });
  return dir;
}

beforeEach(() => {
  h.cfg = null;
  h.createSDArgs = null;
  h.sdMeta = { data: null };
});

describe('FR-2: branch-continuity seed', () => {
  it('TS-3: createFromQF seeds metadata.escalated_from_branch = qf/<qf-id>', async () => {
    h.cfg = { qfRow: baseQfRow() };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs).not.toBeNull();
    expect(h.createSDArgs.metadata.escalated_from_branch).toBe('qf/QF-TEST-1');
    // existing escalation metadata preserved
    expect(h.createSDArgs.metadata.source_qf_id).toBe('QF-TEST-1');
    expect(h.createSDArgs.metadata.escalated_from_qf).toBe('QF-TEST-1');
  });
});

describe('FR-1: born-claim via claim_sd', () => {
  it('TS-1: born-claims the SD for a live session that still holds the QF', async () => {
    const claims = [];
    h.cfg = {
      qfRow: baseQfRow({ claiming_session_id: 'sess-A' }),
      sessionRow: { session_id: 'sess-A', status: 'active', sd_key: 'QF-TEST-1' },
      onClaim: (args) => claims.push(args)
    };
    await createFromQF('QF-TEST-1');
    expect(claims).toHaveLength(1);
    expect(claims[0].p_sd_id).toBe('SD-LEO-FIX-TEST-001');
    expect(claims[0].p_session_id).toBe('sess-A');
  });

  it('TS-2a: no born-claim when the QF has no claiming session (unclaimed — no regression)', async () => {
    const claims = [];
    h.cfg = { qfRow: baseQfRow({ claiming_session_id: null }), onClaim: (a) => claims.push(a) };
    await createFromQF('QF-TEST-1');
    expect(claims).toHaveLength(0);
  });

  it('TS-2b: no born-claim when the captured session is not live', async () => {
    const claims = [];
    h.cfg = {
      qfRow: baseQfRow({ claiming_session_id: 'sess-A' }),
      sessionRow: null, // no active/idle row
      onClaim: (a) => claims.push(a)
    };
    await createFromQF('QF-TEST-1');
    expect(claims).toHaveLength(0);
  });

  it('TS-2c: no born-claim (no claim theft) when the live session has moved to other work', async () => {
    const claims = [];
    h.cfg = {
      qfRow: baseQfRow({ claiming_session_id: 'sess-A' }),
      sessionRow: { session_id: 'sess-A', status: 'active', sd_key: 'SD-SOME-OTHER-001' },
      onClaim: (a) => claims.push(a)
    };
    await createFromQF('QF-TEST-1');
    expect(claims).toHaveLength(0);
  });
});

describe('FR-3: resolveEscalatedBaseRef — local-ref base resolution', () => {
  it('TS-4: returns the local QF ref when seeded and the branch exists', async () => {
    const repo = createFixtureRepo();
    try {
      execSync('git branch qf/QF-B-1', { cwd: repo, stdio: 'pipe' });
      h.sdMeta = { data: { metadata: { escalated_from_branch: 'qf/QF-B-1' } } };
      const ref = await resolveEscalatedBaseRef('SD-LEO-FIX-TEST-001', repo);
      expect(ref).toBe('refs/heads/qf/QF-B-1');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('TS-5a: falls back (null) when seeded but the ref is absent locally', async () => {
    const repo = createFixtureRepo();
    try {
      h.sdMeta = { data: { metadata: { escalated_from_branch: 'qf/QF-MISSING' } } };
      const ref = await resolveEscalatedBaseRef('SD-LEO-FIX-TEST-001', repo);
      expect(ref).toBeNull();
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('TS-5b: falls back (null) when the SD carries no escalated_from_branch seed', async () => {
    const repo = createFixtureRepo();
    try {
      h.sdMeta = { data: { metadata: {} } };
      const ref = await resolveEscalatedBaseRef('SD-LEO-FIX-TEST-001', repo);
      expect(ref).toBeNull();
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
