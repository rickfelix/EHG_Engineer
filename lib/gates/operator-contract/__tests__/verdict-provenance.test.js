/**
 * TS-1/TS-2/TS-5 — a verdict must name WHAT it decided and WHICH TREE it read.
 * SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-002
 *
 * `details.creator_kinds` was read at the gate factory and returned by NONE of the three
 * resolveOperatorContract paths, so the key was always undefined and JSON.stringify dropped it.
 * Measured at the persistence layer rather than inferred from the source: creator_kinds is
 * ABSENT — not null — from the stored details of the 2026-08-08T01:34:51 rejection.
 *
 * Mutations these must catch: M1/M2/M3 (drop `creator` from each return path), M4 (emit the
 * executor-side appPath instead of the post-fallback repoPath), M5/M5b (drop repo_path from
 * the fail-open / fail-closed branches).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createOperatorContractGate } from '../harness-adapter.js';

const supabase = { from: () => ({ select: async () => ({ data: [], error: null }), insert: async () => ({ error: null }) }) };
const sd = { sd_key: 'SD-TEST-001', metadata: {} };
const diffOf = (changedFiles, migrations = []) => ({ changedFiles, migrations, createdTables: [] });
const gate = (diff, appPath = 'C:/named/tree') => createOperatorContractGate(supabase, sd, appPath, { diff });

const FLAG_CREATOR = diffOf([{ path: 'scripts/add-flag.js', added: "await supabase.from('leo_feature_flags').insert({ key: 'k' })" }]);
const ORPHAN = diffOf([{ path: 'scripts/sweep.mjs', added: "await supabase.from('receipts').insert(r)" }]);
const INERT = diffOf([{ path: 'lib/util.js', added: 'export const noop = () => {};' }]);

afterEach(() => { delete process.env.ENFORCE_CONSUMER_CITATION; });

describe('TS-1 — creator_kinds carries DATA, on every return path', () => {
  it('CREATOR path: a real flag creator reports its kind', async () => {
    // M1. Before the fix this was undefined and vanished from the stored JSON entirely.
    const res = await gate(FLAG_CREATOR).validator({ sd });
    expect(res.details.creator_kinds).toEqual(['flag']);
  });

  it('WIRING-ARMED path (non-creator, orphaned producer) still reports creator_kinds', async () => {
    // M3. A separate path, so a test covering only the creator branch leaves this mutant alive.
    const res = await gate(ORPHAN).validator({ sd });
    expect(res.details.creator_kinds).toEqual([]);
    expect(res.details.orphaned_producers).toEqual(['receipts']);
  });

  it('SHORT-CIRCUIT path (nothing armed) still reports creator_kinds', async () => {
    // M2. The quietest path, and the one most likely to be left behind.
    const res = await gate(INERT).validator({ sd });
    expect(res.details.creator_kinds).toEqual([]);
  });

  it('the key is PRESENT, not merely undefined — JSON.stringify must not drop it', async () => {
    // The failure being pinned was an ABSENT key in the persisted row, so presence-after-
    // serialisation is the assertion that actually matches the defect.
    const res = await gate(FLAG_CREATOR).validator({ sd });
    expect(Object.keys(JSON.parse(JSON.stringify(res.details)))).toContain('creator_kinds');
  });
});

describe('TS-2 — the verdict names the tree it actually read', () => {
  it('emits the resolved repo path', async () => {
    expect((await gate(INERT, 'C:/named/tree').validator({ sd })).details.repo_path).toBe('C:/named/tree');
  });

  it('M4: it is the POST-FALLBACK repoPath, not the executor-side appPath', async () => {
    // With appPath undefined the gate falls back to process.cwd(). A mutant emitting appPath
    // yields undefined here; emitting repoPath yields the cwd.
    const res = await createOperatorContractGate(supabase, sd, undefined, { diff: INERT }).validator({ sd });
    expect(res.details.repo_path).toBe(process.cwd());
  });
});

describe('TS-5 — repo_path rides EVERY branch, including the ones that fire when things break', () => {
  it('M5b: the enforced fail-closed branch', async () => {
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await gate(ORPHAN).validator({ sd });
    expect(res.passed).toBe(false);
    expect(res.details.repo_path).toBe('C:/named/tree');
  });

  it('M5: the fail-OPEN branch — the verdict least likely to be examined and most likely to mislead', async () => {
    const res = await createOperatorContractGate(supabase, sd, 'C:/definitely/not/a/repo/xyz').validator({ sd });
    expect(res.passed).toBe(true);
    expect(res.details.fail_open).toBe(true);
    expect(res.details.repo_path).toBe('C:/definitely/not/a/repo/xyz');
  });
});

describe('the two branches my first pass left unpinned (TESTING ee56bca1)', () => {
  /**
   * M5b and X3 SURVIVED the agreed battery. The test I labelled "the enforced fail-closed
   * branch" actually landed on CONSUMER_CITATION_MISSING — proven differentially by TESTING,
   * since mutating only that site reddened it while mutating the fail-closed site reddened
   * nothing. A test whose NAME says one branch and whose EXECUTION reaches another is worse
   * than a missing test: it reads as coverage.
   *
   * X3 matters more. It is the CREATOR-FAIL site — the branch a blocked creator SD actually
   * produces, i.e. the exact verdict the read-back CLI exists to explain. The headline
   * scenario of the whole SD was the one emission site with no test on it.
   */
  const CREATOR_NO_TRIPLE = diffOf(
    [{ path: 'scripts/w.js', added: "await supabase.from('new_thing').insert(r)" }],
    [{ path: 'database/migrations/x.sql', sql: 'CREATE TABLE new_thing (id uuid);' }],
  );

  it('X3: the CREATOR-FAIL verdict names its tree — the branch the read-back CLI is FOR', async () => {
    const res = await gate(CREATOR_NO_TRIPLE).validator({ sd });
    expect(res.passed).toBe(false);
    expect(res.details.repo_path).toBe('C:/named/tree');
    expect(res.details.creator_kinds).toEqual(expect.arrayContaining(['table']));
  });

  it('M5b: the ENFORCE-mode UNEVALUABLE branch names its tree', async () => {
    // Reached by making git throw WHILE enforced — a distinct branch from
    // CONSUMER_CITATION_MISSING, which is what my earlier test actually hit.
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await createOperatorContractGate(supabase, sd, 'C:/definitely/not/a/repo/xyz').validator({ sd });
    expect(res.passed).toBe(false);
    expect(res.issues).toContain('OPERATOR_CONTRACT_UNEVALUABLE');
    expect(res.details.fail_open).toBe(false);
    expect(res.details.repo_path).toBe('C:/definitely/not/a/repo/xyz');
  });

  it('and the CONSUMER_CITATION_MISSING branch too — the one the mislabelled test was hitting', async () => {
    process.env.ENFORCE_CONSUMER_CITATION = '1';
    const res = await gate(ORPHAN).validator({ sd });
    expect(res.issues).toContain('CONSUMER_CITATION_MISSING');
    expect(res.details.repo_path).toBe('C:/named/tree');
  });
});
