/**
 * Critiques Generator
 * Generates workflow critique documents for analysis
 *
 * Extracted from generate-workflow-docs.js for modularity
 * SD-LEO-REFACTOR-WORKFLOW-DOCS-001
 */

import fs from 'fs';
import path from 'path';
import { workflowDir, ensureDir, padStageId, getStages } from './data-loader.js';

/**
 * Generate workflow critiques
 */
export function generateCritiques() {
  const stages = getStages();
  const dir = path.join(workflowDir, 'critique');
  ensureDir(dir);

  // Generate overview critique
  generateOverviewCritique(dir);

  // Generate individual stage critiques
  stages.forEach(stage => {
    generateStageCritique(dir, stage, stages);
  });

  console.log('Generated critiques');
}

/**
 * Generate overview critique document
 * @param {string} dir - Output directory
 */
function generateOverviewCritique(dir) {
  const overviewPath = path.join(dir, 'overview.md');
  const overviewContent = `# Venture Workflow Critique - Overall Analysis

## Executive Summary
The EHG 40-stage venture workflow represents a comprehensive approach to venture development from ideation to exit. This critique analyzes the overall flow for completeness, feasibility, and optimization opportunities.

## Strengths
1. **Comprehensive Coverage**: All major aspects of venture development are addressed
2. **Clear Ownership**: Each stage has a designated owner (EVA, LEAD, PLAN, EXEC, Chairman)
3. **Progressive Validation**: Multiple validation gates prevent wasted effort
4. **AI Integration**: Leverages AI agents throughout the workflow
5. **Exit-Oriented**: Built with exit strategy from stage 13

## Weaknesses & Gaps

### 1. Sequencing Issues
- **Problem**: Pricing Strategy (Stage 15) depends on Profitability Forecasting (Stage 5), creating circular dependency
- **Impact**: Could delay planning phase
- **Recommendation**: Move preliminary pricing earlier or iterate between stages

### 2. Resource Bottlenecks
- **Problem**: Heavy reliance on EXEC agent in development phase (stages 22-28)
- **Impact**: Potential bottleneck during critical development
- **Recommendation**: Distribute responsibilities or parallelize where possible

### 3. Feedback Loop Delays
- **Problem**: Customer feedback only formally captured at Stage 23
- **Impact**: Late discovery of product-market fit issues
- **Recommendation**: Introduce earlier customer validation touchpoints

### 4. Missing Components
- **Legal/IP Strategy**: No dedicated stage for intellectual property
- **Funding/Investment**: No explicit fundraising stage
- **Team Building**: Limited focus on team scaling
- **Regulatory Compliance**: Embedded but not explicit

### 5. Automation Gaps
- **Manual Handoffs**: Between phases lack automation
- **Data Flow**: No clear data pipeline between stages
- **Metrics Collection**: Manual metrics gathering

## Feasibility Assessment

### Resource Requirements
- **Agents**: 4 AI agents + Chairman oversight
- **Tools**: 15+ integrated tools and services
- **Time**: Estimated 6-12 months for full cycle
- **Budget**: TBD based on venture scale

### Technical Feasibility
- **High Complexity**: Actor model and saga patterns (Stage 27) require expertise
- **Integration Challenge**: 19+ third-party integrations to verify
- **Scalability Concerns**: Multi-venture coordination (Stage 39) needs robust architecture

## Top 10 Fix List
1. Resolve stage 5/15 circular dependency
2. Add dedicated Legal/IP stage
3. Insert early customer validation (stage 7)
4. Automate phase transitions
5. Implement real-time metrics dashboard
6. Add funding/investment stage
7. Enable parallel development execution
8. Formalize all decision gates
9. Create comprehensive rollback procedures
10. Build stage-skip framework for mature ventures

## Conclusion
The workflow is comprehensive but requires refinement for production readiness. Priority should be given to resolving dependencies, adding missing components, and building automation infrastructure.`;

  fs.writeFileSync(overviewPath, overviewContent);
}

/**
 * Generate critique for individual stage
 * @param {string} dir - Output directory
 * @param {Object} stage - Stage object
 * @param {Array} stages - All stages array
 */
function generateStageCritique(dir, stage, stages) {
  const filename = `stage-${padStageId(stage.id)}.md`;
  const filepath = path.join(dir, filename);

  const content = `# Stage ${stage.id} Critique: ${stage.title}

## Rubric Scoring (0-5 scale)

| Criteria | Score | Notes |
|----------|-------|-------|
| Clarity | ${stage.id <= 10 ? '4' : stage.id <= 20 ? '3' : '3'} | ${stage.id <= 10 ? 'Well-defined purpose and outputs' : 'Some ambiguity in requirements'} |
| Feasibility | ${stage.owner === 'EVA' ? '4' : '3'} | ${stage.owner === 'EVA' ? 'Automated execution possible' : 'Requires significant resources'} |
| Testability | 3 | Metrics defined but validation criteria unclear |
| Risk Exposure | ${stage.id === 3 || stage.id === 13 || stage.id === 30 ? '4' : '2'} | ${stage.id === 3 || stage.id === 13 || stage.id === 30 ? 'Critical decision point' : 'Moderate risk level'} |
| Automation Leverage | ${stage.owner === 'EVA' ? '5' : '3'} | ${stage.owner === 'EVA' ? 'Fully automatable' : 'Partial automation possible'} |
| Data Readiness | 3 | Input/output defined but data flow unclear |
| Security/Compliance | ${stage.id === 26 ? '5' : '2'} | ${stage.id === 26 ? 'Security-focused stage' : 'Standard security requirements'} |
| UX/Customer Signal | ${[1, 3, 23, 31, 32].includes(stage.id) ? '4' : '1'} | ${[1, 3, 23, 31, 32].includes(stage.id) ? 'Direct customer interaction' : 'No customer touchpoint'} |
| **Overall** | **3.0** | Functional but needs optimization |

## Strengths
- Clear ownership (${stage.owner})
- Defined dependencies${stage.depends_on.length > 0 ? ` (${stage.depends_on.join(', ')})` : ' (standalone)'}
- ${stage.metrics.length} metrics identified

## Weaknesses
- Limited automation for manual processes
- Unclear rollback procedures
- Missing specific tool integrations
- No explicit error handling

## Specific Improvements

### 1. Enhance Automation
- **Current State**: ${stage.owner === 'EVA' ? 'Automated' : 'Manual process'}
- **Target State**: 80% automation
- **Action**: ${stage.owner === 'EVA' ? 'Optimize existing automation' : 'Build automation workflows'}

### 2. Define Clear Metrics
- **Current Metrics**: ${stage.metrics.join(', ') || 'None defined'}
- **Missing**: Threshold values, measurement frequency
- **Action**: Establish concrete KPIs with targets

### 3. Improve Data Flow
- **Current Inputs**: ${stage.inputs.length} defined
- **Current Outputs**: ${stage.outputs.length} defined
- **Gap**: Data transformation and validation rules
- **Action**: Document data schemas and transformations

## Dependencies Analysis
- **Upstream Dependencies**: ${stage.depends_on.join(', ') || 'None'}
- **Downstream Impact**: Stages ${stages.filter(s => s.depends_on.includes(stage.id)).map(s => s.id).join(', ') || 'None identified'}
- **Critical Path**: ${stage.id <= 10 || stage.id === 21 || stage.id === 30 ? 'Yes' : 'No'}

## Recommendations Priority
1. ${stage.owner !== 'EVA' ? 'Increase automation level' : 'Optimize existing automation'}
2. Define concrete success metrics with thresholds
3. Document data transformation rules
4. ${[1, 3, 23, 31, 32].includes(stage.id) ? 'Enhance customer feedback mechanisms' : 'Add customer validation touchpoint'}
5. Create detailed rollback procedures`;

  fs.writeFileSync(filepath, content);
}
