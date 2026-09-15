#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001 -- Explore evidence at LEAD-TO-PLAN.
 *
 * Records the LEAD-phase Explore sub-agent's real findings (already acted on -- the "mock
 * venture is undefined anywhere in the codebase" and "most of Phase 1's substrate is still
 * draft" findings directly drove this SD's scope/key_changes/risks) to the canonical
 * sub_agent_execution_results table.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-ORGANIZATION-ACCEPTANCE-SUITE-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 88,
    phase: 'LEAD-TO-PLAN',
    execution_time_ms: 0,
    summary: "LEAD-phase Explore review of the Solomon AI-organization design and the current codebase surfaced 7 findings, the most significant driving a real LEAD-phase scope decision: (1) the source design's exact text was retrieved directly from feedback row 20b858dc-30fc-4e14-a8a9-951ce5a988d5 (17,110 chars) -- section 5 (A1-A6) is the acceptance-suite spec, section 4 (S1-S8) is the upstream definition/handoff-assurance gate, section 7 phases the work (Phase 1 substrate + acceptance suite proven on the mock venture, Phase 2 commissioning on the clean-slate venture), section 8 names 9 exit predicates (E1-E9), with E6 explicitly a commissioning-time (Phase 2) predicate, not a Phase-1 one. (2) MOST SIGNIFICANT: 'the mock venture', referenced in this SD's own success_criteria text ('the suite catches every seeded fixture on the mock venture, asserted in CI'), does NOT exist anywhere in the codebase as a concrete object -- a whole-repo grep for 'mock venture' returns 9 files, none defining an actual fixture; the only concrete stand-in found is an unrelated synthetic id (FIXTURE_VENTURE_ID) in a role-registry equivalence test, not a provisioned org fixture. This SD is therefore the item that must DEFINE the mock venture, not merely reference a pre-existing one. (3) the clean-slate test venture (ratification 3c4a6781) has NOT been executed -- confirmed live: the ventures table still contains AltifyAI (50763b6a) and ApexNiche AI (809ec7e7), 171 rows total -- so E6 (100% catch rate ON the clean-slate venture) cannot be completed by this SD; it is a future commissioning-time re-run. (4) of the Phase-1 substrate the acceptance suite is meant to eventually test, only the role registry (SD-LEO-INFRA-VERSIONED-ROLE-REGISTRY-001) and the canonical-titles clobber fix (SD-LEO-INFRA-STOP-ORG-ROLE-001, C1) are completed; memory (P3), duty ledger (P4), delegation-receiver contracts (P5), definition/handoff assurance 'the ten questions' lint (P6), regression-gated self-change (P8), talent-function crews (P9), and instantiateVenture-refuses-nonexistent-venture (C2) are all still draft/LEAD -- confirmed by direct strategic_directives_v2 query. (5) the completed role registry ALREADY structurally satisfies 2 of A2's integrity checks by construction, confirmed by reading the migration DDL directly: org_role_base_versions (database/chairman-gated/20260914_org_role_registry_base.sql:64) has no venture_id column at all, and org_role_venture_overlays (..._overlay_pin.sql:31) has no norms column at all -- both tables' RLS grants are service_role-only (REVOKE ALL FROM anon, authenticated, PUBLIC). (6) no existing sub-agent, gate, or test file in the repo already implements a seeded-fixture pass-rate/catch-rate acceptance-suite pattern -- the closest structural analog (PRE_PLAN_ADVERSARIAL_CRITIQUE gate) is a cautionary precedent, not a reusable pattern (0 PASS verdicts across 371 runs, cited in Solomon's own design notes as the reason 'the org never grades itself'). (7) CONST-002 (CLAUDE_ADAM.md, 'Adam proposes; Adam does not execute, accept, or graduate') confirms why no orchestrator SD exists for the parent org design -- SD-LEO-ORCH-AGENT-ORGANIZATION-BUILD-001 is only an archived, untracked plan doc, never a real DB row, consistent with the design's own text.",
    critical_issues: [],
    warnings: [
      {
        id: 'EXP-1',
        severity: 'MEDIUM',
        issue: 'A suite that can currently only check definitional/structural properties (not live runtime agent behavior, since memory/duty-ledger/tracing/delegation-receiver-contracts are all still unbuilt) risks reading as the exact "vacuous instrument" the chairman named this whole design to prevent, for several of the 14 MAST fixtures whose failure mode is fundamentally a runtime behavior (e.g. FM-2.1 conversation reset, FM-1.4 context truncation, FM-1.3 step repetition).',
        evidence: 'Direct query of strategic_directives_v2 for P3/P4/P5/P6/P8/P9/C2 status=draft/LEAD; Solomon session-state notes (.claude/solomon-session-state-d3430608.md:2340-2347) naming the chairman-cited vacuous-instrument pattern this design exists to prevent.',
      },
    ],
    recommendations: [
      'PLAN should scope the 14 MAST fixtures as definitional/structural proxies against the role-registry schema for now, explicitly naming (in the suite\'s own README, not only the PRD) which fixtures/checks are deferred pending P3/P4/P5/P6/P8/P9/C2.',
      'PLAN should confirm the suite\'s run-result storage avoids a new DB table (R1 ceremony) by using a versioned file artifact or an existing generic evidence store.',
      'PLAN should name lib/breakage-escape/catch-rate-ledger.mjs explicitly in the PRD as a distinct, unrelated system, to preempt reviewer confusion (VALIDATION finding).',
    ],
    detailed_analysis: {
      commands_run: [
        'Direct feedback-table read of row 20b858dc-30fc-4e14-a8a9-951ce5a988d5 (17,110 chars), all 14 numbered sections',
        'Whole-repo grep for "mock venture" (case-insensitive) -- 9 files, no concrete fixture definition found',
        'Direct ventures-table query -- 171 rows, AltifyAI and ApexNiche AI both still live',
        'Direct strategic_directives_v2 query for the Phase-1 P1-P9/C1-C5 sibling SDs -- status/current_phase for each',
        'Read database/chairman-gated/20260914_org_role_registry_base.sql and ..._overlay_pin.sql in full -- confirmed no venture_id column on base, no norms column on overlay, RLS service_role-only',
        'grep -rn for catch_rate/seeded_fixture/escape_rate testing vocabulary across the whole repo -- one unrelated hit (RCA evidence file for a different gate)',
        'Read CLAUDE_ADAM.md:115-117 for CONST-002; confirmed SD-LEO-ORCH-AGENT-ORGANIZATION-BUILD-001 is not a real strategic_directives_v2 row',
      ],
    },
    metadata: { independent_verification: true, drove_scope_correction: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    probeExistsRelative: 'scripts/one-off/org-acceptance-suite-lead-explore-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('Explore', sdRow.id, { code: 'Explore', name: 'Explore' }, results, { sdKey: SD_KEY, phase: 'LEAD-TO-PLAN' });
  console.log('STORED:', 'Explore', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
