/**
 * Hermetic tests for scripts/lib/metric-evidence-resolver.js
 * (SD-LEO-INFRA-GROUND-SUCCESS-METRICS-001).
 *
 * Full matrix: 4 kinds x {verified, contradicted, unresolvable} + malformed bindings,
 * unknown kinds, executor timeouts (fail-open), and the resolveAllBindings index map.
 * exec is injected — no real process is ever spawned; supabase is a chainable stub.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  resolveEvidenceBinding,
  resolveAllBindings,
  parseGitRef,
  compareExpect,
  BINDING_EXAMPLES,
} from '../../scripts/lib/metric-evidence-resolver.js';

const REPO = process.cwd(); // tests run from the repo/worktree root — real files exist here

/** exec stub factory: route by binary, throw structured errors like execFileSync. */
function makeExec(routes) {
  return vi.fn((file, args) => {
    const handler = routes[file];
    if (!handler) { const e = new Error(`ENOENT ${file}`); e.code = 'ENOENT'; throw e; }
    return handler(args);
  });
}
const exitErr = (status, signal = null) => { const e = new Error(`exit ${status}`); e.status = status; e.signal = signal; return e; };

/** Chainable supabase stub for db_probe (count head) and gate_score (handoff rows). */
function makeSupabase({ counts = {}, handoffs = [], probeError = null } = {}) {
  return {
    from(table) {
      const filters = {};
      const chain = {
        select(_cols, opts) { chain._head = !!(opts && opts.head); return chain; },
        eq(col, val) { filters[col] = val; return chain; },
        order() { return chain; },
        limit() {
          // gate_score terminal: ordered accepted handoffs
          const rows = handoffs.filter(h =>
            h.sd_id === filters.sd_id && h.handoff_type === filters.handoff_type && h.status === filters.status);
          return Promise.resolve({ data: rows, error: null });
        },
        then(resolve) {
          // db_probe terminal: count head
          if (probeError) return resolve({ count: null, error: { message: probeError } });
          const key = `${table}:${JSON.stringify(filters)}`;
          return resolve({ count: counts[key] ?? counts[table] ?? 0, error: null });
        },
      };
      return chain;
    },
  };
}

// ── pure helpers ──────────────────────────────────────────────────────────────

describe('parseGitRef', () => {
  it('parses PR forms', () => {
    expect(parseGitRef('PR#4553')).toEqual({ pr: 4553 });
    expect(parseGitRef('#123')).toEqual({ pr: 123 });
    expect(parseGitRef('123')).toEqual({ pr: 123 });
    expect(parseGitRef({ pr: 7 })).toEqual({ pr: 7 });
  });
  it('parses commit forms', () => {
    expect(parseGitRef('77ac38a6e622e45b2bbbb4222d6dd257a66299e4')).toEqual({ commit: '77ac38a6e622e45b2bbbb4222d6dd257a66299e4' });
    expect(parseGitRef({ commit: 'abcdef1' })).toEqual({ commit: 'abcdef1' });
  });
  it('rejects garbage', () => {
    expect(parseGitRef('not-a-ref!')).toBeNull();
    expect(parseGitRef({})).toBeNull();
    expect(parseGitRef(null)).toBeNull();
  });
});

describe('compareExpect', () => {
  it('handles operators incl. unicode and default >=', () => {
    expect(compareExpect(85, '>=85')).toBe(true);
    expect(compareExpect(84, '>=85')).toBe(false);
    expect(compareExpect(1, '≥1')).toBe(true);
    expect(compareExpect(3, '<=2')).toBe(false);
    expect(compareExpect(2, '≤2')).toBe(true);
    expect(compareExpect(5, '5')).toBe(true);   // default >=
    expect(compareExpect(0, '==0')).toBe(true);
  });
  it('returns null on unparseable expectations', () => {
    expect(compareExpect(5, 'lots')).toBeNull();
    expect(compareExpect(null, '>=1')).toBeNull();
  });
});

// ── git kind ──────────────────────────────────────────────────────────────────

describe('git kind', () => {
  const ctxWith = (routes) => ({ repoRoot: REPO, exec: makeExec(routes) });

  it('VERIFIED: merged PR', async () => {
    const r = await resolveEvidenceBinding({ kind: 'git', ref: 'PR#42' },
      ctxWith({ gh: () => JSON.stringify({ state: 'MERGED' }) }));
    expect(r).toMatchObject({ bound: true, resolved: true, verified: true });
    expect(r.detail).toMatch(/PR #42 MERGED/);
  });

  it('CONTRADICTED: open PR', async () => {
    const r = await resolveEvidenceBinding({ kind: 'git', ref: { pr: 42 } },
      ctxWith({ gh: () => JSON.stringify({ state: 'OPEN' }) }));
    expect(r).toMatchObject({ resolved: true, verified: false });
  });

  it('UNRESOLVABLE: gh unavailable (fail-open, never contradicted)', async () => {
    const r = await resolveEvidenceBinding({ kind: 'git', ref: 'PR#42' }, ctxWith({}));
    expect(r).toMatchObject({ bound: true, resolved: false });
    expect(r.reason).toMatch(/gh unavailable/);
  });

  it('VERIFIED: commit is ancestor of origin/main', async () => {
    const r = await resolveEvidenceBinding({ kind: 'git', ref: 'a'.repeat(40) },
      ctxWith({ git: () => '' }));
    expect(r).toMatchObject({ resolved: true, verified: true });
  });

  it('CONTRADICTED: commit not an ancestor (exit 1)', async () => {
    const r = await resolveEvidenceBinding({ kind: 'git', ref: { commit: 'b'.repeat(40) } },
      ctxWith({ git: () => { throw exitErr(1); } }));
    expect(r).toMatchObject({ resolved: true, verified: false });
  });

  it('UNRESOLVABLE: git timeout (signal) — cannot tell', async () => {
    const r = await resolveEvidenceBinding({ kind: 'git', ref: { commit: 'c'.repeat(40) } },
      ctxWith({ git: () => { throw exitErr(null, 'SIGTERM'); } }));
    expect(r).toMatchObject({ resolved: false });
  });

  it('UNRESOLVABLE: unrecognized ref shape', async () => {
    const r = await resolveEvidenceBinding({ kind: 'git', ref: { branch: 'main' } }, ctxWith({}));
    expect(r).toMatchObject({ resolved: false });
  });
});

// ── test kind ─────────────────────────────────────────────────────────────────

describe('test kind', () => {
  it('VERIFIED: existing test file runs green (exec exit 0)', async () => {
    const exec = makeExec({ npx: () => '' });
    const r = await resolveEvidenceBinding(
      { kind: 'test', ref: 'tests/unit/metric-evidence-resolver.test.js' },
      { repoRoot: REPO, exec });
    expect(r).toMatchObject({ resolved: true, verified: true });
    expect(exec).toHaveBeenCalledWith('npx', ['vitest', 'run', 'tests/unit/metric-evidence-resolver.test.js'], expect.anything());
  });

  it('CONTRADICTED: test file runs red (clean non-zero exit)', async () => {
    const r = await resolveEvidenceBinding(
      { kind: 'test', ref: 'tests/unit/metric-evidence-resolver.test.js' },
      { repoRoot: REPO, exec: makeExec({ npx: () => { throw exitErr(1); } }) });
    expect(r).toMatchObject({ resolved: true, verified: false });
    expect(r.detail).toMatch(/FAILED/);
  });

  it('UNRESOLVABLE: runner timeout (signal) — infrastructure flake never contradicts', async () => {
    const r = await resolveEvidenceBinding(
      { kind: 'test', ref: 'tests/unit/metric-evidence-resolver.test.js' },
      { repoRoot: REPO, exec: makeExec({ npx: () => { throw exitErr(null, 'SIGTERM'); } }) });
    expect(r).toMatchObject({ resolved: false });
  });

  it('UNRESOLVABLE: file does not exist', async () => {
    const r = await resolveEvidenceBinding(
      { kind: 'test', ref: 'tests/does-not-exist.test.js' },
      { repoRoot: REPO, exec: makeExec({ npx: () => '' }) });
    expect(r).toMatchObject({ resolved: false });
    expect(r.reason).toMatch(/not found/);
  });

  it('UNRESOLVABLE: non-string ref', async () => {
    const r = await resolveEvidenceBinding({ kind: 'test', ref: { file: 'x' } }, { repoRoot: REPO, exec: makeExec({}) });
    expect(r).toMatchObject({ resolved: false });
  });
});

// ── db_probe kind ─────────────────────────────────────────────────────────────

describe('db_probe kind', () => {
  it('VERIFIED: count meets expect', async () => {
    const supabase = makeSupabase({ counts: { widgets: 3 } });
    const r = await resolveEvidenceBinding(
      { kind: 'db_probe', ref: { table: 'widgets', match: { status: 'live' }, expect: '>=1' } },
      { repoRoot: REPO, supabase });
    expect(r).toMatchObject({ resolved: true, verified: true });
    expect(r.detail).toMatch(/count=3/);
  });

  it('CONTRADICTED: count misses expect', async () => {
    const supabase = makeSupabase({ counts: { widgets: 0 } });
    const r = await resolveEvidenceBinding(
      { kind: 'db_probe', ref: { table: 'widgets', expect: '>=1' } },
      { repoRoot: REPO, supabase });
    expect(r).toMatchObject({ resolved: true, verified: false });
  });

  it('UNRESOLVABLE: query error (fail-open)', async () => {
    const supabase = makeSupabase({ probeError: 'permission denied' });
    const r = await resolveEvidenceBinding(
      { kind: 'db_probe', ref: { table: 'widgets', expect: '>=1' } },
      { repoRoot: REPO, supabase });
    expect(r).toMatchObject({ resolved: false });
  });

  it('UNRESOLVABLE: declarative-shape violations (no raw SQL channel)', async () => {
    const supabase = makeSupabase({});
    for (const bad of [
      'SELECT 1',                                  // not an object
      { table: 'w' },                              // missing expect
      { table: 'w', expect: 'DROP TABLE x' },      // non-numeric expect
      { table: 'w', match: ['a'], expect: '>=1' }, // match not a map
      { expect: '>=1' },                           // missing table
    ]) {
      const r = await resolveEvidenceBinding({ kind: 'db_probe', ref: bad }, { repoRoot: REPO, supabase });
      expect(r.resolved, JSON.stringify(bad)).toBe(false);
    }
  });
});

// ── gate_score kind ───────────────────────────────────────────────────────────

describe('gate_score kind', () => {
  const SD = 'uuid-1';
  const accepted = (type, score) => ({ sd_id: SD, handoff_type: type, status: 'accepted', validation_score: score, accepted_at: '2026-06-10' });

  it('VERIFIED: accepted handoff score meets expect', async () => {
    const supabase = makeSupabase({ handoffs: [accepted('EXEC-TO-PLAN', 93)] });
    const r = await resolveEvidenceBinding(
      { kind: 'gate_score', ref: { handoff: 'EXEC-TO-PLAN', expect: '>=85' } },
      { repoRoot: REPO, supabase, sdUuid: SD });
    expect(r).toMatchObject({ resolved: true, verified: true });
  });

  it('CONTRADICTED: score below expect', async () => {
    const supabase = makeSupabase({ handoffs: [accepted('EXEC-TO-PLAN', 60)] });
    const r = await resolveEvidenceBinding(
      { kind: 'gate_score', ref: { handoff: 'EXEC-TO-PLAN', expect: '>=85' } },
      { repoRoot: REPO, supabase, sdUuid: SD });
    expect(r).toMatchObject({ resolved: true, verified: false });
  });

  it('UNRESOLVABLE: no accepted handoff of that type (never self-references the in-flight row)', async () => {
    const supabase = makeSupabase({ handoffs: [] });
    const r = await resolveEvidenceBinding(
      { kind: 'gate_score', ref: { handoff: 'PLAN-TO-LEAD', expect: '>=85' } },
      { repoRoot: REPO, supabase, sdUuid: SD });
    expect(r).toMatchObject({ resolved: false });
  });

  it('UNRESOLVABLE: malformed ref', async () => {
    const r = await resolveEvidenceBinding({ kind: 'gate_score', ref: 'EXEC-TO-PLAN' }, { repoRoot: REPO, supabase: makeSupabase({}), sdUuid: SD });
    expect(r).toMatchObject({ resolved: false });
  });
});

// ── binding-level edge cases + resolveAllBindings ─────────────────────────────

describe('binding edge cases', () => {
  it('unknown kind → unresolvable, never throws', async () => {
    const r = await resolveEvidenceBinding({ kind: 'vibes', ref: 'trust me' }, { repoRoot: REPO });
    expect(r).toMatchObject({ bound: true, resolved: false });
    expect(r.reason).toMatch(/unknown evidence kind/);
  });

  it('non-object evidence → unresolvable; null/undefined → unbound', async () => {
    expect(await resolveEvidenceBinding('PR#1', { repoRoot: REPO })).toMatchObject({ resolved: false });
    expect(await resolveEvidenceBinding(null, { repoRoot: REPO })).toEqual({ bound: false });
    expect(await resolveEvidenceBinding(undefined, { repoRoot: REPO })).toEqual({ bound: false });
  });

  it('resolveAllBindings maps ONLY bound metric indexes (unbound untouched)', async () => {
    const supabase = makeSupabase({ counts: { t: 2 } });
    const metrics = [
      { metric: 'no binding', actual: '100%' },
      { metric: 'bound', evidence: { kind: 'db_probe', ref: { table: 't', expect: '>=1' } } },
      { metric: 'also unbound', actual: '5' },
    ];
    const map = await resolveAllBindings(metrics, { repoRoot: REPO, supabase });
    expect([...map.keys()]).toEqual([1]);
    expect(map.get(1)).toMatchObject({ resolved: true, verified: true });
  });

  it('resolveAllBindings on non-array → empty map; BINDING_EXAMPLES covers all 4 kinds', async () => {
    expect((await resolveAllBindings(null, { repoRoot: REPO })).size).toBe(0);
    const joined = BINDING_EXAMPLES.join('\n');
    for (const kind of ['git', 'test', 'db_probe', 'gate_score']) expect(joined).toContain(`"${kind}"`);
  });
});
