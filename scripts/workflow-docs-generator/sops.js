/**
 * SOPs Generator
 * Generates Standard Operating Procedures for each stage
 *
 * Extracted from generate-workflow-docs.js for modularity
 * SD-LEO-REFACTOR-WORKFLOW-DOCS-001
 */

import fs from 'fs';
import path from 'path';
import { workflowDir, ensureDir, slugify, padStageId, getStages } from './data-loader.js';

/**
 * Generate SOPs for each stage
 */
export function generateSOPs() {
  const stages = getStages();
  const dir = path.join(workflowDir, 'sop');
  ensureDir(dir);

  stages.forEach(stage => {
    const slug = slugify(stage.title);
    const filename = `${padStageId(stage.id)}-${slug}.md`;
    const filepath = path.join(dir, filename);

    const content = `# ${stage.id}. ${stage.title}

- **Owner**: ${stage.owner}
- **Depends on**: ${stage.depends_on.length > 0 ? stage.depends_on.join(', ') : 'None'}
- **Purpose**: ${stage.description}

## Entry Gate
${stage.gates.entry.length > 0 ? stage.gates.entry.map(g => `- ${g}`).join('\n') : '- No specific entry requirements'}

## Exit Gate
${stage.gates.exit.length > 0 ? stage.gates.exit.map(g => `- ${g}`).join('\n') : '- Stage completion criteria TBD'}

## Inputs
${stage.inputs.length > 0 ? stage.inputs.map(i => `- ${i}`).join('\n') : '- TBD'}

## Outputs
${stage.outputs.length > 0 ? stage.outputs.map(o => `- ${o}`).join('\n') : '- TBD'}

## Substages & Checklists
${stage.substages.map(sub => {
  const checklist = sub.done_when.map(d => `  - [ ] ${d}`).join('\n');
  return `### ${sub.id} ${sub.title}\n${checklist}`;
}).join('\n\n')}

## Tooling & Integrations
- **Primary Tools**: ${stage.owner === 'EVA' ? 'EVA Assistant, Voice Interface' :
                      stage.owner === 'LEAD' ? 'LEAD Agent, Strategic Analysis Tools' :
                      stage.owner === 'PLAN' ? 'PLAN Agent, Planning Tools' :
                      stage.owner === 'EXEC' ? 'EXEC Agent, Development Tools' :
                      'Chairman Console, Executive Dashboard'}
- **APIs**: TBD
- **External Services**: TBD

## Metrics & KPIs
${stage.metrics.length > 0 ? stage.metrics.map(m => `- ${m}`).join('\n') : '- TBD'}

## Risks & Mitigations
- **Primary Risk**: TBD
- **Mitigation Strategy**: TBD
- **Fallback Plan**: TBD

## Failure Modes & Recovery
- **Common Failures**: TBD
- **Recovery Steps**: TBD
- **Rollback Procedure**: TBD

## Security/Compliance Considerations
- **Data Security**: Standard EHG data protection policies apply
- **Compliance**: SOX, GDPR where applicable
- **Audit Trail**: All decisions and changes logged

## Notes / Open Questions
- TODO: Map to specific PRD implementations
- TODO: Define specific tool integrations
- TODO: Establish concrete metrics and thresholds`;

    fs.writeFileSync(filepath, content);
  });

  // Generate SOP Index
  generateSOPIndex(stages);
  console.log('Generated SOPs and index');
}

/**
 * Generate SOP index file
 * @param {Array} stages - Array of stage objects
 */
function generateSOPIndex(stages) {
  const indexPath = path.join(workflowDir, 'SOP_INDEX.md');

  const stagesByPhase = (start, end) => stages
    .filter(s => s.id >= start && s.id <= end)
    .map(s => {
      const slug = slugify(s.title);
      return `- [Stage ${s.id}: ${s.title}](sop/${padStageId(s.id)}-${slug}.md)`;
    })
    .join('\n');

  const indexContent = `# SOP Index - 40-Stage Venture Workflow

## Overview
This index provides navigation to all 40 Standard Operating Procedures (SOPs) for the EHG venture workflow.

## Phase 1: IDEATION (Stages 1-10)
${stagesByPhase(1, 10)}

## Phase 2: PLANNING (Stages 11-20)
${stagesByPhase(11, 20)}

## Phase 3: DEVELOPMENT (Stages 21-28)
${stagesByPhase(21, 28)}

## Phase 4: LAUNCH (Stages 29-34)
${stagesByPhase(29, 34)}

## Phase 5: OPERATIONS (Stages 35-40)
${stagesByPhase(35, 40)}

## Quick Reference
- **Total Stages**: 40
- **Phases**: 5
- **Owners**: EVA, LEAD, PLAN, EXEC, Chairman
- **Key Decision Gates**: Stage 3 (Kill/Revise/Proceed), Stage 13 (Exit Strategy), Stage 30 (Production), Stage 40 (Exit)`;

  fs.writeFileSync(indexPath, indexContent);
}
