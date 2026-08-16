// LEAD-phase correction for SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001, incorporating
// VALIDATION (evidence row 0332fe88-4e8d-4362-9c41-07c3fc96ac86) and RISK (evidence row
// e252eef9-9f7a-4180-81bb-d00f8ea470a6) sub-agent findings — both independently converged on
// the same two correctness defects in the SD's original SQL design. Live-verified myself via
// supabase.rpc('exec_sql', {sql_text}) that fn_write_kill_audit_trail (Bucket A) currently
// shows public_exec=true, confirming R1 directly rather than trusting the report alone.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001';

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, description')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (fetchErr) throw fetchErr;

const addendum = `

═══════════════════════════════════════════════════════════════════════════
LEAD-PHASE CORRECTIONS (VALIDATION + RISK sub-agents, 2026-08-15, evidence rows
0332fe88-4e8d-4362-9c41-07c3fc96ac86 / e252eef9-9f7a-4180-81bb-d00f8ea470a6) —
READ BEFORE AUTHORING THE MIGRATION. Both agents independently found the same two
mechanism defects; live-verified directly (fn_write_kill_audit_trail currently shows
public_exec=true via has_function_privilege over supabase.rpc('exec_sql', {sql_text})).
═══════════════════════════════════════════════════════════════════════════

C1 — BUCKET A'S REVOKE AS WRITTEN IS A NO-OP. All 6 Bucket A functions (and 7 of Bucket B's
27) carry an explicit PUBLIC grant. anon/authenticated INHERIT PUBLIC's grant — revoking
"FROM anon, authenticated" alone leaves the function reachable through PUBLIC. Every REVOKE in
this migration MUST read "FROM PUBLIC, anon, authenticated" (Bucket A) or "FROM PUBLIC, anon"
(Bucket B), matching the predecessor migration's own correct pattern
(20260728_revoke_public_execute_role_flag_rpcs.sql, commit 13d02e18d81) — the original SD
description dropped PUBLIC from both.

C2 — THE RECURRENCE FIX AS SCOPED DOES NOT PREVENT RECURRENCE. Live-measured: pg_default_acl
for (postgres, public, functions) already carries an EXPLICIT anon=X, authenticated=X grant,
ADDITIVE to Postgres's built-in PUBLIC=X default. "ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE
ON FUNCTIONS FROM PUBLIC" therefore leaves anon/authenticated's explicit default grants intact
-- every future function would STILL be anon-executable by default. Must read
"REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon" (keep authenticated as a default grant, since
the app depends on it for functions that never get an explicit GRANT — see C5).

C3 — THE DESIGNATED VERIFIER CANNOT SEE THE CHANGE BEING MADE. scripts/audit-rpc-execute-grants.mjs
only ever asserts has_function_privilege('authenticated', ...) — it has no anon or PUBLIC
dimension. Since this SD's actual fix IS revoking anon, the existing tool reports green
whether the fix worked or not. PLAN must either extend this script (assert
NOT has_function_privilege('anon'/'public', oid, 'EXECUTE') for Buckets A+B, assert Bucket C
byte-identical before/after, fail loudly on any SECDEF function matching no declared bucket)
or author a new companion verifier — reusing/extending is preferred per FR-4-style dedup
discipline, not duplicating.

C4 — THE "42 VERDICTS" FRAMING OVERSTATES THE RESIDUAL AND SHOULD BE CORRECTED BEFORE THE
CHAIRMAN ASK. Live-measured: only 10 of Bucket B's 27 functions currently show anon_exec=true
— the other 17 were already closed by the June 2026 sweep (20260603_03 and its follow-ups).
The chairman authorization should be requested against the ACTUAL residual (Bucket A's 6 +
Bucket B's ~10 = ~16 functions genuinely changing state), not "42 verdicts", since the SD's
own stated principle is "authorization given against a verified list, not a category."
Re-measure the exact current count at PLAN/EXEC time, since state may have shifted again.

C5 — THE 42-FUNCTION LIST IS A FLOOR, NOT A CEILING; RE-SCAN BEFORE FINALIZING. Confirmed
anon-executable SECURITY DEFINER functions NOT in any bucket: get_daily_briefing,
get_okr_metrics, get_portfolio_summary (predate the 2026-07-28 scan), plus
fn_anon_ingress_prior_hour_count and log_sd_mutation_audit (post-date it). PLAN must re-run
the 5-dimension scan (or a live has_function_privilege sweep, now that exec_sql RPC provides a
working non-pooler path) immediately before migration authoring and triage any newly-found
functions into a bucket rather than silently excluding them by omission.

C6 — TWO SPECIFIC BUCKET PLACEMENTS NEED RE-CONFIRMATION, NOT SILENT INCLUSION:
  - fn_stage_artifact_precondition (Bucket A): the stated reasoning "called only by SECDEF fn"
    is FACTUALLY WRONG — it has a direct .rpc() call at scripts/harness/s20-fixture.mjs:219.
    It is safe to revoke only BY COINCIDENCE (that caller builds a service_role client, so the
    revoke doesn't break it) — not for the reason recorded. Correct the reasoning before this
    goes to the chairman; the verdict (revoke) likely still holds, but "safe by coincidence"
    recorded as "safe by design" is a debt for the next person who adds a caller.
  - fn_user_has_company_access (Bucket A): REVERSES a deliberate defense-in-depth decision
    made in 20260603_03, which explicitly allowlisted this function. It is safe TODAY (zero
    policies currently reference it) but scripts/lint/rls-anon-tenant-predicate-lint.mjs:207
    actively steers future policy authors toward using it as an auth primitive — this revoke
    sets up a collision with the codebase's own lint guidance. Flag this explicitly to the
    chairman as a reversal of a prior explicit decision, not just another bucket entry.

C7 — NO ROLLBACK IS CURRENTLY REQUIRED BY success_criteria; ADD ONE. The predecessor migration
(13d02e18d81) shipped a paired _DOWN.sql restoring the exact pre-apply ACL. This SD's apply is
a one-shot chairman ceremony EXEC cannot re-enter — author the _DOWN.sql from a captured
pre-apply ACL baseline (VALIDATION's evidence row has one; re-capture fresh at apply time) as
a REQUIRED deliverable, not optional.

C8 — RLS POLICY SCAN MAY HAVE AN INCOMPLETE MATCH. 412 of 1757 CREATE POLICY statements carry
no explicit TO clause, defaulting to PUBLIC (which includes anon). If the original 5-dimension
scan's "referenced by an anon-facing policy" check matched literal roles={anon} only, it may
have missed policies that default to PUBLIC and reference a Bucket A/B function in qual/
with_check — re-verify Bucket A/B membership against BOTH roles={anon} AND roles is null/empty
(defaults to PUBLIC) before finalizing.

WORKING VERIFICATION PATH (pooler is credential-broken, signaled — but not fully blocking):
supabase.rpc('exec_sql', { sql_text: '<SQL>' }) via the REST client (service-role key) executes
arbitrary SQL including pg_proc/has_function_privilege catalog queries. Param name is
sql_text, not sql. Use this for all live grant verification until the pooler credential is
fixed.
`;

const { data: updated, error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ description: sd.description + addendum })
  .eq('id', sd.id)
  .select('id, sd_key')
  .maybeSingle();
if (updateErr) throw updateErr;
console.log('Description updated with LEAD-phase corrections:', updated.sd_key);

const risks = [
  {
    risk: 'Bucket A/B REVOKE statements as originally described omit PUBLIC, making the revoke a no-op for any function carrying a PUBLIC grant (confirmed live: fn_write_kill_audit_trail shows public_exec=true)',
    impact: 'critical', likelihood: 'certain (already confirmed live)',
    mitigation: 'Every REVOKE statement in the authored migration must include PUBLIC explicitly: "FROM PUBLIC, anon, authenticated" (Bucket A) / "FROM PUBLIC, anon" (Bucket B). Verify post-migration with has_function_privilege(\'public\', ...) = false for every touched function, not just anon/authenticated.',
  },
  {
    risk: 'ALTER DEFAULT PRIVILEGES as originally scoped (REVOKE FROM PUBLIC only) does not stop recurrence, since pg_default_acl already carries an explicit additive anon grant for this role/schema',
    impact: 'high', likelihood: 'certain (already confirmed live)',
    mitigation: 'Scope the ADP statement to "REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon" and verify against a throwaway post-migration function that anon_exec=false by default (authenticated stays granted by default, since ~101 of 118 recent function-creating migrations rely on the default grant and provide no explicit GRANT).',
  },
  {
    risk: 'The designated regression verifier (scripts/audit-rpc-execute-grants.mjs) only checks the authenticated axis — it cannot observe whether the anon-revoke half of this migration (the actual security fix) succeeded or broke anything',
    impact: 'high', likelihood: 'certain (already confirmed by code read)',
    mitigation: 'Extend the verifier (or add a companion) to assert anon/PUBLIC EXECUTE is absent for Buckets A+B post-migration, and that Bucket C is byte-identical before/after. Do not treat a green audit-rpc-execute-grants.mjs run alone as evidence the migration worked.',
  },
  {
    risk: 'The 42-function bucket list is a floor, not a ceiling — at least 5 anon-executable SECURITY DEFINER functions exist live that are not in any bucket (some predate the scan, some post-date it), and the "27-function Bucket B" framing overstates the true residual (only ~10 currently show anon=true)',
    impact: 'medium', likelihood: 'high (already confirmed live)',
    mitigation: 'Re-run the 5-dimension scan (or a live has_function_privilege sweep via the now-working exec_sql RPC path) immediately before migration authoring, triage any newly-found functions, and correct the chairman-facing ask to reflect the actual current residual count rather than the stale August scan.',
  },
  {
    risk: 'Two specific Bucket A placements rest on reasoning that does not hold: fn_stage_artifact_precondition has an undocumented direct caller (safe only by coincidence, not by the recorded reasoning), and fn_user_has_company_access reverses a prior explicit defense-in-depth allowlisting decision that an active lint rule still steers future authors toward using',
    impact: 'medium', likelihood: 'low (currently safe, but fragile)',
    mitigation: 'Correct the recorded reasoning for fn_stage_artifact_precondition before the chairman ask. Explicitly flag fn_user_has_company_access as a reversal of the 20260603_03 decision, not a routine bucket entry, so the chairman approves it knowingly.',
  },
  {
    risk: 'The migration applies as a one-shot chairman-ceremony action with no rollback currently required by success_criteria — a production break caught after apply has no fast recovery path',
    impact: 'high', likelihood: 'low',
    mitigation: 'Author a paired _DOWN.sql restoring the exact pre-apply ACL baseline (captured live immediately before apply), matching the predecessor migration\'s and house convention\'s pattern (29 existing _rollback.sql files in this repo).',
  },
];

const { error: riskErr } = await supabase
  .from('strategic_directives_v2')
  .update({ risks })
  .eq('id', sd.id);
if (riskErr) throw riskErr;
console.log('Risks updated with 6 concrete, sub-agent-verified entries.');
