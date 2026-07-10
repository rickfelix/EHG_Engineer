#!/usr/bin/env node
/**
 * SD-completion retrospective for SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002.
 *
 * Written directly against the retrospectives table (same pattern as
 * scripts/one-off/insert-retro-sd-leo-infra-value-authenticity-spec-002.mjs)
 * so the PLAN-TO-LEAD RETROSPECTIVE_QUALITY_GATE has a fresh retro_type=SD_COMPLETION
 * row created after the LEAD-TO-PLAN acceptance timestamp, with genuinely
 * SD-specific insights rather than metric-only boilerplate.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = 'b3a90926-4d99-425c-b48a-85b9a502f78a';
const SD_KEY = 'SD-LEO-INFRA-PAYMENT-RAIL-ATTRIBUTION-002';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'APPLICATION_ISSUE',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  title: `Retrospective: ${SD_KEY} — payment-rail Phase 2 venture attribution for Stripe events`,
  description: 'Second SD of the payment-rail family, built on SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001 (merged) without touching its port-isolation invariant (api/webhooks/stripe.js venture_id: null stamp, PAT-PORT-ISOL-001). Delivers metadata-stamped checkout provenance (lib/payments/checkout-provenance.js), a pure DB-only attribution resolver (lib/payments/attribution-resolver.js), a real computePaidGaugeState() implementation (lib/telemetry/funnel-gauge.mjs) replacing the hardcoded gated_on_attribution stub, a one-shot backfill script (scripts/backfill-payment-attribution.mjs) sharing the resolvers code path, and an additive attribution-columns migration (database/migrations/20260710_ops_payment_events_attribution.sql).',
  affected_components: [
    'lib/payments/checkout-provenance.js',
    'lib/payments/attribution-resolver.js',
    'lib/telemetry/funnel-gauge.mjs',
    'scripts/backfill-payment-attribution.mjs',
    'database/migrations/20260710_ops_payment_events_attribution.sql',
  ],
  related_files: [
    'lib/payments/checkout-provenance.js',
    'lib/payments/attribution-resolver.js',
    'lib/telemetry/funnel-gauge.mjs',
    'scripts/backfill-payment-attribution.mjs',
    'database/migrations/20260710_ops_payment_events_attribution.sql',
    'api/webhooks/stripe.js',
  ],
  what_went_well: [
    'New attribution code (checkout-provenance.js, attribution-resolver.js) was built entirely additively on top of SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001 without touching api/webhooks/stripe.js venture_id: null stamp (PAT-PORT-ISOL-001) — the port-isolation invariant the foundation SD established stayed intact through this whole Phase-2 build.',
    'createVentureCheckoutSession() stamps venture_id + source_surface into BOTH the checkout session metadata AND subscription_data.metadata at session-creation time — this makes future invoice/subscription webhook events resolvable via direct-metadata match with zero live Stripe API calls, attribution by construction rather than inference, matching the SDs stated design principle.',
    'attribution-resolver.js stayed strictly DB-only (reads raw_payload already captured in ops_payment_events, no live Stripe expand calls) and idempotent end to end — resolveUnattributedEvents() is the exact same code path used by both the ongoing resolver and the one-shot scripts/backfill-payment-attribution.mjs, satisfying the SDs backfill-is-the-same-code-path success criterion without any duplicated resolution logic.',
    'Self-caught a silent-zero bug in computePaidGaugeState() before ever running it: the first draft scoped unattributed_count per-venture (.eq(venture_id, ventureId).eq(attribution_status, "unattributed")), but unattributed events have venture_id=NULL by definition, so that query would always return 0 and silently hide the exact honest UNATTRIBUTED line the SDs own success criteria required to be visible. Caught by re-reading the just-written code before executing it, not by a test failure, and fixed to a fleet-wide count.',
    'A genuine order-dependent permanent-strand bug in resolveUnattributedEvents was caught by the VALIDATION sub-agent at PLAN_VERIFICATION before LEAD approval: single-pass, created_at-ordered processing combined with the resolvers own idempotency design (excluding already-processed rows from future scans) meant a charge event arriving before its metadata-carrying checkout.session sibling in the same batch would be marked unattributed and then permanently stranded even after its donor resolved moments later. Fixed with a two-pass approach (direct-metadata pass across the whole batch first, lineage pass against the completed candidate set second) before this SD reached LEAD approval.',
    'Root-caused an apparent missing-code anomaly (see key_learnings) to worktree staleness against origin/main rather than acting on a false "phantom completed sibling SD" conclusion, avoiding a wasted investigation into another SDs data integrity.',
    'database/migrations/20260710_ops_payment_events_attribution.sql (4 additive nullable columns + 1 index) was applied and live-verified, following the Phase-1 migrations own forward-only additive convention (verified against 20260613_capital_transactions_stripe_bridge.sql) rather than introducing a new migration pattern.',
  ],
  what_needs_improvement: [
    'The worktree for this SD branched from origin/main roughly 9 minutes before a concurrent sessions PR #5783 landed the exact function (computePaidGaugeState, hardcoded stub) this SDs own rationale referenced — a fresh repo-wide grep for GATED_ON_ATTRIBUTION found zero matches and the referenced sibling SD (SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A) had zero PRD rows despite being marked completed, which looked exactly like a phantom completion before the staleness was diagnosed. The staleness window in a heavily-parallel multi-session fleet is short enough to bite even careful sourcing.',
    'First draft of computePaidGaugeState() had a per-venture-scoped unattributed_count query that would always silently return 0 for events that are unattributed by definition (venture_id IS NULL) — caught before execution, but the failure mode (silently hiding the exact line the SDs success criteria required to be visible) is exactly the class of bug that a passing test suite would not reliably catch, since a naive test asserting the field exists would still pass on a permanently-zero value.',
    'First draft of resolveUnattributedEvents used a single created_at-ordered pass for lineage resolution, which combined with the resolvers own idempotency design (excluding already-processed rows from future scans) could permanently strand a charge event that arrived before its metadata-carrying checkout.session sibling in the same batch — an idempotent single-pass resolver silently converts a transient ordering problem into a permanent one.',
    'No structured test plan existed prior to EXEC (BMAD_EXEC_TO_PLAN gate flagged "No test plan found - implementation proceeded without structured test strategy") — both real bugs in this SD were caught by code self-review and sub-agent review rather than by a written test strategy that could have surfaced them earlier and more systematically.',
    'MANDATORY_TESTING_VALIDATION gate flagged the TESTING sub-agent as not executed for this infrastructure SD despite it touching 43 code files in the LOC_THRESHOLD_VALIDATION scan (628 LOC, exceeding the 500-LOC infrastructure threshold) — advisory only, but a documented coverage gap for a payments-adjacent SD.',
  ],
  key_learnings: [
    'When code that "should exist per an SDs own rationale" appears missing from a fresh repo-wide grep, verify the LOCAL CHECKOUT is current against origin/main before concluding it is a genuine gap. This SDs worktree was about 9 minutes stale when another sessions PR #5783 landed the exact gauge-state function (computePaidGaugeState) minutes after the branch point — in a heavily-parallel multi-session fleet where merges land every few minutes, a short staleness window is enough to manufacture a convincing phantom-completion illusion (zero grep hits + a sibling SD marked completed with zero PRD rows). A `git merge origin/main` resolved it; the harness-bug report was logged and then root-caused before any further action was taken on the false premise.',
    'Fields meant to surface "could not be attributed" cases are NULL/absent for the very rows they exist to report on — a query that filters an aggregate FOR the value it is trying to expose (e.g. .eq(venture_id, ventureId) on a count of events that by definition could not be attributed to any venture) will silently return zero instead of erroring, hiding exactly the honest signal the feature exists to surface. This class of bug is dangerous specifically because it looks correct: the query runs, returns a number, and the number is plausible-looking (0) even though it is structurally guaranteed to always be 0.',
    'Idempotent batch resolvers that (a) process rows in a single ordered pass and (b) permanently exclude already-processed rows from future scans have an inherent order-dependent bug class: a row resolvable via data arriving LATER in the same batch (a sibling event sharing payment_intent_id/stripe_charge_id not yet processed) gets marked terminal before its resolution path exists, and the resolvers own idempotency then locks that error in forever rather than merely delaying it. A two-pass design (resolve every row with direct metadata first, regardless of batch position, then run lineage resolution against the now-complete candidate set) closes this without sacrificing idempotency.',
    'Self-review (re-reading just-written aggregate-query code before ever running it) and sub-agent PLAN_VERIFICATION review each caught a DIFFERENT class of bug in this SD — a silently-wrong per-venture filter on a fleet-wide gauge query, versus a batch-ordering dependency in an idempotent resolver. Neither check would reliably have caught the others bug: the gauge bug was invisible to a static/structural review of the resolver, and the resolver-ordering bug was invisible to a read-through of the gauge function. Both checks earned their keep independently on the same SD.',
    'Extending a sibling SDs placeholder function into a real implementation is safer when the function first checks whether the underlying mechanism has ever actually run (a fleet-wide "has the resolver produced any rows yet" check) before trusting per-venture data derived from it — computePaidGaugeState() returns the honest, unchanged gated_on_attribution state until resolver coverage genuinely exists, rather than reporting a confident-looking but meaningless zero the moment the code path exists but has never executed.',
  ],
  action_items: [
    {
      title: 'Verify worktree freshness against origin/main before concluding referenced code is missing',
      description: 'Before concluding that code "should exist per an SDs own rationale" is genuinely missing from a fresh repo-wide grep, run git fetch and compare the worktrees branch-point commit timestamp against origin/main HEAD. This SD lost investigation time to a 9-minute-stale worktree that made another sessions in-flight PR (#5783, landing the exact function this SDs rationale depended on) look like a phantom-completed sibling SD instead of a routine staleness gap. Recurring risk in a heavily-parallel multi-session fleet where merges land every few minutes — file as a standing pre-check, not a one-off.',
      priority: 'high',
      owner_role: 'EXEC',
    },
    {
      title: 'Audit other idempotent-batch-resolver-style code for the same order-dependent-permanent-strand bug class',
      description: 'Audit other repo code that shares resolveUnattributedEvents original shape (single-pass, created_at-ordered processing that permanently excludes already-processed rows from future scans) for the same bug class fixed via a two-pass approach in lib/payments/attribution-resolver.js. Candidates are any resolver/reconciliation/backfill job that marks rows terminal within one ordered pass while relying on sibling-row data (shared foreign keys, lineage joins) that may arrive or get processed later in the same batch or a subsequent run.',
      priority: 'high',
      owner_role: 'PLAN',
    },
    {
      title: 'Add a structured test plan for the two bug classes found in this SD',
      description: 'Add unit tests for lib/payments/attribution-resolver.js and lib/telemetry/funnel-gauge.mjs covering: (a) aggregate/gauge queries that filter FOR the value being reported on (regression test: unattributed_count must remain fleet-wide, never re-scoped to a single venture_id filter), and (b) batch-ordering dependencies in resolveUnattributedEvents (regression test: a lineage-resolvable row arriving before its donor sibling in the same batch must resolve, not strand). BMAD_EXEC_TO_PLAN flagged "No test plan found" for this SD — this closes that gap retroactively.',
      priority: 'medium',
      owner_role: 'EXEC',
    },
    {
      title: 'Run the TESTING sub-agent retroactively for this SDs 43 touched code files',
      description: 'MANDATORY_TESTING_VALIDATION flagged TESTING as not executed for this infrastructure SD despite LOC_THRESHOLD_VALIDATION recording 628 LOC across 43 code files (exceeding the 500-LOC infrastructure threshold). Run the TESTING sub-agent against the payment-rail attribution changes as a follow-up, given the payments-adjacent surface area.',
      priority: 'medium',
      owner_role: 'PLAN',
    },
  ],
  improvement_areas: [
    {
      area: 'Worktree staleness manufactured a phantom-completion false alarm',
      analysis: 'The SDs own rationale referenced Child A FR-3 of a completed sibling SD (SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A) with a GATED_ON_ATTRIBUTION gauge state to un-gate, but a fresh repo-wide grep for GATED_ON_ATTRIBUTION found zero matches, and that sibling SD had zero PRD rows despite being marked completed — looking exactly like a phantom completion. Root cause: the worktrees origin/main snapshot was about 9 minutes stale; another sessions PR #5783 had landed the exact gauge-state function (computePaidGaugeState, hardcoded stub) literally minutes after this worktree branched.',
      prevention: 'Fixed for this SD via git merge origin/main once diagnosed. Logged as a harness bug and root-caused before acting further on the false premise. Documented as the first action item above so future sessions check worktree freshness before concluding referenced code is genuinely missing, especially in a heavily-parallel multi-session fleet where merges land every few minutes.',
    },
    {
      area: 'Silently-wrong per-venture filter on a fleet-wide-by-definition aggregate',
      analysis: 'The first draft of computePaidGaugeState() scoped unattributed_count with .eq(venture_id, ventureId).eq(attribution_status, "unattributed") — but unattributed events have venture_id=NULL by definition, since an event that could not be attributed to ANY venture cannot be filtered TO a specific venture. The query would always return 0, silently hiding the exact honest UNATTRIBUTED line the SDs own success criteria required to be visible.',
      prevention: 'Caught by re-reading the just-written code before running it, and fixed to a fleet-wide count (unattributed_count_fleet_wide) before any test ever ran against it. Documented as a key_learning above (aggregate queries that filter FOR the value being reported on) as a reusable check for future gauge/reporting code in this and other resolver-adjacent modules.',
    },
    {
      area: 'Order-dependent permanent strand in an idempotent single-pass resolver',
      analysis: 'resolveUnattributedEvents processed pending rows in a single created_at-ordered pass, so lineage resolution (borrowing a sibling events venture_id via a shared payment_intent_id) depended on processing order. A charge event appearing before its metadata-carrying checkout.session sibling in the same batch would be marked unattributed before its donor ever resolved — and because the resolvers own idempotency design excludes already-processed rows from future scans, that row would be permanently stranded even after the donor resolved moments later.',
      prevention: 'Caught by the VALIDATION sub-agent at PLAN_VERIFICATION and fixed before LEAD approval with a two-pass approach: pass 1 resolves every row with direct metadata regardless of batch position, pass 2 runs lineage resolution against the now-complete candidate set. Documented as the second action item above to audit other idempotent-batch-resolver-style code in the repo for the same bug class.',
    },
  ],
  success_patterns: [
    'Self-caught pre-execution code review (re-reading just-written aggregate-query logic) caught a silent-zero unattributed_count bug before any test ran against it',
    'PLAN_VERIFICATION sub-agent review caught an order-dependent permanent-strand bug in idempotent batch resolution before LEAD approval, fixed via a two-pass design',
    'Root-caused an apparent missing-code/phantom-completion anomaly to worktree staleness against origin/main rather than acting on a false conclusion about a sibling SDs integrity',
    'New attribution code (checkout-provenance.js, attribution-resolver.js) built entirely additively on top of the foundation SD without touching its port-isolation invariant (api/webhooks/stripe.js venture_id: null stamp, PAT-PORT-ISOL-001)',
  ],
  failure_patterns: [
    'First draft of computePaidGaugeState() silently returned 0 for unattributed_count due to an impossible venture_id filter applied to rows that are NULL-venture-id by definition',
    'First draft of resolveUnattributedEvents processed rows in a single created_at-ordered pass, permanently stranding lineage-resolvable rows that arrived before their donor sibling in the same batch',
    'No structured test plan existed prior to EXEC for a payments-adjacent, infrastructure-tier SD touching 43 code files (628 LOC, over the 500-LOC infrastructure threshold)',
  ],
  business_value_delivered: 'Un-gates the demand-engine paid KPIs GATED_ON_ATTRIBUTION state with a genuine venture-attribution mechanism (metadata-stamped checkout provenance + DB-only resolver), Phase 2 of the payment-rail family built on SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001.',
  customer_impact: 'Indirect: unblocks accurate paid-KPI and revenue-attribution reporting for ventures once resolver coverage exists fleet-wide; no end-user-facing surface changed.',
  technical_debt_addressed: false,
  technical_debt_created: true,
  bugs_found: 2,
  bugs_resolved: 2,
  tests_added: 0,
  performance_impact: 'Standard',
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  human_participants: ['LEAD'],
  team_satisfaction: 9,
  metadata: {
    sd_key: SD_KEY,
    predecessor_sd: 'SD-LEO-INFRA-PAYMENT-RAIL-FOUNDATION-001',
    referenced_sibling_sd: 'SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-A',
    port_isolation_invariant: 'PAT-PORT-ISOL-001 (api/webhooks/stripe.js venture_id: null stamp)',
    loc_count: 628,
    code_file_count: 43,
    migration: 'database/migrations/20260710_ops_payment_events_attribution.sql',
    harness_bug_root_cause: 'worktree ~9 minutes stale against origin/main vs concurrent PR #5783',
    plan_verification_finding: 'order-dependent permanent-strand bug in resolveUnattributedEvents, fixed via two-pass resolution',
    self_caught_finding: 'silently-zero unattributed_count due to impossible per-venture filter on NULL-venture_id-by-definition rows',
    handoffs_completed: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
  },
};

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
    process.exit(1);
  }
  const s = createClient(url, key);

  // Dedup guard: don't create a second SD_COMPLETION row if one already exists.
  const { data: existing } = await s
    .from('retrospectives')
    .select('id, created_at')
    .eq('sd_id', SD_UUID)
    .eq('retro_type', 'SD_COMPLETION')
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`SD_COMPLETION retrospective already exists (id: ${existing[0].id}, created_at: ${existing[0].created_at}) — no new row needed.`);
    return;
  }

  const { data: ins, error: insErr } = await s.from('retrospectives').insert(retro).select('id').single();
  if (insErr) {
    console.error('Insert failed:', insErr.message);
    process.exit(1);
  }
  const retroId = ins.id;
  console.log('Inserted retrospective id:', retroId);

  const { data: ver, error: verErr } = await s
    .from('retrospectives')
    .select('id, sd_id, retro_type, retrospective_type, quality_score, status, created_at, learning_category, target_application')
    .eq('id', retroId)
    .single();
  if (verErr) {
    console.error('Verify failed:', verErr.message);
    process.exit(1);
  }
  console.log('Verified:', JSON.stringify(ver, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
