/**
 * Phase Permissions - LEO Protocol Plan Mode Integration
 * Maps LEO phases to Claude Code permission bundles for ExitPlanMode.
 */

export const LEAD_PERMISSIONS = [
  { tool: 'Bash', prompt: 'run SD queue commands (npm run sd:next, sd:status)' },
  { tool: 'Bash', prompt: 'run handoff scripts (node scripts/handoff.js)' },
  { tool: 'Bash', prompt: 'check git status and branch information' },
  { tool: 'Bash', prompt: 'run LEO stack status commands' }
];

export const PLAN_PERMISSIONS = [
  { tool: 'Bash', prompt: 'run PRD generation scripts (add-prd-to-database.js)' },
  { tool: 'Bash', prompt: 'run sub-agent orchestration (orchestrate-phase-subagents.js)' },
  { tool: 'Bash', prompt: 'run handoff scripts (node scripts/handoff.js)' },
  { tool: 'Bash', prompt: 'create and manage git branches' },
  { tool: 'Bash', prompt: 'run validation scripts' }
];

export const EXEC_PERMISSIONS = [
  { tool: 'Bash', prompt: 'run tests (npm test, vitest, playwright)' },
  { tool: 'Bash', prompt: 'run build commands (npm run build)' },
  { tool: 'Bash', prompt: 'git operations (add, commit, status, diff)' },
  { tool: 'Bash', prompt: 'run handoff scripts (node scripts/handoff.js)' },
  { tool: 'Bash', prompt: 'run npm scripts and node commands' },
  { tool: 'Bash', prompt: 'run LEO stack commands (restart, status)' }
];

export const VERIFY_PERMISSIONS = [
  { tool: 'Bash', prompt: 'run handoff scripts (node scripts/handoff.js)' },
  { tool: 'Bash', prompt: 'run verification and validation scripts' },
  { tool: 'Bash', prompt: 'check git status and diff' },
  { tool: 'Bash', prompt: 'run test commands for verification' }
];

export const FINAL_PERMISSIONS = [
  { tool: 'Bash', prompt: 'create pull requests (gh pr create)' },
  { tool: 'Bash', prompt: 'merge pull requests (gh pr merge)' },
  { tool: 'Bash', prompt: 'git push operations' },
  { tool: 'Bash', prompt: 'run handoff scripts (node scripts/handoff.js)' },
  { tool: 'Bash', prompt: 'run archive and completion scripts' }
];

export const PHASE_PERMISSIONS = {
  LEAD: LEAD_PERMISSIONS,
  PLAN: PLAN_PERMISSIONS,
  EXEC: EXEC_PERMISSIONS,
  VERIFY: VERIFY_PERMISSIONS,
  FINAL: FINAL_PERMISSIONS
};

export function getPermissionsForPhase(phase) {
  const normalizedPhase = (phase || 'LEAD').toUpperCase();
  return PHASE_PERMISSIONS[normalizedPhase] || LEAD_PERMISSIONS;
}

export function getCombinedPermissions(phases) {
  const allPermissions = phases.flatMap(phase => getPermissionsForPhase(phase));
  const seen = new Set();
  return allPermissions.filter(perm => {
    const key = `${perm.tool}:${perm.prompt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default { PHASE_PERMISSIONS, getPermissionsForPhase, getCombinedPermissions };
