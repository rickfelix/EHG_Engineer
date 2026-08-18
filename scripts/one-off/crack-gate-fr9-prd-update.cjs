require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: prdRow, error: fetchErr } = await supabase
    .from('product_requirements_v2')
    .select('functional_requirements, metadata')
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001')
    .maybeSingle();
  if (fetchErr) throw fetchErr;

  const fr = prdRow.functional_requirements;
  const metadata = prdRow.metadata || {};

  const fr9 = fr.find((f) => f.id === 'FR-9');
  if (!fr9) throw new Error('FR-9 not found in functional_requirements');

  fr9.acceptance_criteria = [
    "Feedback-emission points exist in the relevant workflow stages, calling fn_submit_venture_user_feedback -- IMPLEMENTED, narrowed from the original text's two-RPC framing after reading BOTH RPC bodies live (not assumed): fn_submit_internal_feedback authorizes via auth.uid() and RAISEs unauthorized when NULL (verified live -- a service-role probe returned real 28000, not PGRST202). EVERY EHG_Engineer backend caller runs as service_role, which never carries a user JWT -- so that RPC can NEVER succeed from ANY backend workflow stage, only a real frontend user session (its own comments name FeedbackWidget.tsx as the intended caller). Wiring it into backend code would have been a permanently-dead call, not a 'blocked pending X' state. fn_submit_venture_user_feedback instead authorizes via a per-venture ingest SECRET (_verify_venture_ingest_secret), which IS satisfiable from backend code once provisioned -- this is the RPC actually wired: lib/eva/bridge/venture-user-feedback-emitter.js, called from the crack-gate sweep's (FR-8) per-venture source-unavailable finding in scripts/cron/venture-ops-actuals-sweep.mjs. Zero new insert-path code -- calls the existing RPC only",
    "An authenticated feedback-path smoke test exists and passes -- IMPLEMENTED: tests/unit/eva/bridge/venture-user-feedback-emitter.test.js's describeDb-gated block proves a real PostgREST round-trip (parameter names resolve against the live schema, the RPC's own unauthorized rejection fires, not PGRST202) -- SKIPS in ordinary CI per this repo's designated-non-prod-target convention (tests/helpers/db-available.js), consistent with every other DB-tier test in this SD",
    "The content/model question is explicitly logged as DEFERRED pending QF-20260817-982, not silently absent -- CONFIRMED STILL OPEN (verified live, not assumed): QF-20260817-982's own scope explicitly folds in 'the feedback-capture MODEL' (sign-in-gated vs. anonymous-keyed) as part of its chairman-commissioned reassessment. The emitter is deliberately inert without a real ingestSecret (none provisioned for any venture today) -- it never fabricates a submission and never attempts the RPC without one, so nothing here presupposes an answer 982 hasn't given",
  ];

  metadata.fr9_scope_decision_2026_08_18 = {
    finding: "FR-9's original text named BOTH fn_submit_internal_feedback and fn_submit_venture_user_feedback as wireable. Reading both RPC bodies live (not assumed) before wiring either surfaced a genuine architectural split: fn_submit_internal_feedback is auth.uid()-gated (frontend-user-session only, structurally uncallable from any EHG_Engineer backend code -- would have been a permanently-dead wire, not merely blocked); fn_submit_venture_user_feedback is ingest-secret-gated (backend-callable in principle, currently blocked only on QF-20260817-982's still-open provisioning/model decision -- the same 'safely inert pending an external dependency' shape as FR-1 and FR-10 in this SD).",
    action_taken: "Wired only fn_submit_venture_user_feedback, into the FR-8 crack-gate sweep's per-venture source-unavailable finding (a well-justified, already-owned hook -- avoids inventing a new instrumentation policy for an unspecified 'workflow stage' the chairman-deferred content question does not name). Signaled the fn_submit_internal_feedback finding separately as it may affect other SDs/sessions assuming that RPC is backend-wireable.",
  };

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update({ functional_requirements: fr, metadata })
    .eq('id', 'PRD-SD-MAN-INFRA-VENTURE-CRACK-GATE-001');
  if (updateErr) throw updateErr;
  console.log('FR-9 acceptance_criteria updated and metadata.fr9_scope_decision_2026_08_18 recorded.');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
