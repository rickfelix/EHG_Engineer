#!/usr/bin/env node
/**
 * One-off: Explore sub-agent evidence for SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F, LEAD-TO-PLAN phase.
 *
 * Records the discovery work actually performed: a very-thorough codebase search for
 * guard/check functions that swallow a Supabase query error into a false/empty/not-found
 * verdict, ranked by consequence. This census was the basis for FR-F1's ranked list and
 * FR-F2's initial corrective target, which two subsequent LEAD-phase sub-agent reviews
 * (validation-agent evidence bedb81c2, testing-agent evidence aa4b4de7) then corrected
 * against current main and the module's real behavior under the wrapped client.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F';

const findings = [
  {
    id: 'finding-1-dedup-checker-highest-severity',
    severity: 'HIGH',
    summary: 'lib/integrations/dedup-checker.js checkDuplicate(): 6 separate swallow points feeding one matches[] accumulator -- lines 99-103/112-118 do not even destructure error (a query failure yields undefined, treated as "no video-ID matches"); lines 126-136/155-167/180-191/203-211 are 4 try/catch blocks each collapsing a fetchAllPaginated() failure to []. Final return {isDuplicate, matches, bestMatch} has no error field anywhere. Confirmed live consumer: lib/integrations/evaluation-bridge.js:173-176 (also scripts/eva/intake-enricher.js) -- when isDuplicate reads false because a query errored, the pipeline auto-creates a new feedback/idea row with zero visibility that dedup failed to check anything.',
  },
  {
    id: 'finding-2-session-conflict-checker-high-self-contradictory',
    severity: 'HIGH',
    summary: 'lib/session-conflict-checker.mjs getSDConflicts()/getClaimedSDs() (lines 86-96, 110-123): return [] on error, feeding canClaimSd() which only blocks for conflicts it actually saw -- an errored check silently reads as canClaim:true despite an unverified conflict. Self-contradictory within the same file: isSDClaimed() (lines 39-71) already implements the correct tri-state {claimed:null, queryFailed:true, error} and canClaimSd (lines 203-210) already checks it for the claim-holder axis, just not for the conflict-matrix/track-occupancy axes. Real consumer: scripts/claude-session-coordinator.mjs:115-140 (npm run sd:claim CLI).',
  },
  {
    id: 'finding-3-migration-data-presence-most-on-theme',
    severity: 'HIGH',
    summary: 'lib/quality/migration-data-presence.js checkMigrationDataPresent()/findEvidenceMigrationGaps(): explicitly documented as "fails open" in its own docblock. This is the single most on-theme finding for the parent CAPA workstream\'s own drift class (a false-completion/ghost-completion detector that itself fails open on a query error against the exact table being verified). Chosen as FR-F2\'s corrective target. NOTE: subsequent validation-agent and testing-agent LEAD-phase reviews (evidence bedb81c2, aa4b4de7) measured this finding against the real wrapped Supabase client and current main, and corrected the initial diagnosis materially -- see those evidence rows for the final, narrower, verified defect scope and the final THROW-based (not shape-based) fix design.',
  },
  {
    id: 'finding-4-ownership-detection-orthogonal-to-record-truth-001-b',
    severity: 'MEDIUM_HIGH',
    summary: 'lib/claim/ownership-detection.js getClaimHolder()/getLiveClaimHolders()/isClaimedBy(): a query error collapses to null/[] ("unclaimed"), read by scripts/fleet-dashboard.cjs:1585-1587 and BaseExecutor.js:134-138 (diagnostic only). Confirmed orthogonal to SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-B: B removed the phantom-column error SOURCE at this exact call site (QF-20260902-724); this finding is the error-SILENCE that hid it -- complementary, not duplicate work. Deferred follow-up candidate, not fixed in this SD.',
  },
  {
    id: 'finding-5-claim-eligibility-lower-severity-clearest-anti-pattern-specimen',
    severity: 'MEDIUM',
    summary: 'lib/fleet/claim-eligibility.cjs baselinedCandidateEligible()/parentLeadPending()/refillSourceIneligibility(): lower severity since blast radius is skip/defer only (never destructive). Clearest in-repo demonstration of the throw-then-reboolean anti-pattern: evaluateDispatchEligibility() (line 610) already does "if (error) throw error -- uncertain, caller decides" correctly, but its own wrapper baselinedCandidateEligible() (lines 670-676) re-collapses that into catch{return false}. Reachable from the self-claim hot path. Deferred follow-up candidate, not fixed in this SD.',
  },
  {
    id: 'positive-precedents-cited-as-target-idiom',
    severity: 'INFO',
    summary: 'lib/eva/lifecycle/exit-gate-verifiers.js: every verifier does "if (error) return {satisfied:false, reason:...fail-closed}" -- self-documenting fail-closed, never silent pass. lib/eva/kill-gate-teeth/firing-verification.js: every DB read does "if (error) throw error" -- no swallow at all. lib/chairman/chairman-gated-decision-row-guard.mjs resolveExistingPendingDecision() (lines 150-179): explicit docblock "An error here means cannot determine -- never not excluded" -- a fully corrected instance of this exact defect class, cited as the copy-paste template.',
  },
  {
    id: 'flagged-per-instruction-not-a-new-finding',
    severity: 'INFO',
    summary: 'lib/fleet/claim-eligibility.cjs:237-239 notBeforeHold: Date.parse(row.metadata.not_before) returns NaN when not_before is an object rather than a string/timestamp -- already independently filed as QF-20260905-599 by Adam. Not a query-error-swallow (no Supabase call involved), out of scope for this census by definition. Noted per task instruction, not counted as a census finding.',
  },
];

const warnings = [
  'FR-F2\'s original scope (targeting finding #3 as a single undifferentiated swallow) was found materially stale against current main by subsequent LEAD-phase validation-agent and testing-agent reviews -- sibling child A\'s throw-on-schema-drift wrapper already covers the headline missing-table/missing-column scenario at one of the two call sites, and a shape-based fix (as opposed to throwing) would itself have shipped a half-fix. See evidence rows bedb81c2 and aa4b4de7 for the corrected, final FR-F2/FR-F3/FR-F4 scope written to this SD\'s scope field after this Explore evidence was recorded.',
  'Findings #1, #2, #4, #5 were NOT independently re-measured against current main with the same rigor applied to finding #3 -- PLAN should either cite this census as their evidence directly or re-measure before promoting any of them to their own follow-up SD/QF.',
];

const recommendations = [
  'PLAN should treat this Explore census as the FR-F1 baseline record, and defer findings #1, #2, #4, #5 to individual follow-up SDs/QFs rather than attempting to fix all five guard classes in one PR (matching the parent workstream\'s per-child PR-size convention).',
  'PLAN should build FR-F2\'s actual implementation from the CORRECTED scope in this SD\'s current scope field (post validation-agent + testing-agent review), not from this Explore evidence\'s original framing of finding #3 alone -- the corrected scope is materially different (two call sites, THROW-based fix, consumer try/catch, exit-code gating decision).',
];

const summary = 'Explore-phase discovery for SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-F: a very-thorough search across lib/ and scripts/ for guard/check functions that swallow a Supabase query error into a false/empty/not-found verdict a caller treats as a confirmed fact. Found 5 ranked, well-evidenced instances plus 3 positive precedents (the target idiom to converge on). Finding #3 (lib/quality/migration-data-presence.js) was selected as the single PR-sized corrective for this child, matching its parent workstream\'s per-child convention and its direct on-theme relevance to the parent CAPA\'s own drift class. Two subsequent LEAD-phase sub-agent reviews (validation-agent, testing-agent) then measured finding #3 against the real wrapped Supabase client and current main, correcting the initial diagnosis to a narrower, verified defect and a THROW-based (not shape-based) fix design -- see their own evidence rows for the final scope.';

async function main() {
  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'Explore',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence_score: 85,
    findings,
    warnings,
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'lib/integrations/dedup-checker.js',
        'lib/integrations/evaluation-bridge.js',
        'lib/session-conflict-checker.mjs',
        'lib/quality/migration-data-presence.js',
        'lib/claim/ownership-detection.js',
        'lib/fleet/claim-eligibility.cjs',
        'lib/eva/lifecycle/exit-gate-verifiers.js',
        'lib/eva/kill-gate-teeth/firing-verification.js',
        'lib/chairman/chairman-gated-decision-row-guard.mjs',
      ],
      related_sub_agent_evidence: ['bedb81c2-b0a9-4a35-9602-bc84207f0b1a (validation-agent, corrects FR-F2)', 'aa4b4de7-873f-4776-9184-a1b140f1497a (testing-agent, corrects FR-F2/FR-F3/FR-F4 design)'],
    },
    phase: 'LEAD_TO_PLAN',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'Explore',
    SD_KEY,
    { name: 'Explore' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD_TO_PLAN', source: 'manual' },
  );

  console.log('EXPLORE EVIDENCE WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  repo_path:', stored.metadata?.repo_path);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
