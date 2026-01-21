/**
 * README Generator
 * Generates README files for workflow documentation
 *
 * Extracted from generate-workflow-docs.js for modularity
 * SD-LEO-REFACTOR-WORKFLOW-DOCS-001
 */

import fs from 'fs';
import path from 'path';
import { stagesDir, workflowDir } from './data-loader.js';

/**
 * Generate README files for documentation directories
 */
export function generateREADMEs() {
  generateStagesReadme();
  generateWorkflowReadme();
  console.log('Generated README files');
}

/**
 * Generate stages directory README
 */
function generateStagesReadme() {
  const stagesReadmePath = path.join(stagesDir, 'README.md');
  const stagesReadmeContent = `# Venture Workflow Diagrams

## Overview
This directory contains Mermaid diagrams visualizing the EHG 40-stage venture workflow.

## Files

### Complete Overview
- [overview.mmd](overview.mmd) - All 40 stages with phases and dependencies

### Phase Diagrams
- [01-ideation.mmd](01-ideation.mmd) - Phase 1: Ideation (Stages 1-10)
- [02-planning.mmd](02-planning.mmd) - Phase 2: Planning (Stages 11-20)
- [03-development.mmd](03-development.mmd) - Phase 3: Development (Stages 21-28)
- [04-launch.mmd](04-launch.mmd) - Phase 4: Launch (Stages 29-34)
- [05-operations.mmd](05-operations.mmd) - Phase 5: Operations (Stages 35-40)

### Individual Stage Details
- [individual/](individual/) - Detailed diagrams for each stage (01.mmd through 40.mmd)

## How to View
1. Copy Mermaid code into any Mermaid viewer
2. Use VS Code with Mermaid extension
3. Use online viewer at https://mermaid.live
4. GitHub will render .mmd files automatically

## Diagram Legend
- **Solid arrows** → Sequential flow
- **Dashed arrows** -.-> Dependencies
- **Double arrows** ==> Critical gates
- **Colors**: Each phase has distinct color coding

## Navigation
- [Back to Workflow Docs](../workflow/)
- [View SOPs](../workflow/SOP_INDEX.md)
- [View Critiques](../workflow/critique/)`;

  fs.writeFileSync(stagesReadmePath, stagesReadmeContent);
}

/**
 * Generate workflow directory README
 */
function generateWorkflowReadme() {
  const workflowReadmePath = path.join(workflowDir, 'README.md');
  const workflowReadmeContent = `# EHG Venture Workflow Documentation

## Overview
Complete documentation for the EHG 40-stage venture workflow, from ideation to exit.

## Directory Structure

### Core Documentation
- \`stages.yaml\` - Canonical definition of all 40 stages (single source of truth)
- \`SOP_INDEX.md\` - Index of all Standard Operating Procedures
- \`sop/\` - Detailed SOPs for each stage

### Analysis & Optimization
- \`critique/\` - Critical analysis of workflow and individual stages
- \`prd_crosswalk.md\` - Mapping of stages to PRD documentation
- \`prd_crosswalk.csv\` - Machine-readable PRD mapping

### Work Management
- \`backlog/backlog.yaml\` - Prioritized improvement backlog
- \`backlog/issues/\` - GitHub-ready issue templates

## Quick Start

### For Developers
1. Start with \`stages.yaml\` for stage definitions
2. Reference SOPs for implementation details
3. Check PRD crosswalk for existing documentation
4. Review backlog for known issues

### For Product Managers
1. Review critique/overview.md for optimization opportunities
2. Check backlog for prioritized improvements
3. Use research packs for deep analysis
4. Reference individual stage critiques for specific improvements

### For Executives
1. View [workflow diagrams](../stages/overview.mmd) for visual overview
2. Review critique for strategic recommendations
3. Check metrics and KPIs in stages.yaml
4. Monitor backlog for major initiatives

## Workflow Phases

### Phase 1: IDEATION (Stages 1-10)
Focus: Idea validation and feasibility assessment

### Phase 2: PLANNING (Stages 11-20)
Focus: Strategic planning and resource preparation

### Phase 3: DEVELOPMENT (Stages 21-28)
Focus: Building and iterating the product

### Phase 4: LAUNCH (Stages 29-34)
Focus: Go-to-market and initial customer success

### Phase 5: OPERATIONS (Stages 35-40)
Focus: Growth, optimization, and exit

## Key Metrics
- **Total Stages**: 40
- **Decision Gates**: 4 formal, 15+ informal
- **Automation Potential**: 50% fully automatable
- **Typical Duration**: 6-12 months
- **Success Predictability**: 60% by stage 10

## Tools & Scripts
- \`validate-stages.js\` - Validate workflow consistency
- \`generate-mermaid.js\` - Regenerate diagrams from stages.yaml
- \`generate-workflow-docs.js\` - Regenerate all documentation

## Contributing
1. All changes start with updating \`stages.yaml\`
2. Run validation script after changes
3. Update SOPs for affected stages
4. Create backlog items for major changes
5. Update diagrams if dependencies change`;

  fs.writeFileSync(workflowReadmePath, workflowReadmeContent);
}
