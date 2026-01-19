/**
 * Intelligent Plan Templates
 * SD-PLAN-MODE-003 - SD-Type Aware Plan Generation
 *
 * Generates phase plans tailored to the specific SD type, complexity,
 * and current context from the database.
 */

import { getRecommendedSubAgents, getWorkflowIntensity } from './sd-context-loader.js';

/**
 * Generate LEAD phase plan based on SD context
 */
export function generateLeadPlan(sdContext) {
  const { id, title, description, type, typeProfile, complexity, complexityProfile } = sdContext;
  const intensity = getWorkflowIntensity(sdContext);
  const subAgents = getRecommendedSubAgents(sdContext);

  const sections = [];

  // Header
  sections.push(`# LEAD Phase: ${id}
## ${title || 'Strategic Directive Analysis'}

**Type:** ${typeProfile?.name || type} | **Complexity:** ${complexity} | **Workflow:** ${intensity}
`);

  // Description if available
  if (description) {
    sections.push(`## Context
${description}
`);
  }

  // Type-specific objectives
  sections.push(generateLeadObjectives(type, typeProfile, intensity));

  // Analysis section - varies by type
  sections.push(generateLeadAnalysis(type, typeProfile, subAgents, sdContext));

  // Scope verification - varies by type
  if (typeProfile?.prSizeTarget) {
    sections.push(`## Scope Verification
- [ ] PR size target: **≤${typeProfile.prSizeTarget} lines** (max ${typeProfile.prSizeMax})
- [ ] Single responsibility - one clear outcome
- [ ] No scope creep - defer unrelated improvements
${complexity === 'complex' ? '- [ ] Consider decomposition into smaller SDs\n' : ''}`);
  }

  // Handoff preparation - varies by workflow
  sections.push(generateLeadHandoff(type, typeProfile, intensity));

  // Commands
  sections.push(generateLeadCommands(type, intensity));

  return sections.join('\n');
}

function generateLeadObjectives(type, typeProfile, intensity) {
  const objectives = {
    feature: `## Objective
Validate the feature requirements and ensure readiness for PRD generation.

### Success Criteria
- [ ] Feature scope is clearly defined
- [ ] User value proposition is understood
- [ ] Technical feasibility confirmed
- [ ] Dependencies identified`,

    bug: `## Objective
Understand the bug, identify root cause, and plan the fix.

### Success Criteria
- [ ] Bug reproduction steps documented
- [ ] Root cause identified or hypothesized
- [ ] Fix approach determined
- [ ] Regression risk assessed`,

    enhancement: `## Objective
Validate the enhancement scope and integration points.

### Success Criteria
- [ ] Enhancement aligns with existing patterns
- [ ] Integration points identified
- [ ] Backward compatibility verified`,

    infrastructure: `## Objective
Assess infrastructure change impact and safety measures.

### Success Criteria
- [ ] Change impact fully understood
- [ ] Rollback plan defined
- [ ] Safety measures identified
- [ ] Deployment strategy planned`,

    documentation: `## Objective
Identify documentation gaps and target audience.

### Success Criteria
- [ ] Target audience identified
- [ ] Documentation scope defined
- [ ] Source material located`,

    refactor: `## Objective
Validate refactoring safety and scope boundaries.

### Success Criteria
- [ ] Current behavior fully understood
- [ ] Refactoring boundaries defined
- [ ] Regression test coverage verified
- [ ] No behavior changes introduced`,

    security: `## Objective
Assess security vulnerability and remediation approach.

### Success Criteria
- [ ] Security issue fully understood
- [ ] Attack vectors identified
- [ ] Remediation approach validated
- [ ] Security review planned`,

    uat: `## Objective
Prepare comprehensive UAT test plan.

### Success Criteria
- [ ] Test scenarios identified
- [ ] Test data prepared
- [ ] Success criteria defined
- [ ] User journey mapped`
  };

  return objectives[type] || objectives.feature;
}

function generateLeadAnalysis(type, typeProfile, subAgents, sdContext) {
  let analysis = '## Required Analysis\n\n';

  // Sub-agent recommendations
  if (subAgents.length > 0) {
    analysis += '### Sub-Agent Invocation\n';
    subAgents.forEach(agent => {
      const agentDescriptions = {
        'RISK': 'Assess complexity and identify potential risks',
        'VALIDATION': 'Check for existing implementations or conflicts',
        'STORIES': 'Generate acceptance criteria and user stories',
        'RCA': 'Perform root cause analysis',
        'REGRESSION': 'Verify backward compatibility approach',
        'SECURITY': 'Security impact assessment',
        'DATABASE': 'Schema and migration analysis',
        'API': 'API design and integration review',
        'DESIGN': 'UI/UX component analysis',
        'PERFORMANCE': 'Performance impact assessment',
        'DOCMON': 'Documentation impact analysis',
        'UAT': 'Test scenario generation',
        'TESTING': 'Test coverage analysis',
        'GITHUB': 'CI/CD and deployment analysis'
      };
      analysis += `- [ ] **${agent}**: ${agentDescriptions[agent] || 'Analysis required'}\n`;
    });
    analysis += '\n';
  }

  // Type-specific analysis
  if (type === 'bug') {
    analysis += `### Bug Analysis
- [ ] Reproduce the issue locally
- [ ] Identify affected code paths
- [ ] Check for related issues or patterns
- [ ] Determine fix scope (surgical vs comprehensive)
`;
  } else if (type === 'refactor') {
    analysis += `### Refactoring Analysis
- [ ] Map current code structure
- [ ] Identify all callers/dependencies
- [ ] Verify test coverage exists
- [ ] Plan incremental refactoring steps
`;
  } else if (type === 'security') {
    analysis += `### Security Analysis
- [ ] Identify vulnerability type (OWASP category)
- [ ] Assess exposure and impact
- [ ] Review related security controls
- [ ] Plan defense-in-depth approach
`;
  }

  // Dependencies check
  if (sdContext.dependencies?.length > 0) {
    analysis += `### Dependencies
${sdContext.dependencies.map(d => `- [ ] ${d}`).join('\n')}
`;
  }

  // Risks check
  if (sdContext.risks?.length > 0) {
    analysis += `### Known Risks
${sdContext.risks.map(r => {
  // Handle both string and object risk formats
  const riskText = typeof r === 'string' ? r : (r.description || r.name || JSON.stringify(r));
  return `- [ ] Mitigate: ${riskText}`;
}).join('\n')}
`;
  }

  return analysis;
}

function generateLeadHandoff(type, typeProfile, intensity) {
  if (type === 'bug' || intensity === 'minimal') {
    return `## Handoff Preparation
- [ ] Bug details documented in handoff
- [ ] Fix approach summarized
- [ ] Ready for implementation

*Fast-track: Skip PRD for bug fixes*
`;
  }

  if (type === 'documentation') {
    return `## Handoff Preparation
- [ ] Documentation outline prepared
- [ ] Source material gathered
- [ ] Ready for content creation
`;
  }

  return `## Handoff Preparation
- [ ] Analysis findings documented
- [ ] Key decisions recorded
- [ ] Open questions listed (if any)
- [ ] Ready for LEAD-TO-PLAN handoff
`;
}

function generateLeadCommands(type, intensity) {
  let commands = `## Commands
\`\`\`bash
npm run sd:status         # Check SD status
`;

  if (type === 'bug') {
    commands += `node scripts/handoff.js lead-to-plan  # Skip PRD, go to fix
`;
  } else {
    commands += `node scripts/handoff.js lead-to-plan  # Transition to PLAN phase
`;
  }

  commands += '```';
  return commands;
}

/**
 * Generate PLAN phase plan based on SD context
 */
export function generatePlanPlan(sdContext) {
  const { id, title, type, typeProfile, complexity, scope, keyChanges } = sdContext;
  const intensity = getWorkflowIntensity(sdContext);

  const sections = [];

  // Header
  sections.push(`# PLAN Phase: ${id}
## ${title || 'PRD Generation & Planning'}

**Type:** ${typeProfile?.name || type} | **PRD Required:** ${typeProfile?.requiresPRD ? 'Yes' : 'No'}
`);

  // Scope if available
  if (scope) {
    sections.push(`## Defined Scope
${scope}
`);
  }

  // Key changes if available
  if (keyChanges?.length > 0) {
    sections.push(`## Key Changes
${keyChanges.map(c => `- ${c}`).join('\n')}
`);
  }

  // PRD section - varies by type
  sections.push(generatePlanPRD(type, typeProfile, intensity));

  // Branch setup
  sections.push(`## Branch Setup
- [ ] Create feature branch: \`feat/${id.toLowerCase()}-description\`
- [ ] Verify branch is up-to-date with main
`);

  // Validation
  sections.push(generatePlanValidation(type, typeProfile));

  // Commands
  sections.push(generatePlanCommands(type, typeProfile));

  return sections.join('\n');
}

function generatePlanPRD(type, typeProfile, intensity) {
  if (!typeProfile?.requiresPRD) {
    return `## Planning (No PRD Required)
- [ ] Document the approach briefly
- [ ] Identify files to modify
- [ ] Estimate change size
`;
  }

  if (type === 'bug') {
    return `## Fix Specification
- [ ] Document root cause
- [ ] Specify fix approach
- [ ] List files to modify
- [ ] Define test cases for verification
`;
  }

  if (type === 'refactor') {
    return `## Refactoring Plan
- [ ] Document current state
- [ ] Define target architecture
- [ ] Plan migration steps
- [ ] Specify behavioral contracts (no changes)
- [ ] Define verification approach
`;
  }

  if (type === 'infrastructure') {
    return `## Infrastructure PRD
- [ ] Document current infrastructure state
- [ ] Define target state
- [ ] Create rollback plan
- [ ] Specify deployment steps
- [ ] Define health checks
`;
  }

  return `## PRD Generation
- [ ] Run PRD generation or create manually
- [ ] Define technical approach
- [ ] Specify file changes
- [ ] Include acceptance criteria

### PRD Sections
- [ ] Overview & objectives
- [ ] Technical approach
- [ ] Implementation details
- [ ] Testing requirements
- [ ] Rollout plan
`;
}

function generatePlanValidation(type, typeProfile) {
  const prSize = typeProfile?.prSizeTarget;

  let validation = `## Validation Checklist
- [ ] Plan is realistic and achievable
`;

  if (prSize) {
    validation += `- [ ] Estimated changes ≤${prSize} lines (max ${typeProfile.prSizeMax})
`;
  }

  if (type === 'refactor') {
    validation += `- [ ] No behavior changes in plan
- [ ] All callers identified
`;
  }

  if (type === 'security') {
    validation += `- [ ] Security review scheduled
- [ ] No new attack vectors introduced
`;
  }

  validation += `- [ ] Ready for implementation
`;

  return validation;
}

function generatePlanCommands(type, typeProfile) {
  let commands = `## Commands
\`\`\`bash
`;

  if (typeProfile?.requiresPRD) {
    commands += `node scripts/add-prd-to-database.js   # Save PRD
`;
  }

  commands += `git checkout -b feat/${type}-description  # Create branch
node scripts/handoff.js plan-to-exec  # Transition to EXEC
\`\`\``;

  return commands;
}

/**
 * Generate EXEC phase plan based on SD context
 */
export function generateExecPlan(sdContext) {
  const { id, title, type, typeProfile, complexity, keyChanges } = sdContext;
  const intensity = getWorkflowIntensity(sdContext);

  const sections = [];

  // Header
  sections.push(`# EXEC Phase: ${id}
## ${title || 'Implementation'}

**Type:** ${typeProfile?.name || type} | **Testing:** ${typeProfile?.testingLevel || 'standard'}
`);

  // Implementation section - varies significantly by type
  sections.push(generateExecImplementation(type, typeProfile, keyChanges, intensity));

  // Testing section - varies by type
  sections.push(generateExecTesting(type, typeProfile));

  // Quality section
  sections.push(generateExecQuality(type, typeProfile));

  // Commit & PR
  sections.push(generateExecCommit(type, typeProfile));

  // Commands
  sections.push(generateExecCommands(type));

  return sections.join('\n');
}

function generateExecImplementation(type, typeProfile, keyChanges, intensity) {
  let impl = '## Implementation\n\n';

  if (type === 'bug') {
    impl += `### Bug Fix
- [ ] Apply the fix as specified
- [ ] Verify fix resolves the issue
- [ ] Check for side effects
- [ ] Add regression test
`;
  } else if (type === 'documentation') {
    impl += `### Documentation
- [ ] Write/update documentation
- [ ] Verify accuracy
- [ ] Check formatting
- [ ] Add examples if applicable
`;
  } else if (type === 'refactor') {
    impl += `### Refactoring
- [ ] Apply refactoring incrementally
- [ ] Run tests after each change
- [ ] Verify behavior unchanged
- [ ] Update any affected tests
`;
  } else if (type === 'infrastructure') {
    impl += `### Infrastructure Changes
- [ ] Apply changes incrementally
- [ ] Verify each step works
- [ ] Test rollback procedure
- [ ] Document any deviations
`;
  } else {
    impl += `### Feature Implementation
- [ ] Implement according to PRD
- [ ] Follow existing patterns
- [ ] Keep changes focused
`;

    if (keyChanges?.length > 0) {
      impl += `\n### Specific Changes\n${keyChanges.map(c => `- [ ] ${c}`).join('\n')}\n`;
    }
  }

  impl += `
### Implementation Principles
- [ ] Minimal changes - only what's needed
- [ ] No scope creep
- [ ] No unrelated improvements
`;

  return impl;
}

function generateExecTesting(type, typeProfile) {
  const testingLevel = typeProfile?.testingLevel || 'standard';

  if (testingLevel === 'minimal') {
    return `## Testing
- [ ] Verify changes work as expected
- [ ] No obvious regressions
`;
  }

  if (testingLevel === 'regression') {
    return `## Testing
- [ ] Verify fix resolves the issue
- [ ] Run regression tests
- [ ] Add test case for the bug
- [ ] Check related functionality
`;
  }

  if (testingLevel === 'uat') {
    return `## Testing
- [ ] Execute UAT test cases
- [ ] Document results
- [ ] Capture evidence (screenshots/logs)
- [ ] Report any issues found
`;
  }

  // Standard or comprehensive
  return `## Testing
- [ ] Run existing tests: \`npm test\`
- [ ] Add tests for new functionality
- [ ] Verify no regressions
${testingLevel === 'comprehensive' ? '- [ ] Run E2E tests: `npm run test:e2e`\n- [ ] Manual verification of key flows\n' : ''}- [ ] All tests passing
`;
}

function generateExecQuality(type, typeProfile) {
  if (type === 'documentation') {
    return `## Quality
- [ ] Spell check complete
- [ ] Links verified
- [ ] Formatting consistent
`;
  }

  return `## Quality
- [ ] Lint passing: \`npm run lint\`
- [ ] Build passing: \`npm run build\`
- [ ] Self-review complete
- [ ] No debug code left
`;
}

function generateExecCommit(type, typeProfile) {
  const prefix = type === 'bug' ? 'fix' : type === 'documentation' ? 'docs' : 'feat';

  return `## Commit & PR
- [ ] Stage changes: \`git add .\`
- [ ] Commit with message: \`${prefix}: description\`
- [ ] Push to remote
- [ ] Create PR with summary
`;
}

function generateExecCommands(type) {
  return `## Commands
\`\`\`bash
npm test                              # Run tests
npm run build                         # Build project
npm run lint                          # Check linting
git add . && git commit -m "..."      # Commit
git push -u origin HEAD               # Push
gh pr create                          # Create PR
node scripts/handoff.js exec-to-plan  # If issues found
\`\`\``;
}

/**
 * Generate VERIFY phase plan based on SD context
 */
export function generateVerifyPlan(sdContext) {
  const { id, title, type, typeProfile, successCriteria } = sdContext;

  const sections = [];

  sections.push(`# VERIFY Phase: ${id}
## ${title || 'Verification'}

**Type:** ${typeProfile?.name || type}
`);

  // Verification checklist
  sections.push(generateVerifyChecklist(type, typeProfile, successCriteria));

  // Quality gates
  sections.push(generateVerifyQualityGates(type, typeProfile));

  // Commands
  sections.push(`## Commands
\`\`\`bash
gh pr checks                                # CI status
node scripts/handoff.js lead-final-approval # Final approval
\`\`\``);

  return sections.join('\n');
}

function generateVerifyChecklist(type, typeProfile, successCriteria) {
  let checklist = '## Verification Checklist\n\n';

  // Success criteria if defined
  if (successCriteria?.length > 0) {
    checklist += '### Success Criteria\n';
    successCriteria.forEach(c => {
      checklist += `- [ ] ${c}\n`;
    });
    checklist += '\n';
  }

  // Type-specific verification
  if (type === 'bug') {
    checklist += `### Bug Fix Verification
- [ ] Bug no longer reproducible
- [ ] Regression test added
- [ ] No new issues introduced
`;
  } else if (type === 'refactor') {
    checklist += `### Refactoring Verification
- [ ] All tests still pass
- [ ] Behavior unchanged
- [ ] Performance not degraded
`;
  } else if (type === 'security') {
    checklist += `### Security Verification
- [ ] Vulnerability resolved
- [ ] Security review passed
- [ ] No new vulnerabilities introduced
`;
  } else {
    checklist += `### Implementation Verification
- [ ] Implementation matches PRD
- [ ] All acceptance criteria met
- [ ] Edge cases handled
`;
  }

  return checklist;
}

function generateVerifyQualityGates(type, typeProfile) {
  const prSize = typeProfile?.prSizeTarget;

  let gates = `## Quality Gates
- [ ] All CI checks passing
- [ ] Code review approved
`;

  if (prSize) {
    gates += `- [ ] PR size ≤${typeProfile.prSizeMax} lines
`;
  }

  gates += `- [ ] No security issues
- [ ] Documentation updated (if needed)
`;

  return gates;
}

/**
 * Generate FINAL phase plan based on SD context
 */
export function generateFinalPlan(sdContext) {
  const { id, title, type, typeProfile } = sdContext;

  return `# FINAL Phase: ${id}
## ${title || 'Completion'}

**Type:** ${typeProfile?.name || type}

## Pre-Merge Checklist
- [ ] All CI checks green
- [ ] PR approved
- [ ] No blocking comments

## Merge
- [ ] Merge PR to main
- [ ] Delete feature branch
- [ ] Verify main is stable

## Post-Merge
- [ ] Update SD status to completed
- [ ] Run /learn to capture insights
- [ ] Close related issues

## Commands
\`\`\`bash
gh pr merge --merge --delete-branch   # Merge
git checkout main && git pull         # Sync
npm run sd:status                     # Verify
\`\`\``;
}

/**
 * Main function to generate plan based on phase and context
 */
export function generateIntelligentPlan(phase, sdContext) {
  const generators = {
    'LEAD': generateLeadPlan,
    'PLAN': generatePlanPlan,
    'EXEC': generateExecPlan,
    'VERIFY': generateVerifyPlan,
    'FINAL': generateFinalPlan
  };

  const generator = generators[phase.toUpperCase()];
  if (!generator) {
    return `# ${phase} Phase: ${sdContext.id}\n\nNo template defined for this phase.`;
  }

  return generator(sdContext);
}

/**
 * Generate plan filename
 */
export function getPlanFilename(sdId, phase) {
  const safeId = sdId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `leo-${safeId}-${phase.toLowerCase()}.md`;
}

export default {
  generateIntelligentPlan,
  generateLeadPlan,
  generatePlanPlan,
  generateExecPlan,
  generateVerifyPlan,
  generateFinalPlan,
  getPlanFilename
};
