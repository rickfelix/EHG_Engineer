// PLAN-phase patch: resolve PRE_PLAN_ADVERSARIAL_CRITIQUE findings (1 block, 3 warn) for
// PRD-SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001 (plan_critiques row 3ff1325f-a022-428a-b957-954183fff93f).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const prdId = 'PRD-SD-FDBK-FIX-FEEDBACKWIDGET-PURPOSE-BUILT-001';

const { data: current, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements, technical_requirements, acceptance_criteria, test_scenarios')
  .eq('id', prdId)
  .single();
if (readErr) { console.error(readErr); process.exit(1); }

const functional_requirements = current.functional_requirements.map((fr) => {
  if (fr.id === 'FR-1') {
    return {
      ...fr,
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'AC-1.6: (BLOCK finding, plan_critiques 3ff1325f) The success response contract is exactly {ok: true, id: <uuid>} (jsonb) -- asserted directly in the dry-run proof (database/chairman-gated/20260817_fdbk_internal_feedback_rpc_dry_run.mjs), which extracts and validates the id field from the RPC return value on every successful call (TS-1/TS-2), and by feedbackDataAccess.ts submitInternalFeedback, which throws "unexpected RPC response shape" if data.ok or data.id is falsy -- the contract is enforced at both the DB and DAL layers, not merely documented.',
      ],
    };
  }
  if (fr.id === 'FR-4') {
    return {
      ...fr,
      description:
        fr.description +
        ' ERROR MAPPING (plan_critiques 3ff1325f, warn): submitInternalFeedback maps PostgrestError.code === \'53400\' (from either check_internal_feedback_rate_limit or the global ceiling) to InternalFeedbackRateLimitExceededError; every other code (22004 invalid input, 28000 unauthorized, or unclassified) maps to a generic Error whose message embeds `(code=<code>)` -- the widget\'s existing onError toast handler already surfaces error.message generically, so no new UI branching is needed, but callers that want to distinguish rate-limiting can `instanceof InternalFeedbackRateLimitExceededError`-check, mirroring submitFeedback/RateLimitExceededError\'s existing convention exactly.',
      acceptance_criteria: [
        ...fr.acceptance_criteria,
        'AC-4.6: (warn finding, plan_critiques 3ff1325f) Unit tests assert the 53400->InternalFeedbackRateLimitExceededError mapping and that a 22004 error message is preserved verbatim in the thrown Error (both already covered by tests/unit/integrations/feedbackDataAccess.test.ts::submitInternalFeedback).',
      ],
    };
  }
  return fr;
});

const technical_requirements = [
  ...current.technical_requirements,
  {
    id: 'TR-6',
    title: 'Deployment ordering: DB migration before frontend deploy (resolves warn finding on rollback completeness)',
    rationale: 'plan_critiques 3ff1325f (warn): a DB-only rollback (DOWN migration) while the deployed frontend still calls fn_submit_internal_feedback would leave the UI calling a missing function (42883). Required ordering: chairman applies the UP migration FIRST; the frontend PR (which always calls the RPC unconditionally, no feature flag) deploys SECOND. No intermediate state exists where the frontend is live without the RPC, because the frontend change and the migration ship as two independently-orderable artifacts under this explicit constraint, not simultaneously. If a rollback is ever needed: revert the frontend PR FIRST (restores the prior, already-broken-but-no-worse direct-insert call), THEN apply the DOWN migration -- reverse of the forward order.',
    description: 'No feature flag: given the RPC-missing failure mode (42883, a clear error) is no worse than today\'s standing defect (42501, an equally opaque-to-the-user rejection), a flag would add a second drift surface for no safety benefit -- ordering discipline alone is sufficient (mirrors TR-3\'s no-feature-flag precedent from the four-audit-critical SD family).',
  },
  {
    id: 'TR-7',
    title: 'check_internal_feedback_rate_limit is NOT extracted into a shared helper with check_feedback_rate_limit (resolves warn finding on reuse)',
    rationale: 'plan_critiques 3ff1325f (warn) asked whether a shared windowed-count helper should replace both single-purpose functions. Evaluated and rejected: both are single-line STABLE SQL functions (LANGUAGE sql) whose only difference is the WHERE clause\'s scoping column (venture_id vs user_id) and threshold (50 vs 20). A shared helper would need either (a) dynamic SQL via PL/pgSQL EXECUTE with a column-name parameter -- loses the STABLE guarantee\'s query-plan caching benefit and reintroduces a SQL-injection-shaped surface for what is currently a fully-parameterized, injection-safe query, or (b) a generic (scope_column_value, scope_type, threshold) signature -- adds an indirection layer to a two-function, ~10-line total surface for no measured maintenance benefit. Both existing functions already share the same error-code/rate-limit convention (ERRCODE 53400) at their call sites, which is the actual behavioral-alignment concern the finding raises -- that alignment is enforced by convention (documented in both functions\' migrations) not by shared code, matching the pattern precedent (TR-3) this SD already follows throughout.',
    description: 'Documented, deliberate non-extraction -- not an oversight.',
  },
];

const test_scenarios = [
  ...current.test_scenarios,
  {
    id: 'TS-11',
    test_type: 'unit',
    given: 'A successful fn_submit_internal_feedback call',
    when: 'the JSONB return value is inspected',
    then: 'it is exactly {ok: true, id: <uuid>} -- no extra or missing keys relied upon by submitInternalFeedback',
    scenario: 'FR-1 response-contract assertion (plan_critiques 3ff1325f BLOCK finding)',
  },
];

const acceptance_criteria = [
  ...current.acceptance_criteria,
  { requirement_id: 'FR-1', criterion: 'AC-1.6: (BLOCK finding, plan_critiques 3ff1325f) success response contract {ok:true, id:<uuid>} enforced at both DB and DAL layers.' },
  { requirement_id: 'FR-4', criterion: 'AC-4.6: (warn finding, plan_critiques 3ff1325f) 53400/22004/28000 error-code mapping unit-tested.' },
  { requirement_id: 'TR-6', criterion: 'Deployment ordering documented: DB migration before frontend deploy; reverse order for rollback.' },
  { requirement_id: 'TR-7', criterion: 'Non-extraction of a shared rate-limit helper is a documented decision, not a gap.' },
];

const { error } = await supabase
  .from('product_requirements_v2')
  .update({ functional_requirements, technical_requirements, test_scenarios, acceptance_criteria })
  .eq('id', prdId);

if (error) { console.error('UPDATE_ERR:', error); process.exit(1); }
console.log('PRD_PATCHED:', prdId);
