#!/usr/bin/env node
/**
 * Anon write-contract probe — a standing assertion about what the anon role can and cannot
 * write to tables whose RLS grants INSERT more broadly than SELECT.
 * SD-LEO-INFRA-DEAD-VENTURE-USER-001.
 *
 * WHAT THIS EXISTS FOR. `public.feedback` accepts a bare anon INSERT, but refuses
 * `INSERT ... RETURNING <target columns>` and `INSERT ... ON CONFLICT DO UPDATE`, both with 42501.
 * The two refusals have DIFFERENT causes and conflating them teaches a false mechanism:
 *   - RETURNING is subject to the SELECT policy, and anon's only SELECT policy here is telegram-only.
 *   - ON CONFLICT DO UPDATE applies the UPDATE USING clause to the conflicting row as a
 *     WithCheckOption, and anon has NO update policy at all (only service_role does). anon DOES hold
 *     the UPDATE grant, so it is a policy denial, not an ACL denial.
 *   - ON CONFLICT DO NOTHING is ALSO refused, by the SELECT policy on the arbiter check — measured
 *     with a fresh id, so no collision ever occurs. The clause alone is sufficient. This file
 *     originally asserted it LANDS, reasoning from the docs; the first live run said otherwise.
 * No live caller is broken today: all five (in apexniche-ai, marketlens and ehg) send the bare form.
 * This is regression prevention, not an outage repair — and the enforcement had to live HERE, at the
 * database, because zero of those five callers live in this repo, so a source lint would see none.
 *
 * WHY IT IS SAFE TO RUN AGAINST PRODUCTION, which is the only database there is: the guarantee is
 * COMMIT-NEVER-ISSUED, not ROLLBACK-in-finally. `query()` throws on any commit-family statement, and
 * no COMMIT appears in this file. That framing matters — it means a connection drop, a throw inside a
 * catch, and an early return before the finally block are ALL already safe. The finally-ROLLBACK is
 * hygiene; stating it as the invariant would misplace where the safety actually comes from.
 *
 * THE FAILURE THIS FILE IS MOST GUARDED AGAINST is reporting a passing contract while testing
 * nothing. If `SET LOCAL ROLE anon` fails to take effect, RLS is bypassed and every form LANDS. That
 * is live here, not hypothetical: the connecting role is rolbypassrls=true AND rolsuper=false, so the
 * obvious `is_superuser` guard reads clean while RLS is fully bypassed. Hence assertRlsInForce(),
 * which leads with row_security_active() — false under owner, under BYPASSRLS, and under
 * RLS-disabled alike — and runs before EVERY form rather than once at the top, because a
 * transaction-mode pooler can land statements on different backends.
 *
 * Usage:
 *   node scripts/anon-write-contract-probe.mjs                       # discover the class, probe each
 *   node scripts/anon-write-contract-probe.mjs --table public.feedback
 *   node scripts/anon-write-contract-probe.mjs --table public.feedback --control-grant-select
 *   node scripts/anon-write-contract-probe.mjs --table public.feedback --control-grant-update
 */

import { createDatabaseClient } from './lib/supabase-connection.js';

/** Distinct exit codes: a caller that cannot tell these apart treats inconclusive as a pass. */
export const EXIT = {
  OK: 0,
  ERROR: 1,
  CONTRACT_CHANGED: 2,
  PROBE_MALFORMED: 3,
  PROBE_INCONCLUSIVE: 4,
  RLS_NOT_IN_FORCE: 5
};

/**
 * The contract. LITERAL constants, deliberately never read from the database — a probe that derives
 * its expectations from what it observes degrades into asserting whatever it last saw, which can
 * never fail. If a sibling SD narrows anon INSERT, this probe SHOULD redden; that is the coupling.
 */
export const EXPECTED = Object.freeze({
  bare_insert: 'LANDS',
  returning_columns: 'REFUSED',
  returning_literal: 'LANDS',
  on_conflict_do_update: 'REFUSED',
  // MEASURED, against the expectation this file originally shipped with. Reasoning from the docs
  // said DO NOTHING needs no policy and would LAND; the first live run said REFUSED, with a FRESH
  // id, so no collision ever occurred. The clause alone is sufficient. Recorded as measured rather
  // than corrected-in-silence because the wrong value is the more intuitive one.
  on_conflict_do_nothing: 'REFUSED',
  positive_control: 'LANDS'
});

/** Pure. Returns the first differing form so a CI failure names what changed. */
export function compare(observed, expected = EXPECTED) {
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(observed || {})])].sort();
  const differingForms = keys.filter((k) => (observed || {})[k] !== expected[k]);
  return { ok: differingForms.length === 0, differingForm: differingForms[0] ?? null, differingForms };
}

const normalizeQual = (q) => String(q ?? '').replace(/[\s()]/g, '').toLowerCase();
/** `false` has several spellings and string-matching only one of them is how a guard goes quiet. */
export function isAlwaysFalse(qual) {
  return ['false', '1=0', 'null'].includes(normalizeQual(qual));
}
export function isAlwaysTrue(qual) {
  return ['true', '1=1'].includes(normalizeQual(qual));
}
const rolesOf = (r) => (Array.isArray(r) ? r : String(r ?? '').replace(/[{}"]/g, '').split(',')).map((s) => String(s).trim());
/** anon inherits PUBLIC. 228 policies on this database are TO PUBLIC — a roles @> '{anon}' filter
 *  cannot see any of them, and would report a fully-covered table as an instance. */
const anonReachable = (r) => { const x = rolesOf(r); return x.includes('anon') || x.includes('public'); };
const isPermissive = (p) => String(p ?? 'PERMISSIVE').toUpperCase() === 'PERMISSIVE';

/**
 * Pure. Given pg_policies rows (joined with pg_class.relrowsecurity), return the tables in the
 * defect class, sorted.
 *
 * A table is an instance when anon can actually INSERT and has NO unconditional SELECT coverage.
 * Exact row-level coverage is statically undecidable — `USING (source_type = 'telegram')` covers
 * some inserted rows and not others — so the rule is deliberately asymmetric: strict on the SELECT
 * side (only an unconditional permissive SELECT policy counts as full coverage, because a
 * conditional one MAY leave a gap) and conservative on the INSERT side (a with_check of false means
 * anon cannot insert at all, so there is no trap). That second half is what correctly excludes the
 * symmetric anon-deny tables, which would otherwise be reported for having a `false` SELECT policy.
 *
 * RESTRICTIVE policies never GRANT anything, so they cannot supply coverage — and `feedback` carries
 * a RESTRICTIVE anon INSERT policy, so counting them would get this table wrong in both directions.
 */
export function discoverAsymmetricTables(policyRows = []) {
  const tables = new Map();
  for (const r of policyRows) {
    const key = `${r.schemaname}.${r.tablename}`;
    if (!tables.has(key)) tables.set(key, { key, rls: true, canInsert: false, fullSelect: false });
    const t = tables.get(key);
    if (r.relrowsecurity === false) t.rls = false;
    if (!anonReachable(r.roles) || !isPermissive(r.permissive)) continue;
    const cmd = String(r.cmd ?? '').toUpperCase();
    if ((cmd === 'INSERT' || cmd === 'ALL') && !isAlwaysFalse(r.with_check)) t.canInsert = true;
    if ((cmd === 'SELECT' || cmd === 'ALL') && isAlwaysTrue(r.qual)) t.fullSelect = true;
  }
  return [...tables.values()].filter((t) => t.rls && t.canInsert && !t.fullSelect).map((t) => t.key).sort();
}

/**
 * A guard the caller cannot satisfy without changing the harm.
 *
 * IT MUST INSPECT EVERY STATEMENT, NOT THE FIRST. The original spelling anchored `^` with no `m`
 * flag and so read only the head of the string — and node-postgres sends a param-less query over
 * the SIMPLE protocol, which executes semicolon-separated statements. `select 1; commit` therefore
 * committed while the guard returned clean. Measured, not theorised: EXEC review reproduced the
 * commit live. A guard that inspects a prefix of what it is guarding is narration, not enforcement.
 */
const COMMIT_FAMILY = /(^|;)\s*(commit|end|prepare\s+transaction|release\s+savepoint)\b/i;
export function assertNotCommitFamily(sql) {
  const text = String(sql);
  if (COMMIT_FAMILY.test(text)) throw new Error(`COMMIT_FAMILY_STATEMENT_BLOCKED: ${text.slice(0, 80)}`);
  return sql;
}

/**
 * Every table name reaching this file is interpolated into SQL — `regclass` casts and CREATE POLICY
 * cannot take a bind parameter. Validate the shape rather than trusting the caller: `--table
 * 'feedback; commit; --'` would otherwise smuggle a COMMIT past even a corrected guard by splitting
 * it across a comment. The operator already holds the DB password, so this is not privilege
 * escalation — it is the difference between safe by construction, which is what this file claims,
 * and safe because nobody typed that.
 */
const QUALIFIED_NAME = /^[a-z_][a-z0-9_$]*\.[a-z_][a-z0-9_$]*$/i;
export function assertQualifiedName(name) {
  if (!QUALIFIED_NAME.test(String(name ?? ''))) throw new Error(`UNSAFE_TABLE_NAME: ${name}`);
  return name;
}

/** Five independent ways RLS can be silently inert. Any one of them makes every verdict a lie. */
export async function assertRlsInForce(q, table, basePid) {
  const { rows: [r] } = await q(
    `select current_user::text                                              as usr,
            (select rolbypassrls from pg_roles where rolname = current_user) as bypass,
            current_setting('row_security')                                  as rowsec,
            row_security_active($1::regclass)                                as active,
            (select relrowsecurity from pg_class where oid = $1::regclass)   as relrls,
            pg_backend_pid()                                                 as pid,
            inet_server_port()                                               as port`,
    [table]
  );
  const problems = [];
  // Every check below is spelled as "must be affirmatively OK", never "must not be the bad value".
  // `=== true` on bypass would fail OPEN if the subquery ever returned NULL — a guard whose unknown
  // case is indistinguishable from its safe case is not a guard.
  if (r.usr !== 'anon') problems.push(`current_user=${r.usr}`);
  if (r.bypass !== false) problems.push(`rolbypassrls=${r.bypass}`);
  if (r.rowsec !== 'on') problems.push(`row_security=${r.rowsec}`);
  if (r.active !== true) problems.push(`row_security_active=${r.active}`);
  if (r.relrls !== true) problems.push(`relrowsecurity=${r.relrls}`);
  if (basePid != null && r.pid !== basePid) problems.push(`backend_pid ${basePid}->${r.pid}`);
  return { ok: problems.length === 0, problems, pid: r.pid, port: r.port };
}

/** 42501 collapses at least five mechanisms onto one token; the whole LEAD investigation on this SD
 *  was misled by that collapse. Never let the bare code stand as the verdict's explanation. */
export async function attributeRefusal(q, table, form, err) {
  if (err?.code !== '42501') return null;
  const priv = form.startsWith('on_conflict') ? 'UPDATE' : form === 'bare_insert' ? 'INSERT' : 'SELECT';
  try {
    const { rows: [p] } = await q('select has_table_privilege(current_user, $1::regclass, $2) as ok', [table, priv]);
    if (p?.ok === false) return `GRANT_DENIED(${priv})`;
  } catch { return 'UNATTRIBUTED'; }
  switch (form) {
    case 'returning_columns':      return 'POLICY_DENIED(select_policy_on_returning_readback)';
    case 'on_conflict_do_update':  return 'POLICY_DENIED(absent_anon_update_policy_via_conflict_row_withcheckoption)';
    // MEASURED, and it corrected the expectation this probe shipped with: DO NOTHING is refused
    // even with a FRESH id, so no collision ever occurs — the clause alone is sufficient. The cause
    // is the SELECT policy, established by control rather than by argument: --control-grant-select
    // flips this form AND returning_columns while leaving on_conflict_do_update refused.
    case 'on_conflict_do_nothing': return 'POLICY_DENIED(select_policy_on_arbiter_check, planned regardless of collision)';
    case 'bare_insert':            return 'POLICY_DENIED(insert_with_check)';
    default:                       return 'UNATTRIBUTED';
  }
}

/** Pre-RLS rejections are NOT contract verdicts. The acceptance battery this SD also repairs was
 *  voided four times by exactly this, then committed the same defect at its own line 188. */
export function classifyError(err) {
  if (!err) return 'LANDS';
  if (err.code === '42501') return 'REFUSED';
  if (['23502', '23514', '23505', '23503'].includes(err.code)) return 'MALFORMED';
  return 'ERROR';
}

/**
 * Run one form and UNDO IT, whatever the outcome.
 *
 * The rollback-on-success half is not tidiness — it is what makes the forms independent, and its
 * absence produced a false REFUSED on the first live run. `venture_user_insert_feedback`'s WITH
 * CHECK calls check_feedback_rate_limit(venture_id), so every form that LANDS pushes the venture
 * closer to its limit and changes the conditions the NEXT form is judged under. Leaving successes in
 * place makes each verdict depend on how many earlier forms succeeded — a probe whose cells are
 * coupled, which is the same defect that confounded this SD's original 2x2 one layer up.
 */
async function attempt(q, name, sql, params) {
  const sp = `sp_${name}`;
  await q(`SAVEPOINT ${sp}`);
  try {
    await q(sql, params);
    await q(`ROLLBACK TO SAVEPOINT ${sp}`);
    return { verdict: 'LANDS' };
  } catch (err) {
    await q(`ROLLBACK TO SAVEPOINT ${sp}`);
    const verdict = classifyError(err);
    return { verdict, code: err.code, constraint: err.constraint ?? null, detail: err.message };
  }
}

/**
 * Row builders, per table.
 *
 * A probe row must satisfy every NOT NULL, every CHECK, and the insert policy's own WITH CHECK
 * before it reaches the SELECT-policy question this file exists to ask — otherwise it is rejected
 * pre-RLS and the verdict means nothing. That is not a hypothetical: it is the defect this SD also
 * repairs in the G2 acceptance battery, and the first draft of this probe committed it too.
 *
 * A builder is therefore per-table and hand-written. THIS IS THE HONEST LIMIT OF THE PROBE: it can
 * only assert the contract for tables it can construct a valid row for. Discovery (below) finds far
 * more candidates than there are builders, and every candidate without one is reported UNPROBED —
 * loudly — because an unprobed table silently omitted from the output reads exactly like a table
 * that passed.
 */
export const ROW_BUILDERS = {
  'public.feedback': {
    cols: '(id, venture_id, feedback_type, source_type, source_application, title, type)',
    vals: '($1, $2, $3, $4, $5, $6, $7)',
    // venture_user_insert_feedback additionally requires venture_id to be present and active and
    // the per-venture rate limit not to be tripped — both via SECURITY DEFINER functions, so both
    // genuinely bind for anon. `type` and `feedback_type` carry separate CHECK constraints.
    preflight: `select v.id from ventures v
                 where venture_exists_and_active(v.id)
                   and not check_feedback_rate_limit(v.id) limit 1`,
    build: (id, ctx, src) => [id, ctx, 'user_bug', src, 'anon-write-contract-probe', `probe ${id}`, 'issue']
  }
};

export async function runForms(q, table, { builder, ctx, subjectSource, controlSource, uuid, basePid }) {
  const COLS = builder.cols, VALS = builder.vals;
  const row = (id, c, src) => builder.build(id, c, src);
  const observed = {}, attributions = {}, guards = [];
  const check = async (label) => {
    const g = await assertRlsInForce(q, table, basePid);
    guards.push({ label, ...g });
    return g.ok;
  };
  const forms = [
    ['bare_insert',           `insert into ${table} ${COLS} values ${VALS}`,                                    () => row(uuid(), ctx, subjectSource)],
    ['returning_columns',     `insert into ${table} ${COLS} values ${VALS} returning id, title`,                 () => row(uuid(), ctx, subjectSource)],
    ['returning_literal',     `insert into ${table} ${COLS} values ${VALS} returning 1`,                         () => row(uuid(), ctx, subjectSource)],
    ['on_conflict_do_nothing',`insert into ${table} ${COLS} values ${VALS} on conflict (id) do nothing`,         () => row(uuid(), ctx, subjectSource)],
    ['positive_control',      `insert into ${table} ${COLS} values ${VALS} returning id`,                        () => row(uuid(), ctx, controlSource)]
  ];
  for (const [name, sql, mk] of forms) {
    if (!(await check(name))) return { observed, attributions, guards, aborted: name };
    const r = await attempt(q, name, sql, mk());
    observed[name] = r.verdict;
    if (r.code) attributions[name] = (await attributeRefusal(q, table, name, r)) ?? `${r.verdict}(${r.code}${r.constraint ? ' ' + r.constraint : ''})`;
  }
  // ON CONFLICT DO UPDATE only evaluates the conflict-row WithCheckOption when a conflict ACTUALLY
  // occurs. With a fresh uuid none fires and the statement is an ordinary insert — a vacuous cell.
  // So seed the id bare first, then collide with it.
  if (!(await check('on_conflict_do_update'))) return { observed, attributions, guards, aborted: 'on_conflict_do_update' };
  // The seed and the collision share ONE savepoint scope: the seed must still be visible when the
  // collision runs (a fresh uuid never conflicts, and DO UPDATE only evaluates the conflict-row
  // WithCheckOption when a conflict actually occurs), but the pair must still leave nothing behind.
  const seed = uuid();
  const sp = 'sp_occ';
  let pending = null;
  await q(`SAVEPOINT ${sp}`);
  try {
    await q(`insert into ${table} ${COLS} values ${VALS}`, row(seed, ctx, subjectSource));
    try {
      await q(`insert into ${table} ${COLS} values ${VALS} on conflict (id) do update set title = excluded.title`,
        row(seed, ctx, subjectSource));
      observed.on_conflict_do_update = 'LANDS';
    } catch (err) {
      // Attribution is deferred to AFTER the savepoint rollback below: once a statement errors, the
      // transaction is in an aborted state and every further query returns 25P02, so an attribution
      // query issued here silently degrades to UNATTRIBUTED for every refusal.
      observed.on_conflict_do_update = classifyError(err);
      pending = err;
    }
  } catch (seedErr) {
    // Not a contract verdict: without a landed seed no conflict is forced and the cell is vacuous.
    observed.on_conflict_do_update = 'MALFORMED';
    attributions.on_conflict_do_update = `seed row did not land (${seedErr.code}) — conflict never forced, cell vacuous`;
  } finally {
    await q(`ROLLBACK TO SAVEPOINT ${sp}`);
  }
  if (pending) {
    attributions.on_conflict_do_update = (await attributeRefusal(q, table, 'on_conflict_do_update', pending))
      ?? `${observed.on_conflict_do_update}(${pending.code}${pending.constraint ? ' ' + pending.constraint : ''})`;
  }
  return { observed, attributions, guards, aborted: null };
}

/**
 * FR-7. A RESTRICTIVE bound that cannot bind, asserted rather than argued.
 *
 * `anon_feedback_ingress_bounds` counts prior rows with an INLINE SUBQUERY, and an inline subquery
 * in a policy runs as the INSERTING role — so the count is itself subject to the telegram-only
 * SELECT policy. As anon the basis is n=1 for every non-telegram source and the limit is
 * arithmetically incapable of binding. SECURITY DEFINER is what that basis lacks.
 *
 * Do NOT confuse this with `check_feedback_rate_limit(venture_id)`, which the insert policy also
 * calls: that one IS SECURITY DEFINER and does bind. Conflating them files a bug against a control
 * that works — which is why the two bases are measured separately here and both are reported.
 *
 * The non-vacuity guard is the point: an empty table would make the two bases agree at zero and
 * pass this check for entirely the wrong reason.
 */
export async function assertIngressBoundCannotBind(q, table, source) {
  const { rows: [pol] } = await q(
    `select permissive, qual, with_check from pg_policies
      where schemaname = split_part($1,'.',1) and tablename = split_part($1,'.',2)
        and policyname = 'anon_feedback_ingress_bounds'`, [table]);
  if (!pol) return { applicable: false, note: 'anon_feedback_ingress_bounds is absent — the finding may already be remediated, or the policy renamed' };

  const countSql = `select count(*)::int as n from ${table} where source_type = $1 and created_at > now() - interval '1 hour'`;
  const { rows: [definer] } = await q(countSql, [source]);   // still the owner here
  await q('savepoint sp_bound');
  await q('set local role anon');
  const { rows: [asAnon] } = await q(countSql, [source]);
  await q('reset role');
  await q('rollback to savepoint sp_bound');

  // SD-LEO-INFRA-INGRESS-BOUND-DEFINER-BASIS-001: read the BASIS ITSELF, not only its symptom.
  //
  // The visibility gap below (definer.n > 1 && anon.n <= 1) is a SYMPTOM of the inline-subquery
  // basis — but the fix for that basis is a SECURITY DEFINER function, which deliberately does NOT
  // close the gap: anon's SELECT surface stays exactly as narrow as it is today (that narrowing is
  // owned by SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001 and widening it was explicitly ruled out).
  //
  // So a gap-only detector NEVER FLIPS. It would keep reporting this finding after the defect is
  // gone, and inverting its EXPECTED would produce a check that is wrong in BOTH states. Measured
  // here rather than assumed: with_check is already fetched above and was simply never examined.
  const withCheck = String(pol.with_check || '');
  const inlineBasis = /\bselect\b[\s\S]*\bcount\s*\(/i.test(withCheck);
  const definerFnBasis = /fn_anon_ingress_prior_hour_count\s*\(/i.test(withCheck);

  return {
    applicable: true,
    restrictive: String(pol.permissive).toUpperCase() === 'RESTRICTIVE',
    definerBasis: definer.n,
    anonBasis: asAnon.n,
    // Non-vacuity: without this, a source with no recent rows agrees at 0 and "passes".
    vacuous: definer.n <= 1,
    // The basis, read from the policy — this is what actually flips when the SD lands.
    inlineBasis,
    definerFnBasis,
    // cannotBind now requires the DEFECT (an inline counting subquery) to still be present, not
    // merely the visibility gap it exploits. Same verdict today; correctly GREEN once the basis
    // becomes a definer call, which is what makes the reddening a real acceptance signal.
    cannotBind: inlineBasis && definer.n > 1 && asAnon.n <= 1
  };
}

function parseArgs(argv) {
  const a = { table: null, grantSelect: false, grantUpdate: false, subjectSource: 'manual_feedback', controlSource: 'telegram' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--table') a.table = argv[++i];
    else if (argv[i] === '--control-grant-select') a.grantSelect = true;
    else if (argv[i] === '--control-grant-update') a.grantUpdate = true;
    else if (argv[i] === '--subject-source') a.subjectSource = argv[++i];
  }
  if (a.table && !a.table.includes('.')) a.table = `public.${a.table}`;
  if (a.table) assertQualifiedName(a.table);
  return a;
}

const POLICY_PREFIX = 'zz_probe_ctl_';

async function probeTable(client, q, table, args, uuid) {
  const control = args.grantSelect || args.grantUpdate;
  const builder = ROW_BUILDERS[table];
  if (!builder) return { code: EXIT.PROBE_INCONCLUSIVE, unprobed: true, reason: 'NO ROW BUILDER — this table is in the class but its contract was NOT asserted' };
  assertQualifiedName(table);
  await q('BEGIN');
  try {
    // Prove BEGIN actually opened a transaction. Autocommit is the un-greppable commit and the
    // realistic breach — a static grep for COMMIT cannot see it. In autocommit every statement is
    // its own transaction, so now() (transaction start) equals statement_timestamp(); inside a real
    // multi-statement transaction the second statement onward makes them diverge.
    await q('select 1');
    const { rows: [tx] } = await q('select now() <> statement_timestamp() as in_tx');
    if (tx?.in_tx !== true) throw new Error('NOT_IN_TRANSACTION: BEGIN did not open a transaction — refusing to issue any write');
    await q("set local statement_timeout = '30s'");
    await q("set local idle_in_transaction_session_timeout = '60s'");
    // CREATE POLICY takes an AccessExclusiveLock held until this transaction ends, which in control
    // mode blocks ALL reads and writes to a live ingress table — including real anon submissions,
    // which a short anon statement_timeout turns from "slow" into "failed". Fail to acquire rather
    // than queue behind ourselves. CI never runs a control mode, so scheduled runs never take it.
    await q("set local lock_timeout = '1s'");

    // Owner-privileged setup happens BEFORE dropping to anon, so there is no mid-run role toggle to
    // leak back across. FR-2a's "re-assert after the toggle" is satisfied by there being no toggle.
    if (args.grantSelect || args.grantUpdate) {
      await q(`create policy ${POLICY_PREFIX}sel on ${table} for select to anon using (true)`);
    }
    if (args.grantUpdate) {
      await q(`create policy ${POLICY_PREFIX}upd on ${table} for update to anon using (true) with check (true)`);
    }

    let ctx = null;
    if (builder.preflight) {
      const { rows: [v] } = await q(builder.preflight);
      if (!v) return { code: EXIT.PROBE_INCONCLUSIVE, reason: 'no row satisfies the insert policy predicate — a probe row cannot be constructed' };
      ctx = v.id;
    }

    // telegram is the ONE source the RESTRICTIVE 50/hr ingress bound can actually bind on, because
    // it is the only anon-SELECT-covered source. Measure before trusting the control.
    const { rows: [c] } = await q(
      `select count(*)::int as n from ${table} where source_type = $1 and created_at > now() - interval '1 hour'`,
      [args.controlSource]
    );
    if (c && c.n >= 50) return { code: EXIT.PROBE_INCONCLUSIVE, reason: `${args.controlSource} last hour = ${c.n} (>=50): the ingress bound may bind, so a REFUSED control would be ambiguous` };

    // FR-7, measured before dropping to anon so the definer-side basis is readable.
    let bound = null;
    if (!control) {
      try { bound = await assertIngressBoundCannotBind(q, table, args.subjectSource); }
      catch (e) { bound = { applicable: false, note: `not measurable: ${e.message}` }; }
    }

    await q('set local role anon');
    const { rows: [p] } = await q('select pg_backend_pid() as pid');
    const res = await runForms(q, table, { builder, ctx, subjectSource: args.subjectSource, controlSource: args.controlSource, uuid, basePid: p.pid });

    if (res.aborted) {
      const g = res.guards[res.guards.length - 1];
      return { code: EXIT.RLS_NOT_IN_FORCE, reason: `RLS not in force before "${res.aborted}": ${g.problems.join(', ')}`, guards: res.guards };
    }
    const malformed = Object.entries(res.observed).filter(([, v2]) => v2 === 'MALFORMED' || v2 === 'ERROR');
    if (malformed.length) {
      return { code: EXIT.PROBE_MALFORMED, reason: `pre-RLS rejection, not a contract verdict: ${malformed.map(([k]) => `${k}=${res.attributions[k]}`).join('; ')}`, ...res };
    }
    const cmp = compare(res.observed);
    res.bound = bound;
    if (control) {
      return { code: EXIT.CONTRACT_CHANGED, reason: `control mode: ${cmp.ok ? 'NO FLIP OBSERVED — the control proved nothing' : `flipped ${cmp.differingForms.join(', ')}`}`, control: true, flipped: cmp.differingForms, ...res };
    }
    return { code: cmp.ok ? EXIT.OK : EXIT.CONTRACT_CHANGED, reason: cmp.ok ? 'contract holds' : `CONTRACT CHANGED at ${cmp.differingForm}`, ...res };
  } finally {
    await q('ROLLBACK');
  }
}

export async function main(argv = process.argv.slice(2)) {
  let client = null;
  let worst = EXIT.OK;
  try {
    const args = parseArgs(argv);
    const { randomUUID } = await import('node:crypto');
    // Inside the try: this throws when the DB password is absent, and outside it that surfaced as an
    // unhandled rejection with no diagnostic and an exit code that never came from the EXIT map.
    // DATABASE_URL is what CI actually has. Locally it is usually unset and the password path
    // resolves instead; passing undefined leaves that path untouched.
    client = await createDatabaseClient('ehg',
      process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {});
    const q = (sql, params) => client.query(assertNotCommitFamily(sql), params);

    let targets = args.table ? [args.table] : null;
    if (!targets) {
      const { rows } = await q(`select p.schemaname, p.tablename, p.roles::text[] as roles, p.cmd, p.qual, p.with_check,
                                       p.permissive, c.relrowsecurity
                                  from pg_policies p
                                  join pg_class c on c.oid = format('%I.%I', p.schemaname, p.tablename)::regclass`);
      const candidates = discoverAsymmetricTables(rows);
      const probable = candidates.filter((t) => ROW_BUILDERS[t]);
      const unprobed = candidates.filter((t) => !ROW_BUILDERS[t]);
      // Report the shortfall EXPLICITLY. A discovery step that silently probes the 1 table it has a
      // builder for, out of the N it found, prints a clean pass and reads as "the class is covered".
      // The count being large is a finding about this probe's reach, not a detail to round off.
      console.log(`discovery: ${candidates.length} candidate(s) in the class; ${probable.length} have a row builder and WILL be asserted.`);
      if (unprobed.length) {
        console.log(`UNPROBED (${unprobed.length}) — in the class, contract NOT asserted, no row builder: ${unprobed.slice(0, 12).join(', ')}${unprobed.length > 12 ? `, +${unprobed.length - 12} more` : ''}`);
        console.log('  A candidate is a table where anon holds a permissive INSERT policy and has no UNCONDITIONAL anon SELECT policy.');
        console.log('  Some are false positives: a qual that is always-false for anon via a function (e.g. fn_is_chairman()) is not');
        console.log('  statically distinguishable from one that is always-true. Add a ROW_BUILDERS entry to assert any of them.');
      }
      targets = probable;
    }

    for (const table of targets) {
      // Per-table isolation. Without it the first target that throws aborts the whole run, and the
      // tables after it — including the one this SD is actually about — are never probed at all.
      let r;
      try {
        r = await probeTable(client, q, table, args, randomUUID);
      } catch (err) {
        r = { code: EXIT.ERROR, reason: `probe threw: ${err.message}` };
      }
      console.log(`\n=== ${table} ===`);
      for (const [form, verdict] of Object.entries(r.observed || {})) {
        console.log(`  ${form.padEnd(24)} ${String(verdict).padEnd(10)} ${r.attributions?.[form] ?? ''}`);
      }
      if (r.bound?.applicable) {
        const b = r.bound;
        console.log(`  ingress-bound  RESTRICTIVE=${b.restrictive} definer-basis=${b.definerBasis} anon-basis=${b.anonBasis}` +
          (b.vacuous ? '  [VACUOUS — too few recent rows to tell, not a pass]'
                     : b.cannotBind ? '  [CANNOT BIND — the inline subquery counts as anon]'
                                    : '  [binds, or the basis changed]'));
      } else if (r.bound) {
        console.log(`  ingress-bound  ${r.bound.note}`);
      }
      console.log(`  -> [${Object.keys(EXIT).find((k) => EXIT[k] === r.code)}] ${r.reason}`);
      if (r.code !== EXIT.OK && worst === EXIT.OK) worst = r.code;
    }
    if (!targets.length) {
      console.log('no target had a row builder — nothing was asserted');
      worst = EXIT.PROBE_INCONCLUSIVE;
    }
  } catch (err) {
    console.error(`probe error: ${err.message}`);
    worst = EXIT.ERROR;
  } finally {
    if (client) await client.end().catch(() => {});
  }
  return worst;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly) main().then((code) => process.exit(code));
