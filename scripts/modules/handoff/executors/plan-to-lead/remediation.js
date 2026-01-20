/**
 * Remediation Messages for PLAN-TO-LEAD Gates
 * Part of SD-LEO-REFACTOR-PLANTOLEAD-001
 */

const REMEDIATIONS = {
  'PREREQUISITE_HANDOFF_CHECK': [
    'EXEC-TO-PLAN handoff must be completed first:',
    '1. Run: node scripts/handoff.js exec-to-plan --sd-id <SD-ID>',
    '2. Ensure handoff is accepted (not just created)',
    '3. Re-run PLAN-TO-LEAD handoff'
  ].join('\n'),

  'SUB_AGENT_ORCHESTRATION': 'Retrospective must be generated before LEAD final approval. Run: node scripts/generate-comprehensive-retrospective.js <SD-ID>',

  'RETROSPECTIVE_QUALITY_GATE': [
    'Retrospective must exist and have quality content:',
    '1. Ensure retrospective is created: node scripts/execute-subagent.js --code RETRO --sd-id <SD-ID>',
    '2. Replace boilerplate learnings with SD-specific insights',
    '3. Add at least one improvement area',
    '4. Ensure key_learnings are not generic phrases',
    '5. Re-run this handoff'
  ].join('\n'),

  'GATE5_GIT_COMMIT_ENFORCEMENT': [
    'All implementation work must be committed and pushed:',
    '1. Review uncommitted changes: git status',
    '2. Commit all work: git commit -m "feat(<SD-ID>): <description>"',
    '3. Push to remote: git push',
    '4. Re-run this handoff'
  ].join('\n'),

  'GATE3_TRACEABILITY': [
    'Review Gate 3 details to see traceability issues:',
    '- Recommendation adherence: Did EXEC follow DESIGN/DATABASE recommendations?',
    '- Implementation quality: Gate 2 score, test coverage',
    '- Traceability mapping: PRD→code, design→UI, database→schema',
    'Address issues and re-run this handoff'
  ].join('\n'),

  'GATE4_WORKFLOW_ROI': [
    'Review Gate 4 details to assess strategic value:',
    '- Process adherence: Did workflow follow protocol?',
    '- Value delivered: What business value was created?',
    '- Strategic questions: Answer 6 LEAD pre-approval questions',
    'Address issues and re-run this handoff'
  ].join('\n'),

  'USER_STORY_EXISTENCE_GATE': [
    'User stories must exist for this SD type:',
    '1. Create user stories: node scripts/add-user-stories-to-database.js --sd-id <SD-ID>',
    '2. Define acceptance criteria for each story',
    '3. Or change SD type if stories are not applicable',
    '4. Re-run this handoff'
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
