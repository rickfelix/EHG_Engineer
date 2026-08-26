// SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 -- EXEC-TO-PLAN follow-up evidence, re-verified against
// commit 221805b6e31d (HEAD), closing the 5 TESTING findings (G1/G2/G3/G4/G5) and 1 SECURITY
// finding (F-1) from the initial EXEC-TO-PLAN review at commit 889a483c455.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002';
const PHASE = 'EXEC';
const HEAD = '221805b6e31d';

const testingResults = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    "Follow-up to the initial EXEC-TO-PLAN TESTING review (evidence 6ce67d9c, verdict CONCERNS/90 at commit 889a483c455), re-verified at commit 221805b6e31d after all 5 findings were addressed and every claim below was independently re-run by me, not merely re-read. G1 (FR-2 had zero committed test): tests/unit/cron/chairman-held-sends-release-sweep.test.js now asserts the exact `deps.context.now` object main() passes to releaseHeldSend across 3 new cases -- default-present, caller-injected-value-wins (merge), and every sibling releaseDeps key survives alongside the default. G3 (FR-3+FR-4 round trip untested together): tests/unit/adam/chairman-held-send-release-real-gate.test.js drives the REAL sendChairmanSMS and REAL rubric evaluate() (heuristicReviewer, no network) through releaseHeldSend -- confirmed by running it: the wire body is byte-identical to the held row's already-composed body (FR-4, no doubling) while the restored reply_instruction/reply_id/no_reply_consequence fields satisfy the real rubric's checks 3 and 9 (FR-3); a second test in the same file proves the negative -- a pre-FR-3-shaped held row (missing reply fields) is correctly rubric-blocked and unclaimed, proving the rubric genuinely still enforces these checks post-fix. G4 (FR-6 orphan wiring untested and measurably blind): the sweep test's shared fake gained a `.in()` branch (it previously threw, was silently swallowed by main()'s own best-effort catch, and every existing test read green with summary.orphans always []); a new test now injects a stuck-in-releasing row via the orphan-scan-only query and asserts it surfaces in summary.orphans with a loud log line. G2 (FR-3 AC-1's primary proof missing): tests/unit/database/chairman-held-sends-reply-fields-migration.test.js adds a unit-tier static assertion over the migration SQL text on disk, confirming all 3 columns are ADD COLUMN IF NOT EXISTS text, reply_id is singular (not reply_ids), and the ALTER TABLE body carries no NOT NULL/DEFAULT/CHECK/CONSTRAINT token. G5 (FR-1 AC-1 literal-text deviation): product_requirements_v2.functional_requirements FR-1's acceptance_criteria were corrected to describe the actual shipped, defensible semantics (the consult lane is deliberately non-blocking by design -- TS-6 -- so a readback failure takes the FR-6 orphan-detector safety-net branch rather than rejecting the hold at write time) instead of an unmet literal 'never created' guarantee. Full re-run at HEAD: 10 files / 114 tests, all green (`npx vitest run` against the 10 SD-scoped test files). Origin/main merged cleanly (7 commits, zero conflicts) per SECURITY finding F-3, so the branch diff no longer misrepresents unrelated files.",
  findings: [
    { id: 'g1-fr2-test-added', severity: 'info', note: 'FR-2 context.now default + merge semantics now has 3 dedicated assertions in the sweep test file, verified by direct re-run.' },
    { id: 'g2-migration-static-assertion-added', severity: 'info', note: 'New unit-tier test statically asserts the migration SQL text -- 5 assertions, all passing.' },
    { id: 'g3-real-gate-roundtrip-added', severity: 'info', note: 'New integration test drives the REAL sendChairmanSMS + REAL rubric through releaseHeldSend, with a positive AND negative control -- both passing.' },
    { id: 'g4-orphan-scan-fake-fixed', severity: 'info', note: 'Sweep test fake gained .in() support; orphan detection is now genuinely exercised through main(), not silently swallowed.' },
    { id: 'g5-fr1-ac1-ratified', severity: 'info', note: 'FR-1 AC-1 text corrected in the DB to match shipped semantics; a defensible design choice, now explicit rather than an unmet literal claim.' },
  ],
  metadata: { prior_evidence_id: '6ce67d9c-8794-4cc3-ac41-f9971c46a71f', prior_commit: '889a483c455', reverified_commit: HEAD, gaps_closed: 5, test_files_total: 10, tests_total: 114 },
  execution_time_ms: 1800000,
};

const securityResults = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    "Follow-up to the initial EXEC-TO-PLAN SECURITY review (evidence a9ed8ad3, verdict PASS/93 at commit 889a483c455), re-verified at commit 221805b6e31d. F-1 (LOW, test-honesty -- no test exercised the real rubric with skipCompose) closed: tests/unit/adam/chairman-held-send-release-real-gate.test.js now runs the REAL sendChairmanSMS + REAL rubric evaluate() through releaseHeldSend (skipCompose:true is always set by releaseHeldSend itself, not caller-controlled), confirmed by direct re-run -- the rubric's labeled_options/reply_instruction/reply_ids/length/no_secrets checks all still evaluate against the actual wire body, and a negative-control test proves the rubric still blocks a row missing the reply fields. F-2 (LOW, latent hazard -- replyInstruction/replyId fields vs body decoupling unenforced) remains a documented, accepted risk -- unchanged, still safe-by-construction (compose precedes the hold insert), still requires service_role write to exploit (already full compromise). F-3 (INFO, merge hygiene) closed: origin/main merged cleanly, 7 commits, zero conflicts -- the two-dot diff no longer misrepresents unrelated files as deleted. F-4 (INFO, minor pattern nit on the one-off void script's raw metadata update) unchanged -- still measured-harmless (nothing else populates that column) and explicitly noted as informational only. No new security-relevant surface was introduced by the follow-up commit (test files + a PRD text correction + an origin/main merge only -- zero production code changed in this pass).",
  findings: [
    { id: 'f1-closed', severity: 'info', note: 'A real-rubric round-trip test now exists; the property SECURITY proved out-of-band at initial review now has a committed regression guard.' },
    { id: 'f2-accepted-unchanged', severity: 'low', note: 'replyInstruction/replyId field-vs-body decoupling remains unenforced but safe-by-construction; accepted as-is, not blocking.' },
    { id: 'f3-closed', severity: 'info', note: 'origin/main merged; two-dot diff hygiene restored.' },
    { id: 'f4-accepted-unchanged', severity: 'info', note: 'Raw metadata update pattern in the one-off void script remains measured-harmless; noted for future pattern-matching only.' },
  ],
  metadata: { prior_evidence_id: 'a9ed8ad3-7f89-4963-a33f-3a3abf7e424e', prior_commit: '889a483c455', reverified_commit: HEAD, findings_closed: 2, findings_accepted_unchanged: 2 },
  execution_time_ms: 900000,
};

const testingResolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'TESTING', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(testingResults, testingResolution);
const testingStored = await storeSubAgentResults('TESTING', SD_ID, { name: 'Enhanced QA Engineering Director' }, testingResults, { phase: PHASE });
console.log('TESTING_FOLLOWUP_STORED_ID=' + (testingStored?.id || 'n/a'));

const securityResolution = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'SECURITY', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(securityResults, securityResolution);
const securityStored = await storeSubAgentResults('SECURITY', SD_ID, { name: 'Security Architect' }, securityResults, { phase: PHASE });
console.log('SECURITY_FOLLOWUP_STORED_ID=' + (securityStored?.id || 'n/a'));
