// SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002 -- PLAN_VERIFICATION follow-up evidence, re-verified at
// commit 81b8b99469b, closing VALIDATION findings V-1/V-2 (evidence 19e08adf, CONCERNS/90 at
// commit 9e3e9d8955d) and REGRESSION finding REG-1 (evidence d172d402, CONCERNS/92 at commit
// a2e0aadbe51).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-CHAIRMAN-SMS-DECISION-002';
const PHASE = 'PLAN_VERIFICATION';
const HEAD = '81b8b99469b';

const validationFollowup = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    "Follow-up to the initial PLAN_VERIFICATION VALIDATION review (evidence 19e08adf, CONCERNS/90 at commit 9e3e9d8955d). V-1 (HIGH) closed: tests/unit/adam/chairman-held-send-release-real-gate.test.js now uses a deterministic context.nowHourET instead of Date.now(), verified time-independent by construction (etHour() returns nowHourET directly before touching any clock -- lint.js:72); the negative-control test now asserts blockedReasons contains reply_instruction/reply_ids specifically, not a generic 'blocked' shape. V-2 (MEDIUM) closed: presend-consult-lane.test.js's FR-1 opts assertion is now load-bearing -- mutation-verified myself by temporarily reverting the {select:'id',single:true} request in production code and confirming the test failed, then restoring it and confirming it passed again. V-3 (MEDIUM) closed: FR-7 AC-3's PRD text was corrected to accurately describe schema:snapshot:lint's actual coverage boundary. Full re-run at HEAD: 10 SD-scoped files / 114 tests, all green.",
  findings: [
    { id: 'v1-closed-mutation-independent', severity: 'info', note: 'Deterministic clock fix confirmed by direct re-run; no longer time-dependent by construction.' },
    { id: 'v2-closed-mutation-verified', severity: 'info', note: 'Personally mutation-tested: reverting the production fix makes this exact test fail; restoring it passes.' },
    { id: 'v3-closed-prd-corrected', severity: 'info', note: 'FR-7 AC-3 text corrected in the DB.' },
  ],
  metadata: { prior_evidence_id: '19e08adf-f3cd-46e5-8a0a-bca1cde52bb6', prior_commit: '9e3e9d8955d', reverified_commit: HEAD, gaps_closed: 3 },
  execution_time_ms: 600000,
};

const regressionFollowup = {
  verdict: 'PASS',
  confidence: 95,
  summary:
    "Follow-up to the initial PLAN_VERIFICATION REGRESSION review (evidence d172d402, CONCERNS/92 at commit a2e0aadbe51). REG-1 (HIGH, blocking) closed: scripts/__tests__/adam-chairman-decision-decision-id-required.test.js's placeholder decision-id fixture ('dec-cli-test-1', not a valid UUID) was updated to a real UUID, matching FR-5's intended tightened contract -- confirmed by direct re-run of that test file (3/3 passing) and a broader sweep across tests/unit/comms/adam-outbound/, tests/unit/comms/chairman-sms-gate/, tests/unit/chairman/, tests/unit/solomon/, tests/unit/adam/, and scripts/__tests__/ (112 files / 1676 tests, all green). REG-1b (exit-code convention asymmetry between missing-field (0) and malformed-UUID (1) refusals) and REG-2 (an informational operator heads-up that the sweep can now genuinely dispatch previously-perpetually-failing-closed holds) both remain as documented, deliberate, non-blocking design notes -- no further action required.",
  findings: [
    { id: 'reg1-closed-fixture-updated', severity: 'info', note: 'Pre-existing test fixture updated to a real UUID; confirmed passing plus a 112-file/1676-test broad sweep with zero failures.' },
  ],
  metadata: { prior_evidence_id: 'd172d402-ccdc-452d-b78b-42910a81e029', prior_commit: 'a2e0aadbe51', reverified_commit: HEAD, broad_sweep_files: 112, broad_sweep_tests: 1676 },
  execution_time_ms: 400000,
};

const vRes = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'VALIDATION', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(validationFollowup, vRes);
const vStored = await storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst' }, validationFollowup, { phase: PHASE });
console.log('VALIDATION_FOLLOWUP_STORED_ID=' + (vStored?.id || 'n/a'));

const rRes = await resolveSubAgentRepo({ sdId: SD_ID, subAgentCode: 'REGRESSION', targetApplication: 'EHG_Engineer' });
applySubAgentRepoVerdict(regressionFollowup, rRes);
const rStored = await storeSubAgentResults('REGRESSION', SD_ID, { name: 'Regression Analyst' }, regressionFollowup, { phase: PHASE });
console.log('REGRESSION_FOLLOWUP_STORED_ID=' + (rStored?.id || 'n/a'));
