// SD-FDBK-INFRA-TESTING-SUB-AGENT-001 — Explore sub-agent evidence (LEAD-TO-PLAN).
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-FDBK-INFRA-TESTING-SUB-AGENT-001';
const PHASE = 'LEAD-TO-PLAN';

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 90,
  summary:
    'Explore pass independently verified the SD\'s 6 factual claims about the TESTING sub-agent type-shortcut against live source. ' +
    'CONFIRMED: lib/sub-agents/testing/index.js:109 calls checkForNonUISdType (defined :362-430); skipE2ESdTypes at :376 is exactly the ' +
    '11-entry list the SD names (database, infrastructure, documentation, docs, protocol, refactor, process, uat, orchestrator, api, ' +
    'backend); on match it returns verdict PASS confidence 95 with every phase marked skipped and phase5_verdict.auto_pass=true (:378-427) ' +
    'BEFORE any Phase 0-5 test executes; a second, DIVERGENT private list E2E_EXEMPT_SD_TYPES exists at phase4-evidence.js:89 (only 5 ' +
    'entries: uat, infrastructure, documentation, docs, orchestrator -- missing database/protocol/refactor/process/api/backend); the ' +
    'canonical policy getValidatorRequirement exists at sd-type-applicability-policy.js:425 with infrastructure.TESTING=NON_APPLICABLE ' +
    'at :175 plus a detectCodeProduction override (:79-99). PARTIALLY DRIFTED: mandatory-testing-validation.js ALREADY imports and ' +
    'consumes getValidatorRequirement (line 20, used at :162) to decide REQUIRED vs ADVISORY tier for a MISSING TESTING row -- but the ' +
    'gate never inspects metadata.findings.phase5_verdict.auto_pass or any "measured" flag once a row exists (only checks verdict in ' +
    "['PASS','CONDITIONAL_PASS'] plus staleness at :245), so an auto-pass row satisfies it identically to a genuine measured pass -- the " +
    'SD\'s core premise holds even though the gate is not purely type-string-driven as the mechanism section implies. Import path is ' +
    'clean (mandatory-testing-validation.js already imports the same policy module with zero circularity; index.js does not yet import ' +
    'it). No verdict object field named "measured" exists anywhere in index.js today -- one would need to be added and threaded to the ' +
    'DB insert. No unit test pins skipE2ESdTypes or E2E_EXEMPT_SD_TYPES by name/value (only one descriptive comment reference in ' +
    'tests/unit/testing-subagent/verify-user-stories-e2e-mapping.test.js:13), so deleting/refactoring the private lists will not break ' +
    'existing tests by name. CONDITIONAL on the corrections raised separately by the VALIDATION sub-agent pass (SC#3 phrasing implies ' +
    'new blocking enforcement not currently present -- flagged to the coordinator via /signal prd-ambiguous 483264c3, unresolved at ' +
    'evidence time) and on threading a new measured field through the verdict/DB-insert path.',
  findings: [
    { id: 'skip-e2e-list-confirmed', severity: 'info', note: 'lib/sub-agents/testing/index.js:376 skipE2ESdTypes matches the SD\'s 11-entry list verbatim; :109 calls checkForNonUISdType (:362-430); auto-pass verdict/confidence/phase-skip/auto_pass flag all confirmed at :378-427.' },
    { id: 'divergent-e2e-exempt-list', severity: 'warning', note: 'lib/sub-agents/testing/phases/phase4-evidence.js:89 E2E_EXEMPT_SD_TYPES has only 5 entries (uat, infrastructure, documentation, docs, orchestrator) vs skipE2ESdTypes\'s 11 -- confirmed divergence the SD cites as SC#1 target for deletion.' },
    { id: 'policy-module-exists-and-clean-import', severity: 'info', note: 'sd-type-applicability-policy.js:425 getValidatorRequirement + :175 infrastructure.TESTING=NON_APPLICABLE + :79-99 detectCodeProduction override all confirmed live. mandatory-testing-validation.js already imports the same module (line 20) with no circularity back into lib/sub-agents/testing/ -- the swap this SD proposes is a straightforward import, not a structural rework.' },
    { id: 'gate-blind-to-auto-pass-flag', severity: 'warning', note: 'mandatory-testing-validation.js:245 checks only verdict membership + staleness once a TESTING row exists -- it never reads phase5_verdict.auto_pass or any measured signal, so today\'s auto-pass rows and a genuine measured PASS are indistinguishable to the gate. Confirms the SD\'s core defect claim independent of the SC#3 wording issue.' },
    { id: 'no-measured-field-yet', severity: 'info', note: 'No top-level "measured" field exists in index.js\'s verdict/results construction anywhere today -- SC#4 requires adding one and threading it into the sub_agent_execution_results insert, not just reading an existing field.' },
    { id: 'no-pinning-tests-on-private-lists', severity: 'info', note: 'grep found zero unit tests asserting skipE2ESdTypes or E2E_EXEMPT_SD_TYPES by name/value; only a descriptive comment mention in tests/unit/testing-subagent/verify-user-stories-e2e-mapping.test.js:13 -- deleting the private lists per SC#1 will not break any existing test by name.' },
  ],
  metadata: {
    skip_e2e_sd_types_line: 'lib/sub-agents/testing/index.js:376',
    e2e_exempt_sd_types_line: 'lib/sub-agents/testing/phases/phase4-evidence.js:89',
    policy_module_line: 'scripts/modules/handoff/validation/sd-type-applicability-policy.js:425',
    mandatory_testing_validation_already_imports_policy: true,
    measured_field_exists_today: false,
    pinning_tests_on_private_lists: 0,
    related_signal: '483264c3-3646-40ef-b557-85bf2d26a9c5',
  },
  execution_time_ms: 480000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'Explore',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore Discovery Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
