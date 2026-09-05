#!/usr/bin/env node
/**
 * One-off: create the PRD for SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B via contentOverride
 * (generate-first pattern, SD-FDBK-INFRA-ADD-PRD-DATABASE-001), grounded in direct source
 * research + a VALIDATION sub-agent replay of 25 real bypass_ledger rows (evidence row
 * 4726e1a6-fe3e-45ba-a335-291907537304) that corrected two design assumptions from the
 * SD's own authored text before this PRD was written.
 */
import { addPRDToDatabase } from '../prd/index.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-B';

const content = {
  executive_summary:
    'bypass_ledger (the audit trail for --bypass-validation) is written exactly once in the ' +
    'codebase (cli-main.js:784-796), unconditionally whenever the flag is passed, before the ' +
    'executor runs. It never records which sd_phase_handoffs row resulted -- live query confirms ' +
    '165/165 rows (100%) have handoff_id NULL, even though the column already exists as a soft FK ' +
    '(no migration needed). Separately, nothing today compares the bypassing actor against the ' +
    'author of the evidence being overridden, even though both identities are the same ' +
    'CLAUDE_SESSION_ID value and directly comparable since child E/A shipped session_id stamping. ' +
    'A VALIDATION sub-agent replay of the 25 most recent real bypasses found 10 would have fired ' +
    'the self-authorship check (all self-authored TESTING=BLOCKED overrides) -- self-authored ' +
    'bypass is the norm among evidence-comparable rows, not an edge case. This child closes both ' +
    'gaps: joins every bypass_ledger row to the handoff row it produced (accepted OR rejected), ' +
    'and refuses a bypass whose actor matches the failing evidence\'s author.',
  functional_requirements: [
    {
      id: 'FR-B1',
      title: 'bypass_ledger.handoff_id joins to whichever sd_phase_handoffs row the bypass attempt produced',
      priority: 'critical',
      description:
        'cli-main.js\'s bypass_ledger insert (line 784-796, the only INSERT into this table in the ' +
        'codebase) knows the ledger row\'s id at write time but never threads it forward. ' +
        'HandoffRecorder.js has TWO separate sd_phase_handoffs write sites: createArtifact() ' +
        '(called only from recordSuccess(), line 421/425), which mints handoffId=randomUUID() at ' +
        'line 936 for the ACCEPTED-path row; and recordFailure() (line 454, its own insert ~line ' +
        '589) for the REJECTED-path row. Live data confirms bypass_ledger rows correlate with BOTH ' +
        'outcomes -- a bypass override can still end rejected by a different, unbypassed gate. Add ' +
        'a bypassLedgerId field threaded end-to-end: lib/handoff/bypass-stamp.js\'s buildBypassStamp ' +
        '()/applyBypassToResult() gain a ledgerId param/field (mirroring the existing patternId/ ' +
        'followupSdKey precedent); BaseExecutor.js\'s gate_failure bypass call site (~line 677, NOT ' +
        'the earlier authority_fence site -- that one has no ledger row to correlate) passes ' +
        'options.bypassLedgerId through; cli-main.js captures the insert\'s returned id into a ' +
        'variable declared BEFORE the bypass block (so it survives the block\'s scope) and adds it ' +
        'to the options object passed to system.executeHandoff(); HandoffRecorder.js\'s createArtifact ' +
        '() and recordFailure() both perform a best-effort UPDATE bypass_ledger SET handoff_id=<the ' +
        'newly-minted id> WHERE id=result.bypassLedgerId whenever result.bypassed is true, logged ' +
        'as a warning (never fail-closed) on error -- the FAIL-CLOSED guarantee already lives on the ' +
        'original ledger+audit-log writes in cli-main.js; this join-back is enrichment of an ' +
        'already-durable audit row, not the audit guarantee itself.',
      acceptance_criteria: [
        'A bypassed handoff that is ACCEPTED (bypass overrides the only failing gate) results in its bypass_ledger row\'s handoff_id equal to the accepted sd_phase_handoffs row\'s id',
        'A bypassed handoff that still ends REJECTED (a different, unbypassed gate also fails) results in its bypass_ledger row\'s handoff_id equal to the rejected sd_phase_handoffs row\'s id',
        'A bypass_ledger row whose invocation never reached either recorder path (refused earlier, e.g. by workflow-sequence enforcement) is left with handoff_id NULL -- this is a correct, non-defective outcome, not a bug this FR fixes',
        'The join-back write failing (DB error) does not fail the handoff itself -- only a warning is logged',
      ],
    },
    {
      id: 'FR-B2',
      title: 'A bypass whose actor authored the failing evidence is refused, not overridden',
      priority: 'critical',
      description:
        'subagent-evidence-gate.js already selects session_id:metadata->>session_id (child A, ' +
        'merged) into its query, but its failing[]/nonEvidence[]/unknownVerdicts[] detail arrays ' +
        '(~lines 520-543) carry only {agent, verdict, created_at} -- session_id is read for a ' +
        'separate provenance computation and discarded before it reaches gateResults, which is all ' +
        'BaseExecutor.js\'s bypass-handling site (~line 665-684) can see. Widen those three detail ' +
        'arrays to additionally carry session_id (purely additive -- the field is already fetched, ' +
        'this is not a new query). At BaseExecutor.js\'s gate_failure bypass site (~line 677), before ' +
        'building bypassInfo and proceeding: for each entry in gateResults.gateResults[failedGate]' +
        '.details.failing/nonEvidence that carries a non-null session_id, compare it against ' +
        'process.env.CLAUDE_SESSION_ID (the same value bypass_ledger.bypass_actor is already ' +
        'populated from, cli-main.js:792). On any match: do NOT set bypassInfo / do NOT proceed to a ' +
        'success return -- return a hard gate failure (a new code, GATE_BYPASS_SELF_AUTHORED_REFUSED) ' +
        'so the handoff flows through the normal reject path (recordFailure), which FR-B1 already ' +
        'makes joinable to the already-written bypass_ledger row. Additionally emit a ' +
        'validation_audit_log row via the existing emitValidationAuditLog() with failure_category=' +
        '\'bypass_refused_self_authored\' (a new free-text value -- the column has no CHECK ' +
        'constraint, and 3 similarly-shaped ad hoc categories already exist in bypass-rubric.js, so ' +
        'no migration is needed). Rows with no session_id at all (pre-cutover evidence, or a ' +
        'different-authored evidence row) are NOT refused -- the check only fires on an actual match, ' +
        'never on absence of a comparable identity, per the SD\'s own success criterion 3 wording ' +
        '("Exit test in lieu of a population baseline" -- absence of data is not evidence of misuse). ' +
        'The authority_fence bypass site (~line 356-368) is explicitly out of scope for this check -- ' +
        'it has no sub-agent evidence to compare against.',
      acceptance_criteria: [
        'A bypass attempt where the failing gate\'s evidence session_id equals process.env.CLAUDE_SESSION_ID is refused: BaseExecutor.execute() returns a failing result, no bypassInfo is stamped, and the handoff is recorded via the normal reject path',
        'A refused bypass emits a validation_audit_log row with failure_category=\'bypass_refused_self_authored\'',
        'A bypass attempt where the failing gate\'s evidence session_id is DIFFERENT from the actor, or absent (pre-cutover / not comparable), proceeds exactly as it does today -- zero behavior change',
        'The authority_fence bypass call site is unaffected by this FR',
        'subagent-evidence-gate.js\'s existing 859-line test suite passes unmodified',
      ],
    },
    {
      id: 'FR-B3',
      title: 'Regression tests for the join-back and the self-authorship refusal, using the DI-seam pattern already proven for BaseExecutor',
      priority: 'high',
      description:
        'No existing test in the repo drives BaseExecutor.execute() with {bypassValidation:true} ' +
        '(confirmed by grep), and tests/unit/handoff/bypass-stamp.test.js only covers the pure ' +
        'lib/handoff/bypass-stamp.js functions, not either call site behaviorally. Reuse the DI-seam ' +
        'pattern already proven workable in tests/unit/handoff/base-executor-failed-gate-wire.test.js ' +
        '(stubbed validationOrchestrator.validateGates, Proxy-stubbed supabase) to add: (a) a fixture ' +
        'where the failing evidence\'s session_id matches the actor -- asserts refusal, no ' +
        'bypassInfo, validation_audit_log call with the new category; (b) a fixture where it differs ' +
        'or is absent -- asserts today\'s existing bypass-succeeds behavior is unchanged; (c) an ' +
        'end-to-end HandoffRecorder-level test (mocked supabase) proving a bypassed accepted result ' +
        'writes handoff_id back onto the correct bypass_ledger row, and a separate test for the ' +
        'rejected-path write-back via recordFailure(). tests/integration/cli-main-bypass-validation-' +
        'audit-parity.test.js is regex/char-offset-window based (lines 62/68, scoped from ' +
        '"from(\'bypass_ledger\')") -- verify the new capture-variable addition does not push existing ' +
        'assertions\' matched content past those windows; extend rather than restructure that test\'s ' +
        'existing assertions.',
      acceptance_criteria: [
        'New unit tests exercise both BaseExecutor.js bypass-handling outcomes (refused vs proceeds) via the DI-seam pattern, not source-text regex',
        'New unit/integration tests prove HandoffRecorder.js writes bypass_ledger.handoff_id back correctly from both the accepted and rejected paths',
        'tests/integration/cli-main-bypass-validation-audit-parity.test.js\'s existing assertions pass unmodified',
        'tests/unit/handoff/bypass-stamp.test.js\'s existing assertions pass unmodified after ledgerId is added to buildBypassStamp/applyBypassToResult',
        'subagent-evidence-gate.js\'s existing 859-line test suite passes unmodified',
      ],
    },
    {
      id: 'FR-B4',
      title: 'CI census: bypass_ledger rows with a real handoff outcome but no handoff_id, since a cutover timestamp',
      priority: 'medium',
      description:
        'Model a new standalone script on scripts/ci/audit-log-parity-check.mjs\'s CLI/exit-code shape ' +
        '(the closest existing pattern -- same table, JSON stdout, exit 1 on violation), but with a ' +
        'cutover-timestamp design (BYPASS_HANDOFF_ID_CUTOVER_AT, mirroring evidence-provenance.js\'s ' +
        'PROVENANCE_CUTOVER_AT convention) rather than a rolling window, since the exit bar is "every ' +
        'row written after this ships", not a percentage over history including the 158 pre-existing ' +
        'legacy rows this SD explicitly does not reconcile. The census MUST classify bypass_ledger ' +
        'rows created after cutover into three buckets, not two: (a) joined (handoff_id set) -- ' +
        'compliant; (b) no corresponding sd_phase_handoffs row exists at all within a reasonable ' +
        'window (e.g. 5 minutes) -- a legitimate "refused before any handoff row was minted" outcome, ' +
        'excluded from the violation count; (c) a sd_phase_handoffs row DOES exist (by sd_id + rough ' +
        'time correlation) but handoff_id is still NULL -- a genuine defect, asserted at 0. Exit code ' +
        '1 only when bucket (c) is non-zero.',
      acceptance_criteria: [
        'The script correctly classifies a synthetic joined row, a synthetic refused-before-handoff row, and a synthetic genuinely-unjoined row into the three buckets',
        'Exit code 0 when bucket (c) is empty, 1 otherwise',
        'A structural test (mirroring tests/ci/audit-log-parity-check.test.js\'s style) pins the cutover-param default and the three-bucket classification, not just source-text regex',
      ],
    },
  ],
  acceptance_criteria: [
    'Every bypass_ledger row written after this ships that corresponds to a real sd_phase_handoffs outcome (accepted or rejected) has a non-null handoff_id',
    'A bypass whose actor authored the failing evidence is refused rather than silently overridden, with a named, queryable reason (validation_audit_log.failure_category)',
    'No DB migration required for either FR -- handoff_id already exists as a soft FK; failure_category has no CHECK constraint',
    'Zero regression in existing bypass-stamp, subagent-evidence-gate, and cli-main bypass audit-parity test suites',
  ],
  system_architecture:
    'FR-B1 threads one new field (bypassLedgerId / handoff_id) through the existing bypass-stamp ' +
    'pipeline (lib/handoff/bypass-stamp.js -> BaseExecutor.js -> HandoffRecorder.js), the same shape ' +
    'already used for patternId/followupSdKey -- no new pipeline, no new table. FR-B2 reuses ' +
    'session_id, already fetched (not re-queried) inside subagent-evidence-gate.js, and the existing ' +
    'validation_audit_log writer -- no new table, no new column, no new query. FR-B4 is a standalone ' +
    'read-only census script, following the one existing precedent for this exact table ' +
    '(audit-log-parity-check.mjs), not wired into a blocking CI gate on day one (consistent with ' +
    'Observe-Only-First for a brand-new predicate).',
  implementation_approach:
    'FR-B1 ships first (pure plumbing, testable independently of FR-B2). FR-B2 depends on FR-B1\'s ' +
    'bypassLedgerId threading pattern for its own options-passing precedent but is otherwise ' +
    'independent logic (the widened gate detail arrays + the actor-vs-author comparison). FR-B3 tests ' +
    'both throughout using the DI-seam pattern already proven in base-executor-failed-gate-wire.test.js. ' +
    'FR-B4 ships last, once real post-cutover data exists to validate the census script against.',
  test_scenarios: [
    {
      scenario: 'A bypass overrides a failing gate unrelated to sub-agent evidence (e.g. an authority_fence bypass) and the handoff is accepted',
      expected: 'bypass_ledger.handoff_id is set to the accepted sd_phase_handoffs row\'s id; no self-authorship check applies (authority_fence site is out of FR-B2 scope)',
    },
    {
      scenario: 'A bypass overrides a failing TESTING gate whose latest evidence session_id differs from process.env.CLAUDE_SESSION_ID, and the handoff is accepted',
      expected: 'The bypass proceeds exactly as today; bypass_ledger.handoff_id is set to the accepted row\'s id',
    },
    {
      scenario: 'A bypass overrides a failing TESTING gate whose latest evidence session_id EQUALS process.env.CLAUDE_SESSION_ID',
      expected: 'The bypass is refused: BaseExecutor.execute() returns a failing result with code GATE_BYPASS_SELF_AUTHORED_REFUSED, a validation_audit_log row is emitted with failure_category=\'bypass_refused_self_authored\', and the handoff is recorded via recordFailure() -- FR-B1 then joins the already-written bypass_ledger row to that rejected sd_phase_handoffs row',
    },
    {
      scenario: '--bypass-validation is passed but the workflow-sequence enforcement check (cli-main.js:903-906, which runs even under bypass) refuses the handoff before any executor call',
      expected: 'The bypass_ledger row written earlier keeps handoff_id NULL permanently -- FR-B4\'s census classifies this as bucket (b), not a violation',
    },
    {
      scenario: 'FR-B4 census run against a mix of the above four outcomes since a test cutover timestamp',
      expected: 'Bucket (a) counts the first two, bucket (b) counts the fourth; if the third is correctly joined by FR-B1 it also lands in bucket (a) -- bucket (c) is empty and the script exits 0',
    },
  ],
  risks: [
    {
      risk: 'FR-B2\'s refusal changes real production behavior (today\'s bypass silently succeeds; after this ships, a self-authored bypass hard-fails) -- unlike child A\'s advisory-first provenance grading, this SD\'s own success criterion explicitly requires refusal, not merely a warning ("refused, not merely logged")',
      mitigation: 'The VALIDATION sub-agent\'s replay over the last 25 real bypasses found the refusal would have fired on exactly the cases the SD is designed to close (10/25, all self-authored TESTING=BLOCKED) and never on a legitimate different-actor or pre-cutover-evidence bypass -- the blast radius is bounded to the exact defect class this SD targets, not a broad new restriction.',
    },
    {
      risk: 'Widening subagent-evidence-gate.js\'s failing/nonEvidence detail shape could break the existing 859-line test suite if any fixture asserts on the exact shape of those arrays',
      mitigation: 'The change is purely additive (one new field on existing objects); run the full existing suite unmodified as an explicit FR-B3 acceptance criterion before EXEC-TO-PLAN.',
    },
    {
      risk: 'Threading bypassLedgerId through cli-main.js requires the ledger-write block\'s local const to survive past its enclosing if-block\'s scope',
      mitigation: 'Declare the capture variable (let bypassLedgerRowId = null) before the if (bypassValidation) block, assign inside it -- a small, mechanical, easily-tested scoping change.',
    },
  ],
  out_of_scope: [
    {
      item: 'Reconciling the 158 pre-existing bypass_ledger rows written before this ships (giving them a queryable "disposition" such as reconciled-by-sd_key / unrecoverable-legacy)',
      reason: 'The SD\'s own success criteria describe this as a distinct, going-forward exit bar ("every bypass row written after this ships") versus a separate historical-reconciliation criterion. Backfilling 158 historical rows with a best-guess handoff_id via approximate time/sd_id correlation is a materially different, riskier operation (retroactive data reconstruction vs. new-write correctness) than this SD\'s core FRs and is better scoped as its own explicit follow-up.',
    },
    {
      item: 'Fixing lib/sub-agent-executor/evidence-provenance.js\'s normalisePhase() PHASE_MAP gap (missing bare PLAN and 3 of 4 hyphenated handoff-type spellings)',
      reason: 'Confirmed real via direct source read, but FR-B2 as designed reads session_id directly off the evidence row\'s metadata -- it never calls gradeProvenance()/normalisePhase() -- so this gap does not affect this SD\'s correctness. Routed to the coordinator separately (already signaled) rather than absorbed here, since it belongs to child A\'s (already-shipped) module.',
    },
    {
      item: 'bypass_ledger.sd_id population (parent success criterion 2)',
      reason: 'Already satisfied going forward by a prior, unrelated SD\'s shipped fix (cli-main.js:789, sd_id: resolvedSdRow?.uuid_id). Live query confirms all 5 most-recent rows have sd_id populated correctly; only pre-fix historical rows are NULL. Verification-only, no new implementation.',
    },
    {
      item: 'The LEAD-FINAL-APPROVAL score_source gap and the accept-path census',
      reason: 'Explicitly named as sibling child G\'s scope in the parent SD\'s own text.',
    },
  ],
};

async function main() {
  await addPRDToDatabase(SD_KEY, 'W5 child B PRD: bypass_ledger joinability + self-authored-bypass refusal', content);
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  });
}
