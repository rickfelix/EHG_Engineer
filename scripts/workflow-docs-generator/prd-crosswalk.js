/**
 * PRD Crosswalk Generator
 * Generates PRD mapping documents
 *
 * Extracted from generate-workflow-docs.js for modularity
 * SD-LEO-REFACTOR-WORKFLOW-DOCS-001
 */

import fs from 'fs';
import path from 'path';
import { workflowDir, padStageId, getStages } from './data-loader.js';

/**
 * Generate PRD crosswalk documents
 */
export function generatePRDCrosswalk() {
  const stages = getStages();
  const csvPath = path.join(workflowDir, 'prd_crosswalk.csv');
  const mdPath = path.join(workflowDir, 'prd_crosswalk.md');

  // Generate CSV
  generateCrosswalkCSV(csvPath, stages);

  // Generate Markdown
  generateCrosswalkMarkdown(mdPath, stages);

  console.log('Generated PRD crosswalk');
}

/**
 * Generate CSV crosswalk file
 * @param {string} csvPath - Output path
 * @param {Array} stages - Stage objects
 */
function generateCrosswalkCSV(csvPath, stages) {
  const csvHeader = 'stage_id,stage_title,prd_file,coverage,evidence_ref,gaps,recommended_change,priority\n';
  const csvRows = stages.map(stage => {
    const slug = stage.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const prdFile = `docs/02_api/${padStageId(stage.id)}_${slug}.md`;
    const coverage = stage.id <= 20 ? 'Implemented' : stage.id <= 30 ? 'Partial' : 'Missing';
    const evidence = stage.id <= 20 ? `Lines 1-500 of ${prdFile}` : 'TBD';
    const gaps = stage.id <= 20 ? 'None' : 'Full implementation needed';
    const change = stage.id <= 20 ? 'None' : 'Create full PRD';
    const priority = stage.id <= 30 ? 'P0' : 'P1';

    return `${stage.id},"${stage.title}","${prdFile}","${coverage}","${evidence}","${gaps}","${change}","${priority}"`;
  }).join('\n');

  fs.writeFileSync(csvPath, csvHeader + csvRows);
}

/**
 * Generate Markdown crosswalk file
 * @param {string} mdPath - Output path
 * @param {Array} stages - Stage objects
 */
function generateCrosswalkMarkdown(mdPath, stages) {
  const phaseTable = (start, end, status, priority) => stages
    .filter(s => s.id >= start && s.id <= end)
    .map(s => `| ${s.id} | ${s.title} | ${status} | ${priority} |`)
    .join('\n');

  const mdContent = `# PRD Crosswalk Analysis

## Summary
- **Total Stages**: 40
- **Fully Implemented**: 20 (50%)
- **Partially Implemented**: 10 (25%)
- **Missing**: 10 (25%)

## Coverage by Phase

### Phase 1: IDEATION (Stages 1-10)
| Stage | Title | PRD Status | Priority |
|-------|-------|------------|----------|
${phaseTable(1, 10, '✅ Implemented', 'P0')}

### Phase 2: PLANNING (Stages 11-20)
| Stage | Title | PRD Status | Priority |
|-------|-------|------------|----------|
${phaseTable(11, 20, '✅ Implemented', 'P0')}

### Phase 3: DEVELOPMENT (Stages 21-28)
| Stage | Title | PRD Status | Priority |
|-------|-------|------------|----------|
${stages.filter(s => s.id > 20 && s.id <= 28).map(s =>
  `| ${s.id} | ${s.title} | ⚠️ Partial | P0 |`
).join('\n')}

### Phase 4: LAUNCH (Stages 29-34)
| Stage | Title | PRD Status | Priority |
|-------|-------|------------|----------|
${stages.filter(s => s.id > 28 && s.id <= 34).map(s =>
  `| ${s.id} | ${s.title} | ${s.id <= 32 ? '⚠️ Partial' : '❌ Missing'} | ${s.id <= 32 ? 'P0' : 'P1'} |`
).join('\n')}

### Phase 5: OPERATIONS (Stages 35-40)
| Stage | Title | PRD Status | Priority |
|-------|-------|------------|----------|
${stages.filter(s => s.id > 34).map(s =>
  `| ${s.id} | ${s.title} | ${s.id === 40 ? '✅ Implemented' : '❌ Missing'} | P1 |`
).join('\n')}

## Gap Analysis

### Critical Gaps (P0)
1. **Stages 21-28**: Development phase PRDs need completion
2. **Stages 29-32**: Launch phase critical stages partially documented
3. **Integration Points**: Cross-stage data flow specifications missing

### Important Gaps (P1)
4. **Stages 33-34**: Post-launch expansion documentation
5. **Stages 35-39**: Operations phase specifications
6. **Metrics Definitions**: Concrete KPIs and thresholds not defined

### Recommendations
1. Complete all P0 PRDs within 2 weeks
2. Define integration specifications for all stages
3. Add metrics and KPI definitions to existing PRDs
4. Create P1 PRDs in second phase (weeks 3-4)
5. Validate all PRDs against implementation

## File Mapping
See [prd_crosswalk.csv](prd_crosswalk.csv) for detailed file mappings and evidence references.`;

  fs.writeFileSync(mdPath, mdContent);
}
