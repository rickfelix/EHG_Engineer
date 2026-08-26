#!/usr/bin/env node
/**
 * One-off: SECURITY sub-agent PROSPECTIVE review of the PRD for
 * SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B, gating the PLAN-TO-EXEC handoff.
 *
 * PLAN-phase review: this is a pre-implementation, high-stakes infrastructure SD
 * (a production DDL migration inserting a new UAT venture_stage and renumbering
 * stages 23-26 to 24-27, touching an irreversible go_live gate on live venture
 * data). No migration code exists yet for this SD's EXEC phase. This review
 * evaluates the PLANNED design against 5 questions, independently verifying live
 * DB state (not trusting the PRD's or an automated RISK sub-agent's prose) via
 * direct pg_proc/pg_policies/information_schema queries against the production
 * database (2026-08-25).
 *
 * Context: an automated RISK sub-agent pass flagged this SD CRITICAL (10/10) on
 * "security" purely from keyword matching on "auth, policy, token" in the SD
 * description -- those words refer to ventures.stage_write_token (a nullable,
 * NULL-at-rest, self-stamp idempotency/attribution column) and the writer-choke
 * REGISTRY mechanism (ventures_canonical_writer_policy()), not any new
 * authentication flow. This review independently verifies that distinction
 * against live pg_get_functiondef output rather than assuming it.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = 'aa05cf0d-254f-4f43-b30b-f935fcedbf21';
const SD_KEY = 'SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B';

const findings = [
  {
    id: 'auth-token-flag-is-keyword-false-positive',
    severity: 'INFO',
    summary: "CONFIRMED FALSE POSITIVE: the RISK sub-agent's CRITICAL(10/10) 'auth, policy, token' flag is a pure keyword match with no underlying auth/authz change. Live-verified via pg_get_functiondef and information_schema this session: (1) ventures.stage_write_token is a nullable text column (confirmed via information_schema.columns) that a BEFORE-INSERT trigger (aaa_reset_canonical_stage_write_token_insert) forces to NULL on every INSERT and a BEFORE-UPDATE trigger (zzz_enforce_canonical_stage_write_final) forces back to NULL at rest after every consuming UPDATE -- it is structurally never a persisted, presentable, or replayable credential, only a same-statement self-attestation written by trusted server-side code. (2) ventures_canonical_writer_policy() is prosecdef=false (plain SQL, no privilege escalation) with EXECUTE granted ONLY to service_role (live-queried information_schema.routine_privileges -- zero rows for anon/authenticated). (3) public.ventures itself has ZERO grants of any kind to anon or authenticated (live-queried information_schema.role_table_grants returned an empty set) -- only service_role holds INSERT/UPDATE/DELETE/SELECT. (4) The enforcement trigger function enforce_canonical_stage_write() is prosecdef=false (SECURITY INVOKER) and never branches on capability_flags contents -- it only checks NEW.stage_write_token IS NULL and EXISTS(registry match), so capability_flags is descriptive metadata only, not an enforcement input. The entire writer-choke mechanism this SD's FR-7 asks it to register into (ventures_canonical_writer_policy()) already shipped to production under a SEPARATE, already-completed SD (SD-LEO-INFRA-STAGE-WRITER-CHOKE-001, status=completed) before this SD (001-B) was even created -- this SD's own scope touches it only by adding descriptive registry rows, not by building or modifying the choke mechanism itself.",
  },
  {
    id: 'registry-registration-does-not-widen-write-access',
    severity: 'INFO',
    summary: "FR-7's plan to register the new UAT stage's writer(s) in ventures_canonical_writer_policy()'s registry CTE does NOT risk widening write access. The registry is a hardcoded VALUES-list SQL function (no backing table, no dynamic INSERT path) whose sole live consumer is the enforcement trigger's EXISTS() check -- adding a row does not itself grant any capability; the ability to set ventures.stage_write_token to a given identity string is gated entirely by which code path can reach the UPDATE statement at all (service_role directly, or a SECURITY DEFINER RPC that already independently enforces fn_is_service_role()/fn_is_chairman()/fn_user_has_venture_access() before it self-stamps). Live-confirmed the function's own EXECUTE grant remains service_role-only and is not proposed to change. No widening vector identified.",
  },
  {
    id: 'venture-stages-rls-no-hardcoded-stage-number-assumption',
    severity: 'INFO',
    summary: "Live-verified public.venture_stages HAS row-level security enabled (relrowsecurity=true) with exactly 2 policies, both SELECT-only for role 'authenticated' with qual='true' (unconditional read, no stage-number predicate) -- confirmed via pg_policies. No INSERT/UPDATE/DELETE policy exists for authenticated on this table, and information_schema.role_table_grants confirms only service_role holds write privileges on venture_stages -- so RLS default-deny plus the absence of any write grant means authenticated genuinely cannot write this table regardless of RLS content. Critically, neither policy's qual text references any literal stage_number value or range -- a DB-wide scan of pg_policies for any policy (on any table) whose qual/with_check text contains a stage-number-shaped literal in the 21-27 range returned ZERO rows. The renumbering DDL (inserting a new row, shifting stage_number 23-26 to 24-27) cannot interact badly with any RLS policy anywhere in the schema because no policy encodes an assumption about current stage numbering.",
  },
  {
    id: 'historical-shim-grant-posture-unstated-recommend-explicit',
    severity: 'MEDIUM',
    summary: "Data-exposure check on FR-4's translate-at-read shim: live-verified both source tables it reconciles (eva_stage_gate_attempts, venture_stage_transitions) are locked down to service_role ONLY today -- RLS enabled, single ALL-command policy scoped to role service_role, zero grants of any kind to anon/authenticated on either table (confirmed via information_schema.role_table_grants and pg_policies). The PRD's system_architecture describes the shim only as 'PostgreSQL view or function, read-only' and does not state its own intended grant posture. This is a genuine, if easily-closed, gap: if EXEC authors the shim as a plain view/function without an explicit REVOKE/GRANT block matching the current service_role-only lockdown (e.g. for developer convenience during testing), it would broaden read access to historical venture stage-transition data beyond what currently has access, without any FR or AC in this PRD catching that regression. No exposure exists TODAY because no shim exists yet -- this is a forward-looking design gap, not a live finding.",
  },
  {
    id: 'chairman-gated-never-auto-applied-is-a-mechanical-control-not-just-documentation',
    severity: 'INFO',
    summary: "Verified the 'staged, chairman-gated, never auto-applied' framing is backed by a genuine, already-operational 3-factor mechanical control in scripts/lib/migration-guards.js -- NOT merely a documentation/header convention this PRD could weaken by omission: (a) the --prod-deploy flag must be passed; (b) a MIGRATION_APPLY_TOKEN env var must match a token-issuance row from a SEPARATE prior `--issue-token` invocation, hashed (SHA-256) and compared server-side, with a 1-hour TTL and single-use consumption (checkTokenFactor); (c) the migration file's own `-- @approved-by: <email>` header must exactly match `git config --get user.email` of the invoking session (checkApproverFactor). Live-tested the approver regex against the literal placeholder text this SD's chairman-gated files currently carry ('-- @approved-by: PENDING') -- it fails to extract any email at all (regex requires an '@'-containing token), so the approver factor hard-fails by construction until a human chairman edits that header to a real ratifying email. Separately confirmed the only automated/scheduled workflow that touches database/chairman-gated/*.sql is .github/workflows/migration-deploy-drift-guard.yml (daily cron 09:17 UTC) -- its own job only DETECTS and reports (GH Actions ::error:: annotation) committed-but-unapplied migrations; it does not invoke apply-migration.js with a token and cannot apply anything. .github/workflows/drive-reports-ddl.yml's own header independently documents (as established, pre-existing repo knowledge, not something this review asserts new) that 'nothing in this repository executes the SQL in database/migrations/' outside that same 3-factor-gated CLI path. No CI/CD or scheduled job in this repo can accidentally apply a chairman-gated file.",
  },
  {
    id: 'hardcoded-p_to_stage-26-upper-bound-in-two-rpcs-not-covered-by-any-fr',
    severity: 'MEDIUM',
    summary: "Adjacent correctness/availability gap discovered during live inspection of the two RPCs this review was asked to independently verify (not a vulnerability -- fails CLOSED, i.e. safe direction, not exploitable): both advance_venture_stage() and fn_advance_venture_stage() hardcode `IF p_to_stage < 1 OR p_to_stage > 26 THEN ... invalid_to_stage` (live-confirmed via pg_get_functiondef pattern match on both function bodies; advance_venture_to_stage and rescan_stage_20 carry no such bound). After this SD's renumbering ships (new max stage becomes 27, since old stage 26 is renumbered to 27), any call to either of these two RPCs targeting the new stage 27 would be rejected with 'invalid_to_stage' even though the venture_stages catalog row for 27 would exist and be valid -- silently making the highest stage functionally unreachable via 2 of the 4 registered canonical writers until this bound is also updated. This is not named in any of FR-1 through FR-8 or in the PRD's risks array. Recommend PLAN add this as an explicit AC (e.g. under FR-2 or FR-3, since it is a direct consequence of the renumber) before EXEC authors the migration, so the bound-update lands in the same change rather than being discovered post-apply as a 'stage 27 unreachable' incident.",
  },
];

const summary = "PROSPECTIVE (PLAN-phase) SECURITY review of the PRD for SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B, gating PLAN-TO-EXEC. This is a pre-implementation review of the PLANNED design only -- no migration code exists yet. Reviewed against 5 questions, independently verifying live production DB state via direct pg_proc/pg_policies/information_schema queries (2026-08-25) rather than trusting the PRD's prose or the automated RISK sub-agent's keyword-matched CRITICAL(10/10) 'security' flag. RESULT: (1) the RISK sub-agent's 'auth, policy, token' flag is a CONFIRMED keyword false-positive -- ventures.stage_write_token is a nullable, NULL-at-rest self-attestation column (never a persisted credential), the registry function is EXECUTE-restricted to service_role only, and public.ventures itself has zero grants of any kind to anon/authenticated; the writer-choke mechanism this SD merely registers a descriptive row into already shipped under a separate, completed SD before this one was created. (2) FR-7's registry registration cannot widen write access -- the registry is a hardcoded VALUES-list consulted only by an EXISTS() check, and adding a row confers no capability by itself. (3) venture_stages has RLS enabled but both its policies are unconditional SELECT-only for authenticated with zero stage-number literals in their predicates, and a DB-wide scan found zero RLS policies anywhere referencing stage-number-shaped literals 21-27 -- the renumber cannot interact badly with any RLS policy. (4) the historical-shim design (FR-4) doesn't yet exist and doesn't state its own grant posture; both source tables it reconciles are service_role-only today, so this is flagged as a forward-looking MEDIUM gap to close with an explicit AC, not a live exposure. (5) the 'chairman-gated, never auto-applied' framing is backed by a real, already-operational 3-factor apply-migration.js guard (flag + single-use hashed 1-hour token + approver-email header matching the invoker's git identity) -- live-tested the current '@approved-by: PENDING' placeholder against the approver regex and confirmed it hard-fails the check by construction; the only automated workflow touching chairman-gated/*.sql is a read-only drift detector that cannot apply anything. One adjacent, non-blocking correctness finding was also surfaced: two of the four registered stage-advance RPCs hardcode an upper bound of 26 for p_to_stage, which would make the new stage 27 unreachable via those two RPCs post-renumber unless updated in the same change -- fails closed (safe), not a vulnerability, but uncovered by any current FR.";

const detailed_analysis = {
    sd_key: SD_KEY,
    phase: 'PLAN',
    review_type: 'prospective_prd_security_review_pre_implementation',
    prd_id: 'PRD-SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B',
    review_method: 'Direct live-database verification (pg_proc/pg_get_functiondef/pg_policies/pg_trigger/information_schema queries via supabase.rpc(\'exec_sql\', ...) against the production Supabase project) cross-referenced against the PRD row\'s functional_requirements, technical_requirements, system_architecture, and risks fields, plus direct file reads of database/chairman-gated/20260825_ventures_canonical_writer_choke.sql, 20260825_ventures_stage_rpcs_self_stamp.sql, scripts/lib/migration-guards.js, and the two GHA workflows referencing chairman-gated/*.sql. No migration code was executed -- this SD is pre-implementation (PLAN phase); this is a design-level review only.',
    live_verification_queries_run: [
      'ventures_canonical_writer_policy() existence, prosecdef, and EXECUTE grants -- prosecdef=false, EXECUTE=service_role only',
      'advance_venture_stage() live body: no v_kill_gates/v_promotion_gates literals, reads venture_stages, has stage_write_token self-stamp -- confirms PRD\'s LEAD EXPLORE CORRECTION',
      'aaa_/zzz_ canonical-stage-write triggers + aaa_ insert-reset trigger: all present and enabled (tgenabled=O) on public.ventures',
      'ventures.stage_write_token column: text, nullable',
      'venture_stages RLS: enabled, 2 SELECT-only authenticated policies, qual=true (no stage-number predicate)',
      'venture_stages / ventures / venture_stage_transitions / eva_stage_gate_attempts table grants: all write privileges service_role-only',
      'ventures RLS policies: named ventures_update_policy exists with roles={public} but ventures table itself has ZERO grants to anon/authenticated, so the policy is unreachable for those roles regardless of its qual content -- SQL privilege check precedes RLS and blocks first',
      'venture_stages rows 20-27 (stage_key/gate_type/is_irreversible) -- go_live (stage 24, promotion, is_irreversible=true) confirmed as the sole irreversible gate in the current live scheme',
      'ventures at stage_number 23-26 grouped by is_demo: 7 demo @23, 1 real (is_demo=false) + 12 demo @24, 1 real @26 -- confirms PRD\'s FR-6 must genuinely account for real ventures already present at shifted stages, not merely a demo-only fixture set',
      'DB-wide pg_policies scan for any policy referencing literal stage-number digits 21-27: zero rows',
      'p_to_stage > 26 hardcode scan across all 4 registered stage-advance RPCs: found in advance_venture_stage and fn_advance_venture_stage, absent from advance_venture_to_stage and rescan_stage_20',
      'approved-by header regex (scripts/lib/migration-guards.js APPROVED_BY_RE) tested against literal "-- @approved-by: PENDING": no match (approver factor hard-fails)',
    ],
    q1_auth_token_flag: 'FALSE POSITIVE -- keyword match only, no auth/authz change; see finding auth-token-flag-is-keyword-false-positive',
    q2_registry_widening: 'NO widening risk identified; see finding registry-registration-does-not-widen-write-access',
    q3_rls_angle_on_venture_stages: 'NO adverse RLS interaction; see finding venture-stages-rls-no-hardcoded-stage-number-assumption',
    q4_data_exposure_via_shim: 'NO live exposure (shim does not exist yet); MEDIUM forward-looking gap flagged -- see finding historical-shim-grant-posture-unstated-recommend-explicit',
    q5_chairman_gated_sufficiency: 'SUFFICIENT -- backed by an operational 3-factor mechanical control, not documentation alone; see finding chairman-gated-never-auto-applied-is-a-mechanical-control-not-just-documentation',
    additional_finding_out_of_scope_of_the_5_questions: 'hardcoded p_to_stage > 26 upper bound in 2 of 4 registered RPCs -- see finding hardcoded-p_to_stage-26-upper-bound-in-two-rpcs-not-covered-by-any-fr',
};

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence_score: 88,
    findings,
    warnings: [
      "FR-4's translate-at-read shim design does not yet state its own grant posture; both source tables it reconciles are service_role-only today and the shim should match that unless a documented broader need exists.",
      "Two of the four registered stage-advance RPCs (advance_venture_stage, fn_advance_venture_stage) hardcode p_to_stage <= 26, which this SD's own renumbering will make functionally incorrect (stage 27 unreachable) unless updated in the same or an immediately-following change.",
    ],
    recommendations: [
      "Add an explicit AC (or extend FR-4) requiring the historical translate-at-read shim's grants to match the service_role-only posture of eva_stage_gate_attempts/venture_stage_transitions unless a documented, reviewed exception is stated.",
      "Add an explicit AC (extending FR-2 or FR-3, since it is a direct mechanical consequence of the renumber) requiring advance_venture_stage() and fn_advance_venture_stage()'s hardcoded `p_to_stage > 26` bound to be updated to `> 27` in the same change, with a test asserting a venture can be advanced to the new max stage post-apply.",
      "Cite the specific 3-factor apply-migration.js guard (flag + hashed single-use token + approver-email header match) explicitly in the PRD's TR-1/FR-8 text, rather than relying on the 'chairman-gated' label alone -- this review found the control mechanically sufficient, but the PRD itself does not currently name it, which matters for a future reader auditing this SD's own safety claim without re-deriving it from scratch.",
    ],
    summary,
    detailed_analysis,
    justification: "CONDITIONAL_PASS rather than PASS because two concrete, closable gaps were found that PLAN should fold into the PRD's ACs before EXEC authors the migration: the historical-shim's grant posture is unstated against a currently fully-locked-down pair of source tables (MEDIUM), and two of the four registered stage-advance RPCs hardcode an upper bound that this SD's own renumbering will silently break (MEDIUM, fails closed/safe but a real post-apply availability gap). CONDITIONAL_PASS rather than WARNING/FAIL because the RISK sub-agent's CRITICAL(10/10) 'security' classification that motivated this review is affirmatively DISCONFIRMED by live verification, not merely unconfirmed: no new auth/authz surface, no write-access widening from the registry registration, no adverse RLS interaction (zero DB-wide policies reference stage-number literals), and the 'never auto-applied' safety claim is backed by a genuinely operational, already-tested-in-this-review 3-factor mechanical control rather than a promise. Neither of the two MEDIUM gaps found is itself a security vulnerability (both fail in the safe direction: an overly-narrow bound rejects a legitimate advance rather than permitting an illegitimate one; an unstated shim grant posture is a should-fix-before-authoring item, not a live exposure since the shim does not exist yet) -- they are correctness/completeness gaps a thorough security pass surfaces, appropriately scoped below WARNING. Confidence 88: every finding is a direct, live, reproducible database query result (pg_get_functiondef, information_schema, pg_policies) or a direct file read (migration files, migration-guards.js, GHA workflow YAML) captured this session, not an inference from the PRD's or SD's prose; the residual uncertainty is that the historical-shim and the specific EXEC-time fix for the p_to_stage bound are not yet authored, so their eventual implementation could still introduce a gap this review cannot see before code exists.",
    phase: 'PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_ID,
    { name: 'Former NSA security architect' },
    results,
    { sdKey: SD_KEY, phase: 'PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
