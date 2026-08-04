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
 * Usage:
 *   node scripts/check-severity-pair-divergence.mjs
 *   node scripts/check-severity-pair-divergence.mjs --seed-divergence
 *   node scripts/check-severity-pair-divergence.mjs --json
 */
import 'dotenv/config';
import pg from 'pg';
import {
  compareSeverityPair,
  compareCountVisibility,
  allCouplingsAgree,
  AGREES,
  UNREADABLE,
} from '../lib/policy/severity-pair-coupling.js';

const VIEW_NAME = 'chairman_all_decision_signals';
const INGRESS_POLICY = 'anon_feedback_ingress_bounds';
const ANON_SELECT_POLICY = 'telegram_bot_select_feedback';

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

async function main() {
  const conn = process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL;
  if (!conn) {
    console.error('UNREADABLE: no SUPABASE_POOLER_URL / SUPABASE_DB_URL in env — cannot read the catalog.');
    process.exit(2);
  }

  const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let viewExpr = null;
  let ingressExpr = null;
  let anonSelectExpr = null;
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
  } finally {
    await client.end();
  }

  const { literal: limitPredicate, correlatedColumn } = extractLimitPredicate(ingressExpr);

  if (SEED) {
    // Mutate ONE side of each coupling so both fences must report DIVERGED.
    if (ingressExpr) ingressExpr = ingressExpr.replace(/'high'/, "'medium'");
    if (anonSelectExpr) anonSelectExpr = `${anonSelectExpr} AND venture_id IS NOT NULL`;
  }

  const pairResult = compareSeverityPair({ viewExpr, policyExpr: ingressExpr });
  const countResult = compareCountVisibility({ limitPredicate, selectPredicate: anonSelectExpr, correlatedColumn });
  const results = [pairResult, countResult];
  const ok = allCouplingsAgree(results);

  if (JSON_OUT) {
    console.log(JSON.stringify({ seeded: SEED, ok, pair: pairResult, count: countResult }, null, 2));
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
    console.log(ok ? 'PAIR_AGREES — every coupling holds.' : 'FENCE TRIPPED — see above.');
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
