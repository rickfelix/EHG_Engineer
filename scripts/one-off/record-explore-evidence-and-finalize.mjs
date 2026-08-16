// Records Explore sub-agent evidence (Explore lacks Bash/Write tools, so the orchestrating
// session persists it on Explore's behalf) and folds its findings into the SD description:
// 3 recently-completed SDs already secured much of Bucket B, meaning the residual may be
// smaller than even the LEAD corrections estimated -- PLAN needs a fresh live measurement.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001';
const SD_ID = 'ef96ac1a-69f1-4f57-8ba5-fcec84ad66d5';

const findings_summary = `Discovery pass (repo: EHG_Engineer worktree + sibling ehg app repo).
1. Edge functions: zero calls to any Bucket A/B function via a true anon-unauthenticated path in either repo's supabase/functions/ (14 + 86 functions swept). telegram-chairman-bot calls claim_sd via a service-role client. chairman-webauthn-stepup-verify only comments on fn_verify_and_consume_stepup_token (called internally, matches Bucket A reasoning).
2. Cron/pg_cron/pg_net: zero Bucket A/B invocations outside a service-role context across 22 scripts/cron/*.mjs files and 2 pg_cron migrations.
3. Overlap check: 1 false-positive open SD (regex hit on unrelated text), zero real conflicts. BUT 6 recently-completed SDs already worked this exact surface: (a) 20260603_03_revoke_secdef_execute_from_anon_authenticated.sql explicitly allowlisted fn_user_has_company_access (direct confirmation of LEAD's C6 finding); (b) SD-LEO-FIX-AUDIT-RESTORE-EXECUTE-001 already re-granted authenticated-only to 18 Bucket B functions; (c) SD-LEO-FIX-GRANT-EXECUTE-RESCAN-001 fixed rescan_stage_20; (d) SD-MAN-FIX-SECURITY-GUARD-PACK-001 already applied the CORRECT REVOKE FROM PUBLIC,anon / GRANT TO service_role,authenticated pattern to 8 Bucket B functions; (e)+(f) SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 and SD-LEO-FIX-CLOSE-ANON-VENTURE-001 (both completed within 3 days of this SD) already independently discovered and pattern-solved the C2 ADP-grants-anon-directly defect.
4. audit-rpc-execute-grants.mjs confirmed as the correct file to extend (no sibling anon-axis script exists). Operational bug found: its EHG_APP_SRC default resolves to a nonexistent path when run from inside a worktree, silently falling back to a stale 24-name list missing 7 real Bucket B members.
5. Exact current signatures collected via git-grep for all 6 Bucket A + 15 Bucket B functions from committed migration files. 2 of 6 Bucket A functions (fn_quick_fixes_validate_target_application, fn_verify_and_consume_stepup_token) have NO committed CREATE FUNCTION anywhere in the repo -- signatures must be confirmed live before the migration is authored.`;

const { error: evidenceErr } = await supabase.from('sub_agent_execution_results').insert({
  sd_id: SD_ID,
  sub_agent_code: 'EXPLORE',
  sub_agent_name: 'Explore (discovery agent)',
  phase: 'LEAD',
  verdict: 'PASS',
  confidence: 90,
  summary: 'Discovery pass covering edge functions, cron/pg_cron, overlapping SDs, verifier-tooling sibling check, and exact function signatures for SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001. No conflicting in-flight work; confirmed no anon-path caller for any Bucket A/B function; found 3 completed SDs that already secured part of Bucket B using the corrected REVOKE/GRANT pattern.',
  detailed_analysis: findings_summary,
  recommendations: ['Reuse the exact REVOKE/GRANT ordering already applied in SD-MAN-FIX-SECURITY-GUARD-PACK-001 and SD-LEO-FIX-CLOSE-ANON-VENTURE-001 rather than re-deriving it.', 'Re-measure the TRUE current residual live before finalizing the chairman ask -- much of the original 42-function list may already be secured by completed sibling SDs.', 'Set EHG_APP_SRC explicitly (or update the fallback list) before relying on scripts/audit-rpc-execute-grants.mjs output from inside this worktree.'],
  warnings: ['2 of Bucket A\'s 6 functions have no committed CREATE FUNCTION in this repo -- confirm signatures live before authoring REVOKE statements.'],
  metadata: {
    repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
    executed_from_cwd: 'C:\\Users\\rickf\\Projects\\_EHG\\EHG_Engineer\\.worktrees\\SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001',
    recorded_by: 'orchestrating session on Explore agent\'s behalf (Explore has no Bash/Write tool access to persist its own evidence)',
  },
});
if (evidenceErr) throw evidenceErr;
console.log('Explore evidence row recorded.');

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('description')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (fetchErr) throw fetchErr;

const addendum2 = `

═══════════════════════════════════════════════════════════════════════════
LEAD-PHASE ADDITIONAL FINDING (Explore sub-agent, 2026-08-15) — C9
═══════════════════════════════════════════════════════════════════════════

C9 — 3 RECENTLY-COMPLETED SDS ALREADY SECURED PART OF THIS SURFACE; RE-MEASURE BEFORE
FINALIZING THE ASK. SD-MAN-FIX-SECURITY-GUARD-PACK-001 (completed 2026-06-11) already applied
the CORRECT pattern (REVOKE FROM PUBLIC, anon / GRANT TO service_role, authenticated) to 8
Bucket B functions: advance_venture_stage, advance_venture_to_stage, bootstrap_venture_workflow,
create_eva_conversation, eva_circuit_allows_request, record_eva_failure, record_eva_success,
rescan_stage_20. SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001 and SD-LEO-FIX-CLOSE-ANON-VENTURE-001
(both completed within 3 days of this SD) already independently found and fixed the C2 ADP
defect elsewhere in the schema, using the exact corrected pattern this SD's LEAD phase also
derived. PLAN must re-measure the TRUE current residual live (not trust the original 42-count
or even C4's ~16 estimate) before the chairman ask goes up — the actual number of functions
genuinely still needing action may be smaller still. Reuse SD-MAN-FIX-SECURITY-GUARD-PACK-001's
and SD-LEO-FIX-CLOSE-ANON-VENTURE-001's exact REVOKE/GRANT ordering as the template rather than
re-deriving it.

Operational note for whoever runs scripts/audit-rpc-execute-grants.mjs from this worktree: its
EHG_APP_SRC default resolves to .worktrees/ehg/src, which does not exist here, silently falling
back to a STALE 24-name list missing 7 real Bucket B members (check_feedback_duplicate, claim_sd,
fn_is_service_role, fn_list_chairman_webauthn_credentials, fn_user_has_venture_access,
is_chairman_role, upsert_operator_cash_burn). Set EHG_APP_SRC explicitly or update the fallback
list before relying on this script's output.

2 of Bucket A's 6 functions (fn_quick_fixes_validate_target_application,
fn_verify_and_consume_stepup_token) have NO committed CREATE FUNCTION anywhere in this repo --
confirm their exact signatures live (via the working exec_sql RPC path) before authoring REVOKE
statements for them.
`;

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({ description: sd.description + addendum2 })
  .eq('sd_key', SD_KEY);
if (updateErr) throw updateErr;
console.log('Description updated with C9 addendum.');
