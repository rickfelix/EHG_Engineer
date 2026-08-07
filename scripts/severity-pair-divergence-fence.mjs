#!/usr/bin/env node
/**
 * SD-LEO-INFRA-THREE-GAPS-APPLIED-001 — FR-2 + FR-3 live divergence fence.
 *
 * Reads BOTH couplings from the live catalog and reports whether the two
 * separately-editable sides still describe the same thing:
 *
 *   FR-2  chairman_all_decision_signals severity pair  <-> anon_feedback_ingress_bounds pair
 *   FR-3  rate-limit subquery predicate                <-> anon SELECT policy predicate
 *
 * Exit 0 only when EVERY coupling AGREES. UNREADABLE exits non-zero: a fence that could
 * not read its inputs has not passed, it has failed to measure.
 *
 * --seed-divergence proves the fence can FAIL (TR-3). The mutation is applied
 * IN MEMORY to the strings read from the catalog — deliberately NOT via a transaction.
 * The PRD sketched a BEGIN/ROLLBACK, but this SD's rule is that the builder never
 * applies DDL, and "inside a rolled-back transaction" is not an exemption. An in-memory
 * mutation is strictly safer and exactly as probative: it exercises the same comparison
 * code against a pair that differs.
 *
 * ── EXTENDED BY SD-LEO-INFRA-OWNERSHIP-PRESERVATION-ASSERTION-001 ─────────────────────────
 * A THIRD coupling: view-vs-base-table COLUMN PARITY, for the p.*-refreeze drift class.
 * A view defined with `p.*` freezes its column list at CREATE; the base table later gains a
 * column and the view does not. Measured live 2026-08-07: v_patterns_with_decay was missing SIX
 * columns present on issue_patterns, including both its only consumer selects — so that consumer
 * raised 42703 on every run and silently fell back to the base table, for months, unnoticed.
 *
 * THIS FENCE WAS THE RIGHT SUBSTRATE PRECISELY BECAUSE IT WAS DORMANT. It was fully built,
 * correct, and NEVER INVOKED — zero workflow references, zero npm scripts, and zero rows in the
 * live periodic_process_registry across 246 registered processes. Building a second detector
 * beside it would have left the working one dark. Extending it means the schedule and the
 * consumer wire that give column-parity a home also end this fence's own dormancy.
 *
 * Usage:
 *   node scripts/severity-pair-divergence-fence.mjs
 *   node scripts/severity-pair-divergence-fence.mjs --seed-divergence
 *   node scripts/severity-pair-divergence-fence.mjs --json
 *
 * (The usage block previously named scripts/check-severity-pair-divergence.mjs, a file that has
 * never existed. NOT RENAMING THE SCRIPT: a rename would invalidate the wiring test's path
 * literals, ACTIVATION_TRIGGER and the registry row for no functional gain. Fixing the pointer
 * instead is the cheap half of that choice, and leaving a docstring that names a nonexistent
 * file is how the next reader concludes the instrument does not exist.)
 */
import 'dotenv/config';
import pg from 'pg';
import {
  compareSeverityPair,
  compareCountVisibility,
  compareViewBaseParity,
  seedParityDivergence,
  allCouplingsAgree,
  AGREES,
  UNREADABLE,
} from '../lib/policy/severity-pair-coupling.js';
import { registerArmedMachinery } from '../lib/machinery-class/armed-registration.js';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';

const VIEW_NAME = 'chairman_all_decision_signals';
const INGRESS_POLICY = 'anon_feedback_ingress_bounds';
const ANON_SELECT_POLICY = 'telegram_bot_select_feedback';

/** SD-LEO-INFRA-OWNERSHIP-PRESERVATION-ASSERTION-001 — armed-machinery identity. */
export const SD_KEY = 'SD-LEO-INFRA-OWNERSHIP-PRESERVATION-ASSERTION-001';
export const ACTIVATION_TRIGGER = '.github/workflows/divergence-fence-cron.yml';
export const EXPECTED_INTERVAL_SECONDS = 24 * 60 * 60;

/**
 * The view/base pairs checked for column parity.
 *
 * DATA-DRIVEN ON PURPOSE — the catalog query is naturally class-wide, and a comparator hard-wired
 * to one view could never earn a schedule. v_patterns_with_decay is the NAMED CASE (it is the one
 * measured drifting), not the scope. Adding a pair here is the whole cost of covering another view.
 */
export const PARITY_PAIRS = Object.freeze([
  { view: 'v_patterns_with_decay', base: 'issue_patterns' },
]);

const argv = process.argv.slice(2);
const SEED = argv.includes('--seed-divergence');
const JSON_OUT = argv.includes('--json');

/**
 * Pull the rate-limit subquery's WHERE predicate out of the ingress policy body.
 * The clause looks like: ( SELECT (count(*) < 50) FROM feedback f WHERE (<pred>))
 * Returns null when absent — which the comparator reports as UNREADABLE, not as pass.
 */
function extractLimitPredicate(policyExpr) {
  if (typeof policyExpr !== 'string') return { literal: null, correlatedColumn: null };
  const m = policyExpr.match(/count\(\*\)[\s\S]{0,200}?\bFROM\b[\s\S]{0,80}?\bWHERE\b\s*\(([\s\S]*)$/i);
  if (!m) return { literal: null, correlatedColumn: null };
  const body = m[1];

  // CORRELATED form (live since 2026-08-03): the counted set tracks the incoming row.
  //   NOT ((f.source_type)::text IS DISTINCT FROM (feedback.source_type)::text)
  // Detect it FIRST — it also contains a `source_type` token, so a literal-first scan
  // would fall through to "unreadable" and hide a decidable divergence.
  // NOTE: the gap between the column and IS DISTINCT FROM contains `)::text`, so a
  // `[^)]*` gap can never cross it. Use a bounded any-char gap instead.
  const corr = body.match(/\b[a-z_]+\.([a-z_]+)\b[\s\S]{0,40}?IS\s+DISTINCT\s+FROM[\s\S]{0,40}?\bfeedback\.\1\b/i)
    || body.match(/\bfeedback\.([a-z_]+)\b[\s\S]{0,40}?IS\s+DISTINCT\s+FROM/i);
  if (corr) return { literal: null, correlatedColumn: corr[1].toLowerCase() };

  // LITERAL form: take only the source_type conjunct — the created_at window is a time
  // bound, not a visibility bound, and anon SELECT is not expected to replicate it.
  const st = body.match(/\(?\s*[a-z_]*\.?source_type\s*\)?\s*(?:::\s*\w+(?:\s+\w+)?)?\s*=\s*'[^']+'(?:\s*::\s*\w+(?:\s+\w+)?)?/i);
  return { literal: st ? st[0] : null, correlatedColumn: null };
}

/**
 * Live column list for one relation, from the catalog.
 *
 * attnum > 0 excludes system columns (ctid, xmin, …) and NOT attisdropped excludes columns
 * dropped-but-not-vacuumed. Omitting either would make EVERY view look drifted — a class-wide
 * false positive that a hand-fed unit test cannot catch, because the query is the part under test.
 * relkind is left open so the SAME function reads a view ('v') and a table ('r').
 */
async function readColumns(client, relname) {
  const { rows } = await client.query(
    `select a.attname
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = $1
        and a.attnum > 0 and not a.attisdropped
      order by a.attnum`,
    [relname],
  );
  return rows.map((r) => r.attname);
}

/**
 * Register this fence as armed machinery. FAIL-SOFT and DELIBERATELY CALLED FIRST.
 *
 * ── WHY BEFORE THE CREDENTIAL CHECK, WHICH IS THE OPPOSITE OF THE OBVIOUS ORDER ────────────
 * main() used to exit(2) on a missing pooler URL as its very first act — before connecting,
 * before every comparator, before registration and before any alert. So on a runner without that
 * secret the fence emitted NOTHING and wrote NO REGISTRY ROW, which means the staleness watcher
 * had no row to find and could not report it overdue. Dead and invisible, identical to never
 * having been scheduled.
 *
 * That is not hypothetical: .github/workflows/solomon-late-verdict-reconcile-cron.yml:38-40
 * carries an in-repo ruling that SUPABASE_POOLER_URL is injected into ZERO cron workflows in this
 * repo and is silently undefined on a GHA runner. Registering first means a fence that cannot read
 * its catalog still leaves a row that ages, so the watcher can say so.
 *
 * Uses supabase-js while the catalog read uses node-postgres — two clients, two credential sets,
 * both required in the workflow env. Stated because it is the one thing about this script that
 * cannot be copied from a cron exemplar.
 */
async function ensureArmedRegistration() {
  try {
    const supabase = createSupabaseServiceClient();
    const r = await registerArmedMachinery(supabase, { sd_key: SD_KEY }, {
      activationTrigger: ACTIVATION_TRIGGER,
      expectedIntervalSeconds: EXPECTED_INTERVAL_SECONDS,
    });
    if (r && r.ok === false) console.warn(`registry: registration failed (${r.error}) — continuing; the measurement matters more than its bookkeeping`);
    return r;
  } catch (e) {
    // Never let bookkeeping break the fence. A registration failure must not convert a readable
    // catalog into an unreadable verdict.
    console.warn(`registry: registration threw (${e.message}) — continuing`);
    return { ok: false, error: e.message };
  }
}

/**
 * Tell a consumer. FAIL-SOFT BY CONTRACT, which is exactly why its test must be two-sided.
 *
 * emitBreakageAlert swallows every error and returns {ok:false}, so a wire that throws on every
 * call is INVISIBLE in the exit code — the only thing any other check here inspects. A test that
 * only asserts "the fence still exits 1" would pass with the alert permanently broken. The
 * 'schema-drift' break class already exists (critical / system_health); no new class is minted.
 */
async function emitDriftAlert(divergedResults, deps = {}) {
  if (!divergedResults.length) return { ok: true, skipped: 'no_divergence' };
  try {
    const { emitBreakageAlert } = deps.emitBreakageAlert
      ? { emitBreakageAlert: deps.emitBreakageAlert }
      : await import('../lib/breakage/emit-breakage-alert.cjs');
    const detail = divergedResults.map((r) => r.detail).join(' | ');
    return await emitBreakageAlert('schema-drift', 'divergence-fence', {
      title: `Divergence fence tripped: ${divergedResults.length} coupling(s)`,
      message: detail,
      metadata: { sd_key: SD_KEY, couplings: divergedResults.length },
    });
  } catch (e) {
    console.warn(`alert: emit threw (${e.message}) — continuing`);
    return { ok: false, error: e.message };
  }
}

async function main() {
  // FIRST, before anything that can exit. See ensureArmedRegistration's header.
  await ensureArmedRegistration();

  const conn = process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL;
  if (!conn) {
    console.error('UNREADABLE: no SUPABASE_POOLER_URL / SUPABASE_DB_URL in env — cannot read the catalog.');
    // Tell a consumer rather than dying quietly. Unmeasurable is a reportable state, not a pass
    // and not a silence — and this is the branch a GHA runner without the secret actually takes.
    await emitDriftAlert([{ detail: 'UNREADABLE: the divergence fence has no pooler credentials on this runner, so no coupling was measured. An unmeasured fence is not a passing fence.' }]);
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let viewExpr = null;
  let ingressExpr = null;
  let anonSelectExpr = null;
  const parityInputs = [];
  try {
    const v = await client.query('select definition from pg_views where schemaname = $1 and viewname = $2', ['public', VIEW_NAME]);
    viewExpr = v.rows[0]?.definition ?? null;

    const p = await client.query(
      `select polname,
              pg_get_expr(polqual, polrelid)      as using_expr,
              pg_get_expr(polwithcheck, polrelid) as check_expr
         from pg_policy
        where polrelid = 'public.feedback'::regclass
          and polname = any($1)`,
      [[INGRESS_POLICY, ANON_SELECT_POLICY]],
    );
    for (const row of p.rows) {
      if (row.polname === INGRESS_POLICY) ingressExpr = row.check_expr;
      if (row.polname === ANON_SELECT_POLICY) anonSelectExpr = row.using_expr;
    }

    // Column parity, one catalog read per side per pair. Same connection, same try/finally.
    for (const pair of PARITY_PAIRS) {
      parityInputs.push({
        ...pair,
        viewCols: await readColumns(client, pair.view),
        baseCols: await readColumns(client, pair.base),
      });
    }
  } finally {
    await client.end();
  }

  const { literal: limitPredicate, correlatedColumn } = extractLimitPredicate(ingressExpr);

  if (SEED) {
    // Mutate ONE side of each coupling so EVERY fence must report DIVERGED.
    //
    // THE PARITY SEED IS NOT OPTIONAL, and the reason is subtle enough to write down: the
    // FENCE IS BROKEN check below asserts only that the AGGREGATE seeded run fails, and the two
    // pre-existing seeds already guarantee that. A new coupling with no seed of its own would
    // ride along permanently untested behind a control that passes for reasons unrelated to it.
    if (ingressExpr) ingressExpr = ingressExpr.replace(/'high'/, "'medium'");
    if (anonSelectExpr) anonSelectExpr = `${anonSelectExpr} AND venture_id IS NOT NULL`;
    for (const p of parityInputs) p.viewCols = seedParityDivergence(p.viewCols);
  }

  const pairResult = compareSeverityPair({ viewExpr, policyExpr: ingressExpr });
  const countResult = compareCountVisibility({ limitPredicate, selectPredicate: anonSelectExpr, correlatedColumn });
  const parityResults = parityInputs.map((p) => compareViewBaseParity({
    viewCols: p.viewCols, baseCols: p.baseCols, viewName: p.view, baseName: p.base,
  }));
  // The aggregator is UNCHANGED — it reads only .verdict, so this is purely additive.
  const results = [pairResult, countResult, ...parityResults];
  const ok = allCouplingsAgree(results);

  if (JSON_OUT) {
    console.log(JSON.stringify({ seeded: SEED, ok, pair: pairResult, count: countResult, parity: parityResults }, null, 2));
  } else {
    console.log(SEED ? '=== SEEDED DIVERGENCE RUN (in-memory mutation; nothing written) ===' : '=== LIVE COUPLING CHECK ===');
    console.log(`FR-2 severity pair : ${pairResult.verdict}`);
    console.log(`   view   (${VIEW_NAME}) = ${fmt(pairResult.viewPair)}`);
    console.log(`   policy (${INGRESS_POLICY}) = ${fmt(pairResult.policyPair)}`);
    console.log(`   ${pairResult.detail}`);
    console.log(`FR-3 count visibility : ${countResult.verdict}`);
    console.log(`   limit counts   = ${countResult.limitPredicate ?? '(unreadable)'}`);
    console.log(`   anon SELECT    = ${countResult.selectPredicate ?? '(unreadable)'}`);
    console.log(`   ${countResult.detail}`);
    for (const [i, r] of parityResults.entries()) {
      const p = parityInputs[i];
      console.log(`COLUMN PARITY (${p.view} <- ${p.base}) : ${r.verdict}`);
      console.log(`   ${r.detail}`);
    }
    console.log(ok ? 'PAIR_AGREES — every coupling holds.' : 'FENCE TRIPPED — see above.');
  }

  // Tell a consumer. NOT on a seeded run: a seeded divergence is a self-test, and alerting on it
  // would train every reader to ignore this alert — the fastest way to make a real one invisible.
  if (!ok && !SEED) {
    await emitDriftAlert(results.filter((r) => r.verdict !== AGREES));
  }

  if (SEED && ok) {
    // The seeded run MUST fail. If it passed, the fence cannot detect divergence and
    // its green runs mean nothing — that is worse than a plain failure, so say so loudly.
    console.error('\nFENCE IS BROKEN: --seed-divergence produced a PASSING result. A fence that cannot fail proves nothing.');
    process.exit(3);
  }
  process.exit(ok ? 0 : 1);
}

function fmt(pair) {
  return Array.isArray(pair) ? `[${pair.join(', ')}]` : '(unreadable)';
}

main().catch((err) => {
  console.error(`UNREADABLE: ${err.message}`);
  process.exit(2);
});
