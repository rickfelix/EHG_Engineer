import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdKey = 'SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001';

const scope = `IN SCOPE:
- New SECURITY DEFINER RPC public.fn_submit_internal_feedback(p_title, p_description, p_type, p_severity),
  GRANT EXECUTE TO authenticated only (no anon grant) -- identity read via auth.uid() inside the
  function body, never a client-supplied parameter (matches fn_submit_venture_user_feedback's
  established discipline).
- New SECURITY DEFINER helper check_internal_feedback_rate_limit(p_user_id uuid) -- a user_id-scoped
  rate limit (check_feedback_rate_limit is venture_id-scoped and not reusable for this caller, which
  has no venture_id).
- A global per-hour ceiling for this path's source_type inside the same function body (defense in
  depth -- this SECURITY DEFINER path never evaluates anon_feedback_ingress_bounds, so any bound that
  policy provided must be reproduced server-side, not inherited from RLS).
- Update ehg/src/components/quality/FeedbackWidget.tsx to call supabase.rpc('fn_submit_internal_feedback', ...)
  instead of a direct .insert() (which is unconditionally rejected today -- zero permissive INSERT
  policy exists for anon or authenticated on public.feedback, confirmed live via pg_policy).
- Chairman-gated migration (paired UP/DOWN) creating both functions and their grants.
- Unit tests for the rate-limit/severity/type validation logic (via a thin JS wrapper or direct SQL
  fixture harness) and a widget-level test that the RPC is called with the right arguments.

OUT OF SCOPE (explicit, per Q8 deletion audit):
- Does NOT touch anon_feedback_ingress_bounds or any RLS policy on public.feedback -- this path
  bypasses RLS entirely by design (SECURITY DEFINER), so no policy edit is needed or wanted.
- Does NOT restore a permissive anon/authenticated INSERT policy -- that is a separate, larger
  incident (worker-signal 6795d774, zero-permissive-grant finding) explicitly out of this SD's scope.
- Does NOT implement the FR-7 drift guard extension (policy-count guard / RPC-authorization guard)
  documented in docs/reference/anon-write-contract.md -- design-only there, not this SD's deliverable.
- Does NOT change severity options in the widget UI (SEVERITY_OPTIONS stays as-is) -- the fix is to
  make the existing critical/high options actually work for authenticated users, not to remove them.`;

const keyChanges = [
  {
    change: 'Create SECURITY DEFINER RPC fn_submit_internal_feedback(p_title, p_description, p_type, p_severity), authenticated-only grant, identity read via auth.uid()',
    impact: 'Gives signed-in FeedbackWidget users a working submit path at every severity, including critical/high -- the two options the widget already offers but which silently fail today (zero permissive INSERT policy for authenticated on public.feedback).',
  },
  {
    change: 'Create check_internal_feedback_rate_limit(p_user_id uuid), a user_id-scoped rate limit, plus a global per-hour ceiling inside the RPC body',
    impact: 'Replaces the abuse control that a permissive RLS policy would normally provide -- SECURITY DEFINER functions bypass RLS structurally, so this bound must live in the function body, not be inherited.',
  },
  {
    change: 'Update ehg/src/components/quality/FeedbackWidget.tsx to call the new RPC instead of a direct table insert',
    impact: 'Closes the actual defect: today every FeedbackWidget submission from a signed-in user is silently rejected (zero permissive INSERT policy), masking exactly the most urgent feedback.',
  },
  {
    change: 'Author paired chairman-gated UP/DOWN migration for both new functions and grants',
    impact: 'Reversible, matches house chairman-gated DDL convention; ceremony-ready without requiring an inline apply.',
  },
];

const successCriteria = [
  {
    criterion: 'fn_submit_internal_feedback exists, SECURITY DEFINER, GRANT EXECUTE TO authenticated only (no anon grant)',
    measure: 'information_schema / pg_proc + pg_proc_acl query confirms function exists and grants match exactly; live call as an authenticated test user succeeds for every severity value (critical/high/medium/low)',
  },
  {
    criterion: 'A signed-in user can submit critical/high severity feedback through FeedbackWidget.tsx end to end',
    measure: 'Manual UI verification: submit one critical-severity item through the widget, confirm the row lands in public.feedback via a service_role query (client-reported success is not sufficient evidence on its own)',
  },
  {
    criterion: 'The RPC never accepts caller-supplied identity or venture_id, and rejects invalid type/severity input',
    measure: 'Code review of the function body confirms auth.uid() is the sole identity source and venture_id is never a parameter; unit/fixture test asserts invalid p_type/p_severity raises ERRCODE 22004',
  },
  {
    criterion: 'The rate limit and global ceiling actually bind',
    measure: 'Fixture test seeds >threshold rows for one user_id and asserts the next call raises ERRCODE 53400; a second user_id under threshold still succeeds in the same test run',
  },
  {
    criterion: 'Migration is staged, never applied inline, and reversible',
    measure: 'database/chairman-gated/<date>_*.sql exists with a blank @approved-by header and a paired _DOWN.sql; grep confirms zero inline-apply callers across scripts/',
  },
];

const smokeTestSteps = [
  {
    step_number: 1,
    instruction: 'As a signed-in EHG user, open the FeedbackWidget (FAB), select severity=Critical, fill in a title and description, submit.',
    expected_outcome: 'Submission succeeds (no error toast); a service_role query on public.feedback shows the new row with severity=critical, user_id=the submitting user, source_type=manual_feedback, feedback_type=user_bug.',
  },
  {
    step_number: 2,
    instruction: 'Submit a second feedback item of type=enhancement, severity left at default.',
    expected_outcome: 'Row lands with feedback_type=user_feature_request, type=enhancement, priority=P2.',
  },
  {
    step_number: 3,
    instruction: 'Attempt to exceed the per-user rate limit by submitting more than the configured threshold within the same hour (or run the fixture test that simulates this).',
    expected_outcome: 'The RPC raises a rate-limited error (ERRCODE 53400); the widget surfaces this as a toast via the existing onError handler; no additional row is inserted.',
  },
];

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({
    scope,
    key_changes: keyChanges,
    success_criteria: successCriteria,
    smoke_test_steps: smokeTestSteps,
    scope_reduction_percentage: 15,
  })
  .eq('sd_key', sdKey);

if (error) {
  console.error('UPDATE FAILED:', error);
  process.exit(1);
}
console.log('LEAD authoring applied to', sdKey);
