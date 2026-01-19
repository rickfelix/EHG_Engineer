#!/usr/bin/env node
/**
 * Generate individual stage documentation from stages_v2.yaml
 *
 * Purpose: Create comprehensive documentation for all 25 stages
 * Source: docs/workflow/stages_v2.yaml (canonical source of truth)
 * Output: docs/workflow/stages/stage-[NN]-[slug].md
 */

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const STAGES_V2_PATH = path.join(__dirname, '../docs/workflow/stages_v2.yaml');
const OUTPUT_DIR = path.join(__dirname, '../docs/workflow/stages');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Load stages_v2.yaml
const stagesConfig = yaml.parse(fs.readFileSync(STAGES_V2_PATH, 'utf8'));

// Phase lookup
const phases = stagesConfig.phases.reduce((acc, phase) => {
  phase.stages.forEach(stageId => {
    acc[stageId] = phase;
  });
  return acc;
}, {});

// Generate slug from title
function slugify(title) {
  return title.toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Format array as markdown table
function formatTable(headers, rows) {
  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `|${headers.map(() => '------|').join('')}`;
  const dataRows = rows.map(row => `| ${row.join(' | ')} |`).join('\n');
  return `${headerRow}\n${separatorRow}\n${dataRows}`;
}

// Generate documentation for a single stage
function generateStageDoc(stage, stageIndex) {
  const phase = phases[stage.id];
  const slug = slugify(stage.title);
  const filename = `stage-${String(stage.id).padStart(2, '0')}-${slug}.md`;

  const prevStageId = stage.id > 1 ? stage.id - 1 : null;
  const nextStageId = stage.id < 25 ? stage.id + 1 : null;

  const prevStage = prevStageId ? stagesConfig.stages.find(s => s.id === prevStageId) : null;
  const nextStage = nextStageId ? stagesConfig.stages.find(s => s.id === nextStageId) : null;

  // Implementation status mapping (from EHG codebase audit)
  const implementationStatus = stage.id <= 25 ? '✅ Implemented in EHG' : '❌ Not yet implemented';

  // Generate markdown content with proper DOCUMENTATION_STANDARDS.md compliance
  const content = `# Stage ${stage.id}: ${stage.title}

## Metadata
- **Category**: Workflow
- **Status**: Approved
- **Version**: 2.0.0
- **Author**: Documentation Sub-Agent (DOCMON)
- **Last Updated**: ${new Date().toISOString().split('T')[0]}
- **Tags**: venture-workflow, stage-${String(stage.id).padStart(2, '0')}, vision-v2, ${stage.work_type}, phase-${phase.id}
- **Stage ID**: ${stage.id}
- **Phase**: ${phase.id} (${phase.name})
- **Work Type**: \`${stage.work_type}\`
- **SD Required**: ${stage.sd_required ? 'Yes' + (stage.sd_suffix ? ` (${stage.sd_suffix})` : '') : 'No'}
- **Advisory Enabled**: ${stage.advisory_enabled ? 'Yes' : 'No'}
- **Implementation Status**: ${implementationStatus}

## Overview

${stage.description}

## Purpose

${stage.work_type === 'decision_gate' ? 'This is a **decision gate** stage where critical go/no-go decisions are made.' : ''}
${stage.sd_required ? 'This stage requires a Strategic Directive (SD) to be created and executed.' : 'This is an artifact-only stage focused on producing specific outputs.'}

## Dependencies

- **Previous Stage${stage.depends_on && stage.depends_on.length > 1 ? 's' : ''}**: ${stage.depends_on && stage.depends_on.length ? stage.depends_on.map(id => {
    const dep = stagesConfig.stages.find(s => s.id === id);
    return `Stage ${id} (${dep ? dep.title : 'Unknown'})`;
  }).join(', ') : 'None (entry point)'}
- **Next Stage**: ${nextStage ? `Stage ${nextStage.id} (${nextStage.title})` : 'Phase 7: THE ORBIT (Active Operations)'}

## Inputs

${stage.inputs && stage.inputs.length ? formatTable(
  ['Input', 'Source', 'Required'],
  stage.inputs.map(input => [input, 'Previous stages', 'Yes'])
) : 'No specific inputs defined.'}

## Outputs

${stage.outputs && stage.outputs.length ? formatTable(
  ['Output', 'Format', 'Storage'],
  stage.outputs.map(output => [output, 'Artifact/Database', 'Database'])
) : 'No specific outputs defined.'}

## Artifacts

${stage.artifacts && stage.artifacts.length ?
  stage.artifacts.map(artifact => `- **\`${artifact}\`**`).join('\n') :
  'No named artifacts defined.'}

## Entry Gates

${stage.gates && stage.gates.entry && stage.gates.entry.length ?
  stage.gates.entry.map(gate => `- ${gate}`).join('\n') :
  'None (previous stage completion is sufficient)'}

## Exit Gates

${stage.gates && stage.gates.exit && stage.gates.exit.length ?
  formatTable(
    ['Gate', 'Criteria', 'Validation'],
    stage.gates.exit.map(gate => [gate, 'Must be met', 'Required'])
  ) :
  'No specific exit gates defined.'}

## Metrics

${stage.metrics && stage.metrics.length ? formatTable(
  ['Metric', 'Target', 'Purpose'],
  stage.metrics.map(metric => [metric, 'TBD', 'Performance tracking'])
) : 'No specific metrics defined.'}

## Key Activities

1. Review inputs from previous stage(s)
2. ${stage.work_type === 'sd_required' ? 'Create and execute Strategic Directive' : 'Generate required artifacts'}
3. ${stage.work_type === 'decision_gate' ? 'Make kill/revise/proceed decision' : 'Validate outputs against exit gates'}
4. Document outcomes in database
5. Proceed to next stage upon completion

## Best Practices

${stage.work_type === 'decision_gate' ? '- **Be Ruthless**: Kill ideas that don\'t meet criteria\n- **Use Data**: Base decisions on validation metrics\n- **Document Rationale**: Record why decisions were made' : ''}
${stage.sd_required ? '- **Database-First**: All SDs tracked in strategic_directives_v2 table\n- **Quality Gates**: Ensure all acceptance criteria pass\n- **Handoff Protocol**: Follow proper phase transition' : ''}
- **Artifact Quality**: Ensure all outputs meet standards
- **Exit Gate Validation**: Don't skip validation steps
- **Documentation**: Keep detailed records of decisions

## Common Pitfalls

| Pitfall | Impact | Solution |
|---------|--------|----------|
| Skipping validation | Poor quality downstream | Follow all exit gates |
| Incomplete artifacts | Blocks next stage | Check artifact completeness |
${stage.work_type === 'decision_gate' ? '| Emotional decisions | Wrong ventures proceed | Use objective criteria |' : ''}
${stage.sd_required ? '| Bypassing SD process | Protocol violation | Always create SD first |' : ''}

## UI Implementation

**Current Status**: ${implementationStatus}

**Location**: ${stage.id <= 25 ? '`/ventures/[id]` route with stage navigation' : 'Not implemented'}

**Components**: ${stage.id <= 25 ? `
- \`Stage${stage.id}*.tsx\` - Stage-specific component
- \`Stage${stage.id}Viewer.tsx\` - Stage output viewer
- \`VentureStageNavigation.tsx\` - Phase-based navigation accordion` : 'Not yet implemented'}

**Database**: ${stage.id <= 25 ? '`ventures.current_lifecycle_stage` tracks progression (INTEGER 1-25)' : 'Schema supports but no UI'}

## Database Schema

**Primary Table**: \`ventures\` (with \`current_lifecycle_stage\` tracking)

**Related Tables**:
- \`lifecycle_stage_config\` - Stage definitions (25 stages, 6 phases)
- \`venture_stage_work\` - Stage entry/completion tracking
${stage.artifacts && stage.artifacts.length ? stage.artifacts.map(a => `- \`venture_${a}\` (if separate table)`).join('\n') : ''}

## Related Documentation

- [stages_v2.yaml](../stages_v2.yaml#L${stageIndex * 40 + 119}) - Stage ${stage.id} definition
- [25-Stage Overview](../25-stage-venture-lifecycle-overview.md#phase-${phase.id}-${slugify(phase.name)}) - Phase context
${prevStage ? `- [Stage ${prevStage.id}: ${prevStage.title}](stage-${String(prevStage.id).padStart(2, '0')}-${slugify(prevStage.title)}.md) - Previous stage` : ''}
${nextStage ? `- [Stage ${nextStage.id}: ${nextStage.title}](stage-${String(nextStage.id).padStart(2, '0')}-${slugify(nextStage.title)}.md) - Next stage` : ''}

${stage.assumption_set ? `## Golden Nugget: Assumptions vs Reality

This stage includes Assumptions vs Reality tracking:
- **Action**: ${stage.assumption_set.action}
- **Note**: ${stage.assumption_set.note}
` : ''}

${stage.epistemic_classification ? `## Golden Nugget: Four Buckets (Epistemic Classification)

This stage requires epistemic classification of all outputs:
- **Required**: ${stage.epistemic_classification.required ? 'Yes' : 'No'}
- **Note**: ${stage.epistemic_classification.note || 'All claims must be classified as Facts/Assumptions/Simulations/Unknowns'}
` : ''}

${stage.crew_tournament ? `## Golden Nugget: Crew Tournament

This stage uses tournament-style agent competition:
- **Enabled**: Yes (Pilot stage)
- **Note**: ${stage.crew_tournament.note}
` : ''}

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-01-19 | Vision V2 initial documentation |

---
*Part of Vision V2 (25-Stage Venture Lifecycle)*
*Technical Reference: \`docs/workflow/stages_v2.yaml\` (lines ${stageIndex * 40 + 119}-${stageIndex * 40 + 159})*
`;

  return { filename, content };
}

// Generate all stage documents
console.log('Generating stage documentation from stages_v2.yaml...\n');

let generatedCount = 0;
let skippedCount = 0;

stagesConfig.stages.forEach((stage, index) => {
  const { filename, content } = generateStageDoc(stage, index);
  const filepath = path.join(OUTPUT_DIR, filename);

  // Check if file already exists
  if (fs.existsSync(filepath)) {
    console.log(`⚠️  SKIP: ${filename} (already exists)`);
    skippedCount++;
  } else {
    fs.writeFileSync(filepath, content);
    console.log(`✅ CREATE: ${filename}`);
    generatedCount++;
  }
});

console.log(`\nSummary:`);
console.log(`- Generated: ${generatedCount} files`);
console.log(`- Skipped: ${skippedCount} files`);
console.log(`- Total: ${stagesConfig.stages.length} stages`);
console.log(`\nOutput directory: ${OUTPUT_DIR}`);
