/**
 * Remediation Messages for PLAN-TO-EXEC Gates
 * Part of SD-LEO-REFACTOR-PLANTOEXEC-001
 *
 * Provides detailed guidance for resolving gate failures
 */

/**
 * Gate remediation messages
 */
const REMEDIATIONS = {
  'GATE_ARCHITECTURE_VERIFICATION': [
    'ARCHITECTURE MISMATCH DETECTED (SD-BACKEND-002A Prevention)',
    '',
    'This gate prevents the catastrophic 30-52 hour rework that occurred when',
    'Next.js API routes were implemented in a Vite SPA application.',
    '',
    'STEPS TO RESOLVE:',
    '1. Run: node scripts/verify-app-architecture.js --app-path <target-app>',
    '2. Review the detected framework vs PRD implementation approach',
    '3. If mismatch: Update PRD to match actual framework',
    '',
    'COMMON FIXES:',
    '• Vite SPA → Use Supabase client directly, NOT API routes',
    '• Next.js → Can use app/api/ or pages/api/ routes',
    '• Remix → Use loader/action functions in routes',
    '',
    'If architecture is correct but gate fails: Check target_application in SD'
  ].join('\n'),

  'BMAD_PLAN_TO_EXEC': 'Run STORIES sub-agent to generate user stories with proper acceptance criteria.',

  'GATE_CONTRACT_COMPLIANCE': [
    'PRD violates parent SD contract boundaries:',
    '',
    'DATA_CONTRACT violations (BLOCKING):',
    '1. Review allowed_tables in parent contract',
    '2. Update PRD to only reference allowed tables',
    '3. Request contract update if scope needs expansion',
    '',
    'UX_CONTRACT violations (WARNING):',
    '1. Review component_paths in parent UX contract',
    '2. Either adjust component paths or document justification',
    '',
    'Cultural Design Style:',
    '- Style is STRICTLY inherited from parent',
    '- Cannot be overridden by child SDs',
    '',
    'Run: node scripts/verify-contract-system.js to debug contracts'
  ].join('\n'),

  'GATE1_DESIGN_DATABASE': [
    'Execute DESIGN and DATABASE sub-agents:',
    '1. Run DESIGN sub-agent: node scripts/execute-subagent.js --code DESIGN --sd-id <SD-ID>',
    '2. Run DATABASE sub-agent: node scripts/execute-subagent.js --code DATABASE --sd-id <SD-ID>',
    '3. Run STORIES sub-agent: node scripts/execute-subagent.js --code STORIES --sd-id <SD-ID>',
    '4. Re-run this handoff'
  ].join('\n'),

  'GATE6_BRANCH_ENFORCEMENT': [
    'Create a feature branch before EXEC work begins:',
    '1. Branch will be created/switched automatically (stash-safe)',
    '2. Or resolve branch issues manually',
    '3. Re-run this handoff'
  ].join('\n'),

  'PREREQUISITE_HANDOFF_CHECK': [
    'LEAD-TO-PLAN handoff must be completed first:',
    '1. Run: node scripts/handoff.js execute LEAD-TO-PLAN <SD-ID>',
    '2. Ensure handoff is accepted (not just created)',
    '3. Re-run PLAN-TO-EXEC handoff'
  ].join('\n'),

  'GATE_PRD_EXISTS': [
    'PRD is required before EXEC phase:',
    '1. Create a PRD: node scripts/add-prd-to-database.js --sd-id <SD-ID>',
    '2. Ensure PRD status is set to "approved"',
    '3. Re-run this handoff'
  ].join('\n'),

  'GATE_EXPLORATION_AUDIT': [
    'Insufficient codebase exploration documented:',
    '1. Update exploration_summary in PRD with file references',
    '2. Minimum 3 files required, 5+ recommended',
    '3. Include key_findings for each explored file'
  ].join('\n'),

  'GATE_DELIVERABLES_PLANNING': [
    'Deliverables should be defined before EXEC:',
    '1. Deliverables will be auto-populated from PRD exec_checklist',
    '2. Or manually add deliverables to sd_scope_deliverables table',
    '3. Each deliverable should have name, description, and acceptance criteria'
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
