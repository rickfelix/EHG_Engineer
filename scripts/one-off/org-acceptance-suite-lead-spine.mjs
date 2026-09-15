#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 -- LEAD-phase spine population.
 *
 * Scoping decision (LEAD): this SD delivers the acceptance-suite FRAMEWORK + the 14
 * MAST-seeded broken-organization fixtures tested at the DEFINITIONAL/structural level
 * against the role registry (SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001, completed) plus
 * a clean "mock venture" passing-control fixture -- NOT full runtime-behavioral
 * reproduction (memory/duty-ledger/tracing/delegation-receiver-contracts don't exist yet;
 * see docs/plans/archived/sd-leo-orch-agent-organization-build-001-plan.md P3-P6/P8/P9,
 * all still draft/LEAD). E6 (100% catch rate on the CLEAN-SLATE test venture at
 * commissioning) is explicitly deferred -- ratification 3c4a6781 has not been executed
 * (ventures table still holds AltifyAI + ApexNiche AI live). This mirrors the SD's own
 * DB text distinguishing "E6 (at commissioning)" from "Before then: ... asserted in CI."
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const key_changes = [
    {
      change: 'Build a versioned, CI-runnable Organization Acceptance Suite runner (new module, e.g. lib/org/acceptance-suite/run-suite.mjs) that resolves an "organization" via the already-shipped resolveVentureRoles() (lib/org/role-registry-resolver.mjs, from SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001) and evaluates it against a set of checks, returning {suite_version, run_id, content_hash, pass_rate, catch_rate, findings[]} -- the A4 provenance shape (design feedback 20b858dc section 5, "results carry suite version, run id and content hash").',
      impact: 'Gives the org design a real, versioned proof-of-quality artifact instead of the chairman-named "vacuous instrument" pattern (UAT predicate that can never pass; identities-exist witness satisfied by 18,340 orphans) -- the suite cannot silently pass a broken organization because A3 requires it to fail its own seeded broken fixtures first.',
    },
    {
      change: 'Seed the suite with all 14 MAST-derived broken-organization fixtures (arxiv 2503.13657, exact taxonomy: FC1 System Design -- FM-1.1 disobey task spec, FM-1.2 disobey role spec, FM-1.3 step repetition, FM-1.4 loss of conversation history/context truncation, FM-1.5 unaware of termination conditions; FC2 Inter-Agent Misalignment -- FM-2.1 conversation reset, FM-2.2 fail to ask for clarification, FM-2.3 task derailment, FM-2.4 information withholding, FM-2.5 ignored other agent input, FM-2.6 reasoning-action mismatch; FC3 Task Verification -- FM-3.1 premature termination, FM-3.2 no/incomplete verification, FM-3.3 incorrect verification), each expressed as a deliberately-invalid role/task/handoff definition against the role registry\'s structure/function/norms schema, and prove the suite fails (catches) every one of the 14 (A3: "every run must fail every fixture; catch rate reported beside pass rate").',
      impact: 'Proves the suite\'s checks are non-vacuous against a published, independent taxonomy (not one the org invented) -- mirroring this session\'s own established mutation-testing discipline (seed a known-bad input, confirm the detector catches it, never assume).',
    },
    {
      change: 'Define "the mock venture" (referenced but never concretely built anywhere in the codebase per LEAD-phase Explore) as this SD\'s own minimal passing-control fixture: a synthetic, clearly test-only venture id plus a correctly-defined baseline organization derived from a real role-registry base+overlay resolution, used to prove the suite does not fail indiscriminately (pass rate = 100% on the clean fixture, alongside catch rate = 14/14 on the broken ones).',
      impact: 'No other Phase-1 org-design item builds a mock-venture fixture; without it, A3\'s "every run must fail every fixture" cannot be distinguished from a suite that simply fails everything, which would itself be a vacuous instrument.',
    },
    {
      change: 'Implement the 2 currently-provable A2 integrity checks against the ALREADY-LIVE role registry, as suite assertions (not new code in the registry itself): (a) base-immutable-from-venture-context -- org_role_base_versions has no venture_id column and RLS grants are service_role-only (REVOKE ALL FROM anon, authenticated, PUBLIC), confirmed live via direct query, not just the migration file; (b) norms-unwritable-by-agents -- org_role_venture_overlays has no norms column at all, so no venture-scoped write path can reach it regardless of code path. Both facts already exist by construction from SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001; this SD\'s job is to assert and PIN them in the suite so a future migration cannot silently reintroduce the hazard.',
      impact: 'Delivers 2 of A2\'s "integrity" checks (base unwritable by a venture, norms unwritable by agents) with zero new runtime code -- pure regression-pinning of an already-shipped guarantee.',
    },
    {
      change: 'Explicitly document (in the suite\'s own README/docblock, not only in this ticket) which A2 integrity checks and which of the 14 MAST fixtures are DEFERRED because their owning substrate is still draft/LEAD (no-instantiation-for-nonexistent-venture depends on SD-LEO-INFRA-INSTANTIATEVENTURE-REFUSES-VENTURE-001; learning-without-evidence-refused depends on SD-LEO-INFRA-REGRESSION-GATED-SELF-001; several MAST modes -- e.g. FM-2.1 conversation reset, FM-1.4 context truncation, FM-1.3 step repetition -- are fundamentally RUNTIME behaviors that need SD-LEO-INFRA-AGENT-MEMORY-WORKING-001 (P3) / SD-LEO-INFRA-DUTY-LEDGER-TRACING-001 (P4) / SD-LEO-INFRA-DEFINITION-HANDOFF-ASSURANCE-001 (P6) before they can be exercised as anything more than a definitional/spec-shaped proxy). A1 ("run... on every change") makes the suite a living artifact this SD deliberately under-builds now and each landing P-item extends later -- never silently skipped, always a named, dated gap per A5 ("stricter is free, looser needs a record").',
      impact: 'Keeps the suite honest about its own coverage boundary instead of implying full MAST/A2 coverage it cannot yet deliver -- directly serves A6 ("proof of quality = pass rate + catch rate + provenance + escapes, never pass rate alone").',
    },
  ];

  const strategic_objectives = [
    'Serve chairman ratification 212909b9 ("build this before the clean-slate test venture, which is its commissioning test") and org design feedback 20b858dc section 5 (A1-A6) by delivering a CI-verified, self-testing organization acceptance suite proven against a mock-venture fixture NOW, while explicitly deferring E6\'s 100%-catch-rate-on-the-clean-slate-venture claim to the actual commissioning event (ratification 3c4a6781, not yet executed -- AltifyAI and ApexNiche AI are still live in the ventures table).',
    'Prevent the suite itself from becoming another instance of the chairman\'s own named failure pattern ("today\'s vacuous instruments... a test that can never fail") by requiring it to correctly catch 100% of its own 14 MAST-seeded broken fixtures (a published, independent taxonomy) before it is trusted to gate anything real.',
  ];

  const risks = [
    {
      risk: 'Scope creep into the wider org design: this item owns only its own exit predicate; other Phase-1 substrate items (memory, duty ledger, delegation-receiver contracts, definition/handoff assurance, regression-gated self-change, talent-function crews, instantiateVenture guard) are separate, still-draft SDs.',
      severity: 'medium',
      mitigation: 'Suite ships only what is provably testable against the ALREADY-LIVE role registry; every deferred check is named with its owning SD, not silently folded in.',
    },
    {
      risk: 'A suite that checks only definitional/structural properties (not live runtime agent behavior) risks reading as the exact "vacuous instrument" class the chairman named this design to prevent, since several MAST failure modes (e.g. FM-2.1 conversation reset, FM-1.4 context truncation) are fundamentally runtime behaviors this SD cannot yet exercise.',
      severity: 'medium',
      mitigation: 'A3\'s self-test (all 14 seeded broken fixtures must fail the suite) is the direct, mandatory countermeasure -- applied via mutation-testing discipline (seed the fixture, prove it is caught) for every fixture this SD ships, and the coverage boundary is documented rather than implied as complete.',
    },
    {
      risk: 'R1 (any new table needs the chairman ceremony, ratification bb2175d2) could be triggered if suite run results are stored in a new dedicated table.',
      severity: 'low',
      mitigation: 'Suite run results are stored as a versioned artifact without a new table (e.g. a content-hashed JSON result plus an existing generic evidence/results store) -- a durable table is an explicit, separately-ceremonied follow-up if one later proves necessary, not assumed here.',
    },
    {
      risk: 'A pre-existing, semantically distinct "catch rate" system already exists in the codebase (lib/breakage-escape/catch-rate-ledger.mjs, SD-LEO-INFRA-BREAKAGE-ESCAPE-INSTRUMENT-001 -- a harness-wide defect catch/escape classifier over sub_agent_execution_results/root_cause_reports/quick_fixes/feedback), which could confuse a reviewer into thinking this SD duplicates it.',
      severity: 'low',
      mitigation: 'VALIDATION (LEAD-TO-PLAN) confirmed by reading its source that the two systems are unrelated; PLAN names both explicitly in the PRD to preempt confusion.',
    },
  ];

  const smoke_test_steps = [
    {
      instruction: 'Run the acceptance suite against the clean "mock venture" passing-control fixture (e.g. `node lib/org/acceptance-suite/run-suite.mjs --fixture mock-venture`)',
      step_number: 1,
      expected_outcome: 'Suite reports pass_rate=100%, catch_rate=N/A (no seeded defects in this fixture), and a result object carrying suite_version, run_id, content_hash',
    },
    {
      instruction: 'Run the acceptance suite against each of the 14 MAST-seeded broken-organization fixtures individually (or as one batch invocation covering all 14)',
      step_number: 2,
      expected_outcome: 'Every one of the 14 fixtures is reported as FAILED by the suite (catch_rate = 14/14 = 100%) -- a fixture that the suite does not catch is a real defect in the suite, not an acceptable result',
    },
    {
      instruction: 'Run the 2 currently-enforceable A2 integrity checks (base-immutable-from-venture-context, norms-unwritable-by-agents) against the live org_role_base_versions / org_role_venture_overlays schema',
      step_number: 3,
      expected_outcome: 'Both checks pass (confirming venture_id absent from the base table, norms absent from the overlay table, RLS grants service_role-only) -- a schema change that reintroduces either column should fail this check',
    },
    {
      instruction: 'Inspect the suite\'s own README/docblock for the documented deferred-checks list',
      step_number: 4,
      expected_outcome: 'Every A2/A3 item this SD does not implement is named explicitly with its owning not-yet-built SD, not silently absent',
    },
  ];

  const success_criteria = [
    {
      criterion: 'A CI-runnable suite runner exists and produces a result object carrying suite_version, run_id, and content_hash (A4 provenance).',
      measure: 'Running the suite runner produces a result object with all three provenance fields populated; verified by direct invocation.',
    },
    {
      criterion: 'All 14 MAST-seeded broken-organization fixtures (FM-1.1 through FM-3.3) are individually caught (fail) by the suite -- 100% catch rate on the fixtures this SD delivers.',
      measure: 'A CI-asserted test for each of the 14 fixtures confirms the suite reports it as failed; a fixture the suite does not catch is a defect, not a pass.',
    },
    {
      criterion: 'The clean mock-venture baseline fixture passes the suite -- proving the suite does not fail indiscriminately.',
      measure: 'A CI-asserted test confirms pass_rate=100% against the clean fixture.',
    },
    {
      criterion: 'The 2 currently-enforceable A2 integrity checks (base immutable from venture, norms unwritable by agents) are asserted and pass against the live role-registry schema.',
      measure: 'A CI-asserted schema/RLS-shape test confirms both invariants hold today.',
    },
    {
      criterion: 'E6 (100% catch rate on the clean-slate test venture at commissioning) is explicitly out of scope for this SD and documented as a future, separate verification event once ratification 3c4a6781 is executed -- this SD is not marked complete against E6.',
      measure: 'The SD\'s own completion evidence cites the "Before then" CI-verified scope, not E6, as this SD\'s delivered success criterion.',
    },
  ];

  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2')
    .select('id, metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const mechanism_verifications = [
    { verified_by: 'LEAD-Explore', verified_at: 'lib/org/role-registry-resolver.mjs:1' },
    { verified_by: 'LEAD-Explore', verified_at: 'database/chairman-gated/20260914_org_role_registry_base.sql:64' },
    { verified_by: 'LEAD-Explore', verified_at: 'database/chairman-gated/20260914_org_role_registry_overlay_pin.sql:31' },
    { verified_by: 'VALIDATION', verified_at: 'lib/breakage-escape/catch-rate-ledger.mjs:1' },
  ];

  const { error: updErr } = await supabase.from('strategic_directives_v2')
    .update({
      key_changes,
      strategic_objectives,
      risks,
      smoke_test_steps,
      success_criteria,
      metadata: {
        ...sdRow.metadata,
        mechanism_verifications,
        needs_enrichment: [],
      },
    })
    .eq('id', sdRow.id);
  if (updErr) throw updErr;

  console.log('SPINE UPDATED:', SD_KEY, 'id=', sdRow.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
