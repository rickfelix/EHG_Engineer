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

describe('Description/scope inheritance (QF-20260729-534 option C)', () => {
  it('prefers expected/actual behavior over the free-form description when both are present', async () => {
    h.cfg = {
      qfRow: baseQfRow({
        description: 'A long free-form incident narrative that is not the SD scope.',
        expected_behavior: 'The gate surfaces a warning.',
        actual_behavior: 'The gate is silent.',
      }),
    };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs.description).toBe('Expected: The gate surfaces a warning.\nActual: The gate is silent.');
    expect(h.createSDArgs.description).not.toContain('incident narrative');
  });

  it('falls back to the free-form description when expected/actual are both empty', async () => {
    h.cfg = { qfRow: baseQfRow({ description: 'Only a narrative here.', expected_behavior: null, actual_behavior: null }) };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs.description).toBe('Only a narrative here.');
  });

  it('falls back to the title when description and behavior fields are all empty', async () => {
    h.cfg = { qfRow: baseQfRow({ title: 'Fallback title', description: null, expected_behavior: null, actual_behavior: null }) };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs.description).toBe('Fallback title');
  });

  it('truncates a description exceeding MAX_CONTENT_CHARS at the exact 8000-char boundary', async () => {
    // Heterogeneous fixture (counter, not a repeated char) so an off-by-one cut point
    // changes the final character and an exact toBe() can pin the boundary precisely --
    // a homogeneous 'x'.repeat() fixture with startsWith()/toBeLessThan() only bounds the
    // cut to the open interval [8000, len), so e.g. a slice(0, 12000) mutant survives it.
    const long = Array.from({ length: 21693 }, (_, i) => i % 10).join('');
    h.cfg = { qfRow: baseQfRow({ description: long, expected_behavior: null, actual_behavior: null }) };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs.description).toBe(`${long.slice(0, 8000)}\n\n[…truncated; full text in metadata.qf_origin_body]`);
  });

  it('truncates an oversized behavior summary too -- the cap is not bypassed on the preferred path', async () => {
    // expected_behavior/actual_behavior are unconstrained free-text columns. If the
    // truncation check were ever moved inside an early-return for the behaviorSummary
    // branch, this is the exact regression that would silently reintroduce the unbounded-
    // description defect QF-20260729-534 exists to close -- just via the preferred path
    // instead of the description fallback.
    const longExpected = 'e'.repeat(9000);
    h.cfg = { qfRow: baseQfRow({ description: 'short', expected_behavior: longExpected, actual_behavior: null }) };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs.description.length).toBe(8000 + '\n\n[…truncated; full text in metadata.qf_origin_body]'.length);
    expect(h.createSDArgs.description).toContain('…truncated; full text in metadata.qf_origin_body');
    expect(h.createSDArgs.description.startsWith(`Expected: ${'e'.repeat(100)}`)).toBe(true);
  });

  it('does not truncate a description within the cap', async () => {
    const short = 'y'.repeat(500);
    h.cfg = { qfRow: baseQfRow({ description: short, expected_behavior: null, actual_behavior: null }) };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs.description).toBe(short);
  });

  it('does not truncate a description at exactly MAX_CONTENT_CHARS (boundary, not over it)', async () => {
    // TESTING sub-agent adversarial pass: composed.length > MAX_CONTENT_CHARS mutated to
    // >= survived every other test here, because none of them supply a fixture of exactly
    // 8000 chars -- all sit strictly on one side of both operators. Only an exact-length
    // fixture distinguishes "over the cap" from "at the cap".
    const exact = 'w'.repeat(8000);
    h.cfg = { qfRow: baseQfRow({ description: exact, expected_behavior: null, actual_behavior: null }) };
    await createFromQF('QF-TEST-1');
    expect(h.createSDArgs.description).toBe(exact);
  });

  it('preserves the full, untruncated original in metadata.qf_origin_body regardless of length', async () => {
    const long = 'z'.repeat(21693);
    h.cfg = {
      qfRow: baseQfRow({
        description: long,
        expected_behavior: 'short expected',
        actual_behavior: 'short actual',
      }),
    };
    await createFromQF('QF-TEST-1');
    // description field used the short behavior summary (per the preference test above)...
    expect(h.createSDArgs.description).toBe('Expected: short expected\nActual: short actual');
    // ...but nothing from the long original narrative was discarded.
    expect(h.createSDArgs.metadata.qf_origin_body).toEqual({
      description: long,
      expected_behavior: 'short expected',
      actual_behavior: 'short actual',
    });
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
