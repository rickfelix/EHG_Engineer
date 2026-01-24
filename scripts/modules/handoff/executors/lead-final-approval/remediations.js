/**
 * Remediations Domain
 * Defines remediation messages for failed gates
 *
 * @module lead-final-approval/remediations
 */

/**
 * Remediation messages for each gate type
 */
export const REMEDIATIONS = {
  'PLAN_TO_LEAD_HANDOFF_EXISTS': [
    'PLAN-TO-LEAD handoff must be accepted before final approval:',
    '1. Run: node scripts/handoff.js execute PLAN-TO-LEAD <SD-ID>',
    '2. Ensure all gates pass',
    '3. Re-run LEAD-FINAL-APPROVAL'
  ].join('\n'),

  'USER_STORIES_COMPLETE': [
    'All user stories must be completed:',
    '1. Check incomplete stories in database',
    '2. Mark as completed: UPDATE user_stories SET status = \'completed\' WHERE ...',
    '3. Re-run LEAD-FINAL-APPROVAL'
  ].join('\n'),

  'RETROSPECTIVE_EXISTS': [
    'A quality retrospective is required:',
    '1. Generate retrospective: node scripts/execute-subagent.js --code RETRO --sd-id <SD-ID>',
    '2. Ensure quality score >= 60%',
    '3. Re-run LEAD-FINAL-APPROVAL'
  ].join('\n'),

  'PR_MERGE_VERIFICATION': [
    'All code for this SD must be merged to main before completion:',
    '',
    'For OPEN PRs:',
    '1. Merge each PR: gh pr merge <PR-NUMBER> --repo <REPO> --merge --delete-branch',
    '2. Or close if no longer needed: gh pr close <PR-NUMBER> --repo <REPO>',
    '',
    'For UNMERGED BRANCHES (no PR created):',
    '1. cd to the repo with the branch',
    '2. Push branch if not on remote: git push -u origin <branch>',
    '3. Create PR: gh pr create --title "feat(<SD-ID>): <description>" --body "Merging SD work"',
    '4. Merge PR: gh pr merge --merge --delete-branch',
    '',
    'After merging:',
    '1. git checkout main && git pull',
    '2. Re-run LEAD-FINAL-APPROVAL'
  ].join('\n')
};

/**
 * Get remediation message for a specific gate
 * @param {string} gateName - Name of the failed gate
 * @returns {string|null} Remediation message or null
 */
export function getRemediation(gateName) {
  return REMEDIATIONS[gateName] || null;
}

export default {
  REMEDIATIONS,
  getRemediation
};
