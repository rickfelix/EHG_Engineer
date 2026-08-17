// PLAN-PHASE-INLINE-MODE PRD insert for SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdId = '399a955f-7da7-42e4-8b55-0baff4e47039';
const sdKey = 'SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001';
const prdId = `PRD-${sdKey}`;
const sessionShort = '698520e6';

const functional_requirements = [
  {
    id: 'FR-1',
    title: 'New SECURITY DEFINER RPC fn_submit_internal_feedback(p_title, p_description, p_type, p_severity)',
    priority: 'high',
    description: 'Create public.fn_submit_internal_feedback(p_title text, p_description text, p_type text, p_severity text) RETURNS jsonb, LANGUAGE plpgsql, SECURITY DEFINER, SET search_path TO \'public\', \'pg_temp\'. GRANT EXECUTE TO authenticated only (no anon grant -- this caller is never anonymous by construction: FeedbackWidget.tsx already gates on `if (!user) return null`). Identity is read via auth.uid() inside the function body, never accepted as a parameter (mirrors fn_submit_venture_user_feedback\'s established "never accept as a parameter what the caller could forge" discipline). RAISE EXCEPTION ERRCODE 28000 if auth.uid() IS NULL. Validate p_type IN (\'issue\',\'enhancement\') and p_severity IN (\'critical\',\'high\',\'medium\',\'low\') (NULL p_severity defaults to \'medium\'), else RAISE EXCEPTION ERRCODE 22004. Validate p_title not null/empty (22004). Map feedback_type: p_type=\'enhancement\' -> \'user_feature_request\', else \'user_bug\' (feedback_feedback_type_check-compatible values, confirmed live). Compute priority server-side mirroring the widget\'s existing calculatePriority (critical->P0, high->P1, medium->P2, low->P3; enhancement always P2), so the client can no longer forge priority either. Insert with source_type=\'manual_feedback\', source_application=\'EHG\', status=\'new\', user_id=auth.uid(), venture_id never set (this caller has none, by design -- matches the FR-4 design doc\'s explicit point). left(p_title,255) / left(p_description,2000) clamp to the live column widths (VARCHAR(255)/TEXT(2000) confirmed via information_schema).',
    acceptance_criteria: [
      'AC-1.1: pg_proc + pg_proc_acl confirms fn_submit_internal_feedback exists, prosecdef=true, EXECUTE granted to authenticated only (not anon, not public).',
      'AC-1.2: Calling the RPC as an authenticated test user with p_severity=\'critical\' succeeds and the resulting row has severity=\'critical\' -- this is the actual defect being fixed (today, every FeedbackWidget submission is unconditionally rejected regardless of severity; see TR-1).',
      'AC-1.3: Calling with an invalid p_type (e.g. \'bug\') raises ERRCODE 22004, not a generic 23514 check-constraint violation surfaced to the client.',
      'AC-1.4: Calling with auth.uid() unresolvable (simulated via a role with no JWT claims) raises ERRCODE 28000.',
      'AC-1.5: The inserted row never has venture_id set, regardless of any attempt to smuggle it (the function signature has no venture_id parameter at all -- structurally impossible, not merely validated away).',
    ],
  },
  {
    id: 'FR-2',
    title: 'New user_id-scoped rate limit: check_internal_feedback_rate_limit(p_user_id uuid)',
    priority: 'high',
    description: 'Create public.check_internal_feedback_rate_limit(p_user_id uuid) RETURNS boolean, LANGUAGE sql, STABLE SECURITY DEFINER, SET search_path TO \'public\', \'pg_catalog\' -- same shape as the existing check_feedback_rate_limit(p_venture_id uuid), which cannot be reused here because this caller has no venture_id. Returns TRUE when the caller IS rate-limited (count(*) >= 20 WHERE user_id = p_user_id AND source_type = \'manual_feedback\' AND created_at > now() - interval \'1 hour\'). fn_submit_internal_feedback (FR-1) calls this BEFORE insert (direct truthy check, matching fn_submit_venture_user_feedback\'s established polarity convention for this idiom) and RAISE EXCEPTION ERRCODE 53400 if rate-limited.',
    acceptance_criteria: [
      'AC-2.1: check_internal_feedback_rate_limit exists, STABLE SECURITY DEFINER, matching check_feedback_rate_limit\'s access pattern.',
      'AC-2.2: Fixture test seeding 20 manual_feedback rows for one user_id within the last hour: the 21st fn_submit_internal_feedback call for that same user_id raises ERRCODE 53400.',
      'AC-2.3: A second, different user_id under the threshold in the same test run still succeeds -- the limit is per-user, not global.',
    ],
  },
  {
    id: 'FR-3',
    title: 'Global per-hour ceiling inside fn_submit_internal_feedback (defense in depth)',
    priority: 'medium',
    description: 'This SECURITY DEFINER path structurally bypasses anon_feedback_ingress_bounds and every other RLS policy on public.feedback for its own internal write (same structural class of gap as record_venture_error(), documented in docs/reference/anon-write-contract.md\'s FR-4 design section, gap 2). Fixing identity (FR-1, via auth.uid()) does not fix the missing global bound. Add, inside fn_submit_internal_feedback, a global ceiling: count(*) WHERE source_type=\'manual_feedback\' AND created_at > now() - interval \'1 hour\' >= 200 -> RAISE EXCEPTION ERRCODE 53400 (200 mirrors anon_feedback_ingress_bounds\'s own manual_feedback cap, confirmed live in the policy WITH CHECK clause -- reusing the same bound this path structurally cannot inherit).',
    acceptance_criteria: [
      'AC-3.1: Fixture test seeding 200 manual_feedback rows in the last hour (any user_id mix) causes the next fn_submit_internal_feedback call to raise ERRCODE 53400, even for a user_id under their own per-user limit.',
      'AC-3.2: The global count query filters on source_type=\'manual_feedback\' specifically (not all feedback rows), matching the scoping discipline fn_submit_venture_user_feedback already applies to its own global ceiling (MEDIUM-2 finding, evidence cefd6b89-cf93-4b34-8b4e-e9b348795bd2) -- an unrelated writer of a different source_type must not count against this ceiling.',
    ],
  },
  {
    id: 'FR-4',
    title: 'Route FeedbackWidget.tsx through a new feedbackDataAccess.ts DAL function, not an inline RPC call',
    priority: 'high',
    description: 'VALIDATION sub-agent finding (evidence a91f146c-b23c-4946-b5c9-c1c5c70268aa, MEDIUM): ehg/src/integrations/feedback/feedbackDataAccess.ts already declares itself the "sole database surface" for feedback widgets, with a house rule of "no inline supabase.from/rpc calls in widget components." Add `submitInternalFeedback(input)` to that module (mirroring the existing `submitFeedback` shape, minus ventureId/ingestSecret/dedup-check, none of which this caller has or needs) calling `supabase.rpc(\'fn_submit_internal_feedback\', {...})`, with its own `InternalFeedbackSubmission`/`InternalFeedbackSubmissionResult`/`InternalFeedbackRateLimitExceededError` types (distinct from the venture-scoped ones, which require a ventureId this caller does not have). FeedbackWidget.tsx imports and calls `submitInternalFeedback` instead of touching `supabase` directly at all. Remove the now-server-computed fields from the client payload (priority via the old calculatePriority, status, source_url, source_application, created_by, created_at, updated_at) -- the RPC sets all of these server-side per FR-1. IMPORTANT: base this edit on `git fetch origin main` HEAD of the ehg repo, not a possibly-stale local checkout -- VALIDATION found the local working copy at C:/Users/rickf/Projects/_EHG/ehg missing `source_type: "manual_feedback"` that origin/main already has (a completed QF), and editing from the stale copy would silently revert it.',
    acceptance_criteria: [
      'AC-4.1: FeedbackWidget.tsx no longer references `supabase` (from @/lib/supabase) anywhere -- it imports only `submitInternalFeedback` from feedbackDataAccess.ts.',
      'AC-4.2: feedbackDataAccess.ts exports submitInternalFeedback, InternalFeedbackSubmission, InternalFeedbackSubmissionResult, InternalFeedbackRateLimitExceededError.',
      'AC-4.3: Manual UI test: a signed-in user submits severity=Critical through the widget; the row lands in public.feedback (verified via a service_role query, not just absence of a client error toast -- client-reported success is not sufficient evidence on its own).',
      'AC-4.4: Manual UI test: an invalid/rate-limited response surfaces as a toast via the existing onError handler, no new error-handling code required.',
      'AC-4.5: The edit is based on origin/main (git fetch + diff confirms no QF-20260817-434-class field is dropped).',
    ],
  },
  {
    id: 'FR-5',
    title: 'Chairman-gated paired UP/DOWN migration',
    priority: 'high',
    description: 'Author database/chairman-gated/<date>_fdbk_internal_feedback_rpc.sql (blank @approved-by header, matching house convention) creating both functions (FR-1, FR-2/FR-3 combined into FR-1\'s function body) and their grants in one transaction, plus a paired _DOWN.sql (DROP FUNCTION both, in reverse order). Add a "Applying <file>" entry to database/chairman-gated/README.md documenting the apply command. No inline-apply caller anywhere in scripts/ (grep-verified).',
    acceptance_criteria: [
      'AC-5.1: database/chairman-gated/<date>_fdbk_internal_feedback_rpc.sql exists with a blank @approved-by header.',
      'AC-5.2: Paired _DOWN.sql exists and DROPs both functions cleanly.',
      'AC-5.3: grep across scripts/ for the migration filename finds zero inline-apply callers.',
      'AC-5.4: README.md has a new "Applying <file>" entry.',
    ],
  },
  {
    id: 'FR-6',
    title: 'Unit/fixture tests for the RPC validation and rate-limit logic',
    priority: 'medium',
    description: 'Add a test harness exercising fn_submit_internal_feedback and check_internal_feedback_rate_limit against a live or transaction-scoped test DB connection (ROLLBACK-guarded, matching the established live-safe DDL verification pattern used by prior chairman-gated migrations in this repo) covering: valid submit at each severity (critical/high/medium/low), invalid p_type, invalid p_severity, missing title, per-user rate limit trip, global ceiling trip, and that venture_id is never set on the resulting row.',
    acceptance_criteria: [
      'AC-6.1: All 8+ cases pass.',
      'AC-6.2: Test file uses a ROLLBACK-guarded transaction (or TEMP-table-scoped harness) -- never leaves residue in public.feedback.',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    title: 'Live-confirmed root cause: zero permissive INSERT policy for anon or authenticated on public.feedback',
    rationale: 'Direct pg_policy query (2026-08-17, this SD\'s own PLAN-phase probe) confirms only `insert_feedback_policy` (permissive, WITH CHECK true) exists for INSERT, scoped to role={service_role} only. `anon_feedback_ingress_bounds` is RESTRICTIVE and applies to every role, but a restrictive policy with no permissive grant to narrow is moot -- there is nothing for it to restrict. This is the "SUPERSEDED, 2026-08-17" finding referenced in this SD\'s own description (worker-signal 6795d774): the original theory (severity-specific exclusion) understated the defect -- ALL FeedbackWidget submissions fail today, at every severity.',
    description: 'This is why a SECURITY DEFINER RPC (FR-1) is the correct mechanism, not an RLS policy edit: SECURITY DEFINER functions bypass table RLS entirely for their own internal write (when the function owner has direct table privileges, matching fn_submit_venture_user_feedback\'s already-working pattern). No policy change is needed or wanted for this SD\'s scope.',
  },
  {
    id: 'TR-2',
    title: 'Severity is NOT clamped to exclude critical/high -- deliberate deviation from the SECURITY sub-agent\'s draft suggestion',
    rationale: 'docs/reference/anon-write-contract.md\'s FR-4 design section (SECURITY sub-agent evidence 241fb047-1b4a-4795-b73b-8fa4c8ab2778) flagged p_severity as drafted and suggested EITHER dropping it as a parameter OR clamping it server-side to exclude critical/high, mirroring anon_feedback_ingress_bounds. That suggestion was written for an anonymous-caller threat model. This SD\'s own problem statement is the opposite: authenticated users selecting Critical/High in the widget today get silently rejected, "masking exactly the most urgent feedback." Clamping severity here would reproduce the original defect under a new code path. Because auth.uid() (FR-1) makes the caller\'s identity real and non-forgeable (unlike the anonymous case the clamp was designed for), the correct abuse control is the user_id-scoped rate limit (FR-2) plus the global ceiling (FR-3), not a severity clamp. This resolution is submitted to a fresh SECURITY sub-agent review at PLAN-TO-EXEC before implementation, per the design doc\'s own "close before implementation" instruction.',
    description: 'p_severity accepts the full critical/high/medium/low range; validation rejects only out-of-enum values, not critical/high specifically.',
  },
  {
    id: 'TR-3',
    title: 'Pattern precedent: fn_submit_venture_user_feedback / check_feedback_rate_limit',
    rationale: 'Both new functions mirror the exact structure, error-code conventions (28000 unauthorized, 22004 invalid input, 53400 rate-limited), and SET search_path discipline of the existing, already-shipped fn_submit_venture_user_feedback (database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql) and check_feedback_rate_limit (database/migrations/20260401_venture_user_feedback_channel.sql). No new conventions introduced.',
    description: 'Reduces review surface -- reviewers already know this shape from the venture-feedback RPC.',
  },
  {
    id: 'TR-4',
    title: 'Independent of, and does not touch, the separate zero-permissive-grant remediation (Remedy A/B)',
    rationale: 'database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql (Remedy A, PRIMARY) and the staged-not-applied 20260817_restore_feedback_permissive_insert.sql (Remedy B, alternative) both address venture-scoped callers. Neither touches FeedbackWidget.tsx\'s actual insert payload, which sets neither venture_id nor a valid feedback_type for that RPC (confirmed by direct code read, TESTING/SECURITY sub-agent evidence 731d79a4/241fb047, cited in 20260817_restore_feedback_permissive_insert.sql\'s own header). This SD\'s FR-1 RPC is a structurally separate, orthogonal fourth mechanism -- it will work regardless of which remedy (or neither) the chairman applies for the venture-scoped path.',
    description: 'No sequencing dependency on the chairman\'s Remedy A/B decision.',
  },
  {
    id: 'TR-5',
    title: 'Reusing feedback_type=user_bug/user_feature_request is safe -- blast-radius measured, not assumed (resolves VALIDATION HIGH finding)',
    rationale: 'VALIDATION sub-agent (evidence a91f146c-b23c-4946-b5c9-c1c5c70268aa) flagged that feedback_feedback_type_check has no dedicated "internal feedback" value, so reusing user_bug/user_feature_request enrolls FR-1 rows into every user_%-scoped predicate portfolio-wide. Measured each one directly: (a) select_feedback_policy (RLS) requires venture_id IS NOT NULL -- FR-1 rows always have venture_id NULL, structurally excluded. (b) check_feedback_rate_limit(p_venture_id) filters WHERE venture_id = p_venture_id -- NULL rows never match any venture\'s count. (c) fn_submit_venture_user_feedback\'s global ceiling filters source_type = \'user_feedback\' -- FR-1 rows have source_type=\'manual_feedback\', excluded. (d) getFeedbackByVenture (feedbackDataAccess.ts:237) explicitly does .eq(\'venture_id\', ventureId) -- NULL rows never returned for any specific venture query. Adding a new CHECK-constraint enum value would be an unnecessary chairman-gated DDL change for a contamination risk that does not actually exist once venture_id NULL is accounted for.',
    description: 'feedback_type reuse is confirmed safe by direct measurement of every consuming query\'s filter predicate, not by inspection of the enum list alone -- this is the "blast-radius measurement" PLAN was asked to record.',
  },
];

const test_scenarios = [
  { id: 'TS-1', test_type: 'unit', given: 'Authenticated caller, p_severity=critical, valid title/description', when: 'fn_submit_internal_feedback is called', then: 'row inserted with severity=critical, feedback_type=user_bug, source_type=manual_feedback, user_id=auth.uid()', scenario: 'FR-1 happy path at the exact severity that fails today' },
  { id: 'TS-2', test_type: 'unit', given: 'Authenticated caller, p_type=enhancement', when: 'fn_submit_internal_feedback is called', then: 'row inserted with feedback_type=user_feature_request, priority=P2', scenario: 'FR-1 enhancement mapping' },
  { id: 'TS-3', test_type: 'unit', given: 'p_type=\'bug\' (invalid)', when: 'fn_submit_internal_feedback is called', then: 'raises ERRCODE 22004', scenario: 'FR-1 input validation: type' },
  { id: 'TS-4', test_type: 'unit', given: 'p_severity=\'urgent\' (invalid)', when: 'fn_submit_internal_feedback is called', then: 'raises ERRCODE 22004', scenario: 'FR-1 input validation: severity' },
  { id: 'TS-5', test_type: 'unit', given: 'p_title=\'\' (empty)', when: 'fn_submit_internal_feedback is called', then: 'raises ERRCODE 22004', scenario: 'FR-1 input validation: title required' },
  { id: 'TS-6', test_type: 'unit', given: '20 manual_feedback rows already exist for user_id X in the last hour', when: 'fn_submit_internal_feedback is called as user X', then: 'raises ERRCODE 53400', scenario: 'FR-2 per-user rate limit trips' },
  { id: 'TS-7', test_type: 'unit', given: '20 manual_feedback rows exist for user X, 0 for user Y', when: 'fn_submit_internal_feedback is called as user Y', then: 'succeeds -- limit is per-user, not global', scenario: 'FR-2 rate limit does not cross-contaminate users' },
  { id: 'TS-8', test_type: 'unit', given: '200 manual_feedback rows exist in the last hour across many users, each individually under their per-user limit', when: 'fn_submit_internal_feedback is called by any user', then: 'raises ERRCODE 53400 (global ceiling)', scenario: 'FR-3 global ceiling trips even when no single user is over their own limit' },
  { id: 'TS-9', test_type: 'unit', given: 'A successful submission', when: 'the resulting row is inspected', then: 'venture_id IS NULL, and no parameter exists to have set it otherwise', scenario: 'FR-1 structural guarantee: venture_id never settable' },
  { id: 'TS-10', test_type: 'manual', given: 'Live ehg deployment, signed-in user', when: 'submit a Critical-severity item through the FeedbackWidget FAB', then: 'no error toast; service_role query confirms the row landed with severity=critical', scenario: 'FR-4 smoke: end-to-end fix confirmation (the exact repro of the original bug)' },
];

const acceptance_criteria = [
  ...functional_requirements.flatMap(fr => (fr.acceptance_criteria || []).map(criterion => ({ requirement_id: fr.id, criterion }))),
  { requirement_id: 'NFR-1', criterion: 'Migration is staged only (blank @approved-by), never applied inline by this SD.' },
  { requirement_id: 'NFR-2', criterion: 'Zero regressions: existing venture-feedback RPC path (fn_submit_venture_user_feedback) and its tests unaffected.' },
  { requirement_id: 'NFR-3', criterion: 'All 3 smoke_test_steps on the SD run green (or documented as pending chairman apply for step 1, if the migration has not yet been applied at PLAN-VERIFY time).' },
];

const risks = [
  { id: 'R-1', risk: 'Severity is not clamped for authenticated callers (TR-2) -- a signed-in but malicious/compromised account could spam critical-severity items to trigger operator attention/paging.', impact: 'MEDIUM', probability: 'LOW', mitigation: 'user_id-scoped rate limit (FR-2, 20/hour) plus global ceiling (FR-3, 200/hour) bound the blast radius; identity is non-forgeable (auth.uid()) so any abuse is directly attributable and revocable (ban the account), unlike the anonymous case the original clamp defended against.', rollback_plan: 'Add a severity clamp in a follow-up migration if abuse is observed in practice -- does not require reverting FR-1.' },
  { id: 'R-2', risk: 'This SECURITY DEFINER path structurally bypasses RLS -- a bug in the function body\'s own validation is not caught by any table-level policy as a second line of defense.', impact: 'MEDIUM', probability: 'LOW', mitigation: 'FR-6 fixture tests directly exercise every validation branch; TR-3 mirrors an already-shipped, already-reviewed pattern (fn_submit_venture_user_feedback) rather than inventing new logic.', rollback_plan: 'DOWN migration drops both functions cleanly; FeedbackWidget.tsx revert restores the (broken but no-worse) prior direct-insert call.' },
  { id: 'R-3', risk: 'Rate-limit thresholds (20/hour per user, 200/hour global) are estimates, not empirically derived from real FeedbackWidget usage volume.', impact: 'LOW', probability: 'MEDIUM', mitigation: 'Thresholds mirror the existing anon_feedback_ingress_bounds manual_feedback cap (200) and check_feedback_rate_limit\'s per-scope cap (50, halved here since this is a lower-traffic authenticated-only UI widget, not a programmatic channel). Adjustable in a follow-up migration without touching the RPC contract.', rollback_plan: 'N/A -- threshold tuning, not correctness.' },
];

const system_architecture = {
  overview: 'A new SECURITY DEFINER RPC pair (fn_submit_internal_feedback + check_internal_feedback_rate_limit) in the EHG_Engineer-managed Supabase DB, called from the EHG frontend\'s FeedbackWidget.tsx via supabase.rpc(). Structurally independent of the existing RLS policies and the separate venture-feedback RPC channel.',
  components: [
    { name: 'public.fn_submit_internal_feedback (new function, EHG_Engineer DB)', role: 'Authenticated-only entry point; identity via auth.uid(); validates input; enforces rate limit + global ceiling; inserts into public.feedback' },
    { name: 'public.check_internal_feedback_rate_limit (new function, EHG_Engineer DB)', role: 'user_id-scoped rate-limit predicate, called by fn_submit_internal_feedback' },
    { name: 'ehg/src/components/quality/FeedbackWidget.tsx', role: 'Caller -- switches from direct .insert() to .rpc(); UI unchanged' },
    { name: 'public.feedback (table)', role: 'Write target -- unchanged schema; RLS policies unchanged (this path bypasses them by design)' },
  ],
  data_flow: 'FeedbackWidget (signed-in user) -> supabase.rpc(\'fn_submit_internal_feedback\', {...}) -> auth.uid() identity check -> input validation -> check_internal_feedback_rate_limit(user_id) -> global ceiling check -> INSERT INTO public.feedback -> {ok:true, id} | RAISE EXCEPTION (28000/22004/53400) -> PostgrestError surfaced to the widget\'s existing onError toast',
};

const integration_operationalization = {
  consumers: [
    { consumer: 'ehg/src/components/quality/FeedbackWidget.tsx (the only caller)', journey: 'Signed-in user submits feedback via the FAB modal; now succeeds at every severity instead of unconditionally failing.' },
  ],
  dependencies: [
    { name: 'public.feedback (table)', direction: 'downstream', failure_mode: 'A future column rename/constraint change could break the INSERT inside the function body -- caught immediately (function fails loudly), not silently, since SECURITY DEFINER does not swallow errors.' },
    { name: 'auth.uid() (Supabase Auth)', direction: 'upstream', failure_mode: 'If the JWT is missing/invalid, auth.uid() returns NULL and the function raises 28000 -- fail-closed, matches house convention.' },
  ],
  data_contracts: [
    { entity: 'fn_submit_internal_feedback input', shape: 'p_title: text (required), p_description: text (optional), p_type: \'issue\'|\'enhancement\', p_severity: \'critical\'|\'high\'|\'medium\'|\'low\'|NULL (defaults medium)' },
    { entity: 'fn_submit_internal_feedback output (success)', shape: '{ok: true, id: uuid}' },
    { entity: 'fn_submit_internal_feedback output (failure)', shape: 'raises PostgreSQL exception with ERRCODE in {28000, 22004, 53400}' },
  ],
  runtime_config: [
    { config: 'No new env vars or feature flags', purpose: 'Migration is additive (new functions + grants); atomic DOWN migration available if reverted.' },
  ],
  observability_rollout: {
    metrics: ['public.feedback row count where source_type=manual_feedback AND source_application=EHG (should become nonzero post-fix; is currently 0 or near-0 due to the standing defect)'],
    rollout_plan: 'Chairman applies the migration (ceremony documented in FR-5); widget change ships in the same PR (frontend change has no DB dependency ordering issue -- calling a not-yet-existing RPC simply 22004/42883s the same way the current insert 42501s, no worse than today).',
    rollback_procedure: 'DOWN migration drops both functions; a git revert of the FeedbackWidget.tsx change restores the prior (already-broken) direct-insert call if needed, though there is no reason to revert the frontend independently of the DB.',
  },
};

const exploration_summary = {
  files_read: [
    'docs/reference/anon-write-contract.md (FR-4 design section + surrounding incident history)',
    'ehg/src/components/quality/FeedbackWidget.tsx (full read)',
    'database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql, 20260817_restore_feedback_permissive_insert.sql (pattern + independence confirmation)',
    'Live pg_proc/pg_policy/information_schema.columns probe against public.feedback and the two existing feedback RPCs (this SD\'s own PLAN-phase script, scripts/one-off/probe-feedback-schema-fdbk-purpose-built-001.mjs)',
  ],
  baseline_observation: 'Live probe (2026-08-17): public.feedback has exactly one permissive INSERT policy, scoped to service_role only. Neither anon nor authenticated can INSERT via RLS today, at any severity. fn_submit_internal_feedback / check_internal_feedback_rate_limit do not yet exist (confirmed via pg_proc). No pending migration file already covers this (grep across database/).',
  validation_agent_evidence: {
    row_id: 'a91f146c-b23c-4946-b5c9-c1c5c70268aa',
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    finding: 'No duplicate implementation (parent SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001 explicitly left FR-4 unimplemented). 4 HIGH/MEDIUM conditions, all folded into this PRD: GATE-1 backlog item created (see backlog_id BL-SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001-001), stale local ehg checkout worked around by a fresh git worktree on origin/main (FR-4 description), feedback_type enum-reuse blast radius measured and resolved (TR-5), DAL architectural boundary followed (FR-4 rewritten to route through feedbackDataAccess.ts).',
  },
  explore_evidence: { row_id: 'bab5aee2-35c1-4100-9107-e820c7d1b1f9', verdict: 'PASS' },
};

const prdRow = {
  id: prdId,
  directive_id: sdKey,
  sd_id: sdId,
  title: 'FeedbackWidget FR-4: purpose-built authenticated feedback RPC with user_id-scoped rate limit',
  version: '1.0.0',
  status: 'in_progress',
  category: 'bugfix',
  priority: 'high',
  document_type: 'prd',
  phase: 'planning',
  progress: 0,
  executive_summary: 'public.feedback has zero permissive INSERT policy reachable by anon or authenticated (confirmed live via pg_policy) -- every FeedbackWidget.tsx submission from a signed-in user is unconditionally rejected today, at every severity, masking exactly the most urgent (critical/high) feedback. Rather than editing the anon-scoped RLS policy (a separate, larger, chairman-gated decision tracked elsewhere -- Remedy A/B, which this SD does not touch and does not depend on), this SD implements the fourth mechanism already design-decision-ready in docs/reference/anon-write-contract.md\'s FR-4 section: a SECURITY DEFINER RPC (fn_submit_internal_feedback) that reads the caller\'s identity via auth.uid() rather than trusting any client-supplied value, structurally bypassing RLS the way fn_submit_venture_user_feedback already does for the venture-scoped channel. Because this caller\'s identity is real and non-forgeable (unlike the anonymous threat model the original severity exclusion defended against), this SD deliberately does NOT clamp severity to exclude critical/high (a documented deviation from the SECURITY sub-agent\'s draft suggestion, see TR-2) -- instead adding a user_id-scoped rate limit plus a global per-hour ceiling as the abuse control, which is the SD title\'s own stated mechanism.',
  business_context: 'FeedbackWidget is the primary in-app channel for users to report issues, including outages/data-loss (severity=critical). A silently-failing submit path for exactly the most urgent category is a real product and safety gap, not a cosmetic bug.',
  technical_context: 'Cross-repo: DB migration lives in EHG_Engineer (database/chairman-gated/); the calling widget lives in the EHG frontend repo (ehg/src/components/quality/FeedbackWidget.tsx). Security-sensitive (RLS-adjacent, new SECURITY DEFINER function) -- Tier 3 full-SD workflow per Work Item Routing, DATABASE and SECURITY sub-agent evidence required at PLAN-TO-EXEC.',
  functional_requirements,
  technical_requirements,
  test_scenarios,
  acceptance_criteria,
  risks,
  system_architecture,
  integration_operationalization,
  exploration_summary,
  technology_stack: ['PostgreSQL (PL/pgSQL, SECURITY DEFINER)', 'Supabase (PostgREST RPC, Supabase Auth)', 'React/TanStack Query (FeedbackWidget.tsx)'],
  dependencies: [
    'public.feedback table (write target, schema unchanged)',
    'auth.uid() / Supabase Auth (identity source)',
    'docs/reference/anon-write-contract.md FR-4 design section (source design)',
  ],
  performance_requirements: { p99_fn_submit_internal_feedback_ms: 100 },
  metadata: {
    sd_key: sdKey,
    sd_type: 'bugfix',
    plan_phase_session: sessionShort,
    loc_estimate: { source: { min: 60, max: 100 }, tests: 150, ceiling: 400 },
    out_of_scope: [
      'anon_feedback_ingress_bounds / any RLS policy edit on public.feedback',
      'Remedy A/B (venture-scoped zero-permissive-grant remediation) -- separate, independent SD/chairman decision',
      'FR-7 drift guard design from anon-write-contract.md -- design-only there, not this SD\'s deliverable',
      'Changing SEVERITY_OPTIONS in the widget UI',
    ],
    sub_agent_evidence: {
      validation: 'a91f146c-b23c-4946-b5c9-c1c5c70268aa',
      explore: 'bab5aee2-35c1-4100-9107-e820c7d1b1f9',
    },
    fr4_design_source: 'docs/reference/anon-write-contract.md lines 257-303',
    severity_clamp_deviation: 'TR-2 -- deliberately does not clamp severity to exclude critical/high, contrary to the SECURITY sub-agent\'s draft suggestion in the design doc, because doing so would reproduce the exact defect this SD exists to fix. Resubmitted for fresh SECURITY sub-agent review at PLAN-TO-EXEC.',
    dry_run_proof: '19/19 assertions pass, ROLLBACK-guarded, database/chairman-gated/20260817_fdbk_internal_feedback_rpc_dry_run.mjs (runs the real UP file body including the DO $verify$ EXECUTE-grant assertions)',
  },
  created_by: `PLAN-PHASE-INLINE-MODE-CC-${sessionShort}`,
  goal_summary: 'Give signed-in FeedbackWidget users a working submit path at every severity via a purpose-built, identity-bound, rate-limited SECURITY DEFINER RPC -- without touching the separate anon-scoped RLS remediation.',
  smoke_test_cmd: 'node database/chairman-gated/20260817_fdbk_internal_feedback_rpc_dry_run.mjs && npx vitest run tests/unit/integrations/feedbackDataAccess.test.ts',
};

const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert(prdRow)
  .select('id, directive_id, sd_id, status, phase, category, priority, created_by');

if (error) {
  console.error('INSERT_ERR:', error);
  process.exit(1);
}

console.log('PRD_INSERTED:', JSON.stringify(data, null, 2));
