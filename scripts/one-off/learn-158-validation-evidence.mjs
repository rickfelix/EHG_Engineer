#!/usr/bin/env node
/**
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158 — Validation evidence at LEAD-TO-PLAN.
 *
 * An independent validation-agent sub-agent re-derived the Explore investigation from scratch,
 * confirmed the core code chain (98-99% confidence per hop), but REFUTED the Explore agent's
 * causal claim that a falsified `first_seen` timestamp is what drove /learn's scoring -- that
 * field is not read anywhere in scripts/modules/learning/filter.mjs. The validator instead
 * traced and confirmed the real mechanism: the retro-pattern-extraction backlog drain's
 * sibling-SD fan-out (many orchestrator-child SDs sharing one historical Feb-28 incident, each
 * recorded against its own distinct sd_id) defeats filter.mjs's 3 single-SD noise guards, which
 * are all keyed on first_seen_sd_id === last_seen_sd_id. This evidence record captures that
 * independent, corrective re-derivation.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-158';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: sdRow, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', SD_KEY)
    .single();
  if (sdErr) throw sdErr;

  const validationResults = {
    verdict: 'PASS',
    confidence: 92,
    phase: 'LEAD',
    execution_time_ms: 0,
    summary: "Independently re-derived the full 5-hop mechanism claim from scratch (own file reads, own repo-wide caller sweep, own DB queries against a DIFFERENT pattern sample than Explore's) and CONFIRMED it at 98-99% per hop: .github/workflows/retro-pattern-extraction-cron.yml:13,48 (hourly, not disabled) -> scripts/extract-pending-retro-patterns.mjs:23-28,34 (selects oldest-unextracted-first, passes only row.id onward, created_at read only for the lag alarm at :42-44) -> scripts/auto-extract-patterns-from-retro.js:361,245,247 (kb.recordOccurrence({sd_id: sdId, ...}), no timestamp; confirmed zero references to created_at anywhere in the file despite select('*') putting it in scope at :369) -> lib/learning/issue-knowledge-base.js:168,284 (recordOccurrence -> recordSiteAndMaybeEscalate(supabase, updated, {sd_id}), opts omitted) -> lib/learning/class-escalation.js:168,171,57,70 (mergeSite defaults now=new Date(), stamps first_seen at wall-clock time). Extended the repo-wide caller sweep beyond Explore's and found the real-time RCA-orchestrator seams (lib/rca/rca-orchestrator.js:319,382) ALSO never pass opts.now (correctly, since that path is genuinely real-time) -- confirming zero production callers anywhere pass a historical timestamp. BUT REFUTED one clause of the prior Explore-phase causal story: grepped scripts/modules/learning/filter.mjs and confirmed first_seen is read NOWHERE in /learn's scoring path -- its only repo-wide consumer is a human-readable description string at class-escalation.js:98. Traced and confirmed the ACTUAL mechanism instead: filter.mjs's 3 single-SD noise guards (checkSingleSDClosedSource, checkSingleSDStaleOpenSource, checkSingleSDRetroLikeCategory) are all keyed on pattern.first_seen_sd_id === pattern.last_seen_sd_id. The backlog drain records each of ~20 sibling orchestrator-child SDs (all sharing the SAME one-time 2026-02-28 PRD-template defect) against its OWN distinct sd_id, so first_seen_sd_id !== last_seen_sd_id for these patterns, and all 3 guards abstain -- the guards' own premise ('touched >1 SD = genuine recurrence') is exactly the signal the sibling-SD fan-out manufactures for what is really one incident replayed across one batch. occurrence_count (39-41) and updated_at (refreshed to today on every recordOccurrence call) are the fields that actually reach the composite scorer.",
    critical_issues: [],
    warnings: [
      {
        id: 'VAL-1',
        severity: 'MEDIUM',
        issue: "Explore's causal claim ('falsified first_seen directly caused /learn to mint this SD') does not hold -- first_seen is cosmetic (a display string only), not a scoring input. Corrected via a second scope-correction pass (scripts/one-off/correct-scope-learn-158-v2.mjs) that retargets the SD's primary fix at the single-SD noise-guard defeat (scripts/modules/learning/filter.mjs) rather than solely at mergeSite's first_seen field. The mergeSite timestamp-fidelity defect is real and stays in scope as a secondary correctness fix (it still misleads a human LEAD reviewer reading a pattern's site history), just not the mechanism that fooled automated scoring.",
        evidence: 'grep for "first_seen" across scripts/modules/learning/filter.mjs and its test suite returns zero matches; occurrence_count appears at filter.mjs:225,324 as a direct scoring input.',
      },
      {
        id: 'VAL-2',
        severity: 'LOW',
        issue: 'The cron workflow comment cites "568/608 retrospectives in 14 days" (a 14-day sample as of 2026-09-11), not a fixed 568-row backlog total as the first correction pass implied. Live count: 7,983 of 9,869 retrospectives (81%) still have learning_extracted_at IS NULL -- the real, still-draining backlog is roughly 14x larger, meaning this defect class will keep manufacturing false cross-SD-recurrence signals for an extended period.',
        evidence: 'SELECT count(*) FROM retrospectives WHERE learning_extracted_at IS NULL -> 7983 of 9869 total.',
      },
    ],
    recommendations: [
      'PRD should scope the PRIMARY fix at scripts/modules/learning/filter.mjs\'s single-SD guards (make them aware that sibling SDs sharing a parent_sd_id, recorded within one drain run, represent ONE historical incident rather than N independent recurrences) rather than solely at mergeSite\'s first_seen.',
      'Keep the mergeSite/recordOccurrence created_at-threading fix as a secondary, still-valuable correctness fix, additive and optional so lib/rca/rca-orchestrator.js\'s real-time call sites are unaffected.',
      'Regression test both: (1) a synthetic sibling-SD batch sharing one parent_sd_id, backfilled in one drain run, must not defeat the single-SD guards; (2) a synthetic old-created_at retro must produce a site first_seen matching that created_at, not test-run time.',
    ],
    detailed_analysis: {
      commands_run: [
        'Independent re-read of all 5 chain files with own line citations',
        'Own repo-wide grep for every caller of recordOccurrence/recordSiteAndMaybeEscalate, including lib/rca/rca-orchestrator.js:319,382 and archived/dead-code callers',
        'Own DB queries: PAT-LES-752e6a374f67 + PAT-LES-e02af6e8e18d spot-checked independently (19-21 sites each, all first_seen=2026-09-14 12:08:15-12:13:26, 12-14s apart -- sequential batch-loop signature)',
        'All 20 resolved sd_ids -> strategic_directives_v2: 100% status=completed, 100% created 2026-02-28, 19/19 with parent_sd_id set (orchestrator children)',
        'sub_agent_execution_results query for the sampled SDs -> 0 rows ever; sd_phase_handoffs latest activity 2026-06-13, none since 2026-09-01 -- confirms no gate genuinely re-ran today, ruling out the "legitimate re-trigger" alternative explanation',
        'grep scripts/modules/learning/filter.mjs for first_seen (0 matches) vs occurrence_count/last_seen_at/updated_at (direct scoring inputs) -- the refutation that corrected the prior pass',
        'Read filter.mjs\'s 3 single-SD guard functions directly, confirmed first_seen_sd_id===last_seen_sd_id gating on all 3',
        'SELECT count(*) FROM retrospectives WHERE learning_extracted_at IS NULL -> 7983/9869, correcting the "568 backlog" factual drift',
      ],
    },
    metadata: { independent_verification: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    probeExistsRelative: 'scripts/one-off/learn-158-validation-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(validationResults, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('VALIDATION', sdRow.id, { code: 'VALIDATION', name: 'Validation' }, validationResults, { sdKey: SD_KEY, phase: 'LEAD' });
  console.log('STORED:', 'VALIDATION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
