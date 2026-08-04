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
  isAlwaysFalse, isAlwaysTrue, assertNotCommitFamily, assertQualifiedName,
  classifyError, assertRlsInForce, attributeRefusal, runForms, ROW_BUILDERS
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

  /**
   * THE LIMIT OF THIS TIER, stated rather than papered over. Every test above drives
   * assertRlsInForce through a MOCKED `q`, so it verifies the JS branching and is structurally
   * blind to the SQL those branches judge: EXEC review replaced `row_security_active($1::regclass)`
   * with a literal `true` and the whole suite stayed green. A mock cannot protect the query it
   * stands in for.
   *
   * So this is a source pin — the weaker instrument, used knowingly. It catches the primitive being
   * deleted or replaced, which is the realistic edit. It cannot catch the predicate being subtly
   * wrong; only the live probe can, which is why CI invokes the binary directly.
   */
  it('SOURCE PIN: the guard query actually asks all five questions — a mocked test cannot check this', () => {
    const code = codeOf(PROBE);
    // Pin the CALL FORMS, not the bare identifiers. The first spelling of this test used bare names
    // and stayed green through the mutation, because `problems.push(\`row_security_active=...\`)`
    // contains the identifier too — the assertion was satisfied by the message that REPORTS the
    // guard rather than the query that IS it. A value read only by a log line looks exactly like a
    // guard, and so does a test that only greps for its name.
    for (const predicate of [
      'row_security_active($1::regclass)',   // false under owner, BYPASSRLS, and RLS-disabled alike
      'select rolbypassrls from pg_roles',
      "current_setting('row_security')",
      'relrowsecurity from pg_class',
      'pg_backend_pid()'
    ]) {
      expect(code, `guard predicate "${predicate}" is gone from the probe's SQL`).toContain(predicate);
    }
    // And the results must be CONSUMED, not merely selected — a value read only by a log line looks
    // exactly like a guard.
    expect(code).toMatch(/problems\.push\(`rolbypassrls=/);
    expect(code).toMatch(/problems\.push\(`row_security_active=/);
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
  // Parses BOTH YAML sequence styles. The block-only version passed vacuously on any workflow
  // written as `paths: ['a','b']` — it found zero filters and reported clean, which is the same
  // shape of hole the brace-alternation bug is: a check that silently matches nothing.
  const filtersOf = (src) => {
    const out = [];
    let inBlock = false;
    for (const line of src.split('\n')) {
      const flow = line.match(/^\s*paths(-ignore)?\s*:\s*\[(.+)\]\s*$/);
      if (flow) { out.push(...flow[2].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''))); inBlock = false; continue; }
      if (/^\s*paths(-ignore)?\s*:\s*$/.test(line)) { inBlock = true; continue; }
      if (inBlock) {
        const m = line.match(/^\s*-\s*['"]?([^'"#]+?)['"]?\s*$/);
        if (m) out.push(m[1].trim()); else if (line.trim() !== '') inBlock = false;
      }
    }
    return out;
  };

  it('the filter parser sees flow sequences too — a parser that finds nothing passes everything', () => {
    expect(filtersOf("on:\n  push:\n    paths: ['scripts/a.mjs', 'scripts/b.mjs']\n")).toEqual(['scripts/a.mjs', 'scripts/b.mjs']);
    expect(filtersOf("on:\n  push:\n    paths:\n      - 'scripts/a.mjs'\n")).toEqual(['scripts/a.mjs']);
    expect(filtersOf("on:\n  push:\n    paths: ['scripts/**/*.{js,mjs}']\n")[0]).toMatch(/\{/);
  });

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

/**
 * Everything below closes a hole EXEC review PROVED by mutation: 11 of 27 mutations to the shipped
 * probe survived the original suite, including replacing row_security_active() with a literal
 * `true` — the primitive this file's own header calls the strongest. The common cause was import
 * surface: attributeRefusal, runForms, attempt and parseArgs had ZERO executing tests, so any
 * mutation inside them was invisible. A suite that imports nine symbols cannot protect fourteen.
 */
describe('runForms — the guard must ABORT, not merely observe', () => {
  const builder = ROW_BUILDERS['public.feedback'];
  const mkQ = (opts = {}) => {
    const issued = [];
    const q = async (sql) => {
      issued.push(sql);
      if (/current_user::text/.test(sql)) {
        return { rows: [{ usr: opts.usr ?? 'anon', bypass: false, rowsec: 'on', active: opts.active ?? true, relrls: true, pid: 7, port: 5432 }] };
      }
      if (/has_table_privilege/.test(sql)) return { rows: [{ ok: true }] };
      if (/^\s*(SAVEPOINT|ROLLBACK TO)/i.test(sql)) return { rows: [] };
      if (opts.refuse && /insert into/i.test(sql)) { const e = new Error('denied'); e.code = '42501'; throw e; }
      return { rows: [] };
    };
    return { q, issued };
  };
  const ctxArgs = { builder, ctx: 'v1', subjectSource: 'manual_feedback', controlSource: 'telegram', uuid: () => 'id-1', basePid: 7 };

  it('aborts on the FIRST form when RLS is not in force, and records no verdicts', async () => {
    const { q, issued } = mkQ({ active: false });
    const res = await runForms(q, 'public.feedback', ctxArgs);
    expect(res.aborted).toBe('bare_insert');
    expect(res.observed).toEqual({});
    // The real assertion: it must never have issued the write. Merely *noticing* the guard failed
    // and continuing anyway would still produce a full, entirely meaningless verdict set.
    expect(issued.some((s) => /insert into/i.test(s))).toBe(false);
  });

  it('undoes every form it runs — including the ones that SUCCEED', async () => {
    const { q, issued } = mkQ();
    await runForms(q, 'public.feedback', ctxArgs);
    const savepoints = issued.filter((s) => /^SAVEPOINT/i.test(s)).length;
    const rollbacks = issued.filter((s) => /^ROLLBACK TO SAVEPOINT/i.test(s)).length;
    expect(savepoints).toBeGreaterThan(0);
    // One rollback per savepoint. Leaving a success in place couples the forms: on the live table
    // each landed insert pushes the venture toward its rate limit and changes what the NEXT form is
    // judged under. That produced a false REFUSED on the first live run.
    expect(rollbacks).toBe(savepoints);
  });

  it('re-checks the guard before EVERY form, not once at the top', async () => {
    const { q } = mkQ();
    const res = await runForms(q, 'public.feedback', ctxArgs);
    expect(res.guards.length).toBe(Object.keys(EXPECTED).length);
  });

  it('when every insert is denied, DO UPDATE reports MALFORMED — not REFUSED — because its seed never landed', async () => {
    const { q } = mkQ({ refuse: true });
    const res = await runForms(q, 'public.feedback', ctxArgs);
    for (const form of ['bare_insert', 'returning_columns', 'returning_literal', 'on_conflict_do_nothing', 'positive_control']) {
      expect(res.observed[form]).toBe('REFUSED');
    }
    // This is the vacuity guard, and it is the whole reason the cell is built the way it is. DO
    // UPDATE only evaluates the conflict-row check when a conflict ACTUALLY occurs; with no seeded
    // row nothing collides, so a "REFUSED" here would be a verdict about an ordinary insert wearing
    // an upsert's name. Reporting MALFORMED is the honest answer.
    expect(res.observed.on_conflict_do_update).toBe('MALFORMED');
    expect(res.attributions.on_conflict_do_update).toMatch(/conflict never forced/);
  });
});

describe('attributeRefusal (FR-2b, TS-10) — 42501 alone is not a verdict', () => {
  const q = (granted) => async (sql) => (/has_table_privilege/.test(sql) ? { rows: [{ ok: granted }] } : { rows: [] });

  it('a GRANT-derived and a policy-derived 42501 produce DIFFERENT causes', async () => {
    const grantDenied = await attributeRefusal(q(false), 'public.feedback', 'bare_insert', { code: '42501' });
    const policyDenied = await attributeRefusal(q(true), 'public.feedback', 'bare_insert', { code: '42501' });
    expect(grantDenied).toMatch(/^GRANT_DENIED/);
    expect(policyDenied).toMatch(/^POLICY_DENIED/);
    expect(grantDenied).not.toBe(policyDenied);
  });

  it('the two upsert forms are attributed to DIFFERENT policies — conflating them teaches a false mechanism', async () => {
    const doNothing = await attributeRefusal(q(true), 'public.feedback', 'on_conflict_do_nothing', { code: '42501' });
    const doUpdate = await attributeRefusal(q(true), 'public.feedback', 'on_conflict_do_update', { code: '42501' });
    const returning = await attributeRefusal(q(true), 'public.feedback', 'returning_columns', { code: '42501' });
    expect(doNothing).toMatch(/select_policy/);      // flips under --control-grant-select
    expect(returning).toMatch(/select_policy/);      // flips under --control-grant-select
    expect(doUpdate).toMatch(/update_policy/);       // needs --control-grant-update
    expect(new Set([doNothing, doUpdate, returning]).size).toBe(3);
  });

  it('is silent for a non-42501 error rather than guessing', async () => {
    expect(await attributeRefusal(q(true), 'public.feedback', 'bare_insert', { code: '23502' })).toBeNull();
  });

  it('reports UNATTRIBUTED rather than guessing when the privilege query itself fails', async () => {
    const boom = async () => { throw new Error('25P02'); };
    expect(await attributeRefusal(boom, 'public.feedback', 'bare_insert', { code: '42501' })).toBe('UNATTRIBUTED');
  });
});

describe('table-name validation — the guard is worthless if the name can smuggle a statement', () => {
  it.each(['public.feedback', 'public.marketing_attribution'])('accepts %s', (n) => {
    expect(assertQualifiedName(n)).toBe(n);
  });

  it.each([
    'feedback; commit; --',
    'public.feedback; commit; --',
    'public.feedback"',
    'public.f oo',
    'feedback',            // unqualified — reaches CREATE POLICY without a schema
    ''
  ])('rejects %s', (n) => { expect(() => assertQualifiedName(n)).toThrow(/UNSAFE_TABLE_NAME/); });
});

describe('the commit guard must see EVERY statement, not the first', () => {
  // node-postgres sends a param-less query over the SIMPLE protocol, which executes
  // semicolon-separated statements. The original guard anchored ^ with no /m and so inspected only
  // the head of the string — `select 1; commit` committed while the guard returned clean.
  it.each([
    'select 1; commit',
    'SAVEPOINT sp; COMMIT;',
    'create policy p on t for select to anon using (true); commit; --',
    'select 1;\ncommit'
  ])('blocks a COMMIT hiding after the first statement: %s', (sql) => {
    expect(() => assertNotCommitFamily(sql)).toThrow(/COMMIT_FAMILY_STATEMENT_BLOCKED/);
  });

  it('still allows a legitimate multi-statement string with no commit', () => {
    expect(() => assertNotCommitFamily('select 1; select 2')).not.toThrow();
  });
});

describe('row builders — the probe only claims what it can actually construct', () => {
  it('the feedback builder supplies every NOT NULL column plus the policy-required venture_id', () => {
    const b = ROW_BUILDERS['public.feedback'];
    const row = b.build('id-1', 'venture-1', 'manual_feedback');
    expect(row.length).toBe(b.cols.split(',').length);
    expect(b.cols).toMatch(/source_application/);
    expect(b.cols).toMatch(/\btype\b/);
    expect(row).toContain('issue');       // `type` CHECK admits only issue|enhancement
    expect(row).toContain('user_bug');    // feedback_type CHECK, and LIKE 'user_%' for the policy
    expect(b.preflight).toMatch(/venture_exists_and_active/);
    expect(b.preflight).toMatch(/check_feedback_rate_limit/);
  });

  it('a table with no builder is UNPROBED, never silently treated as passing', () => {
    expect(ROW_BUILDERS['public.agents']).toBeUndefined();
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
