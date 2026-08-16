// Behavioural acceptance for
// database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql
// (SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001, TR-3).
//
// ── RUN IT TWICE. THE BASELINE IS NOT OPTIONAL. ───────────────────────────────────────────────
//   node <this file> --baseline    BEFORE the apply. Shows the CURRENT exposure — 14 of the 16
//                                  target functions are anon/authenticated-executable SOLELY
//                                  because PUBLIC was never revoked, not because anyone
//                                  deliberately granted anon/authenticated.
//   node <this file> --verify      AFTER  the apply. Every assertion below must PASS.
//
// A post-apply green proves nothing on its own unless the baseline first showed the real
// pre-apply exposure. Matches the discriminator convention in
// 20260803_bound_anon_ingress_source_type_qualifier_acceptance.mjs and
// 20260812_venture_ingest_key_binding_acceptance.mjs.
//
// ── METHOD — deliberately DIFFERENT from those two precedents ────────────────────────────────
// This migration does not add or change any function's BEHAVIOUR — it only tightens EXECUTE
// grants on functions that already exist and already run in production (chairman decisions,
// SD claims, RLS policy helpers, a trigger). Actually INVOKING them here as anon (the ingest-key
// precedent's method) would risk real side effects — audit rows, mutation triggers, rate-limit
// counters — for zero additional proof value. The correct probe for a pure-ACL migration is the
// catalog itself: has_function_privilege() via the SAME exec_sql RPC path this SD used
// throughout PLAN/EXEC (TR-1) — service-role only, SELECT-only (exec_sql structurally rejects
// DDL/writes), zero blast radius, nothing minted or deleted, no teardown needed.
//
// ── DECLARED vs EFFECTIVE, the TR-3 distinction ───────────────────────────────────────────────
// has_function_privilege('anon', ..., 'EXECUTE') answers "can anon execute this" — TRUE whether
// that's because anon was granted directly OR because PUBLIC was granted and anon inherits it.
// It cannot by itself tell you WHICH. But it doesn't need raw ACL-text parsing to separate them:
// EFFECTIVE(role) = DIRECT(role) OR DECLARED_PUBLIC, so whenever DECLARED_PUBLIC is false,
// DIRECT(role) = EFFECTIVE(role) exactly. Only when DECLARED_PUBLIC is true is a same-named
// direct grant indeterminate from this data — and irrelevant, since PUBLIC alone already grants
// the access either way. This report shows both columns and marks the indeterminate case
// explicitly rather than guessing.
//
// ── THE TWO BUCKET-PLACEMENT REVERSALS (surfaced explicitly per TR-3, not silently) ──────────
//   (1) fn_write_kill_audit_trail: moved Bucket A -> B during PLAN. It has a SECURITY INVOKER
//       caller (fn_chairman_decide) whose body PERFORMs it — under invoker semantics the inner
//       call runs AS THE CALLING ROLE, so revoking `authenticated` would have broken
//       fn_chairman_decide. The original "called only by a SECURITY DEFINER function, so it
//       never needs authenticated" premise was false for this one function.
//   (2) is_chairman_role: moved Bucket B -> C during PLAN. It's referenced by a roles={public}
//       policy on archetype_benchmarks_admin (RLS enabled, anon holds table-level SELECT).
//       roles={public} includes anon, so the SD's own Bucket-C exclusion rule ("referenced by an
//       anon/PUBLIC-facing policy") applies — revoking anon here would have broken that policy.
//
// ── BLAST RADIUS ───────────────────────────────────────────────────────────────────────────────
// None. Every query below is a SELECT against pg_proc/has_function_privilege via exec_sql, which
// itself rejects non-SELECT/WITH statements. Nothing is created, granted, revoked, or deleted by
// this script — the migration file is the only thing that mutates state, and only once the
// chairman applies it.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const MODE = process.argv.includes('--baseline') ? 'baseline'
           : process.argv.includes('--verify') ? 'verify'
           : null;
if (!MODE) {
  console.error('Usage: node <this file> --baseline | --verify   (see the header: the baseline is not optional)');
  process.exit(2);
}

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Signature/reason data mirrors scripts/audit-rpc-execute-grants-buckets.json exactly — same
// manifest the standing verifier (FR-5) reads, so this artifact and the CI gate can never drift
// silently apart.
const BUCKET_A = [
  ['fn_enforce_stage_advancement_artifact_gate', 'Trigger function, no client-facing caller.'],
  ['fn_quick_fixes_validate_target_application', 'Trigger function, no client-facing caller.'],
  ['fn_stage_artifact_precondition', 'Only caller resolved to a service_role client — safe to revoke authenticated.'],
  ['fn_user_has_company_access', 'Reverses a prior explicit defense-in-depth allowlisting; zero live policy references today.'],
  ['fn_verify_and_consume_stepup_token', 'Called only internally by approve/reject_chairman_decision (SECURITY DEFINER).'],
  ['log_sd_mutation_audit', 'Trigger function, 0 policies/callers found.'],
];
const BUCKET_B = [
  ['approve_chairman_decision', 'App-called (chairman decision queue).'],
  ['check_feedback_duplicate', 'App-called.'],
  ['claim_sd', 'App-called; also used by the fleet harness and chairman Telegram bot (service_role).'],
  ['fn_is_service_role', 'RLS policy helper backing 7 policies.'],
  ['fn_list_chairman_webauthn_credentials', 'App-called (chairman WebAuthn flow).'],
  ['fn_user_has_venture_access', 'RLS policy helper backing 17 policies.'],
  ['fn_write_kill_audit_trail', 'REVERSAL 1 — see header: moved here from Bucket A during PLAN.'],
  ['get_gate_decision_status', 'App-called.'],
  ['reject_chairman_decision', 'App-called (chairman decision queue).'],
  ['upsert_operator_cash_burn', 'App-called.'],
];
const BUCKET_C = [
  ['check_feedback_rate_limit', 'Referenced by an anon-facing RLS policy.'],
  ['fn_advance_pipeline_stage', 'No internal caller found — treated as external-integration-shaped, not revoked on absence of evidence.'],
  ['fn_is_chairman', 'Referenced by an anon-facing RLS policy (29 policies total).'],
  ['fn_relay_insert_sms_candidate', 'Anon-only grant, zero internal callers — the Twilio inbound SMS webhook.'],
  ['is_leo_admin', 'Referenced by an anon-facing RLS policy (9 policies).'],
  ['lhe_pending_migration_applied', 'No internal caller found — treated as external-integration-shaped.'],
  ['record_venture_error', 'No internal caller found — treated as external-integration-shaped.'],
  ['set_session_working_context', 'No internal caller found — treated as external-integration-shaped.'],
  ['venture_exists_and_active', 'Referenced by an anon-facing RLS policy (feedback.venture_user_insert_feedback).'],
  ['is_chairman_role', 'REVERSAL 2 — see header: moved here from Bucket B during PLAN.'],
  ['fn_anon_ingress_prior_hour_count', 'Backs the anon ingress rate-limit bound — IS the anon-facing control, not a gap.'],
];
const ALL_NAMES = [...BUCKET_A, ...BUCKET_B, ...BUCKET_C].map(([n]) => n);

async function queryGrantState() {
  const sql = `SELECT p.proname, 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS full_sig, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec, has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[${ALL_NAMES.map((n) => `'${n}'`).join(',')}])`;
  const { data, error } = await supabase.rpc('exec_sql', { sql_text: sql });
  if (error) throw new Error(`exec_sql failed: ${JSON.stringify(error)}`);
  const rows = data?.[0]?.result || [];
  const byName = {};
  for (const r of rows) {
    if (!byName[r.proname]) byName[r.proname] = [];
    byName[r.proname].push(r);
  }
  return byName;
}

function directGrantLabel(effective, declaredPublic) {
  if (declaredPublic) return 'indeterminate (PUBLIC already grants it)';
  return effective ? 'YES — direct grant' : 'no';
}

function printBucket(title, entries, byName) {
  console.log(`\n=== ${title} ===`);
  for (const [name, reason] of entries) {
    const rows = byName[name];
    if (!rows || rows.length === 0) {
      console.log(`  ${name}: NOT FOUND IN CATALOG — ${reason}`);
      continue;
    }
    if (rows.length > 1) {
      console.log(`  ${name}: MULTI-OVERLOAD (${rows.length}) — needs disambiguation, cannot report a single state`);
      continue;
    }
    const r = rows[0];
    console.log(`  ${r.full_sig}`);
    console.log(`    declared PUBLIC grant: ${r.public_exec}`);
    console.log(`    effective anon=${r.anon_exec} (direct anon grant: ${directGrantLabel(r.anon_exec, r.public_exec)})`);
    console.log(`    effective authenticated=${r.auth_exec} (direct authenticated grant: ${directGrantLabel(r.auth_exec, r.public_exec)})`);
    console.log(`    — ${reason}`);
  }
}

function assertBucket(title, entries, byName, expect) {
  const failures = [];
  for (const [name] of entries) {
    const rows = byName[name];
    if (!rows || rows.length !== 1) {
      failures.push(`${name}: catalog lookup failed (found ${rows?.length ?? 0} rows, expected 1)`);
      continue;
    }
    const r = rows[0];
    const got = { anon: r.anon_exec, auth: r.auth_exec, public: r.public_exec };
    for (const key of Object.keys(expect)) {
      if (got[key] !== expect[key]) {
        failures.push(`${r.full_sig}: ${key}=${got[key]}, expected ${expect[key]}`);
      }
    }
  }
  console.log(`  [${failures.length === 0 ? 'PASS' : 'FAIL'}] ${title} (${entries.length} functions)`);
  failures.forEach((f) => console.log(`    - ${f}`));
  return failures;
}

(async () => {
  try {
    const byName = await queryGrantState();

    const missing = ALL_NAMES.filter((n) => !byName[n]);
    if (missing.length) console.log('MISSING FROM CATALOG:', missing.join(', '));

    if (MODE === 'baseline') {
      console.log('\n--- BASELINE: current declared/effective exposure (before chairman applies) ---');
      printBucket('BUCKET A (6) — will be fully locked to service_role', BUCKET_A, byName);
      printBucket('BUCKET B (10) — anon will be revoked, authenticated explicitly preserved', BUCKET_B, byName);
      printBucket('BUCKET C (11) — untouched by this migration, shown for reference', BUCKET_C, byName);
      console.log('\n=== BASELINE RESULT: no assertions in this mode — re-run with --verify after the chairman applies ===');
      return;
    }

    console.log('\n--- VERIFY: post-apply grant state must match the migration\'s declared end-state ---');
    const allFailures = [
      ...assertBucket('Bucket A: anon=false, authenticated=false, public=false', BUCKET_A, byName, { anon: false, auth: false, public: false }),
      ...assertBucket('Bucket B: anon=false, public=false, authenticated=true', BUCKET_B, byName, { anon: false, auth: true, public: false }),
      ...assertBucket('Bucket C: unchanged — still anon=true', BUCKET_C, byName, { anon: true }),
    ];
    console.log(`\n=== VERIFY RESULT: ${allFailures.length === 0 ? 'PASS' : `FAIL (${allFailures.length} violation(s))`} ===`);
    if (allFailures.length) process.exitCode = 1;
  } catch (e) {
    console.error('ACCEPTANCE SCRIPT ERROR:', e.message);
    process.exitCode = 1;
  }
})();
