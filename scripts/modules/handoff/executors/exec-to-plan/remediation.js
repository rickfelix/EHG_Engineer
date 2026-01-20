/**
 * Remediation Messages for EXEC-TO-PLAN Gates
 * Part of SD-LEO-REFACTOR-EXECTOPLAN-001
 */

const REMEDIATIONS = {
  'SUB_AGENT_ORCHESTRATION': 'Fix sub-agent failures before creating EXEC→PLAN handoff. Review sub-agent results and address issues.',

  'BMAD_EXEC_TO_PLAN': 'Ensure all test plans are complete and E2E test coverage is 100%.',

  'GATE2_IMPLEMENTATION_FIDELITY': [
    'Review Gate 2 details to see which requirements were not met:',
    '- Testing: Unit tests executed & passing (MANDATORY)',
    '- Server restart: Dev server restarted & verified (MANDATORY)',
    '- Code quality: No stubbed/incomplete code (MANDATORY)',
    '- Directory: Working in correct application (MANDATORY)',
    '- Ambiguity: All FIXME/TODO/HACK comments resolved (MANDATORY)',
    'After fixing issues, re-run this handoff'
  ].join('\n'),

  'RCA_GATE': 'All P0/P1 RCRs must have verified CAPAs before handoff. Run: node scripts/root-cause-agent.js capa verify --capa-id <UUID>',

  'MANDATORY_TESTING_VALIDATION': [
    'ERR_TESTING_REQUIRED: TESTING sub-agent is MANDATORY for feature/qa SDs.',
    '',
    'STEPS TO RESOLVE:',
    '1. Run TESTING sub-agent before completing EXEC phase',
    '2. Command: node scripts/orchestrate-phase-subagents.js PLAN_VERIFY <SD-ID>',
    '3. Ensure all E2E tests pass',
    '4. Re-run EXEC-TO-PLAN handoff',
    '',
    'EXEMPT SD TYPES: documentation, docs, infrastructure, orchestrator, database',
    'REQUIRED SD TYPES: feature, qa (SD-LEARN-010:US-001)'
  ].join('\n'),

  'TEST_EVIDENCE_AUTO_CAPTURE': [
    'Test evidence auto-capture helps populate story_test_mappings.',
    '',
    'TO GENERATE TEST EVIDENCE:',
    '1. Run E2E tests: npx playwright test',
    '2. Run unit tests: npm test -- --coverage',
    '3. Manual ingest: node scripts/test-evidence-ingest.js --sd-id <SD-ID>',
    '',
    'REPORT LOCATIONS SCANNED:',
    '- playwright-report/report.json',
    '- test-results/.last-run.json',
    '- coverage/coverage-summary.json',
    '',
    'This gate is advisory - MANDATORY_TESTING_VALIDATION will block if no evidence.'
  ].join('\n'),

  'PREREQUISITE_HANDOFF_CHECK': [
    'ERR_CHAIN_INCOMPLETE: PLAN-TO-EXEC handoff must be completed first.',
    '',
    'STEPS TO RESOLVE:',
    '1. Complete PLAN phase prerequisites (PRD, user stories, design analysis)',
    '2. Run: node scripts/handoff.js execute PLAN-TO-EXEC <SD-ID>',
    '3. Address any validation failures',
    '4. Retry EXEC-TO-PLAN after PLAN-TO-EXEC is accepted'
  ].join('\n'),

  'HUMAN_VERIFICATION_GATE': [
    'Feature SDs require human-verifiable outcomes.',
    '',
    'TO RESOLVE:',
    '1. Add smoke_test_steps to the SD in database',
    '2. Or run /uat to generate and execute tests',
    '3. Ensure LLM UX score meets threshold if applicable'
  ].join('\n')
};

/**
 * Get remediation guidance for a specific gate
 *
 * @param {string} gateName - Name of the gate
 * @returns {string|null} Remediation guidance or null if not found
 */
export function getRemediation(gateName) {
  return REMEDIATIONS[gateName] || null;
}

/**
 * Get all available remediations
 *
 * @returns {Object} Map of gate names to remediation messages
 */
export function getAllRemediations() {
  return { ...REMEDIATIONS };
}
