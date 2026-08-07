#!/usr/bin/env node
/**
 * One-off: record TESTING sub-agent evidence at the PLAN phase for
 * SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001 (PLAN-TO-EXEC handoff).
 *
 * Adversarial test-strategy review of PRD-SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001's TS-1..TS-4,
 * plus independent re-measurement of the triage counts (do not trust the PRD's numbers verbatim).
 * Written through the canonical writer (CLAUDE.md prologue rule 11).
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_ID = '4d825dee-12c2-43da-ab32-5b2bb4ae6f36';
const SD_KEY = 'SD-LEO-INFRA-SILENT-TRUNCATION-ONE-001';

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({ sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'TESTING', supabase });

  let results = {
    verdict: 'PASS',
    confidence: 78,
    findings: [
      {
        id: 'F1-per-site-inspection-is-the-honest-ceiling',
        severity: 'MEDIUM',
        summary: "TS-1/TS-2 are per-site output-inspection tests ('the roster prints the full id', 'the [ROLE] line carries the full id'). They cannot prove the SD's real success condition -- that nobody re-types a truncated id -- because that is a claim about a HUMAN/AGENT READER's downstream behavior, not a property of the code under test. No unit or E2E test can assert an absence-of-misuse across every future reader. TS-1/TS-2 are nonetheless the correct and adequate ceiling: they assert the positive, checkable half of the contract ('a full, re-consumable value is present in the output'), which is exactly what the display-layer remedy (PRD TR-2/description Section on display-layer enforcement) can guarantee. Recommend framing them explicitly in the PRD as 'necessary, not sufficient' rather than as proof of the outcome, so a future reader does not mistake green tests for the failure mode being retired.",
      },
      {
        id: 'F2-exemption-pin-partially-exists-precedent-found',
        severity: 'HIGH',
        summary: "tests/unit/eva-master-scheduler.test.js:242,958-959 ALREADY pins lib/eva/eva-master-scheduler.js:146's `this.instanceId = \\`scheduler-${randomUUID().slice(0, 8)}\\`` via `expect(scheduler.instanceId).toMatch(/^scheduler-[a-f0-9]{8}$/)` -- this is a working, pre-existing instance of exactly the TS-3 exemption-pin pattern, and it WOULD fail if someone 'fixed' the slice to print the full UUID (format would no longer match 8 hex chars). No equivalent pin exists for lib/eva/concurrent-venture-orchestrator.js:55 (instanceId = `concurrent-${randomUUID().slice(0,8)}`, trivially testable via `new ConcurrentVentureOrchestrator().instanceId`), for lib/session-manager.mjs:136 (generateSessionId() is NOT exported -- only reachable via the async getOrCreateSession(), so this site needs either an export or an integration-level test), or for either KIND 3 site (lib/genesis/branch-lifecycle.js sim/<8> at :243/:291/:549/:589, lib/sub-agents/rca.js:487 PAT-<cat>-<8> fallback in findPatternMatches, unexported -- would need export or invocation via execute()). Concrete design in metadata.exemption_pin_design.",
      },
      {
        id: 'F3-session-role-orient-existing-test-WILL-break-on-child-1-fix',
        severity: 'HIGH',
        summary: "scripts/hooks/__tests__/session-role-orient.test.js:44 asserts `expect(out[0]).toMatch(/WORKER \\(callsign: Bravo\\) under coordinator session=coord-uu\\./)` against fixture session_id 'coord-uuid-12345678', pinning the CURRENT truncated form (decide() calls workerLines(callsign, coordFile.session_id.slice(0,8)) at line 82). Child 1's FR-1(b)/FR-2 fix -- print full+short together on this purely human-facing line -- necessarily changes the character immediately after 'coord-uu' from '.' to more id characters, so this regex breaks. This is a real, concrete regression Child 1 MUST update in the same PR, not an incidental side effect to discover in CI. No equivalent pre-existing assertion was found for scripts/assign-fleet-identities.cjs's roster/diagnostic lines or scripts/coordinator-hourly-review.cjs:326 / scripts/fleet-dashboard.cjs:2236 (relay-drop-gauge display) -- those three have zero existing coverage of their console.log format, so Child 1's TS-1 assertions there are net-new with no regression risk from the existing suite.",
      },
      {
        id: 'F4-measured-counts-close-but-not-exact-match-to-PRD',
        severity: 'LOW',
        summary: "Independently re-ran the population counts rather than trusting FR-3/TR-4. (a) CONFIRMED: lib/coordinator/detectors.cjs:71 and :95 are exactly `.map(c => c.session_id).filter(Boolean).slice(0, 10)` -- array cap, not string truncation; every session_id inside is full length. (b) MOSTLY CONFIRMED: randomUUID()/uuidv4().slice|substring sites that MINT (not truncate) an id -- my own grep across lib/,scripts/,server/ (excluding tests) found 15 randomUUID()-based + 4 uuidv4()-based = 19 raw hits, of which 5 sit in scripts/archive/one-time/ (dead code); excluding those gives 14 live. The PRD's '17' sits between my raw (19) and my live (14) counts depending on exactly which archive/dead-code exclusion rule is applied -- the PRD does not state its exact filter, so I cannot reproduce '17' bit-for-bit, but every site I found IS genuinely minting (constructs a NEW id from randomUUID()/uuidv4(), never truncates an EXISTING stored value), so the substantive KIND 2 classification holds regardless of the exact count. (c) CONFIRMED all 3 spot-checked KIND 1 sites: scripts/assign-fleet-identities.cjs (:523,:575,:648,:674,:712,:732,:737 all do w.session_id.substring(0,12) / worker.session_id.substring(0,12), no full session_id printed anywhere else in the file's console output), scripts/hooks/session-role-orient.cjs:82 (coordFile.session_id.slice(0,8), no full id anywhere in the hook), scripts/coordinator-hourly-review.cjs:326 + scripts/fleet-dashboard.cjs:2236 (both slice d.id and d.correlationId to 8 chars; the two lines are near-identical, not byte-for-byte identical -- the age-formatting expression differs slightly between the two files, though the truncation-relevant substring is identical). No full value is available elsewhere in any of the three spot-checked outputs -- all are genuine hazards as claimed.",
      },
      {
        id: 'F5-FR-5-class-B-has-zero-test-scenario-and-its-own-precondition-is-unmet',
        severity: 'HIGH',
        summary: "TS-1 through TS-4 cover only FR-1/FR-2/FR-3/FR-4 (Class A + exemptions). FR-5 (priority=high, 'Class B -- typed envelope constructor') has NO test_scenario at all, despite acceptance criteria that describe testable behavior ('the constructor cannot be invoked without its send context -- absence is a construction-time error, not a runtime null'). Separately, FR-5's own precondition is unmet: its acceptance criteria require 'the relationship [to SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001] is explicitly decided and recorded (fold, depend, or divide)' -- queried strategic_directives_v2 directly and found SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 still status=draft, zero children under this SD's id (4d825dee), and no fold/depend/divide annotation in either SD's metadata. That SD is ALSO independently claimed and under active LEAD analysis by a different session (session_id 0db9d282, 'lead_analysis_alpha2' in its metadata) -- a real risk of two sessions building overlapping Class B work concurrently, which is precisely the coordination failure FR-5 exists to prevent.",
      },
    ],
    metadata: {
      measured_counts: {
        kind1_hazard_spot_checked: '3/3 confirmed genuine (assign-fleet-identities.cjs, session-role-orient.cjs, coordinator-hourly-review.cjs+fleet-dashboard.cjs)',
        kind2_minting_raw: 19,
        kind2_minting_excluding_archive: 14,
        kind2_minting_prd_claimed: 17,
        kind2_minting_verdict: 'count not bit-for-bit reproduced but substantive classification (mint not truncate) confirmed for every site found',
        array_cap_false_positives_confirmed: 'lib/coordinator/detectors.cjs:71,:95 -- exact match to claim',
        already_compliant_spot_check: 'scripts/coordinator-reply.cjs:53+buildReplyPayload:33-46 -- confirmed short form in subject only, full correlationId in payload.reply_to and payload.correlation_id',
      },
      exemption_pin_design: {
        recommendation: 'Behavioral assertion where the minting/labeling code is reachable from an exported, synchronously-testable surface; source-anchor (grep-on-file-content) fallback only where no such surface exists (private function, or a bare git-SHA display with no fabrication risk to police).',
        existing_precedent: 'tests/unit/eva-master-scheduler.test.js:242 already does exactly this for eva-master-scheduler.js:146 -- expect(scheduler.instanceId).toMatch(/^scheduler-[a-f0-9]{8}$/). Use as the template.',
        proposed_new_file: 'tests/unit/silent-truncation-exemption-pin.test.js',
        proposed_assertions: [
          "KIND2 lib/eva/concurrent-venture-orchestrator.js:55 -- new ConcurrentVentureOrchestrator().instanceId toMatch(/^concurrent-[0-9a-f]{8}$/). Trivial: constructor is synchronous, deps optional.",
          "KIND2 lib/session-manager.mjs:136 -- generateSessionId() is unexported (only getOrCreateSession() at :301 calls it). Either add it to the module.exports default block at :1019 for direct testing, or assert indirectly via a mocked getOrCreateSession() call and regex the returned sessionId against /^session_[0-9a-f]{8}_.+_\\d+$/. Flagging as the one KIND2 site that needs an export change (not just a test) to pin cleanly.",
          "KIND3 lib/genesis/branch-lifecycle.js -- generateBranchName(seedText) IS exported (:84) and pure; assert its return matches /^sim\\/[a-z0-9-]+-[0-9a-f]{6,8}$/ for a fixed seedText. NOTE: :243/:291/:549/:589 build a DIFFERENT derived label (`sim/${data.id.substring(0,8)}`) inline inside async DB-reading functions (getSimulationBranch, etc.) rather than via generateBranchName -- and in at least :243, the SAME return object also carries `id: data.id` (the full value) alongside the short `name`, so that specific site is already full+short together, not a bare truncation. Worth PLAN double-checking whether all 4 of these sites are genuinely KIND3-as-claimed or whether some are closer to the already-compliant pattern.",
          "KIND3 lib/sub-agents/rca.js:487 -- findPatternMatches(rcr, historicalRCRs) at :457 is unexported (only execute() at :42 is exported, and default export is { execute } at :687). Pin either by exporting findPatternMatches for direct testing, or by asserting on execute()'s output shape with a fixture historical row lacking pattern_id, checking the synthesized pattern_id matches /^PAT-[^-]+-[0-9a-f]{8}$/.",
          "KIND4 git-SHA sites (e.g. lib/eva/bridge/verification-sd-generator.js:33, lib/governance/check-resolver-freshness.js:65) -- lower priority for a behavioral pin since messing with these carries no fabrication risk (git resolves prefixes); a lightweight source-anchor test asserting the .slice(0,7)/.substring(0,7) pattern is still present on a representative site is sufficient documentation-as-test, not a hard requirement.",
        ],
      },
      session_role_orient_baseline: {
        file: 'scripts/hooks/__tests__/session-role-orient.test.js',
        line: 44,
        current_assertion: "expect(out[0]).toMatch(/WORKER \\(callsign: Bravo\\) under coordinator session=coord-uu\\./)",
        fixture: "session_id: 'coord-uuid-12345678'",
        verdict: 'WILL BREAK on Child 1 fix to session-role-orient.cjs:82 (full+short together changes the character after \"coord-uu\" from \".\" to more id chars). Must be updated in the same PR as the fix, not discovered later in CI.',
      },
      assign_fleet_identities_baseline: 'tests/unit/assign-fleet-identities-{coordinator-filter,rebroadcast,sdkey-and-panel-fields,tier-callsign}.test.js -- none spy on console.log or assert the roster/diagnostic output format (:523,:575,:648,:674,:712,:732,:737). Zero regression risk from the existing suite; TS-1 is net-new coverage.',
      coordinator_hourly_review_baseline: 'tests/unit/coordinator-hourly-review-solomon-leg.test.js and tests/unit/coordinator/relay-drop-gauge.test.js exist but neither asserts on the console.log format at coordinator-hourly-review.cjs:326 (relay-drop-gauge.test.js tests planRelayDrops()\'s RETURNED decision objects, not the printed string). fleet-dashboard.cjs\'s printRelayDropGauge() (which prints the byte-similar line at :2236) has NO referencing test file at all. Zero regression risk; TS-2-equivalent coverage there is also net-new.',
      fr5_class_b_gap: 'No test_scenario for FR-5. SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 (draft, unfolded, independently claimed by session 0db9d282) is FR-5\'s own blocking precondition and remains unresolved.',
    },
    phase: 'PLAN',
    summary: "PASS for PLAN-TO-EXEC on the scoped, testable portion of this PRD (FR-1/FR-2/FR-3/FR-4, TS-1..TS-4), with two findings EXEC must act on and one gap PLAN should close before FR-5 lands. (1) TS-1/TS-2 per-site output inspection is the honest ceiling for this SD -- 'nobody re-types a truncated id' is a downstream-reader behavior no test can prove; the tests correctly assert the positive, checkable half (full value present and re-consumable) instead. (2) TS-3's exemption pin already has a WORKING precedent in this codebase (tests/unit/eva-master-scheduler.test.js:242 pins exactly one of the KIND2 minting sites) -- concrete extension design for the remaining KIND2/KIND3 sites is in metadata.exemption_pin_design. (3) scripts/hooks/__tests__/session-role-orient.test.js:44 is an EXISTING test that WILL break when Child 1 fixes session-role-orient.cjs:82 -- this must be updated in the same PR, not discovered later. assign-fleet-identities.cjs and coordinator-hourly-review.cjs/fleet-dashboard.cjs have zero existing coverage of their display format, so no regression risk there. (4) Independently re-measured the triage: detectors.cjs:71/:95 array-cap claim confirmed exactly; randomUUID()/uuidv4() minting-site count came back 14-19 depending on archive-exclusion rule against the PRD's 17 (not bit-for-bit reproduced, but every site found is genuinely minting, not truncating); all 3 spot-checked KIND1 hazard sites confirmed genuine with no full id available elsewhere in the same output. (5) GAP: FR-5 (Class B typed constructor, priority=high) has NO test_scenario, and its own acceptance-criteria precondition -- an explicit fold/depend/divide decision against SD-LEO-INFRA-WORK-ASSIGNMENT-UNREADABLE-001 -- is unrecorded while that SD is independently claimed and under active analysis by a different session. Recommend PLAN either add a TS-5 now or explicitly defer FR-5 to a follow-on PRD before EXEC starts on it.",
  };

  results = applySubAgentRepoVerdict(results, resolution);
  const stored = await storeSubAgentResults('TESTING', SD_ID, { name: 'TESTING (QA Engineering Director)' }, results, { sdKey: SD_KEY, phase: 'PLAN' });
  console.log('TESTING result stored:', stored.id, stored.verdict, stored.confidence);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
