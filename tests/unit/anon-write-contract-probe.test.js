/**
 * Standing unit tier for the anon write-contract probe. SD-LEO-INFRA-DEAD-VENTURE-USER-001.
 *
 * NO DATABASE. That is deliberate and load-bearing: the vitest `db` project on this repo currently
 * has an empty DESIGNATED_NON_PROD_REFS, so assessDbTarget returns {allowed:false} and every test
 * placed there SKIPS — and a skip reports green. A live-tier test would be permanently, silently
 * inert. Everything that can be proven without a connection is proven here instead, and CI invokes
 * the probe binary directly so its exit code is the gate.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  EXPECTED, EXIT, compare, discoverAsymmetricTables,
  isAlwaysFalse, isAlwaysTrue, assertNotCommitFamily, classifyError, assertRlsInForce
} from '../../scripts/anon-write-contract-probe.mjs';

const REPO = join(import.meta.dirname, '..', '..');
const PROBE = join(REPO, 'scripts', 'anon-write-contract-probe.mjs');

/**
 * Strip comments before asserting on source. Found the hard way: the first draft of the two
 * assertions below matched the PROSE THAT NARRATES THE CODE — a file whose comment says "no
 * continue-on-error here" failed a /continue-on-error/ check, and the FR-4 fix failed its own
 * "never sends user_general" check because the comment explaining the fix names the old value.
 * A source assertion that cannot tell code from the commentary about code reports on the wrong text.
 */
const codeOf = (path, style = 'js') => readFileSync(path, 'utf8').split('\n')
  .filter((l) => (style === 'yaml' ? !/^\s*#/.test(l) : !/^\s*(\/\/|\*|\/\*)/.test(l)))
  .join('\n');

describe('EXPECTED / compare — the standing mutation harness (TS-8)', () => {
  // A mutation harness that cannot prove it mutated is hollow: a deep-clone that silently failed to
  // change anything passes vacuously and reports the suite as protective.
  it('baseline: an unmutated observation matches — the positive control', () => {
    expect(compare({ ...EXPECTED })).toEqual({ ok: true, differingForm: null, differingForms: [] });
  });

  for (const key of Object.keys(EXPECTED)) {
    it(`mutating ${key} reddens compare(), and the mutation provably landed`, () => {
      const mutant = { ...EXPECTED, [key]: EXPECTED[key] === 'LANDS' ? 'REFUSED' : 'LANDS' };
      const differingKeys = Object.keys(EXPECTED).filter((k) => mutant[k] !== EXPECTED[k]);
      expect(differingKeys).toEqual([key]);          // proof the mutation landed, in exactly one key

      const r = compare(mutant);
      expect(r.ok).toBe(false);
      expect(r.differingForm).toBe(key);             // also pins FR-6: the failure names the form
    });
  }

  it('mutating the OBSERVATION side is caught too, not just the expectation side', () => {
    const observed = { ...EXPECTED, returning_columns: 'LANDS' };
    expect(compare(observed, EXPECTED).differingForm).toBe('returning_columns');
  });

  it('an observation missing a form is a failure, not a pass', () => {
    const { positive_control, ...partial } = EXPECTED;
    expect(compare(partial).ok).toBe(false);
    expect(compare(partial).differingForms).toContain('positive_control');
  });

  // Both upsert forms are refused, and it is worth pinning WHY they are listed separately: they are
  // refused by DIFFERENT policies, established by control on the live database, not by argument.
  //   --control-grant-select  flips returning_columns + on_conflict_do_nothing, leaves DO UPDATE refused
  //   --control-grant-update  additionally flips on_conflict_do_update
  // The cell that stays refused under the first control is what proves the flip is a policy change
  // and not RLS quietly switching off — the simultaneous negative FR-2 requires, supplied by data.
  // THE MUTATION HARNESS ABOVE CANNOT CATCH A WRONG `EXPECTED`: it mutates relative to EXPECTED, so
  // flipping EXPECTED itself moves both sides and every relative test still passes. This literal pin
  // is what bites, and the live probe in CI is what would have caught the value being wrong in the
  // first place — which is exactly how on_conflict_do_nothing got corrected.
  it('pins every contract value literally — the one assertion a self-relative harness cannot make', () => {
    expect(EXPECTED).toEqual({
      bare_insert: 'LANDS',
      returning_columns: 'REFUSED',
      returning_literal: 'LANDS',
      on_conflict_do_update: 'REFUSED',
      on_conflict_do_nothing: 'REFUSED',
      positive_control: 'LANDS'
    });
  });

  it('the two upsert forms are distinct keys, so a control can flip one without the other', () => {
    expect(Object.keys(EXPECTED)).toEqual(expect.arrayContaining(['on_conflict_do_nothing', 'on_conflict_do_update']));
    const onlyDoNothingFlipped = { ...EXPECTED, on_conflict_do_nothing: 'LANDS' };
    expect(compare(onlyDoNothingFlipped).differingForms).toEqual(['on_conflict_do_nothing']);
  });
});

describe('discoverAsymmetricTables (TS-7) — over-reporting is as bad as under-reporting', () => {
  const p = (tablename, cmd, o = {}) => ({
    schemaname: 'public', tablename, cmd, roles: '{anon}', permissive: 'PERMISSIVE',
    qual: null, with_check: null, relrowsecurity: true, ...o
  });

  // Mirrors the live shape measured during PLAN.
  const LIVE = [
    p('feedback', 'INSERT', { with_check: "(feedback_type ~~ 'user_%'::text)" }),
    p('feedback', 'INSERT', { with_check: '(count_ok)', permissive: 'RESTRICTIVE' }),
    p('feedback', 'SELECT', { qual: "(source_type = 'telegram'::text)" }),
    p('marketing_attribution', 'INSERT', { with_check: '(true)' }),
    p('protocol_improvement_queue', 'INSERT', { with_check: 'false' }),
    p('protocol_improvement_queue', 'SELECT', { qual: 'false' }),
    p('security_audit_events', 'INSERT', { with_check: 'false' }),
    p('security_audit_events', 'SELECT', { qual: 'false' })
  ];

  it('deep-equals the sorted instance list — a `contains` assertion could never catch over-reporting', () => {
    expect(discoverAsymmetricTables(LIVE)).toEqual(['public.feedback', 'public.marketing_attribution']);
  });

  it('a TO PUBLIC unconditional SELECT counts as coverage (228 live policies are TO PUBLIC)', () => {
    const rows = [p('t', 'INSERT', { with_check: '(true)' }), p('t', 'SELECT', { roles: '{public}', qual: 'true' })];
    expect(discoverAsymmetricTables(rows)).toEqual([]);
  });

  it('a RESTRICTIVE SELECT policy never grants coverage', () => {
    const rows = [p('t', 'INSERT', { with_check: '(true)' }), p('t', 'SELECT', { qual: 'true', permissive: 'RESTRICTIVE' })];
    expect(discoverAsymmetricTables(rows)).toEqual(['public.t']);
  });

  it('relrowsecurity=false is not an instance — there is no policy to gap', () => {
    expect(discoverAsymmetricTables([p('t', 'INSERT', { with_check: '(true)', relrowsecurity: false })])).toEqual([]);
  });

  it.each(['false', '(1=0)', '(NULL)'])('an INSERT with_check of %s means anon cannot insert at all', (spelling) => {
    expect(discoverAsymmetricTables([p('t', 'INSERT', { with_check: spelling })])).toEqual([]);
  });

  it('a table added AFTER authoring time is discovered — discovery is not a disguised hardcoded list', () => {
    const rows = [...LIVE, p('some_table_that_did_not_exist_yet', 'INSERT', { with_check: '(true)' })];
    expect(discoverAsymmetricTables(rows)).toEqual([
      'public.feedback', 'public.marketing_attribution', 'public.some_table_that_did_not_exist_yet'
    ]);
  });

  it('a policy TO service_role only is not anon-reachable', () => {
    expect(discoverAsymmetricTables([p('t', 'INSERT', { with_check: '(true)', roles: '{service_role}' })])).toEqual([]);
  });

  it('isAlwaysFalse/isAlwaysTrue handle the spellings that defeat string matching', () => {
    for (const f of ['false', '(false)', ' 1=0 ', '(1 = 0)', 'NULL']) expect(isAlwaysFalse(f)).toBe(true);
    for (const t of ['true', '(true)', '(1 = 1)']) expect(isAlwaysTrue(t)).toBe(true);
    expect(isAlwaysFalse("(source_type = 'telegram')")).toBe(false);
    expect(isAlwaysTrue("(source_type = 'telegram')")).toBe(false);
  });
});

describe('safety: COMMIT is never issued (TS-4)', () => {
  it.each(['COMMIT', 'commit;', '  End ', 'PREPARE TRANSACTION \'x\'', 'release savepoint sp'])(
    'the runtime guard throws on %s — a guard the caller cannot satisfy without changing the harm',
    (sql) => { expect(() => assertNotCommitFamily(sql)).toThrow(/COMMIT_FAMILY_STATEMENT_BLOCKED/); }
  );

  it('ordinary statements pass through unchanged', () => {
    for (const sql of ['BEGIN', 'ROLLBACK', 'SAVEPOINT sp', 'select 1', 'insert into t values (1)']) {
      expect(assertNotCommitFamily(sql)).toBe(sql);
    }
  });

  it('SECONDARY pin only: no literal COMMIT in the source. Theatre against autocommit — the runtime guard above is the real one', () => {
    const src = readFileSync(PROBE, 'utf8');
    const executable = src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    expect(executable).not.toMatch(/\bq\(\s*['"`]\s*commit/i);
  });

  it('the probe asserts it is really inside a transaction — autocommit is the un-greppable commit', () => {
    expect(readFileSync(PROBE, 'utf8')).toMatch(/NOT_IN_TRANSACTION/);
  });
});

describe('RLS-in-force guard (TS-5) — the cannot-fail case', () => {
  const base = { usr: 'anon', bypass: false, rowsec: 'on', active: true, relrls: true, pid: 42, port: 5432 };
  const q = (over) => async () => ({ rows: [{ ...base, ...over }] });

  it('passes only when all five conditions hold', async () => {
    expect((await assertRlsInForce(q({}), 'public.feedback', 42)).ok).toBe(true);
  });

  // Each failure asserted SEPARATELY: a single combined case cannot prove each guard fires on its own.
  it.each([
    ['current_user is not anon',        { usr: 'postgres' }, /current_user=postgres/],
    ['the role can BYPASSRLS',          { bypass: true },    /rolbypassrls=true/],
    ['row_security is off',             { rowsec: 'off' },   /row_security=off/],
    ['row_security_active is false',    { active: false },   /row_security_active=false/],
    ['relrowsecurity is false',         { relrls: false },   /relrowsecurity=false/],
    ['the pooler moved us to a new backend', { pid: 99 },    /backend_pid 42->99/]
  ])('fails when %s', async (_label, over, re) => {
    const r = await assertRlsInForce(q(over), 'public.feedback', 42);
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(re);
  });

  it('BYPASSRLS with rolsuper=false is caught — the live shape of this connection, where an is_superuser check reads clean', async () => {
    const r = await assertRlsInForce(q({ usr: 'anon', bypass: true, active: false }), 'public.feedback', 42);
    expect(r.ok).toBe(false);
    expect(r.problems).toContain('rolbypassrls=true');
    expect(r.problems).toContain('row_security_active=false');
  });
});

describe('error classification (TS-6) — a pre-RLS rejection is not a contract verdict', () => {
  it.each([
    ['23502', 'MALFORMED'], ['23514', 'MALFORMED'], ['23505', 'MALFORMED'], ['23503', 'MALFORMED'],
    ['42501', 'REFUSED'], ['08006', 'ERROR']
  ])('%s classifies as %s', (code, verdict) => { expect(classifyError({ code })).toBe(verdict); });

  it('no error means the write landed', () => { expect(classifyError(null)).toBe('LANDS'); });

  it('the probe row carries every NOT NULL column — the defect this SD also repairs, not re-commits', () => {
    const src = readFileSync(PROBE, 'utf8');
    for (const col of ['source_application', 'source_type', 'title', 'type', 'venture_id']) {
      expect(src).toMatch(new RegExp(`\\b${col}\\b`));
    }
    expect(src).toMatch(/venture_exists_and_active/);
    expect(src).toMatch(/check_feedback_rate_limit/);
  });
});

describe('exit codes (TS-13) — a caller that cannot tell these apart treats inconclusive as a pass', () => {
  it('every outcome has a distinct code', () => {
    const codes = Object.values(EXIT);
    expect(new Set(codes).size).toBe(codes.length);
    expect(EXIT.OK).toBe(0);
    for (const [k, v] of Object.entries(EXIT)) if (k !== 'OK') expect(v).not.toBe(0);
  });
});

describe('workflow path filters (TS-11) — repo-wide, so it also stops the NEXT dead workflow', () => {
  const dir = join(REPO, '.github', 'workflows');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : [];
  const filtersOf = (src) => {
    const out = [];
    let inBlock = false;
    for (const line of src.split('\n')) {
      if (/^\s*paths(-ignore)?\s*:/.test(line)) { inBlock = true; continue; }
      if (inBlock) {
        const m = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/);
        if (m) out.push(m[1].trim()); else if (line.trim() !== '') inBlock = false;
      }
    }
    return out;
  };

  it('found workflows to check — a zero-file sweep would pass vacuously', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('no path filter uses brace alternation: Actions does NOT expand braces, and four workflows in this repo have effectively never fired because of it', () => {
    const offenders = [];
    for (const f of files) {
      for (const filter of filtersOf(readFileSync(join(dir, f), 'utf8'))) {
        if (/\{[^}]*,[^}]*\}/.test(filter)) offenders.push(`${f}: ${filter}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("this SD's own workflow filter matches at least one file that exists today — a filter matching zero files is dead on arrival", () => {
    const wf = join(dir, 'anon-write-contract-probe.yml');
    expect(existsSync(wf)).toBe(true);
    // Union of tracked and on-disk. `git ls-files` alone would fail for a file added in the same
    // commit that adds the workflow — which is precisely this commit, and precisely the case where
    // the check most needs to work.
    const tracked = execSync('git ls-files', { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n').map((s) => s.trim()).filter(Boolean);
    const filters = filtersOf(readFileSync(wf, 'utf8'));
    expect(filters.length).toBeGreaterThan(0);
    for (const filter of filters) {
      const re = new RegExp('^' + filter.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*/g, '[^/]*') + '$');
      const matches = tracked.some((t) => re.test(t)) || existsSync(join(REPO, filter));
      expect(matches, `filter "${filter}" matches no file that exists today`).toBe(true);
    }
  });

  it('the probe step cannot be silently skipped: no continue-on-error, no job-level if:', () => {
    const code = codeOf(join(dir, 'anon-write-contract-probe.yml'), 'yaml');
    expect(code).not.toMatch(/continue-on-error/);
    expect(code).not.toMatch(/^\s{4}if\s*:/m);
    expect(code).toMatch(/node scripts\/anon-write-contract-probe\.mjs/);
  });
});

describe('the G2 acceptance battery is reachable (TS-9, FR-4)', () => {
  const g2 = join(REPO, 'database', 'chairman-gated', '20260803_bound_anon_ingress_source_type_qualifier_acceptance.mjs');

  it('no longer sends a feedback_type outside the live CHECK', () => {
    const code = codeOf(g2);
    expect(code).not.toMatch(/user_general/);
    expect(code).toMatch(/feedback_type:\s*'user_bug'/);
  });

  it('names the constraint at the change site, so the next editor knows what constrains the value', () => {
    expect(readFileSync(g2, 'utf8')).toMatch(/feedback_feedback_type_check/);
  });
});
