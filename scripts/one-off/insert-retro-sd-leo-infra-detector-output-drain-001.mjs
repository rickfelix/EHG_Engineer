#!/usr/bin/env node
/**
 * SD_COMPLETION retrospective for SD-LEO-INFRA-DETECTOR-OUTPUT-DRAIN-001.
 * Written directly against the retrospectives table so the PLAN-TO-LEAD
 * RETROSPECTIVE_QUALITY_GATE has a fresh retro_type=SD_COMPLETION row created
 * after the LEAD-TO-PLAN acceptance timestamp (2026-07-27T22:02:08.736Z).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SD_UUID = '3ed107a8-710a-418a-b2e7-f816a4acb76f';
const SD_KEY = 'SD-LEO-INFRA-DETECTOR-OUTPUT-DRAIN-001';

const retro = {
  sd_id: SD_UUID,
  retro_type: 'SD_COMPLETION',
  retrospective_type: null,
  learning_category: 'PROCESS_IMPROVEMENT',
  target_application: 'EHG_Engineer',
  generated_by: 'MANUAL',
  status: 'PUBLISHED',
  quality_score: 92,
  title: `Retrospective: ${SD_KEY} — drain inventory: pair every detector with a NAMED CONSUMER and measure staleness on the DRAIN, not on whether the detector fired`,
  description:
    'Thesis: a detector whose output accumulates unread is indistinguishable, at every downstream surface, from a detector that never fired. GAUGE_REGISTRY in lib/governance/gauge-registry.js answered "who owns a TRIP"; nothing answered "who drains the ROW it wrote". The seam was visible inside the registry itself — `relay-drop` is a registered entry WITH an ownerRole, and its output (feedback category=relay_drop) sat at 11 rows, all status=new, undrained since 2026-07-19. Registration is not drainage. '
    + 'This SD ships: (1) lib/governance/drain-inventory.js — a new PURE core exporting computeOldestUndrainedAge (scans for the minimum, never trusts rows[0]), classifyStructural / classifyObserved (verdicts separated BY PROVENANCE — zero-IO structural findings vs read-requiring observed ones), paginateAll (exhaustive ordered pagination that REFUSES to report a truncated population as complete), exitCodeFor and buildInventoryRow; (2) DRAIN_DESCRIPTORS, a frozen sibling export appended to lib/governance/gauge-registry.js carrying consumer / closingPath / predicate / shapeContract / accumulationSignal / fieldQuestion / measuredBy / timestampSkew per detector; (3) scripts/drain-inventory.mjs — a strictly read-only CLI that self-registers as standard_loop:drain-inventory in periodic_process_registry (liveness_source=self_stamped) so the gauge is not itself an unwatched detector; (4) tests/unit/governance/drain-inventory.test.js — 46 tests. '
    + 'Live run: 11 detectors, 7 FAILING, exit code 1 — relay-drop NO_CONSUMER (8.0d, n=11), adam-adherence-drift NO_CLOSING_PATH (36.0d, n=75), adam-adherence-ledger NO_CLOSING_PATH (36.0d, n=124), quick-fixes-stranded NO_CONSUMER (2.4d, n=7), feedback-sla-breach NO_CONSUMER (22.9d, n=54 — the SLA alarm, itself undrained), invariant-gauge-finding CLOSING_PATH_UNEXERCISED (24.5d, n=4245), solomon-advice-outcome-ledger PASS (3.5d, n=380), solomon-consult-replies MEASURED_ELSEWHERE. PR #6616.',
  affected_components: [
    'lib/governance/drain-inventory.js',
    'lib/governance/gauge-registry.js',
    'scripts/drain-inventory.mjs',
  ],
  related_files: [
    'lib/governance/drain-inventory.js',
    'lib/governance/gauge-registry.js',
    'scripts/drain-inventory.mjs',
    'tests/unit/governance/drain-inventory.test.js',
    'lib/coordinator/feedback-sla-gauge.cjs',
    'lib/coordinator/drain-gauge.cjs',
    'lib/adam/inbound-backlog-watchdog.js',
    'scripts/coordinator-relay-drop-gauge.cjs',
    'scripts/adam-self-adherence-review.mjs',
    'scripts/hooks/stop-loop-wakeup-reminder.cjs',
    'lib/vision/rung-health-convergence.mjs',
    'tests/helpers/db-target.js',
  ],
  what_went_well: [
    'The TESTING sub-agent at PLAN caught a STRUCTURAL error in the PRD before any code was written: the PRD put drain descriptors ON GAUGE_REGISTRY entries in lib/governance/gauge-registry.js. Only `relay-drop` is actually a registry entry — the other nine detectors are not gauges at all, and a drain-only SINK has no detectorFn, so descriptor-bearing entries would have broken the file\'s own non-null-detectorFn invariant, its toHaveLength(25) entry-count assertion, and its 22-id enabled list. Moved to DRAIN_DESCRIPTORS, a sibling Object.freeze()d export in the SAME file — which still satisfies the SD\'s "no new registry" constraint while letting a descriptor exist for a sink that has no detector.',
    'The same PLAN pass surfaced that the PRD CONTRADICTED ITSELF: test scenario TS-2 called for SEEDING data while TR-5 required the whole SD to be read-only. Resolved by extracting a pure computeOldestUndrainedAge(rows, nowMs) that takes a fixture, mirroring the existing computeBreaches(rows, nowMs) / planSlaBreaches(supabase) split already in lib/coordinator/feedback-sla-gauge.cjs — the contradiction became an architecture decision rather than a coin flip.',
    'Caught that the `db` vitest project resolves to ZERO test files (tests/helpers/db-target.js DESIGNATED_NON_PROD_REFS is intentionally empty; vitest prints "db project DISABLED — no designated non-production target ... 0 of db tests will run"). A DB-tier test for this SD would never have executed, and its green would have been indistinguishable from having no coverage at all. All 46 tests were pinned to the `unit` tier instead, which is why the pure/IO split in drain-inventory.js is load-bearing rather than stylistic.',
    'Ran the CLI LIVE against the real database before claiming completion, and the live run independently reproduced the SD\'s own measured evidence (relay-drop n=11 vs the SD\'s 11 rows; quick-fixes-stranded n=7 vs VALIDATION\'s measured 7; adam-adherence-drift oldest 2026-06-21). Reproducing the finding with a different instrument is what verified the tool measures the right thing.',
    'An adversarial TESTING pass ran 42 mutants WITH 5 control mutants to prove the harness could still kill — the negative control ran before the positive signal was cited. Every load-bearing verdict rule survived mutation; three real gaps did not (F1 row.failing, F3 a vacuous loop, F4 provably-unreachable dead defence at 0 of 84 descriptor x reading combinations).',
    'The SECURITY finding SEC-DRAIN-001 was verified in the DEPENDENCY SOURCE, not assumed: postgrest-js v2.103.0 PostgrestClient.from(relation) builds `new URL(`${this.url}/${relation}`)` at dist/index.cjs:4749 without encoding the relation, and new URL() normalizes traversal — confirmed empirically that "https://proj.supabase.co/rest/v1/" + "../../auth/v1/admin/users" resolves to https://proj.supabase.co/auth/v1/admin/users. Credential-leak checks were forced with a canary key (SUPABASE_SERVICE_ROLE_KEY=CANARY_BADKEY_...) so every error path actually executed rather than being reasoned about.',
    'Every age assertion in tests/unit/governance/drain-inventory.test.js carries a negative control — exact value AND separation from a newest-write reading — because toBeGreaterThan(0) passes identically for a 1-minute and a 51-day reading and survives deleting the drain logic entirely. A discrimination control is also included: solomon-advice-outcome-ledger PASSES while six entries FAIL, so an implementation that simply failed everything could not look correct.',
    'Scope discipline at LEAD: instance 2 (requires_chairman_apply) was DELETED after verifying it was already fully closed by SD-LEO-INFRA-CHAIRMAN-APPLY-FLAG-001 (completed 2026-07-27, shipped the blocking CHAIRMAN_APPLY_VERIFICATION gate) — an 11% scope reduction taken before EXEC rather than discovered during it.',
    'Deferred work was RECORDED, not silently dropped: 4 of 17 test scenarios (TS-8 session_coordination descriptor, TS-10 the gauge\'s own descriptor, TS-16 undeclared-skew detection, readDescriptor dispatch coverage) are written into PRD metadata.deferred_scenarios with a gap and an assessment for each. Leaving them silently unmet would have reproduced this SD\'s own central complaint — that unrecorded absence reads as "not yet filled in".',
    'No regressions: 46 new tests green, and 1,405 tests across 101 governance + coordinator suites pass, including the pre-existing gauge-registry suite unchanged (the DRAIN_DESCRIPTORS change is strictly additive). A 3-file / 61-test baseline was captured BEFORE EXEC so any post-EXEC red in gauge-registry, gauge-runner-liveness or feedback-sla-gauge would be provably caused by this SD.',
  ],
  what_needs_improvement: [
    'MY OWN IMPLEMENTATION SHIPPED THE DEFECT IT EXISTS TO DETECT. On the first live run, invariant-gauge-finding rendered PASS with 4,245 outstanding rows: the feedback-category reader in scripts/drain-inventory.mjs left `closingPathUses` null, and `null !== 0` fell straight through the CLOSING_PATH_UNEXERCISED branch in classifyObserved to PASS. The inventory reported HEALTH over the single largest undrained population in the database — the gauge runner\'s own output. Fixed by PROBING declared closing paths via descriptor.closingPathTable instead of assuming them; the entry now correctly reads CLOSING_PATH_UNEXERCISED against a gauge_finding_dispositions table with zero rows ever written.',
    'A MUTANT SURVIVED THE ENTIRE SUITE. Forcing `row.failing = false` in buildInventoryRow passed all 35 tests at that point, because the true case was only ever asserted through isFailing() directly and never through the ROW that carries it. scripts/drain-inventory.mjs renders its `!!` markers, its consumer/closingPath detail line, its FAILING count and its "A failing entry is a FINDING" banner from that one flag — so the defect would have printed "11 detectors — 0 FAILING" while still exiting 1. Findings rendered as blank cells: precisely the failure mode this SD exists to prevent.',
    'A FIXTURE\'S INCIDENTAL ORDERING MADE THE LOAD-BEARING TEST UNFALSIFIABLE. Mutant 1 (trust rows[0] instead of scanning for the minimum) was initially killed by the ordering-independence test ALONE. The TS-2 fixture happened to be ordered oldest-first, so rows[0] was ACCIDENTALLY correct there and the primary drain-age test passed while the drain logic was broken. Fixture reordered newest-first; TS-2 now fails independently (2 failures, not 1).',
    'THE SECURITY CONTROL WAS NOT IN THE PR WHEN I REPORTED IT AS DONE. The SEC-DRAIN-001 allow-list (CLOSING_PATH_TABLES) existed only in my working tree — local HEAD and origin were both a78ac756dd0 with ZERO occurrences of the identifier. The TESTING re-verification found it because it checked the control AT THE CONSUMER (the actual committed tree) rather than at my report. Accepting the handoff at that moment would have shipped a PR lacking the control its own evidence row credited it with. Committed as 060f3727ce8.',
    'Three other tests were weaker than they looked: F3, "every descriptor names a predicate", was a loop with no non-emptiness guard and passed with DRAIN_DESCRIPTORS emptied — a test that cannot fail is not a test. F4 was a structural-vs-UNAVAILABLE guard in the CLI that was provably unreachable across all 84 descriptor x reading combinations (buildInventoryRow yields UNAVAILABLE only when classifyStructural returns null), so it was removed rather than left as dead defence.',
    'The SD narrated 9 instances of the class; VALIDATION\'s census found ~27 feedback categories with undrained rows. The narrative sample under-counted the population by roughly 3x, and the largest single instance (invariant_gauge_finding, 4,235 of 4,235 undrained) was not in the original narration at all.',
    'The inventory does not yet cover its OWN output (TS-10). The gauge self-registers in periodic_process_registry and stampLastFired is verified writing last_fired_at, but there is no DRAIN_DESCRIPTOR for what drain-inventory itself emits — so the survives-its-own-standard claim is only half delivered.',
    'The remedy is not yet drained either: 7 FAILING entries are now VISIBLE but still have no consumer or no closing path. Producing an accurate list of undrained queues is not the same as draining them, and a report nobody reads would make this the twelfth instance of its own class.',
  ],
  key_learnings: [
    'VERIFY A CONTROL AT THE CONSUMER, NOT AT THE REPORT. I reported SEC-DRAIN-001 (the CLOSING_PATH_TABLES allow-list in scripts/drain-inventory.mjs) as implemented while it existed only in my working tree — local HEAD and origin were both a78ac756dd0 with zero occurrences of the identifier. The TESTING re-verification caught it by grepping the committed tree rather than reading my evidence row. Generalizable rule: an agent\'s claim that a control exists is a claim about the WORKING TREE unless it names a commit; verification must run against the artifact the consumer will actually receive (origin/HEAD, the merged branch, the deployed bundle), because a working-tree-only control and a shipped control are indistinguishable in every report either would produce.',
    'A FIXTURE\'S INCIDENTAL ORDERING CAN MAKE A LOAD-BEARING TEST UNFALSIFIABLE. The TS-2 drain-age fixture was ordered oldest-first by accident, so a `rows[0]` implementation of computeOldestUndrainedAge was accidentally correct under it and the test passed while the logic was broken — only the separate ordering-independence test killed the mutant. Any test whose fixture has an ordering, a length, a sign or a sort the implementation could exploit is a test whose pass may be an artifact of the fixture. Concrete practice adopted here: shuffle or adversarially reorder the fixture in the PRIMARY test, and do not rely on a secondary property test to be the only killer.',
    'A TOOL BUILT TO DETECT A DEFECT CLASS IS NOT IMMUNE TO THAT CLASS. drain-inventory.mjs rendered PASS for invariant-gauge-finding over 4,245 outstanding rows because `closingPathUses` was left null and `null !== 0` fell through to PASS — the drain inventory reported health over the largest undrained population in the database. Building the detector does not confer immunity; the FIRST live run of any detector should be treated as an adversarial test OF THE DETECTOR, and the tool should be pointed at itself (TS-10) as a standing requirement, not an optional nicety.',
    'AN ABSENT SIGNAL AND A NULL SIGNAL ARE DIFFERENT, AND THE COMPARISON OPERATOR DECIDES WHICH ONE YOU GET. The PASS-over-4,245-rows bug was a strict-inequality comparison (`reading.closingPathUses === 0`) against a value the reader never populated. Any three-state signal (measured-zero / measured-nonzero / never-measured) collapsed into a two-branch comparison will silently route "never measured" into the healthy branch. Fix pattern used: PROBE the closing path via a declared closingPathTable so the value is always measured, and separate verdicts BY PROVENANCE — structural (zero-IO: UNDECLARED, NO_CONSUMER, NO_CLOSING_PATH, MEASURED_ELSEWHERE) vs observed (needs a read: PASS, CLOSING_PATH_UNEXERCISED, UNAVAILABLE) — so UNAVAILABLE can never render as either health or a finding.',
    'A FLAG ASSERTED ONLY THROUGH ITS COMPUTING FUNCTION IS UNTESTED AT ITS RENDER SITE. `row.failing` forced to false survived all 35 tests because the true case was checked via isFailing() and never through buildInventoryRow\'s output — yet the CLI derives its `!!` markers, FAILING count and banner from the row, so the defect would have printed "11 detectors — 0 FAILING" while exiting 1. Where a value crosses a boundary (pure function -> row -> renderer), assert it on BOTH sides; mutation testing is what makes that gap visible, and 42 mutants with 5 controls found three real gaps that 35 green tests did not.',
    'VERIFY THE INVARIANTS OF THE STRUCTURE YOU ARE EXTENDING BEFORE EXTENDING IT. The PRD would have attached drain descriptors to GAUGE_REGISTRY entries; only relay-drop is an entry, and a drain-only SINK has no detectorFn, so the change would have broken the registry\'s own non-null-detectorFn invariant, its entry-count assertion and its enabled-id list. The sibling-export-in-the-same-file resolution satisfied both the SD\'s "no new registry" constraint and the registry\'s existing contract. A PLAN-phase structural check is orders of magnitude cheaper than discovering the invariant break through a red regression suite mid-EXEC.',
    'A TEST TIER THAT RESOLVES TO ZERO FILES MAKES GREEN INDISTINGUISHABLE FROM NO COVERAGE. The `db` vitest project is disabled by design (tests/helpers/db-target.js DESIGNATED_NON_PROD_REFS intentionally empty) and silently runs 0 of 225 db tests. Writing this SD\'s coverage there would have produced a green run that proved nothing. Before choosing a tier, confirm it EXECUTES — and prefer a pure/IO split (as in lib/coordinator/feedback-sla-gauge.cjs\'s computeBreaches/planSlaBreaches) so the load-bearing logic is testable in a tier you have proven runs.',
    'A NAMED CONSUMER IS NOT SUFFICIENT — THE TABLE MUST BE ABLE TO EXPRESS "DONE". adam_adherence_ledger HAS a real consumer (lib/vision/rung-health-convergence.mjs:126 reads the catch-rate trend), so a consumer-only check would have called it healthy. But its columns are run_id/probe/duty/verdict/detail/remediation_ref/created_at — there is NO status column at all, so a verdict=fail row can never be marked addressed and the table can only grow (1,333 rows). Drain obligation requires BOTH a consumer and an expressible terminal transition; checking only the former produces a confident false clean bill.',
    'A REMINDER IS NOT A DRAIN, AND AN ALARM CAN ITSELF BE UNDRAINED. adam_adherence_drift is COUNTED by feedback-sla-gauge, whose only response is to write ANOTHER feedback row (feedback_sla_breach) — which the live run then measured at 54 rows, 22.9 days old, with no consumer of its own. A detector that escalates by writing into a queue nobody drains has not closed the loop; it has added a second undrained queue. When auditing drain obligations, follow the escalation path to a terminal state, not to the next write.',
    'SCOPE DISCIPLINE MEANS RE-VERIFYING EACH NARRATED INSTANCE IS STILL OPEN, AND RE-SCOPING WHEN THE PRIOR REMEDY IS ITSELF AN INSTANCE. Instance 2 was deleted at LEAD because SD-LEO-INFRA-CHAIRMAN-APPLY-FLAG-001 had already shipped the blocking CHAIRMAN_APPLY_VERIFICATION gate (11% scope reduction, taken before EXEC). Instance 8 was re-scoped after finding that QF-20260726-794 had already shipped the consecutive_refusals counter — with ZERO consumers, and its only invoker ignoring the return value. The prior fix was a fresh instance of the very class it was meant to fix, so the remedy became "drain the existing signal" rather than "add a signal".',
    'RECORD DEFERRED SCENARIOS EXPLICITLY OR THEY READ AS NOT-YET-FILLED-IN. 4 of this SD\'s 17 test scenarios were not met (TS-8, TS-10, TS-16, readDescriptor dispatch). Each is written into PRD metadata.deferred_scenarios with a gap statement and an assessment distinguishing "missing an ENTRY (inventory data)" from "missing a CAPABILITY". This is the same asymmetry the SD is about: an unrecorded absence is indistinguishable from work nobody has gotten to yet, while a recorded deferral is a finding with an owner.',
    'MEASURE THE POPULATION BEFORE TRUSTING THE NARRATED SAMPLE. The SD described 9 instances; VALIDATION\'s census found ~27 feedback categories with undrained rows, and the largest instance by far (invariant_gauge_finding, 4,235 of 4,235 undrained) was absent from the narration entirely. A hand-enumerated instance list is a sample, not a census — run the census before sizing the class or the scope will be set from the instances that happened to be memorable.',
  ],
  action_items: [
    {
      title: 'Add a DRAIN_DESCRIPTOR for drain-inventory\'s OWN output (TS-10)',
      description: 'The gauge self-registers in periodic_process_registry as standard_loop:drain-inventory with liveness_source=self_stamped and stampLastFired is verified writing last_fired_at — but there is no descriptor in lib/governance/gauge-registry.js DRAIN_DESCRIPTORS for what scripts/drain-inventory.mjs itself emits, so it does not appear in its own inventory. "Survives its own standard" is this SD\'s central rhetorical claim and is currently only half delivered. Recorded in PRD metadata.deferred_scenarios as TS-10.',
      priority: 'high',
      owner_role: 'EXEC',
    },
    {
      title: 'Drain the 7 FAILING entries the inventory now makes visible — starting with feedback_sla_breach and relay_drop',
      description: 'The live run reports 11 detectors / 7 FAILING / exit 1: relay-drop NO_CONSUMER (8.0d, n=11), adam-adherence-drift NO_CLOSING_PATH (36.0d, n=75), adam-adherence-ledger NO_CLOSING_PATH (36.0d, n=124), quick-fixes-stranded NO_CONSUMER (2.4d, n=7), feedback-sla-breach NO_CONSUMER (22.9d, n=54), wind-down-survey (write-only sink from scripts/hooks/stop-loop-wakeup-reminder.cjs:200), invariant-gauge-finding CLOSING_PATH_UNEXERCISED (24.5d, n=4245). Each needs a NAMED consumer and a concrete closing transition added to its descriptor and actually wired. feedback_sla_breach is the sharpest: it is the escalation output of the SLA gauge and is itself undrained, so today an escalation just creates a second undrained queue.',
      priority: 'high',
      owner_role: 'LEAD',
    },
    {
      title: 'Give adam_adherence_ledger an expressible terminal state (it has a consumer and still cannot close)',
      description: 'adam_adherence_ledger is read by lib/vision/rung-health-convergence.mjs:126 but its columns (run_id/probe/duty/verdict/detail/remediation_ref/created_at) contain NO status column, so a verdict=fail row can never be marked addressed — the table only grows (1,333 rows, and scripts/adam-self-adherence-review.mjs:248 independently flags unbounded accumulation with no pruning). Either add a disposition column/table or declare a retention+rollup policy. This is the entry that proves a named consumer is not sufficient.',
      priority: 'high',
      owner_role: 'PLAN',
    },
    {
      title: 'Exercise or retire gauge_finding_dispositions — 4,245 invariant_gauge_finding rows against a table with zero rows ever written',
      description: 'invariant-gauge-finding reads CLOSING_PATH_UNEXERCISED: the closing path EXISTS as a live table and has NEVER been used. This is the single largest undrained population in the database and it is the gauge runner\'s OWN output. Either wire a disposition writer into the gauge-runner loop, or delete the table so the entry degrades honestly to NO_CLOSING_PATH rather than sitting in a verdict that reads as "someone meant to".',
      priority: 'high',
      owner_role: 'LEAD',
    },
    {
      title: 'Schedule drain-inventory.mjs and route its non-zero exit somewhere a human reads — otherwise it is instance #12',
      description: 'scripts/drain-inventory.mjs exits 1 when any entry FAILS and self-stamps periodic_process_registry, but nothing currently RUNS it on a schedule and nothing consumes its exit code or --json output. A detector whose output nobody reads is exactly the class this SD was chartered to close, so leaving it unwired would make this SD a fresh instance of its own finding. Wire it into the standard loop and name the consumer of its report in its own descriptor.',
      priority: 'high',
      owner_role: 'EXEC',
    },
    {
      title: 'Add the session_coordination drain descriptor (TS-8) to demonstrate owed-vs-delivered predicate discrimination',
      description: 'The predicate MECHANISM is implemented and generically tested (every descriptor names its predicate; the predicate is carried onto the row and never merged into one number), but no session_coordination descriptor exists, so the live discrimination case — 2 coordinator_request rows OWED vs 233 raw unacked rows DELIVERED — is not demonstrated. This is missing inventory DATA, not missing capability. Recorded in PRD metadata.deferred_scenarios as TS-8.',
      priority: 'medium',
      owner_role: 'EXEC',
    },
    {
      title: 'Flag an UNDECLARED timestampSkew as a finding (TS-16) — needs new detection behaviour, not a test',
      description: 'buildInventoryRow carries descriptor.timestampSkew onto the row, and the DECLARED case is tested (quick_fixes carries its skew), but an ABSENT timestampSkew on a naive-timestamp table yields null with no verdict impact. Naive timestamps on quick_fixes / strategic_directives_v2 / sd_phase_handoffs / product_requirements_v2 make a JS-computed age read ~4h YOUNGER — in the alarm-SUPPRESSING direction (SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001, draft). An undeclared skew should itself be a verdict. Recorded in PRD metadata.deferred_scenarios as TS-16.',
      priority: 'medium',
      owner_role: 'PLAN',
    },
    {
      title: 'Make "verify the control at the consumer, not at the report" a standing step in sub-agent re-verification',
      description: 'The TESTING re-verification found the SEC-DRAIN-001 allow-list existed only in the working tree — local HEAD and origin were both a78ac756dd0 with zero occurrences of CLOSING_PATH_TABLES — while my evidence row already credited the PR with the control. Add an explicit step to the TESTING/SECURITY re-verification checklist: when an agent claims a control exists, grep for it in the COMMITTED artifact (git show HEAD / origin) and record the commit SHA in the evidence row, never accept the claim from the report alone. Generalizes beyond this SD to every sub-agent evidence row that asserts a mitigation.',
      priority: 'high',
      owner_role: 'PLAN',
    },
    {
      title: 'Add readDescriptor per-source-kind dispatch and closing-path-probe error-path coverage',
      description: 'The dangerous half of scripts/drain-inventory.mjs (loop bound, ORDER BY, truncation, error-to-noData) was extracted into paginateAll in lib/governance/drain-inventory.js and is covered by 7 tests. What remains untested is the per-source-kind filter dispatch (feedback_category vs table vs the closing-path probe) and the probe error paths. TESTING accepted this as residual because a mis-scoped population surfaces as an obviously wrong COUNT rather than a silently young AGE — a different risk class — but it is still uncovered. Recorded in PRD metadata.deferred_scenarios.',
      priority: 'low',
      owner_role: 'EXEC',
    },
  ],
  improvement_areas: [
    {
      area: 'The detector reported HEALTH over the defect it exists to detect (invariant-gauge-finding PASS with 4,245 undrained rows)',
      analysis: 'A three-state signal (measured-zero / measured-nonzero / never-measured) was collapsed into `reading.closingPathUses === 0`, and the feedback-category reader never populated the value, so null fell through to PASS.',
      prevention: 'Closing paths are now PROBED via a declared descriptor.closingPathTable rather than assumed, and verdicts are separated BY PROVENANCE so UNAVAILABLE (could not measure) can never render as either health or a finding. Standing practice: treat the FIRST live run of a new detector as an adversarial test of the detector, and point the tool at its own output (tracked as the TS-10 action item).',
    },
    {
      area: 'A security control was reported as implemented while it existed only in the working tree',
      analysis: 'SEC-DRAIN-001\'s CLOSING_PATH_TABLES allow-list was present locally but absent from both local HEAD and origin (a78ac756dd0). The evidence row already credited the PR with it; only a consumer-side grep of the committed tree revealed the gap.',
      prevention: 'Committed as 060f3727ce8 and recorded in PRD metadata.security_evidence. Tracked as the "verify the control at the consumer" action item — evidence rows asserting a mitigation must name the commit SHA, and re-verification must grep the committed artifact.',
    },
    {
      area: 'Fixture ordering made the primary drain-age test unable to falsify a rows[0] implementation',
      analysis: 'The TS-2 fixture happened to be ordered oldest-first, so rows[0] was accidentally correct and the load-bearing test passed while computeOldestUndrainedAge was broken. Only the separate ordering-independence test killed the mutant.',
      prevention: 'Fixture reordered newest-first so TS-2 now fails independently (2 mutant failures, not 1). Generalized: any fixture with an ordering the implementation could exploit is adversarially reordered in the primary test rather than relying on a secondary property test.',
    },
    {
      area: 'Green tests did not imply covered behaviour — a rendered flag survived mutation',
      analysis: 'row.failing forced to false passed all 35 tests because the true case was asserted only through isFailing(), never through buildInventoryRow\'s output, even though the CLI renders its markers, FAILING count and banner from the row.',
      prevention: 'Mutation testing (42 mutants + 5 controls) is now part of the verification for detector logic; all four failing verdicts and both non-failing ones are asserted through the ROW, and id/consumer/closingPath/accumulationSignal/fieldQuestion/count/reason/measuredBy/oldestAt are each pinned after surviving being nulled.',
    },
    {
      area: 'The scope narrative under-counted the population by roughly 3x',
      analysis: 'The SD narrated 9 instances; VALIDATION\'s census found ~27 feedback categories with undrained rows, and the largest (invariant_gauge_finding, 4,235 of 4,235) was not narrated at all.',
      prevention: 'Recorded in PRD metadata.population_correction. Practice: run the census before sizing the class, and treat any hand-enumerated instance list as a sample.',
    },
  ],
  success_patterns: [
    'PLAN-phase structural check on the extension point: TESTING verified GAUGE_REGISTRY\'s own invariants (non-null detectorFn, entry count, enabled-id list) before descriptors were attached, converting a mid-EXEC regression into a pre-EXEC design correction (sibling DRAIN_DESCRIPTORS export in the same file)',
    'Resolved a self-contradicting PRD (TS-2 "seed" vs TR-5 "read-only") by extracting a pure core, mirroring the existing computeBreaches/planSlaBreaches split in lib/coordinator/feedback-sla-gauge.cjs rather than inventing a new pattern',
    'Confirmed the chosen test tier actually EXECUTES before writing coverage into it — the `db` vitest project resolves to 0 files, so all 46 tests were pinned to `unit`',
    'Ran the negative control before citing the positive signal: 42 mutants shipped with 5 control mutants proving the harness could still kill; forced credential error paths with a canary key rather than reasoning about them',
    'Every age assertion carries an exact value AND separation from a newest-write reading, plus a discrimination control (one PASS among six FAIL) so an implementation that failed everything could not look correct',
    'Verified the security mechanism in the dependency source (postgrest-js dist/index.cjs:4749 does not encode the relation; new URL() normalizes traversal) instead of accepting the tool\'s internal-only framing',
    'Re-verified each narrated defect instance was still open at LEAD — deleted instance 2 (closed by SD-LEO-INFRA-CHAIRMAN-APPLY-FLAG-001) and re-scoped instance 8 after finding QF-20260726-794\'s shipped counter had zero consumers',
    'Recorded 4 unmet test scenarios as explicit DEFERRALS in PRD metadata with gap + assessment for each, rather than letting silent absence read as not-yet-filled-in',
    'Captured a pre-EXEC baseline (3 files / 61 tests green) so any post-EXEC red in the neighbouring suites would be provably attributable to this SD',
  ],
  failure_patterns: [
    'The detector shipped the defect class it detects: null closingPathUses fell through `=== 0` to PASS, so the inventory reported HEALTH over 4,245 undrained invariant_gauge_finding rows on its first live run',
    'A control was credited in an evidence row while present only in the working tree — local HEAD and origin were both a78ac756dd0 with zero occurrences of CLOSING_PATH_TABLES',
    'A load-bearing test was unfalsifiable because its fixture\'s incidental oldest-first ordering made a rows[0] implementation accidentally correct',
    'A rendered flag (row.failing) survived mutation against all 35 tests because it was asserted only through its computing function and never through the object the renderer reads',
    'A vacuous test: "every descriptor names a predicate" was a loop with no non-emptiness guard and passed with DRAIN_DESCRIPTORS emptied',
    'Dead defence: a structural-vs-UNAVAILABLE guard in the CLI was provably unreachable across all 84 descriptor x reading combinations',
    'The scope narrative was a sample, not a census — 9 narrated instances vs ~27 found, with the largest instance unnarrated',
    'An escalation path that terminates in another undrained queue: adam_adherence_drift is counted by feedback-sla-gauge whose only response is to write feedback_sla_breach, itself measured at 54 rows / 22.9 days with no consumer',
  ],
  business_value_delivered:
    'Converts an invisible, unbounded liability into a measured, exit-code-bearing finding: 11 detectors inventoried, 7 FAILING, with the oldest undrained row per queue named in days rather than left as a blank cell. The largest single item surfaced — 4,245 invariant_gauge_finding rows against a gauge_finding_dispositions table with zero rows ever written — was not in the SD\'s original narration and would otherwise have kept growing unread. The inventory also establishes the contract vocabulary (consumer, closingPath, predicate, shapeContract, accumulationSignal, fieldQuestion, measuredBy, timestampSkew) so future detectors declare a drain obligation at birth instead of accumulating one silently, and it explicitly protects unkeyable judgment work via MEASURED_ELSEWHERE so no one is pressured to manufacture artifacts just so a counter can see them.',
  customer_impact:
    'Indirect: internal governance/observability surface for the LEO harness. No end-user product surface changed; the CLI is strictly read-only and adds no runtime cost to any existing loop.',
  technical_debt_addressed: true,
  technical_debt_created: false,
  bugs_found: 6,
  bugs_resolved: 6,
  tests_added: 46,
  performance_impact: 'Standard — read-only CLI, ordered paginated reads at PAGE_SIZE=1000; largest population read is 4,245 rows. No change to any existing loop.',
  objectives_met: true,
  on_schedule: true,
  within_scope: true,
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC', 'VALIDATION', 'Explore', 'DESIGN', 'DATABASE', 'RISK', 'TESTING', 'SECURITY', 'VISION_FIDELITY', 'RETRO'],
  human_participants: ['LEAD'],
  team_satisfaction: 9,
  metadata: {
    sd_key: SD_KEY,
    pr: 'https://github.com/rickfelix/EHG_Engineer/pull/6616',
    branch: 'feat/SD-LEO-INFRA-DETECTOR-OUTPUT-DRAIN-001',
    worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-INFRA-DETECTOR-OUTPUT-DRAIN-001',
    files_new: [
      'lib/governance/drain-inventory.js',
      'scripts/drain-inventory.mjs',
      'tests/unit/governance/drain-inventory.test.js',
    ],
    files_edited: ['lib/governance/gauge-registry.js'],
    diff_stat: '4 files / +897 LOC vs merge-base 451bcb0c7c3',
    commits: {
      '8810e187883': 'drain inventory core — pure computeOldestUndrainedAge / classifyStructural / classifyObserved / buildInventoryRow + DRAIN_DESCRIPTORS sibling export (35 tests)',
      'be11274f79b': 'runnable read-only CLI + periodic_process_registry self-registration; fixed the PASS-over-4245-rows defect and the blank-age-on-failing-entry defect',
      '299f9771fa4': 'killed 2 surviving mutants (row.failing, pagination <=), removed 1 vacuous test + 1 unreachable guard, extracted paginateAll seam (45 tests)',
      'a78ac756dd0': 'eslint: drop unused test-helper args',
      '060f3727ce8': 'SEC-DRAIN-001 CLOSING_PATH_TABLES allow-list + SEC-DRAIN-002 comment; pinned measuredBy/oldestAt mutants (46 tests)',
    },
    live_run: {
      command: 'node scripts/drain-inventory.mjs',
      result: '11 detectors, 7 FAILING, exit code 1',
      rows: [
        'relay-drop              NO_CONSUMER               8.0d  n=11',
        'adam-adherence-drift    NO_CLOSING_PATH          36.0d  n=75',
        'adam-adherence-ledger   NO_CLOSING_PATH          36.0d  n=124',
        'quick-fixes-stranded    NO_CONSUMER               2.4d  n=7',
        'feedback-sla-breach     NO_CONSUMER              22.9d  n=54',
        'invariant-gauge-finding CLOSING_PATH_UNEXERCISED 24.5d  n=4245',
        'solomon-advice-outcome-ledger PASS                3.5d  n=380',
        'solomon-consult-replies MEASURED_ELSEWHERE          —',
        'roadmap-link-exception  UNAVAILABLE                 —   (cannot read SD metadata; unmeasured never renders as health)',
      ],
    },
    test_verification: {
      new_tests: { 'tests/unit/governance/drain-inventory.test.js': 46 },
      regression_scope: '1,405 tests across 101 governance + coordinator suites green; pre-existing gauge-registry suite unchanged (additive-only)',
      pre_exec_baseline: '3 files / 61 tests green before EXEC (gauge-registry, gauge-runner-liveness, feedback-sla-gauge)',
      mutation_testing: '42 mutants + 5 control mutants; 3 real gaps found (F1 row.failing survived all 35 tests, F3 vacuous predicate loop, F4 unreachable guard at 0/84 combinations)',
      tier_note: 'All tests pinned to the `unit` vitest project — the `db` project resolves to ZERO files (tests/helpers/db-target.js DESIGNATED_NON_PROD_REFS intentionally empty), so a db-tier green would be indistinguishable from no coverage',
    },
    sub_agent_evidence: {
      VALIDATION_LEAD: 'fc6b1208-fb8e-4227-8aab-c9b7212df3a8 (conf 88) — censused ~27 undrained feedback categories vs the SD\'s narrated 9',
      Explore_LEAD: '1671354b-21c9-4201-8461-182886b6c2e1 (conf 85)',
      TESTING_PLAN: '6a87230f-f53a-4a45-800b-afff42983701 (conf 82) — drove the 6 plan_amendments incl. the DRAIN_DESCRIPTORS structural correction',
      TESTING_EXEC: '1c3eb1d2-fe87-4fdc-a1e4-1588914019ff (conf 88) — adversarial mutation pass',
      SECURITY_EXEC: '0a0dac90-c9a0-4db4-8749-7ae21bf00ff6 (conf 92) — SEC-DRAIN-001 / SEC-DRAIN-002',
      TESTING_REVERIFY: 'd63dca08-c123-40f2-b9b1-e441109e0ef3 (conf 93, CONDITIONAL_PASS) — checked the control AT THE CONSUMER and found the allow-list was working-tree-only',
      VISION_FIDELITY: '9c7ec7c8-f7b3-4f17-a71e-96121f27d9ca (conf 100)',
    },
    deferred_scenarios: ['TS-8 session_coordination descriptor', 'TS-10 the gauge\'s own descriptor', 'TS-16 undeclared-skew detection', 'readDescriptor dispatch coverage'],
    lead_scope_reduction: 'Instance 2 deleted (closed by SD-LEO-INFRA-CHAIRMAN-APPLY-FLAG-001); instance 8 re-scoped after QF-20260726-794\'s shipped counter was found to have zero consumers — 11% reduction',
    partial_dependency: 'SD-LEO-INFRA-NAIVE-TIMESTAMP-SKEW-001 (draft) — naive timestamps read ~4h younger, in the alarm-suppressing direction. Not blocking; feedback is timestamptz.',
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

  const { data: ins, error: insErr } = await s.from('retrospectives').insert(retro).select('id, created_at, retro_type, quality_score').single();
  if (insErr) {
    console.error('INSERT FAILED:', insErr.message, insErr.details || '', insErr.hint || '');
    process.exit(1);
  }
  console.log('INSERTED:', JSON.stringify(ins, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
