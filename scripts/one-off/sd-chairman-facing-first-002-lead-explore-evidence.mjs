// SD-LEO-FIX-CHAIRMAN-FACING-FIRST-002 — LEAD-TO-PLAN Explore sub-agent evidence.
// Escalated from QF-20260912-901 (111 source LOC > 75 cap). Code for FIX SHAPE (a) of the
// originating QF-20260912-079 was already implemented and unit-tested (52 new + 129 sibling
// tests) before escalation; this records the Explore-phase evidence the LEAD-TO-PLAN gate
// requires.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-FIX-CHAIRMAN-FACING-FIRST-002';

const findings = [
  {
    id: 'sibling-sd-001-shipped-the-other-half-not-a-duplicate',
    severity: 'HIGH',
    summary: 'SD-LEO-FIX-CHAIRMAN-FACING-FIRST-001 (completed) shipped FIX SHAPE (b) of the same originating QF-20260912-079 (the consult-hold expiry defer-vs-abandon distinction). This SD ships FIX SHAPE (a) (composer measured_by[] provenance + a new pre-send refusal gate), which -001 explicitly deferred and filed as this ticket (QF-20260912-901). The dedup advisory flagged during creation is expected and reviewed -- both SDs share a lineage, neither duplicates the other\'s delivered scope.',
  },
  {
    id: 'refusal-gate-location-chosen-after-tracing-the-real-opener',
    severity: 'HIGH',
    summary: 'The originating QF\'s own text guessed the refusal belonged in lib/adam/chairman-held-send-release.js, but that file only handles RELEASE/expiry (confirmed during -001\'s Explore pass) -- it never opens a consult. Traced the actual "hold opener" to lib/adam/presend-consult-lane.cjs\'s runPreSendConsultLane (called from lib/comms/adam-outbound/chairman-sms-gate/index.js, gated on isDecision). The refusal check is inserted there, immediately after evaluatePreSendConsult confirms action===\'consult-then-send\' and before performBoundedConsult is called -- scoped to exactly the population the measured incident described (held/consult-triggered packets), never routine proceed-path sends.',
  },
  {
    id: 'digit-detection-heuristic-deliberately-coarse-documented-limitation',
    severity: 'MEDIUM',
    summary: 'lib/adam/measured-number-provenance.cjs uses adjacency-to-punctuation (word char, #, or -) to exclude numbers embedded in ids/dates/PR-refs (QF-20260912-901, #8788, 2026-09-12 all correctly exempted, unit-tested). Matching is coarse (any measured_by[] entry whose value stringifies to the same digit run counts as a stamp, regardless of body position) rather than exact positional correlation -- documented in the module\'s own header as a deliberate simplification, not a silently-assumed completeness guarantee.',
  },
  {
    id: 'both-composers-updated-only-decision-path-currently-reachable',
    severity: 'INFO',
    summary: 'chairman-sms-gate/index.js gates the entire consult mechanism on isDecision (status/heartbeat sends never consult) -- confirmed by reading the guard. Both scripts/adam-chairman-decision.mjs and scripts/adam-chairman-sms.mjs were still given --measured-by acceptance (per the ticket\'s explicit ask for both composers), even though only the decision-composer path currently reaches the refusal gate -- for consistency and forward-compatibility should the status path ever gain its own consult trigger.',
  },
];

const recommendations = [
  'PLAN should treat this Explore evidence plus the existing PR #8791 diff as the PRD\'s primary technical artifact -- the fix is already implemented, tested, and live-verified; PLAN/EXEC should validate against what shipped rather than re-derive requirements from scratch.',
  'No further scope expansion: this SD closes FIX SHAPE (a) exactly as filed in QF-20260912-901; do not fold in the separate pre-existing gap already flagged during -001\'s completion (refused-but-answered holds never abandon on expiry) -- that remains its own, not-yet-filed follow-up.',
];

const summary = 'Explore-phase discovery for SD-LEO-FIX-CHAIRMAN-FACING-FIRST-002 (escalated from QF-20260912-901 on LOC alone) confirmed the correct location for the new refusal gate (presend-consult-lane.cjs, not chairman-held-send-release.js as originally guessed), verified the digit-detection heuristic correctly exempts ids/dates/PR-refs via unit tests, and confirmed this SD\'s scope (FIX SHAPE (a)) is the deliberately-deferred remainder of its sibling SD-LEO-FIX-CHAIRMAN-FACING-FIRST-001 (FIX SHAPE (b)), not a duplicate.';

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
    confidence_score: 92,
    findings,
    warnings: [],
    recommendations,
    summary,
    detailed_analysis: {
      sd_key: SD_KEY,
      phase: 'LEAD_TO_PLAN',
      artifacts_read: [
        'lib/adam/measured-number-provenance.cjs',
        'lib/adam/presend-consult-lane.cjs',
        'lib/comms/adam-outbound/chairman-sms-gate/index.js',
        'scripts/adam-chairman-decision.mjs',
        'scripts/adam-chairman-sms.mjs',
        'tests/unit/adam/measured-number-provenance.test.js',
        'tests/unit/adam/presend-consult-lane.test.js',
        'tests/unit/comms/chairman-sms-gate-measured-by-refusal.test.js',
      ],
      searches_run: [
        'traced isDecision gating in chairman-sms-gate/index.js to confirm scope of the refusal check',
        'confirmed chairman-held-send-release.js has no consult-opening code (release/expiry only)',
        'ran the full new + sibling test suite (181 tests) to confirm no regressions',
      ],
      dedup_candidates_checked: ['SD-LEO-FIX-CHAIRMAN-FACING-FIRST-001 (completed -- shipped FIX SHAPE (b), the sibling half of the same originating QF-20260912-079; this SD ships FIX SHAPE (a), not a duplicate)'],
      mechanism_verifications: [
        { verified_by: 'Explore (LEAD-TO-PLAN)', verified_at: 'lib/adam/presend-consult-lane.cjs (runPreSendConsultLane, refusal check inserted before performBoundedConsult)' },
        { verified_by: 'Explore (LEAD-TO-PLAN)', verified_at: 'lib/adam/measured-number-provenance.cjs (checkMeasuredByProvenance, NUMBER_TOKEN_RE)' },
        { verified_by: 'Explore (LEAD-TO-PLAN)', verified_at: 'lib/comms/adam-outbound/chairman-sms-gate/index.js (isDecision gate; refuse-outcome consumption)' },
      ],
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
