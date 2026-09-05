#!/usr/bin/env node
/**
 * One-off: create the PRD for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D via contentOverride
 * (generate-first pattern, SD-FDBK-INFRA-ADD-PRD-DATABASE-001), grounded in an Explore sweep
 * plus independent validation-agent and risk-agent re-measurement against live DB/code that
 * corrected all 4 of the SD's own stated FRs before this PRD was written -- see LEAD
 * scope-correction note recorded on the SD row (metadata.lead_scope_correction).
 */
import { addPRDToDatabase } from '../prd/index.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D';

const content = {
  executive_summary:
    'LEAD research corrected all 4 of this SD\'s own pre-authored FRs against live code and ' +
    'production data. The real, measured defect behind FR-D1 is precise: ' +
    'lead-final-approval/index.js:43\'s projectGateResultsForPersistence() reads .required off ' +
    'the wrong sibling object, so 15,476/15,476 sampled gate_results entries (500/500 production ' +
    'rows) persist required:false unconditionally -- including WIRE_CHECK_GATE, which is ' +
    'required:true in source. Live gate-BLOCKING behavior is unaffected (a separate code path ' +
    'reads the correct value at evaluation time); only the persisted audit trail is wrong, which ' +
    'is exactly what an auditor or the parent CAPA\'s own bypass-rate measurement would read. In ' +
    'fact the parent\'s own ratified success_criteria text is demonstrably corrupted by this bug: ' +
    'it concluded 5 named gates were "not required" from the buggy false reading, when all 5 ' +
    'declare required:true and were actually accepted via bypass. FR-D2\'s "advisory-only ' +
    'staleness" framing is also wrong in a way that changes where the fix belongs: the existing ' +
    'staleness-detection logic does not run at LEAD-FINAL-APPROVAL at all (wired only into 4 other ' +
    'handoff types, and even there scoped to EXEC-TO-PLAN only) -- there is currently no ' +
    'staleness check of any kind at this phase. A naive port of the existing commit-SHA-based ' +
    'check would be vacuous by construction (95% no-op rate, measured, since it depends on a ' +
    'worktree path that is null/reaped for most completed SDs); the corrected design is a ' +
    'DB-only, age-based check inside the already-registered GATE_ACTIVATION_INVARIANT gate. ' +
    'FR-D3 undercounted env-flag-gated dead branches (5, not 2) and mischaracterized one as fully ' +
    'dead when it partially isn\'t; only the zero-risk flag is turned on. FR-D4\'s proposed data ' +
    'source cannot ever populate on LEAD-FINAL-APPROVAL\'s actual write path; the real, ' +
    'already-populated source (bypass_ledger) just needs a structural join fixed.',
  functional_requirements: [
    {
      id: 'FR-D1',
      title: 'Every LEAD-FINAL-APPROVAL gate\'s persisted required flag reflects its real declared/effective value, not an unconditional false',
      priority: 'critical',
      description:
        'ValidationOrchestrator.js:343 does `results.gateResults[gate.name] = gateResult;` -- the ' +
        'raw validator return value, which carries `required` for exactly one of the 22 registered ' +
        'gates (fr-delivery-classifier.js, which sets it dynamically and deliberately). The other ' +
        '21 validators never populate it, so lead-final-approval/index.js:43\'s ' +
        '`required: !!(r && r.required)` always evaluates false for them. The correct static value ' +
        'already exists nearby and is orphaned: ValidationOrchestrator.js:352/359 builds ' +
        '`results.gateStatuses[gate.name] = { status, required: gate.required !== false }` but ' +
        'nothing downstream ever reads gateStatuses. Fix at the single point results.gateResults is ' +
        'built (ValidationOrchestrator.js:343): merge in the gate\'s static required (predicate ' +
        '`gate.required !== false`, matching the live blocking predicate exactly) as `required`, ' +
        'and preserve any validator-set dynamic value as `required_effective` (so ' +
        'FR_DELIVERY_VERIFICATION\'s deliberate warn-only false is not overwritten/regressed). This ' +
        'repairs projectGateResultsForPersistence with zero further edit needed to index.js, and ' +
        'also repairs the 3 other downstream writers (HandoffRecorder.recordFailure/createArtifact/' +
        '_recordCompletionActionFailure) for free, since they all read the same results.gateResults ' +
        'object -- this is a root-cause fix at the one shared construction site, not a per-writer ' +
        'patch. Also project `status` and `skip_reason` (already available on gateStatuses) ' +
        'alongside `required`, so a type-skip is distinguishable from a real pass in the audit ' +
        'record. CI asserts the corrected value for the 9 gates the SD itself named as a subset ' +
        'of the full, programmatically-derived 16-of-22 required-gate roster (not a hardcoded 9).',
      acceptance_criteria: [
        'A fixture LEAD-FINAL-APPROVAL run where WIRE_CHECK_GATE fails persists required:true in the resulting metadata.gate_results entry (measured today: unconditionally false across 500/500 sampled production rows)',
        'FR_DELIVERY_VERIFICATION\'s dynamic warn-only required:false (its deliberate, documented behavior when its own enforcement flag is off) is preserved as required_effective and not overwritten by the static true',
        'A test asserts the persisted required roster programmatically against getRequiredGates() (all currently-registered required:true gates), not a hardcoded list of 9',
        'HandoffRecorder-written gate_results (the rejected-handoff-row path) also carry a correct required value with no separate code change, proving the fix is at the shared construction site',
        'The parent CAPA\'s criteriaD[3] correction (the 5 named gates ARE required; they were accepted via bypass, not because they were non-required) is recorded alongside this fix',
      ],
    },
    {
      id: 'FR-D2',
      title: 'A real, DB-only evidence-staleness check runs at LEAD-FINAL-APPROVAL and produces a failing verdict, closing a gap where none exists today',
      priority: 'critical',
      description:
        'No staleness-vs-commit or staleness-vs-phase-start check exists anywhere in the ' +
        'LEAD-FINAL-APPROVAL pipeline today -- subagent-evidence-gate.js\'s detectStaleEvidence is ' +
        'wired only into LEAD-TO-PLAN/PLAN-TO-EXEC/EXEC-TO-PLAN/PLAN-TO-LEAD, and even there fires ' +
        'only for handoffType===\'EXEC-TO-PLAN\' by deliberate design (a commit-SHA mismatch is the ' +
        'NORMAL state at the other 3 phases). Add an age-based check (created_at vs. phase start, ' +
        'no git/worktree dependency) inside the already-registered, already-required:true ' +
        'GATE_ACTIVATION_INVARIANT gate (activation-invariant-gate.js), at a 72h threshold ' +
        '(measured trailing-30-day impact: 1/120 SDs, 0.8% -- versus 93.3% for a naive ' +
        'commit-SHA-strict port, which would be vacuous by construction since sd.worktree_path is ' +
        'null/reaped for most completed SDs). This requires fixing ' +
        'lib/sub-agent-executor/evidence-provenance.js\'s normalisePhase()/PHASE_MAP, which is ' +
        'still missing bare \'PLAN\' and 3 of 4 hyphenated handoff-type spellings (measured: ~51% ' +
        'of trailing-30-day evidence rows fail to normalise) -- add the missing keys, and add a ' +
        'LEAD-FINAL-APPROVAL entry to HANDOFF_TYPE_TO_PHASE mapping to \'LEAD\' (consistent with ' +
        'subagent-evidence-gate.js\'s own phase-start resolver). Deliberately leave \'orchestrated\' ' +
        'unmapped -- that is a separate design decision, not a bugfix. Ship with a kill-switch env ' +
        'var following this codebase\'s existing convention (e.g. ' +
        'LEO_DISABLE_LFA_STALENESS_CHECK), matching LEO_DISABLE_STALE_EVIDENCE_CHECK\'s precedent.',
      acceptance_criteria: [
        'A fixture SD whose newest relevant sub-agent evidence created_at predates the current LEAD phase start by more than 72h fails GATE_ACTIVATION_INVARIANT with the age stated in the verdict, not a console warning',
        'A fixture SD with fresh evidence (within threshold) passes unaffected',
        'normalisePhase() correctly maps bare \'PLAN\' and all 4 hyphenated handoff-type spellings (LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD); \'orchestrated\' remains unmapped by design, with a test pinning that as intentional',
        'HANDOFF_TYPE_TO_PHASE has a LEAD-FINAL-APPROVAL entry mapping to \'LEAD\'',
        'The check is NOT a port of detectStaleEvidence\'s commit-SHA-equality predicate -- a test fixture with a genuinely mismatched-but-recent evaluated_commit_sha (a normal post-merge state) does NOT fail the new check, proving it is age-based, not SHA-based',
        'LEO_DISABLE_LFA_STALENESS_CHECK (or equivalent) exists as a documented kill-switch',
      ],
    },
    {
      id: 'FR-D3',
      title: 'ENFORCE_ADKAR_GATE is turned on (zero-risk); the other 4 env-flag-gated branches remain observe-only with documented per-flag rationale; none are removed',
      priority: 'high',
      description:
        'The SD named 2 flags; research found 5: ENFORCE_ADKAR_GATE, ENFORCE_LEARNING_GATE, ' +
        'ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING, INVOCATION_PATH_PROOF_MODE, ' +
        'SUBAGENT_EVIDENCE_PROVENANCE_MODE -- none set to \'true\' anywhere in production. Turn on ' +
        'ONLY ENFORCE_ADKAR_GATE: measured zero-risk (only 1 of 6,089 SDs has ever set ' +
        'metadata.requires_adoption=true, and that SD is already completed -- zero in-flight ' +
        'exposure). Do NOT flip ENFORCE_LEARNING_GATE -- learning-or-bypass-resolved-gate.js ' +
        'already contains an unconditional hard block on unresolved phase-chain bypasses that does ' +
        'NOT depend on the flag; the flag only gates a narrower secondary check whose false-positive ' +
        'rate is unmeasured. Do NOT flip ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING -- a prior sibling ' +
        'SD already recorded a standing recommendation to spot-check its false-positive rate before ' +
        'ever flipping it, which this SD has not done. Do not touch INVOCATION_PATH_PROOF_MODE or ' +
        'SUBAGENT_EVIDENCE_PROVENANCE_MODE (the latter shipped by sibling A yesterday; flipping it ' +
        'is out of this SD\'s scope). Per the parent CAPA\'s own ratified rule, a zero-yield census ' +
        'is evidence to investigate, never a removal warrant requiring a per-gate reachability ' +
        'proof -- no branch is removed in this SD.',
      acceptance_criteria: [
        'ENFORCE_ADKAR_GATE=true is set in the appropriate config/env location and a test confirms ADKAR_ADOPTION now enforces for a fixture SD with requires_adoption=true',
        'A before/after measurement note states the honest zero-delta (0 in-flight SDs affected) rather than implying a meaningful behavior change',
        'ENFORCE_LEARNING_GATE, ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING, INVOCATION_PATH_PROOF_MODE, and SUBAGENT_EVIDENCE_PROVENANCE_MODE remain at their current default (off/observe-only) with no code change',
        'Each of the 5 flags has a one-line documented disposition-and-rationale in the FR-D4 gate-census artifact',
      ],
    },
    {
      id: 'FR-D4',
      title: 'The LEAD-FINAL-APPROVAL bypass_ledger join is made structural (handoff_id/sd_id populated), the already-holding no-silent-bypass invariant is CI-asserted, and a committed gate-census artifact names every gate\'s disposition',
      priority: 'high',
      description:
        'validation_details.bypass (the SD\'s originally proposed source) can never populate for ' +
        'LEAD-FINAL-APPROVAL -- its canonical accepted-row write does its own dedicated insert and ' +
        'never routes through HandoffRecorder.recordSuccess()\'s bypass-stamping path. The correct, ' +
        'already-populated source is bypass_ledger (33 LEAD-FINAL-APPROVAL rows); the already-' +
        'holding invariant (every accepted row with a failing required gate joins to a bypass_ledger ' +
        'row -- measured 22/22) was independently confirmed. The real defect is joinability: ' +
        'bypass_ledger.handoff_id is 0/33 populated for this phase (sd_id 2/33; only the soft, ' +
        'renameable sd_key is 33/33). Populate handoff_id/sd_id on the LEAD-FINAL-APPROVAL ' +
        'bypass_ledger write path, and add a CI-asserted regression test for the 22/22 invariant so ' +
        'it cannot silently regress. Produce a committed gate-census artifact (script + generated ' +
        'output, or a test fixture) naming every LEAD-FINAL-APPROVAL gate\'s required/not-required ' +
        'status, live-registration status, and (for the 5 FR-D3 flags) enforcement disposition -- ' +
        'this satisfies the SD\'s own FR-D4 CI-predicate intent ("the gate census is a committed ' +
        'artifact with every gate\'s disposition named") independent of the bypass-rate reframing ' +
        'below.',
      acceptance_criteria: [
        'A fixture LEAD-FINAL-APPROVAL bypass write populates bypass_ledger.handoff_id and sd_id, not just sd_key',
        'A CI test asserts: every accepted LEAD-FINAL-APPROVAL row (in a fixture/sample) with a required gate reading passed:false joins to a bypass_ledger row via handoff_id -- and fails loudly if that ever stops holding',
        'A committed gate census (script output or fixture) lists every LEAD-FINAL-APPROVAL gate module with its required/registered/enforcement-flag status',
        'The trailing-30-day LEAD-FINAL-APPROVAL bypass-share KPI is reported as an observation-only measurement (currently 34.2%, driven substantively by infrastructure fail-closed conditions such as a dead GEMINI_API_KEY causing RETROSPECTIVE_EXISTS bypasses -- separately signaled, not fixed here), not asserted as a code-enforceable pass/fail against the original 32/158 (20.3%) baseline, since that baseline is not something this SD\'s code can move',
      ],
    },
  ],
  acceptance_criteria: [
    'A gate\'s declared required:true in its own source is what reaches the persisted audit record on both accepted and rejected LEAD-FINAL-APPROVAL rows, for the full programmatically-derived required-gate roster (not a hardcoded 9)',
    'A real, DB-only, age-based evidence-staleness check runs at LEAD-FINAL-APPROVAL and produces a failing verdict with the age stated -- where today no staleness check of any kind exists at this phase',
    'ENFORCE_ADKAR_GATE is live; the other 4 env-flag-gated branches are left alone with documented rationale, none removed',
    'The LEAD-FINAL-APPROVAL bypass_ledger join is structural (handoff_id-based), the already-holding 22/22 no-silent-bypass invariant is CI-asserted, and a committed gate-census artifact names every gate\'s disposition',
    'The parent CAPA\'s own criteriaD[3] baseline claim is corrected in the same PR that fixes the bug which produced it',
  ],
  system_architecture:
    'FR-D1 is a single-point fix at ValidationOrchestrator.js\'s gateResults construction (no new ' +
    'table, no schema change) that fixes all 4 downstream writers simultaneously. FR-D2 extends the ' +
    'existing, already-registered GATE_ACTIVATION_INVARIANT gate with a new age-based condition and ' +
    'fixes an existing shared utility (normalisePhase/PHASE_MAP) rather than adding a new gate or ' +
    'wiring in subagent-evidence-gate.js (which would drag in its unrelated required-agent-roster ' +
    'and provenance-grading machinery, the latter of which has its own live bug in a sibling SD, ' +
    'out of scope here). FR-D3 is an env/config flip plus documentation, no code path change beyond ' +
    'ADKAR. FR-D4 adds two columns\' worth of population to an existing bypass_ledger write path ' +
    'and a CI assertion; no schema change (handoff_id/sd_id already exist as columns per the SD\'s ' +
    'own text and measured data).',
  implementation_approach:
    'FR-D1 ships first -- it is the instrument the other 3 FRs\' own evidence depends on (the ' +
    'parent\'s own baseline was corrupted by this exact bug), and D4\'s CI assertion needs correct ' +
    'required values to test against. FR-D4\'s join fix and gate-census artifact ship next (cheap, ' +
    'independent, and needed to honestly report FR-D3\'s flag dispositions). FR-D3\'s single flag ' +
    'flip ships alongside D4\'s census. FR-D2 ships last, since it is the most novel piece (a new ' +
    'check, plus a shared-utility fix) and benefits from FR-D1\'s corrected audit trail being in ' +
    'place first for its own test fixtures.',
  test_scenarios: [
    {
      scenario: 'A fixture LEAD-FINAL-APPROVAL run where WIRE_CHECK_GATE fails',
      expected: 'metadata.gate_results.WIRE_CHECK_GATE.required is true, not false',
    },
    {
      scenario: 'A fixture run of FR_DELIVERY_VERIFICATION with its enforcement flag off (current default)',
      expected: 'required_effective is false (preserved, not overwritten by the new static-required merge)',
    },
    {
      scenario: 'A fixture SD with sub-agent evidence created 80 hours before LEAD phase start',
      expected: 'GATE_ACTIVATION_INVARIANT fails, stating the evidence age',
    },
    {
      scenario: 'A fixture SD with a stale-but-normal post-merge commit-SHA mismatch and fresh (recent) evidence timestamps',
      expected: 'GATE_ACTIVATION_INVARIANT passes -- proving the new check is age-based, not SHA-based',
    },
    {
      scenario: 'normalisePhase() called with \'PLAN\', \'LEAD-TO-PLAN\', \'PLAN-TO-EXEC\', \'EXEC-TO-PLAN\', and \'orchestrated\'',
      expected: 'All 4 named spellings normalise correctly; \'orchestrated\' returns null/unmapped by design',
    },
    {
      scenario: 'A fixture SD with metadata.requires_adoption=true and an unresolved ADKAR item',
      expected: 'ADKAR_ADOPTION now enforces (fails) since ENFORCE_ADKAR_GATE is on',
    },
    {
      scenario: 'A fixture accepted LEAD-FINAL-APPROVAL row with a required gate at passed:false',
      expected: 'A joinable bypass_ledger row exists via handoff_id; the CI invariant test passes',
    },
    {
      scenario: 'The committed gate-census artifact is run/read',
      expected: 'Every LEAD-FINAL-APPROVAL gate is listed with its required/registered/enforcement-flag disposition',
    },
  ],
  risks: [
    {
      risk: 'FR-D1\'s merge at ValidationOrchestrator.js:343 could regress FR_DELIVERY_VERIFICATION\'s deliberate dynamic warn-only behavior if the static/dynamic precedence is implemented backwards',
      mitigation: 'Explicit acceptance criterion and test scenario pin required_effective as the preserved dynamic value; the merge order (dynamic wins where present, static as fallback into required, never the reverse) is stated directly in the FR description.',
    },
    {
      risk: 'FR-D2\'s new required:true, blocking check at LEAD-FINAL-APPROVAL could itself become a denial-of-completion vector if it misfires on infrastructure issues (the exact failure mode measured driving FR-D4\'s bypass-rate finding)',
      mitigation: 'Ships with a documented kill-switch env var (matching the codebase\'s existing LEO_DISABLE_* convention) and a measured 0.8% trailing-30-day impact at the chosen 72h threshold, with an explicit tightening path documented rather than defaulted to immediately.',
    },
    {
      risk: 'Widening FR-D1\'s required-gate roster from the SD\'s original 9 to the full ~16-25 registered gates changes historical-looking-forward interpretation of the persisted field for many more gates than originally scoped',
      mitigation: 'No consumer anywhere in the codebase currently reads the persisted required field (confirmed via a full repo-wide grep) -- the flip changes no observable behavior, only audit-record correctness. No backfill is attempted; historical rows keep their old (incorrect) values, documented as forward-only.',
    },
    {
      risk: 'FR-D3\'s ENFORCE_ADKAR_GATE flip, though measured zero-risk today, could be misread later as "proof the flag works" when its only historical trigger is a single already-completed SD',
      mitigation: 'The PRD and shipped documentation explicitly state the honest zero-delta (0 in-flight SDs affected) rather than implying a meaningful before/after behavior change.',
    },
    {
      risk: 'FR-D4\'s bypass-share KPI re-cut (from a hard pass/fail to observation-only) could be read as quietly weakening the SD\'s own stated exit bar',
      mitigation: 'The re-cut is justified with a specific, measured, root-caused reason (34.2% vs. 20.3% baseline, driven by a named infra defect -- dead GEMINI_API_KEY -- outside this SD\'s code), and that infra defect is separately signaled rather than silently dropped.',
    },
  ],
  out_of_scope: [
    {
      item: 'The SD\'s original "9 of 31 gates" framing and file list as the complete required-gate population',
      reason: 'Measured wrong on both numbers: only 22 gates are actually registered (not 31), of which 16 declare required:true (not 9). 2 of the SD\'s 9 named files (runtime-probe-coverage-gate.js, lead-final-approval/gates/acceptance-criteria-traceability.js) are dead code never wired into the runtime pipeline -- fixing their persistence has zero live effect. This PRD fixes and asserts against the full, programmatically-derived roster instead of the SD\'s hardcoded 9.',
    },
    {
      item: 'Porting subagent-evidence-gate.js\'s detectStaleEvidence commit-SHA-equality check directly to LEAD-FINAL-APPROVAL',
      reason: 'Measured vacuous by construction: it depends on sd.worktree_path, which is null or already-reaped for 57/60 of recently completed SDs. Would read as wired while no-oping ~95% of the time. Replaced with a DB-only, age-based check inside GATE_ACTIVATION_INVARIANT instead.',
    },
    {
      item: 'lib/sub-agent-executor/evidence-provenance.js\'s gradeProvenance() content-hash mismatch bug (59/93 post-cutover rows false-failing)',
      reason: 'A real, live, but separate defect in sibling SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-A\'s already-shipped code (a hashing-representation mismatch between write time and DB-read-back time), unrelated to this SD\'s age-based staleness design (which never calls gradeProvenance). Signaled to the coordinator 2026-09-05 for a QF against child A, not absorbed here.',
    },
    {
      item: 'Flipping ENFORCE_LEARNING_GATE, ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING, INVOCATION_PATH_PROOF_MODE, or SUBAGENT_EVIDENCE_PROVENANCE_MODE to enforcing/binding',
      reason: 'ENFORCE_LEARNING_GATE\'s "dead branch" framing was itself found wrong (the gate already hard-blocks unconditionally on its main path; the flag only gates an unmeasured secondary check). ACCEPTANCE_TIER_DOWNGRADE_GATE_BINDING already carries a prior sibling SD\'s standing recommendation against flipping without a false-positive spot-check this SD has not performed. SUBAGENT_EVIDENCE_PROVENANCE_MODE was shipped by sibling A only yesterday. Per the parent CAPA\'s own ratified rule, a zero-yield census is evidence to investigate, not a removal or auto-enable warrant.',
    },
    {
      item: 'Removing any of the 5 env-flag-gated dead/soft branches',
      reason: 'The parent CAPA\'s own ratified rule requires a per-gate reachability proof before removing any branch (three distinct causes are possible: no-caller, dead-by-configuration, or live-but-untriggered) -- not performed for any of the 5 flags in this SD.',
    },
    {
      item: 'Redesigning the bypass-rate measurement to derive from gate_results rather than bypass_ledger',
      reason: 'bypass_ledger is already the correct, already-populated, already-CLAUDE.md-compliant (evidence not authored by the party it gates) source, and its core invariant already holds (22/22, measured). Deriving a second, parallel bypass signal from gate_results would create a divergent metric and, per CLAUDE.md\'s gate-evidence-provenance rule, a metric partly authored by the gated party itself. The real and only needed fix is the join (handoff_id/sd_id population).',
    },
    {
      item: 'A dead GEMINI_API_KEY causing RETROSPECTIVE_EXISTS to fail-closed and bypass at LEAD-FINAL-APPROVAL',
      reason: 'A real, separately-actionable infrastructure defect inflating the bypass-share KPI for reasons unrelated to this SD\'s gate-pipeline code. Signaled to the coordinator 2026-09-05, not fixed here -- this SD\'s code cannot remediate an unset API key.',
    },
    {
      item: 'Backfilling historical sd_phase_handoffs/leo_handoff_executions rows\' incorrect required:false values',
      reason: 'The static gate-definition data needed to recompute historical values is not persisted anywhere it can be recovered from. All 4 FRs are forward-only fixes; documented rather than left for a reviewer to ask about.',
    },
  ],
};

async function main() {
  await addPRDToDatabase(SD_KEY, 'W5 child D PRD: root-fix the persisted required-flag bug, add a real LEAD-FINAL-APPROVAL staleness check, and make the bypass-ledger join structural', content);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
