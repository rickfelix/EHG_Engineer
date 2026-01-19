/**
 * LEO Protocol Plan Templates
 * SD-PLAN-MODE-002 - Phase-specific action plans for Claude Code Plan Mode
 *
 * These templates define the actions/tasks for each LEO Protocol phase,
 * which get written to Claude Code's plan file when entering a phase.
 */

/**
 * LEAD Phase Plan Template
 * Focus: SD approval, requirements gathering, sub-agent analysis
 */
export const LEAD_PLAN_TEMPLATE = (sdId, sdTitle) => `# LEAD Phase: ${sdId}

## Objective
${sdTitle || 'Review and approve Strategic Directive for implementation'}

## Required Actions

### 1. SD Analysis
- [ ] Review SD requirements and acceptance criteria
- [ ] Verify SD is ready for implementation (status: approved/ready)
- [ ] Check dependencies on other SDs

### 2. Sub-Agent Analysis (as needed)
- [ ] Run RISK agent if complexity is high
- [ ] Run VALIDATION agent to check for existing implementations
- [ ] Run relevant domain agents (API, DATABASE, DESIGN, etc.)

### 3. Scope Verification
- [ ] Confirm PR size target (≤100 lines preferred, max 400)
- [ ] Identify if SD needs decomposition into smaller units
- [ ] Verify simplicity principles are maintained

### 4. Handoff Preparation
- [ ] Document any clarifications or decisions made
- [ ] Prepare LEAD-TO-PLAN handoff with gathered context

## Exit Criteria
- SD requirements are clear and understood
- Sub-agent analysis complete (if applicable)
- Ready to generate PRD in PLAN phase

## Commands
\`\`\`bash
npm run sd:next           # View SD queue
npm run sd:status         # Check SD status
node scripts/handoff.js lead-to-plan  # Transition to PLAN
\`\`\`
`;

/**
 * PLAN Phase Plan Template
 * Focus: PRD generation, architecture decisions, branch creation
 */
export const PLAN_PLAN_TEMPLATE = (sdId, sdTitle) => `# PLAN Phase: ${sdId}

## Objective
${sdTitle || 'Generate PRD and prepare implementation plan'}

## Required Actions

### 1. PRD Generation
- [ ] Run PRD generation script or create PRD manually
- [ ] Define technical approach and architecture
- [ ] Specify file changes and modifications needed

### 2. Sub-Agent Orchestration
- [ ] Run ARCHITECT agent for design decisions
- [ ] Run STORIES agent for acceptance criteria
- [ ] Run relevant technical agents (API, DATABASE, etc.)

### 3. Branch Setup
- [ ] Create feature branch from main
- [ ] Verify branch naming follows convention: feat/SD-XXX-description

### 4. Verification
- [ ] PRD passes schema validation
- [ ] Implementation plan is realistic for PR size limits
- [ ] All dependencies are identified

### 5. Handoff Preparation
- [ ] PRD is complete and validated
- [ ] Prepare PLAN-TO-EXEC handoff

## Exit Criteria
- PRD generated and validated
- Feature branch created
- Ready to implement in EXEC phase

## Commands
\`\`\`bash
node scripts/add-prd-to-database.js   # Add PRD to database
node scripts/handoff.js plan-to-exec  # Transition to EXEC
\`\`\`
`;

/**
 * EXEC Phase Plan Template
 * Focus: Implementation, testing, code quality
 */
export const EXEC_PLAN_TEMPLATE = (sdId, sdTitle) => `# EXEC Phase: ${sdId}

## Objective
${sdTitle || 'Implement the solution according to PRD'}

## Required Actions

### 1. Implementation
- [ ] Implement changes according to PRD specifications
- [ ] Follow existing code patterns and conventions
- [ ] Keep changes focused and minimal (avoid over-engineering)

### 2. Testing
- [ ] Run existing tests to ensure no regressions
- [ ] Add new tests for new functionality
- [ ] Verify all tests pass: \`npm test\`

### 3. Code Quality
- [ ] Run linter: \`npm run lint\`
- [ ] Run build: \`npm run build\`
- [ ] Self-review code for obvious issues

### 4. Commit & PR
- [ ] Stage and commit changes with descriptive message
- [ ] Push to feature branch
- [ ] Create pull request with summary and test plan

### 5. Handoff
- [ ] Run EXEC-TO-VERIFY or EXEC-TO-PLAN handoff
- [ ] Document any deviations from PRD

## Exit Criteria
- All code changes implemented
- Tests passing
- PR created and ready for review

## Commands
\`\`\`bash
npm test                              # Run tests
npm run build                         # Build project
git add . && git commit -m "..."      # Commit changes
git push -u origin HEAD               # Push branch
gh pr create                          # Create PR
node scripts/handoff.js exec-to-plan  # Back to PLAN if issues
\`\`\`
`;

/**
 * VERIFY Phase Plan Template
 * Focus: Review, validation, quality gates
 */
export const VERIFY_PLAN_TEMPLATE = (sdId, sdTitle) => `# VERIFY Phase: ${sdId}

## Objective
${sdTitle || 'Verify implementation meets requirements'}

## Required Actions

### 1. Code Review
- [ ] Review PR changes for correctness
- [ ] Verify implementation matches PRD
- [ ] Check for any missed requirements

### 2. Testing Verification
- [ ] Confirm all tests pass in CI
- [ ] Run E2E tests if applicable
- [ ] Verify no regressions introduced

### 3. Quality Gates
- [ ] PR size within limits (≤100 lines preferred)
- [ ] No security vulnerabilities introduced
- [ ] Documentation updated if needed

### 4. Final Approval
- [ ] Prepare LEAD-FINAL-APPROVAL handoff
- [ ] Document verification results

## Exit Criteria
- All quality gates passed
- Implementation verified correct
- Ready for final approval and merge

## Commands
\`\`\`bash
gh pr checks                                # Check CI status
npm run test:e2e                            # Run E2E tests
node scripts/handoff.js lead-final-approval # Final approval
\`\`\`
`;

/**
 * FINAL Phase Plan Template
 * Focus: Merge, cleanup, completion
 */
export const FINAL_PLAN_TEMPLATE = (sdId, sdTitle) => `# FINAL Phase: ${sdId}

## Objective
${sdTitle || 'Complete SD and merge changes'}

## Required Actions

### 1. Final Review
- [ ] Confirm all checks passing
- [ ] Verify no blocking issues

### 2. Merge
- [ ] Merge PR to main
- [ ] Delete feature branch

### 3. Post-Merge
- [ ] Verify main branch is stable
- [ ] Run /learn to capture session learnings
- [ ] Update SD status to completed

### 4. Cleanup
- [ ] Archive any temporary files
- [ ] Update documentation if needed

## Exit Criteria
- PR merged successfully
- SD marked as completed
- Learnings captured

## Commands
\`\`\`bash
gh pr merge --merge --delete-branch   # Merge and cleanup
git checkout main && git pull         # Sync local
npm run sd:status                     # Verify completion
\`\`\`
`;

/**
 * Get plan template for a given phase
 */
export function getPlanTemplate(phase, sdId, sdTitle) {
  const templates = {
    'LEAD': LEAD_PLAN_TEMPLATE,
    'PLAN': PLAN_PLAN_TEMPLATE,
    'EXEC': EXEC_PLAN_TEMPLATE,
    'VERIFY': VERIFY_PLAN_TEMPLATE,
    'FINAL': FINAL_PLAN_TEMPLATE
  };

  const templateFn = templates[phase.toUpperCase()];
  if (!templateFn) {
    return `# ${phase} Phase: ${sdId}\n\nNo template defined for this phase.`;
  }

  return templateFn(sdId, sdTitle);
}

/**
 * Generate plan filename for an SD
 */
export function getPlanFilename(sdId, phase) {
  const safeId = sdId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `leo-${safeId}-${phase.toLowerCase()}.md`;
}

export default {
  getPlanTemplate,
  getPlanFilename,
  LEAD_PLAN_TEMPLATE,
  PLAN_PLAN_TEMPLATE,
  EXEC_PLAN_TEMPLATE,
  VERIFY_PLAN_TEMPLATE,
  FINAL_PLAN_TEMPLATE
};
