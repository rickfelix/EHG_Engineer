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
import { pathToFileURL } from 'node:url';
import {
  compareSeverityPair,
  compareViewBaseParity,
  seedParityDivergence,
  allCouplingsAgree,
  AGREES,
  UNREADABLE,
} from '../lib/policy/severity-pair-coupling.js';
import { registerArmedMachinery, armedProcessKey } from '../lib/machinery-class/armed-registration.js';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';

const VIEW_NAME = 'chairman_all_decision_signals';
const INGRESS_POLICY = 'anon_feedback_ingress_bounds';

/**
 * FR-3 COUNT VISIBILITY WAS RETIRED FROM THIS FENCE on 2026-08-07
 * (SD-LEO-FIX-POINT-STARVATION-COUPLING-001, coordinator ruling B on advisory 8c95764a).
 *
 * THE PREMISE DISSOLVED. The rate-limit count moved inside fn_anon_ingress_prior_hour_count
 * (SECURITY DEFINER, postgres-owned), so it no longer runs as the inserting role and is no longer
 * subject to that role's SELECT policy. Proven by execution, not argued: as postgres
 * row_security_active(feedback) is false, direct count 8, via the definer fn 8; AS ANON
 * row_security_active is TRUE, direct count 0, VIA THE DEFINER FN 8. Anon, whose own visibility of
 * those rows is zero, receives the true count — the starvation this coupling watched for cannot
 * occur, and a comparator that kept reporting it WOULD have reddened this fence on every run.
 *
 * IT WAS NOT LEFT IN PLACE UNUSED, deliberately. A comparator sitting exported with nine green
 * tests — one of them titled "AGREES today" — reads to the next person as a live guard protecting
 * the count. That is a lie waiting for a reader, and the more expensive failure of the two.
 *
 * WHAT REPLACED IT, so the capability is not merely deleted: an anon-role BEHAVIOURAL PROBE in
 * scripts/anon-write-contract-probe.mjs (assertIngressBoundCannotBind), already armed on its own
 * daily cron. It asserts a PAIR — as anon the definer count equals the owner's true count, AND
 * anon's direct count is strictly less than it — which covers the re-inline path this comparator
 * used to be the only thing positioned to notice, plus three paths it could never see (function
 * OWNER change, BODY rewrite, and REVOKE EXECUTE from anon). The retired comparator's own closing
 * note asked for exactly that: "this needs an anon-role probe".
 */

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
 * Live column list for one relation, from the catalog.
 *
 * attnum > 0 excludes system columns (ctid, xmin, …) and NOT attisdropped excludes columns
 * dropped-but-not-vacuumed. Omitting either would make EVERY view look drifted — a class-wide
 * false positive that a hand-fed unit test cannot catch, because the query is the part under test.
 * relkind is left open so the SAME function reads a view ('v') and a table ('r').
 */
export async function readColumns(client, relname) {
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
export async function emitDriftAlert(divergedResults, deps = {}, sourceService = 'divergence-fence') {
  if (!divergedResults.length) return { ok: true, skipped: 'no_divergence' };
  try {
    const { emitBreakageAlert } = deps.emitBreakageAlert
      ? { emitBreakageAlert: deps.emitBreakageAlert }
      : await import('../lib/breakage/emit-breakage-alert.cjs');
    const detail = divergedResults.map((r) => r.detail).join(' | ');
    return await emitBreakageAlert('schema-drift', sourceService, {
      title: `Divergence fence tripped: ${divergedResults.length} coupling(s)`,
      message: detail,
      metadata: { sd_key: SD_KEY, couplings: divergedResults.length },
    });
  } catch (e) {
    console.warn(`alert: emit threw (${e.message}) — continuing`);
    return { ok: false, error: e.message };
  }
}

/**
 * Stamp last_fired_at on a HEALTHY completed run.
 *
 * WITHOUT THIS THE FIX ABOVE INVERTS INTO A PERMANENT FALSE ALARM, which is the whole reason it
 * is here. Registering-before-the-credential-check gives the staleness watcher a row to read —
 * but a row that is never stamped reads as armed-and-never-produced FOREVER, no matter how many
 * healthy runs happen. So the moment the credentials are fixed, a true positive would become a
 * permanent false one, and an alarm that cannot clear is an alarm everyone learns to ignore.
 * Registration and stamping had to land in the same change; shipping either alone is worse than
 * shipping neither.
 *
 * Stamped ONLY on a clean run: a tripped or unreadable fence has not successfully produced.
 */
async function stampIfHealthy(ok) {
  if (!ok) return { ok: false, skipped: 'not_healthy' };
  try {
    const { stampLastFired } = await import('../lib/periodic-liveness/stamp-last-fired.js');
    const supabase = createSupabaseServiceClient();
    return await stampLastFired(supabase, armedProcessKey(SD_KEY));
  } catch (e) {
    console.warn(`registry: stamp threw (${e.message}) — continuing`);
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
    //
    // A DISTINCT source_service, AND THAT IS NOT COSMETIC. recordSystemAlert dedups on
    // (source_service, break_class, resolved_at IS NULL). A tripped-fence alert from an earlier
    // run sits open almost by definition — the drift it reports is exactly what nobody has fixed
    // yet — so sharing a source_service would let that open row SWALLOW this one, and the alert
    // built to cure the dead-and-invisible mode would itself be invisible. The obvious fix for a
    // silent failure is easy to make silent in the same way.
    await emitDriftAlert(
      [{ detail: 'UNREADABLE: the divergence fence has no catalog credentials on this runner (SUPABASE_POOLER_URL / SUPABASE_DB_URL both unset), so NO coupling was measured. An unmeasured fence is not a passing fence.' }],
      {},
      'divergence-fence-unreadable',
    );
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let viewExpr = null;
  let ingressExpr = null;
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
      [[INGRESS_POLICY]],
    );
    for (const row of p.rows) {
      if (row.polname === INGRESS_POLICY) ingressExpr = row.check_expr;
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

  if (SEED) {
    // Mutate ONE side of each coupling so EVERY fence must report DIVERGED.
    //
    // EVERY REMAINING COUPLING STILL HAS ITS OWN SEED, and the reason is subtle enough to write
    // down: the FENCE IS BROKEN check below asserts only that the AGGREGATE seeded run fails, so a
    // coupling with no seed of its own would ride along permanently untested behind a control that
    // passes for reasons unrelated to it. Retiring FR-3 removed a coupling AND its seed together —
    // dropping one without the other is exactly how that untested-passenger state gets created.
    if (ingressExpr) ingressExpr = ingressExpr.replace(/'high'/, "'medium'");
    for (const p of parityInputs) p.viewCols = seedParityDivergence(p.viewCols);
  }

  const pairResult = compareSeverityPair({ viewExpr, policyExpr: ingressExpr });
  const parityResults = parityInputs.map((p) => compareViewBaseParity({
    viewCols: p.viewCols, baseCols: p.baseCols, viewName: p.view, baseName: p.base,
  }));
  // The aggregator is UNCHANGED — it reads only .verdict.
  const results = [pairResult, ...parityResults];
  const ok = allCouplingsAgree(results);

  if (JSON_OUT) {
    // `count` is gone from this payload with FR-3's retirement. Measured before removing it: no
    // production consumer reads it — the only --json callers are this repo's own tests.
    console.log(JSON.stringify({ seeded: SEED, ok, pair: pairResult, parity: parityResults }, null, 2));
  } else {
    console.log(SEED ? '=== SEEDED DIVERGENCE RUN (in-memory mutation; nothing written) ===' : '=== LIVE COUPLING CHECK ===');
    console.log(`FR-2 severity pair : ${pairResult.verdict}`);
    console.log(`   view   (${VIEW_NAME}) = ${fmt(pairResult.viewPair)}`);
    console.log(`   policy (${INGRESS_POLICY}) = ${fmt(pairResult.policyPair)}`);
    console.log(`   ${pairResult.detail}`);
    console.log('FR-3 count visibility : RETIRED 2026-08-07 — premise dissolved (SECURITY DEFINER basis).');
    console.log('   now asserted behaviourally by scripts/anon-write-contract-probe.mjs (its own daily cron).');
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
  // Stamp only a clean, non-seeded run. See stampIfHealthy: without this the registry row never
  // ages out of armed-never-produced and the watcher alarms forever on a healthy fence.
  if (!SEED) await stampIfHealthy(ok);

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

/**
 * ENTRYPOINT GUARD — SD-LEO-INFRA-OWNERSHIP-PRESERVATION-ASSERTION-001.
 *
 * main() used to run UNCONDITIONALLY at import, and every terminus calls process.exit(). That made
 * the module physically unimportable: any test that touched it would open a database connection
 * and then kill the test runner. So EVERY assertion about this file had to be a regex over its
 * source text, and anything invisible in the text was invisible to the suite — measured, five
 * separate mutations to this script stayed GREEN across the entire 36,000-test unit project.
 *
 * The guard is the shape scripts/cron/payment-attribution-sweep.mjs already uses. It changes
 * nothing about how the CLI behaves and makes the exported seams (emitDriftAlert's deps parameter,
 * in particular) actually reachable by a test — which is what lets the consumer wire be asserted
 * two-sided instead of trusted because one live row appeared once.
 */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(`UNREADABLE: ${err.message}`);
    process.exit(2);
  });
}
