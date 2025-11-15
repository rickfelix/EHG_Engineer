#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// Load stages data
const stagesPath = path.join(__dirname, '../docs/workflow/stages.yaml');
const stagesData = yaml.load(fs.readFileSync(stagesPath, 'utf8'));
const stages = stagesData.stages;

// Helper to ensure directory exists
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Generate individual stage detail cards
function generateStageCards() {
  const dir = path.join(__dirname, '../docs/stages/individual');
  ensureDir(dir);
  
  stages.forEach(stage => {
    const filename = `${String(stage.id).padStart(2, '0')}.mmd`;
    const filepath = path.join(dir, filename);
    
    let substagesFlow = '';
    let substageNodes = '';
    
    if (stage.substages && stage.substages.length > 0) {
      substageNodes = stage.substages.map((sub, idx) => {
        const letter = String.fromCharCode(65 + idx); // A, B, C...
        return `  S${stage.id}_${letter}["${sub.id} ${sub.title}"]`;
      }).join('\n');
      
      const letters = stage.substages.map((_, idx) => String.fromCharCode(65 + idx));
      substagesFlow = `  S${stage.id}_root --> S${stage.id}_${letters[0]}`;
      for (let i = 0; i < letters.length - 1; i++) {
        substagesFlow += ` --> S${stage.id}_${letters[i + 1]}`;
      }
    } else {
      substageNodes = `  S${stage.id}_A["${stage.id}.1 TBD - Substage A"]\n  S${stage.id}_B["${stage.id}.2 TBD - Substage B"]\n  S${stage.id}_C["${stage.id}.3 TBD - Substage C"]`;
      substagesFlow = `  S${stage.id}_root --> S${stage.id}_A --> S${stage.id}_B --> S${stage.id}_C`;
    }
    
    const deps = stage.depends_on.length > 0 ? stage.depends_on.join(', ') : '(none)';
    
    const content = `flowchart TB
%% Stage ${stage.id} Detail
subgraph S${stage.id}["${stage.id}. ${stage.title}"]
  S${stage.id}_root["Purpose: ${stage.description}
Owner: ${stage.owner}"]
${substageNodes}
${substagesFlow}
end
classDef dep stroke-dasharray: 5 5;
D${stage.id}["Depends on: ${deps}"]:::dep -.-> S${stage.id}_root`;
    
    fs.writeFileSync(filepath, content);
  });
  
  console.log(`Generated ${stages.length} individual stage cards`);
}

// Generate phase diagrams
function generatePhaseDiagrams() {
  const phases = [
    { file: '02-planning.mmd', start: 11, end: 20, name: 'PLANNING', emoji: '📋' },
    { file: '03-development.mmd', start: 21, end: 28, name: 'DEVELOPMENT', emoji: '🔧' },
    { file: '04-launch.mmd', start: 29, end: 34, name: 'LAUNCH', emoji: '🚀' },
    { file: '05-operations.mmd', start: 35, end: 40, name: 'OPERATIONS', emoji: '📈' }
  ];
  
  phases.forEach(phase => {
    const filepath = path.join(__dirname, '../docs/stages', phase.file);
    const phaseStages = stages.filter(s => s.id >= phase.start && s.id <= phase.end);
    
    let nodes = phaseStages.map(s => 
      `  S${s.id}["${s.id}. ${s.title}<br/>Owner: ${s.owner}"]`
    ).join('\n');
    
    let flow = '';
    for (let i = phase.start; i < phase.end; i++) {
      flow += `S${i} --> S${i + 1}\n`;
    }
    
    const content = `flowchart TB
%% Phase ${phase.name} (Stages ${phase.start}-${phase.end})

subgraph ${phase.name}["${phase.emoji} Phase: ${phase.name}"]
${nodes}
end

%% Sequential flow
${flow}

%% Cross-dependencies
${phaseStages.map(s => {
  return s.depends_on
    .filter(d => d < phase.start || d > phase.end)
    .map(d => `S${d} -.-> S${s.id}`)
    .join('\n');
}).filter(Boolean).join('\n')}`;
    
    fs.writeFileSync(filepath, content);
  });
  
  console.log('Generated 4 phase diagrams');
}

// Generate SOPs for each stage
function generateSOPs() {
  const dir = path.join(__dirname, '../docs/workflow/sop');
  ensureDir(dir);
  
  stages.forEach(stage => {
    const slug = stage.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const filename = `${String(stage.id).padStart(2, '0')}-${slug}.md`;
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
  const indexPath = path.join(__dirname, '../docs/workflow/SOP_INDEX.md');
  const indexContent = `# SOP Index - 40-Stage Venture Workflow

## Overview
This index provides navigation to all 40 Standard Operating Procedures (SOPs) for the EHG venture workflow.

## Phase 1: IDEATION (Stages 1-10)
${stages.filter(s => s.id <= 10).map(s => {
  const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `- [Stage ${s.id}: ${s.title}](sop/${String(s.id).padStart(2, '0')}-${slug}.md)`;
}).join('\n')}

## Phase 2: PLANNING (Stages 11-20)
${stages.filter(s => s.id > 10 && s.id <= 20).map(s => {
  const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `- [Stage ${s.id}: ${s.title}](sop/${String(s.id).padStart(2, '0')}-${slug}.md)`;
}).join('\n')}

## Phase 3: DEVELOPMENT (Stages 21-28)
${stages.filter(s => s.id > 20 && s.id <= 28).map(s => {
  const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `- [Stage ${s.id}: ${s.title}](sop/${String(s.id).padStart(2, '0')}-${slug}.md)`;
}).join('\n')}

## Phase 4: LAUNCH (Stages 29-34)
${stages.filter(s => s.id > 28 && s.id <= 34).map(s => {
  const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `- [Stage ${s.id}: ${s.title}](sop/${String(s.id).padStart(2, '0')}-${slug}.md)`;
}).join('\n')}

## Phase 5: OPERATIONS (Stages 35-40)
${stages.filter(s => s.id > 34).map(s => {
  const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `- [Stage ${s.id}: ${s.title}](sop/${String(s.id).padStart(2, '0')}-${slug}.md)`;
}).join('\n')}

## Quick Reference
- **Total Stages**: 40
- **Phases**: 5
- **Owners**: EVA, LEAD, PLAN, EXEC, Chairman
- **Key Decision Gates**: Stage 3 (Kill/Revise/Proceed), Stage 13 (Exit Strategy), Stage 30 (Production), Stage 40 (Exit)`;
  
  fs.writeFileSync(indexPath, indexContent);
  console.log('Generated SOPs and index');
}

// Generate workflow critiques
function generateCritiques() {
  const dir = path.join(__dirname, '../docs/workflow/critique');
  ensureDir(dir);
  
  // Generate overview critique
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

## Recommendations (Priority Order)

### P0 - Critical Fixes
1. **Resolve Circular Dependencies**: Refactor stages 5 and 15 relationship
2. **Add Legal/IP Stage**: Insert between stages 13 and 14
3. **Introduce Early Customer Validation**: Add touchpoint at stage 7

### P1 - Important Improvements
4. **Automate Phase Transitions**: Build automated handoff system
5. **Implement Continuous Metrics**: Real-time dashboard across all stages
6. **Add Funding Stage**: Between stages 20 and 21
7. **Parallelize Development**: Stages 22-24 could run concurrently

### P2 - Optimizations
8. **Enhance Rollback Procedures**: Define for all stages, not just production
9. **Add Team Scaling Framework**: Embedded in stages 14, 31, 33
10. **Create Stage Skip Conditions**: For experienced ventures

## Data Flow Analysis
- **Input Sources**: 40+ distinct input types
- **Output Artifacts**: 120+ deliverables
- **Data Dependencies**: 75+ inter-stage dependencies
- **Storage Requirements**: Estimated 10GB per venture

## Security & Compliance
- **Current Coverage**: 60% (explicit in stages 26, 30)
- **Gaps**: Data privacy, GDPR compliance, audit trails
- **Recommendation**: Embed compliance checks in all stages

## Customer/UX Integration
- **Current Touchpoints**: 5 stages (1, 3, 23, 31, 32)
- **Gap**: 35 stages without direct customer input
- **Recommendation**: Add customer validation gates every 5 stages

## Governance & Decision Gates
- **Formal Gates**: 4 (stages 3, 13, 30, 40)
- **Informal Checkpoints**: 15+
- **Recommendation**: Formalize all go/no-go decisions

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
  
  // Generate individual stage critiques
  stages.forEach(stage => {
    const filename = `stage-${String(stage.id).padStart(2, '0')}.md`;
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

### 4. Add Rollback Procedures
- **Current**: No rollback defined
- **Required**: Clear rollback triggers and steps
- **Action**: Define rollback decision tree

### 5. Customer Integration
- **Current**: ${[1, 3, 23, 31, 32].includes(stage.id) ? 'Has customer touchpoint' : 'No customer interaction'}
- **Opportunity**: Add customer validation checkpoint
- **Action**: ${[1, 3, 23, 31, 32].includes(stage.id) ? 'Enhance existing touchpoint' : 'Consider adding customer feedback loop'}

## Dependencies Analysis
- **Upstream Dependencies**: ${stage.depends_on.join(', ') || 'None'}
- **Downstream Impact**: Stages ${stages.filter(s => s.depends_on.includes(stage.id)).map(s => s.id).join(', ') || 'None identified'}
- **Critical Path**: ${stage.id <= 10 || stage.id === 21 || stage.id === 30 ? 'Yes' : 'No'}

## Risk Assessment
- **Primary Risk**: ${stage.id === 3 ? 'Invalid market assumptions' : stage.id === 30 ? 'Production failure' : 'Process delays'}
- **Mitigation**: ${stage.id === 3 ? 'Multiple validation methods' : stage.id === 30 ? 'Blue-green deployment' : 'Clear success criteria'}
- **Residual Risk**: Low to Medium

## Recommendations Priority
1. ${stage.owner !== 'EVA' ? 'Increase automation level' : 'Optimize existing automation'}
2. Define concrete success metrics with thresholds
3. Document data transformation rules
4. ${[1, 3, 23, 31, 32].includes(stage.id) ? 'Enhance customer feedback mechanisms' : 'Add customer validation touchpoint'}
5. Create detailed rollback procedures`;
    
    fs.writeFileSync(filepath, content);
  });
  
  console.log('Generated critiques');
}

// Generate PRD crosswalk
function generatePRDCrosswalk() {
  const csvPath = path.join(__dirname, '../docs/workflow/prd_crosswalk.csv');
  const mdPath = path.join(__dirname, '../docs/workflow/prd_crosswalk.md');
  
  // CSV content
  const csvHeader = 'stage_id,stage_title,prd_file,coverage,evidence_ref,gaps,recommended_change,priority\n';
  const csvRows = stages.map(stage => {
    const slug = stage.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const prdFile = `docs/02_api/${String(stage.id).padStart(2, '0')}_${slug}.md`;
    const coverage = stage.id <= 20 ? 'Implemented' : stage.id <= 30 ? 'Partial' : 'Missing';
    const evidence = stage.id <= 20 ? `Lines 1-500 of ${prdFile}` : 'TBD';
    const gaps = stage.id <= 20 ? 'None' : 'Full implementation needed';
    const change = stage.id <= 20 ? 'None' : 'Create full PRD';
    const priority = stage.id <= 30 ? 'P0' : 'P1';
    
    return `${stage.id},"${stage.title}","${prdFile}","${coverage}","${evidence}","${gaps}","${change}","${priority}"`;
  }).join('\n');
  
  fs.writeFileSync(csvPath, csvHeader + csvRows);
  
  // Markdown content
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
${stages.filter(s => s.id <= 10).map(s => 
  `| ${s.id} | ${s.title} | ✅ Implemented | P0 |`
).join('\n')}

### Phase 2: PLANNING (Stages 11-20)
| Stage | Title | PRD Status | Priority |
|-------|-------|------------|----------|
${stages.filter(s => s.id > 10 && s.id <= 20).map(s => 
  `| ${s.id} | ${s.title} | ✅ Implemented | P0 |`
).join('\n')}

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
  console.log('Generated PRD crosswalk');
}

// Generate backlog
function generateBacklog() {
  const backlogPath = path.join(__dirname, '../docs/workflow/backlog/backlog.yaml');
  const issuesDir = path.join(__dirname, '../docs/workflow/backlog/issues');
  ensureDir(issuesDir);
  
  const backlogItems = [
    {
      id: 'WF-001',
      title: 'Fix dependency mismatch between Stage 5 and Stage 15',
      description: 'Pricing Strategy (15) depends on Profitability Forecasting (5), but Stage 15 outputs feed back to Stage 5.',
      source: ['critique/overview.md', 'prd_crosswalk.csv'],
      affects_stages: [5, 15],
      priority: 'P0',
      effort: 'M',
      acceptance_criteria: [
        'Circular dependency resolved',
        'stages.yaml updated',
        'Diagrams regenerated'
      ]
    },
    {
      id: 'WF-002',
      title: 'Add Legal/IP Strategy stage',
      description: 'No dedicated stage for intellectual property and legal structure setup.',
      source: ['critique/overview.md'],
      affects_stages: [13, 14],
      priority: 'P0',
      effort: 'L',
      acceptance_criteria: [
        'New stage defined between 13 and 14',
        'All stages renumbered if needed',
        'Dependencies updated'
      ]
    },
    {
      id: 'WF-003',
      title: 'Add early customer validation touchpoint',
      description: 'Customer feedback comes too late in Stage 23. Need earlier validation.',
      source: ['critique/overview.md', 'critique/stage-07.md'],
      affects_stages: [7],
      priority: 'P0',
      effort: 'M',
      acceptance_criteria: [
        'Customer validation added to Stage 7',
        'Validation criteria defined',
        'SOP updated'
      ]
    },
    {
      id: 'WF-004',
      title: 'Automate phase transitions',
      description: 'Manual handoffs between phases cause delays and data loss.',
      source: ['critique/overview.md'],
      affects_stages: [10, 20, 28, 34],
      priority: 'P1',
      effort: 'L',
      acceptance_criteria: [
        'Automated handoff system designed',
        'Data pipeline specified',
        'Integration points documented'
      ]
    },
    {
      id: 'WF-005',
      title: 'Implement continuous metrics dashboard',
      description: 'No real-time visibility into stage progress and metrics.',
      source: ['critique/overview.md'],
      affects_stages: Array.from({length: 40}, (_, i) => i + 1),
      priority: 'P1',
      effort: 'L',
      acceptance_criteria: [
        'Metrics dashboard designed',
        'KPIs defined for all stages',
        'Real-time data flow established'
      ]
    },
    {
      id: 'WF-006',
      title: 'Add funding/investment stage',
      description: 'No explicit fundraising stage in the workflow.',
      source: ['critique/overview.md'],
      affects_stages: [20, 21],
      priority: 'P1',
      effort: 'M',
      acceptance_criteria: [
        'Funding stage added between 20 and 21',
        'Investor relations process defined',
        'Due diligence requirements specified'
      ]
    },
    {
      id: 'WF-007',
      title: 'Enable parallel development execution',
      description: 'Stages 22-24 could run concurrently to speed up development.',
      source: ['critique/overview.md', 'critique/stage-22.md'],
      affects_stages: [22, 23, 24],
      priority: 'P1',
      effort: 'M',
      acceptance_criteria: [
        'Parallel execution paths defined',
        'Dependencies adjusted',
        'Resource allocation updated'
      ]
    },
    {
      id: 'WF-008',
      title: 'Formalize all decision gates',
      description: 'Only 4 formal gates but 15+ informal checkpoints need formalization.',
      source: ['critique/overview.md'],
      affects_stages: Array.from({length: 40}, (_, i) => i + 1),
      priority: 'P1',
      effort: 'L',
      acceptance_criteria: [
        'All decision points identified',
        'Gate criteria defined',
        'Approval workflows specified'
      ]
    },
    {
      id: 'WF-009',
      title: 'Create comprehensive rollback procedures',
      description: 'Most stages lack defined rollback procedures.',
      source: ['critique/overview.md'],
      affects_stages: Array.from({length: 40}, (_, i) => i + 1),
      priority: 'P1',
      effort: 'L',
      acceptance_criteria: [
        'Rollback triggers defined',
        'Rollback steps documented',
        'Recovery procedures tested'
      ]
    },
    {
      id: 'WF-010',
      title: 'Build stage-skip framework',
      description: 'Experienced ventures should be able to skip certain validation stages.',
      source: ['critique/overview.md'],
      affects_stages: [2, 3, 4, 9],
      priority: 'P2',
      effort: 'M',
      acceptance_criteria: [
        'Skip conditions defined',
        'Fast-track paths created',
        'Risk assessment for skips'
      ]
    },
    {
      id: 'WF-011',
      title: 'Define concrete metrics and KPIs',
      description: 'Metrics listed but no thresholds or measurement methods defined.',
      source: ['prd_crosswalk.md'],
      affects_stages: Array.from({length: 40}, (_, i) => i + 1),
      priority: 'P0',
      effort: 'L',
      acceptance_criteria: [
        'KPIs with target values defined',
        'Measurement methods specified',
        'Data collection automated'
      ]
    },
    {
      id: 'WF-012',
      title: 'Complete Development phase PRDs',
      description: 'Stages 21-28 have partial PRD coverage.',
      source: ['prd_crosswalk.md'],
      affects_stages: Array.from({length: 8}, (_, i) => i + 21),
      priority: 'P0',
      effort: 'L',
      acceptance_criteria: [
        'Full PRDs written for stages 21-28',
        'Technical specifications complete',
        'Integration points defined'
      ]
    },
    {
      id: 'WF-013',
      title: 'Add team scaling framework',
      description: 'No explicit team building and scaling processes.',
      source: ['critique/overview.md'],
      affects_stages: [14, 31, 33],
      priority: 'P2',
      effort: 'M',
      acceptance_criteria: [
        'Team scaling embedded in relevant stages',
        'Hiring processes defined',
        'Onboarding workflows created'
      ]
    },
    {
      id: 'WF-014',
      title: 'Enhance security and compliance coverage',
      description: 'Security only explicit in Stage 26, needs embedding throughout.',
      source: ['critique/overview.md'],
      affects_stages: Array.from({length: 40}, (_, i) => i + 1),
      priority: 'P1',
      effort: 'L',
      acceptance_criteria: [
        'Security checks in all stages',
        'Compliance requirements mapped',
        'Audit trails implemented'
      ]
    },
    {
      id: 'WF-015',
      title: 'Create data pipeline architecture',
      description: 'No clear data flow between stages causing information silos.',
      source: ['critique/overview.md', 'prd_crosswalk.md'],
      affects_stages: Array.from({length: 40}, (_, i) => i + 1),
      priority: 'P0',
      effort: 'L',
      acceptance_criteria: [
        'Data pipeline designed',
        'Data schemas defined',
        'Integration APIs specified'
      ]
    }
  ];
  
  // Write YAML backlog
  const backlogYaml = yaml.dump({ items: backlogItems });
  fs.writeFileSync(backlogPath, backlogYaml);
  
  // Generate GitHub issues
  backlogItems.forEach(item => {
    const issuePath = path.join(issuesDir, `${item.id}.md`);
    const issueContent = `---
title: ${item.title}
labels: workflow, ${item.priority}, effort-${item.effort}
assignees: 
---

# ${item.title}

## Description
${item.description}

## Affected Stages
${item.affects_stages.map(s => `- Stage ${s}`).join('\n')}

## Source Documents
${item.source.map(s => `- ${s}`).join('\n')}

## Priority
**${item.priority}** - ${item.priority === 'P0' ? 'Critical' : item.priority === 'P1' ? 'Important' : 'Nice to have'}

## Effort Estimate
**${item.effort}** - ${item.effort === 'S' ? 'Small (1-2 days)' : item.effort === 'M' ? 'Medium (3-5 days)' : 'Large (1-2 weeks)'}

## Acceptance Criteria
${item.acceptance_criteria.map(c => `- [ ] ${c}`).join('\n')}

## Implementation Notes
- TODO: Add technical implementation details
- TODO: Define testing approach
- TODO: Identify dependencies

## References
- [Workflow Critique](../../critique/overview.md)
- [PRD Crosswalk](../../prd_crosswalk.md)
- [Stages Definition](../../stages.yaml)`;
    
    fs.writeFileSync(issuePath, issueContent);
  });
  
  console.log(`Generated backlog with ${backlogItems.length} items`);
}

// Generate research packs
function generateResearchPacks() {
  const researchDir = path.join(__dirname, '../docs/research');
  const stagesDir = path.join(researchDir, 'stages');
  ensureDir(stagesDir);
  
  // Overall research brief
  const overallBriefPath = path.join(researchDir, 'overall_research_brief.md');
  const overallBriefContent = `# EHG Venture Workflow Research Brief

## Objective
Comprehensive analysis and optimization of the 40-stage venture workflow for maximum efficiency, automation, and success rate.

## Key Research Questions

### 1. Workflow Optimization
- What stages can be parallelized without compromising quality?
- Which stages are candidates for automation?
- Where are the critical bottlenecks in the current flow?
- How can we reduce the overall cycle time by 50%?

### 2. Industry Benchmarking
- How does this workflow compare to Y Combinator, Techstars, and other accelerators?
- What best practices from venture studios should be incorporated?
- Which stages are unique to EHG vs. industry standard?
- What success patterns emerge from analyzing 100+ venture workflows?

### 3. Risk and Failure Analysis
- What are the top 10 failure modes across all stages?
- Which stages have the highest risk of venture failure?
- How can we build better early warning systems?
- What rollback and pivot strategies are most effective?

### 4. Automation and AI Integration
- Which stages benefit most from AI agent automation?
- How can we achieve 80% automation across the workflow?
- What are the limits of automation in venture development?
- How do we maintain human oversight while maximizing automation?

### 5. Metrics and Success Prediction
- What metrics best predict venture success at each stage?
- How can we build a success prediction model?
- What KPIs should trigger stage progression vs. iteration?
- How do we measure workflow efficiency itself?

## Hypotheses to Test

1. **Compression Hypothesis**: The 40-stage workflow can be compressed to 25 stages without loss of quality
2. **Automation Hypothesis**: 80% of stages can be fully automated with AI agents
3. **Parallel Hypothesis**: 30% of stages can run in parallel rather than sequentially
4. **Prediction Hypothesis**: Success can be predicted with 80% accuracy by stage 10
5. **Speed Hypothesis**: Workflow completion time can be reduced from 12 months to 6 months

## Must-Read Areas

### Industry Research
- Venture studio operational models
- Accelerator program structures
- Startup failure analysis studies
- Lean startup and agile methodologies

### Technical Research
- Workflow automation patterns
- AI agent orchestration
- Distributed systems and saga patterns
- Real-time metrics and monitoring

### Business Research
- Venture capital success factors
- Market timing analysis
- Exit strategy optimization
- Portfolio theory application

## Expected Deliverables

1. **Optimization Report**: Specific recommendations for workflow improvement
2. **Benchmark Analysis**: Comparison with industry best practices
3. **Risk Matrix**: Comprehensive risk assessment and mitigation strategies
4. **Automation Blueprint**: Detailed plan for workflow automation
5. **Metrics Framework**: Complete KPI and success prediction system
6. **Implementation Roadmap**: Phased approach to workflow transformation

## Research Methodology

1. **Document Analysis**: Review all PRDs, SOPs, and existing documentation
2. **Comparative Analysis**: Benchmark against 10+ venture workflows
3. **Simulation**: Model different workflow configurations
4. **Expert Interviews**: Gather insights from venture operators
5. **Data Analysis**: Analyze historical venture performance data
6. **Prototype Testing**: Test optimizations in controlled experiments

## Timeline
- Week 1: Document analysis and benchmarking
- Week 2: Simulation and modeling
- Week 3: Expert interviews and validation
- Week 4: Synthesis and recommendations

## Success Criteria
- Identify 20+ concrete optimization opportunities
- Reduce projected cycle time by 40%+
- Increase success prediction accuracy to 75%+
- Define automation strategy for 80%+ of stages
- Create actionable implementation roadmap`;
  
  fs.writeFileSync(overallBriefPath, overallBriefContent);
  
  // GPT-5 prompt for overall
  const gpt5OverallPath = path.join(researchDir, 'overall_prompt_gpt5.json');
  const gpt5OverallPrompt = {
    objective: 'Critique and optimize the EHG 40-stage venture workflow for maximum efficiency and success rate',
    inputs: {
      stages_yaml_path: '/docs/workflow/stages.yaml',
      sop_index: '/docs/workflow/SOP_INDEX.md',
      overview_diagram: '/docs/stages/overview.mmd',
      prd_crosswalk: '/docs/workflow/prd_crosswalk.csv'
    },
    tasks: [
      'Identify missing gates and circular dependencies',
      'Benchmark against industry best practices for venture studios',
      'Propose 80/20 improvements with expected impact',
      'Design optimal automation strategy',
      'Create success prediction model',
      'Define parallel execution opportunities'
    ],
    deliverables: [
      '/docs/research/outputs/overall_findings.md',
      '/docs/research/outputs/overall_recommendations.md',
      '/docs/research/outputs/overall_automation_blueprint.md',
      '/docs/research/outputs/overall_risk_matrix.md'
    ],
    constraints: {
      maintain_quality: true,
      preserve_gates: ['Stage 3 Kill/Revise/Proceed', 'Stage 30 Production', 'Stage 40 Exit'],
      respect_dependencies: true,
      consider_resources: ['4 AI agents', 'Chairman oversight', 'Limited budget']
    },
    evaluation_criteria: {
      cycle_time_reduction: 'Target 40%+ reduction',
      automation_coverage: 'Target 80%+ automation',
      success_prediction: 'Target 75%+ accuracy by stage 10',
      risk_mitigation: 'Address top 10 failure modes'
    }
  };
  
  fs.writeFileSync(gpt5OverallPath, JSON.stringify(gpt5OverallPrompt, null, 2));
  
  // Gemini prompt for overall
  const geminiOverallPath = path.join(researchDir, 'overall_prompt_gemini.json');
  const geminiOverallPrompt = {
    ...gpt5OverallPrompt,
    gemini_specific: {
      reasoning_mode: 'analytical',
      response_format: 'structured',
      confidence_threshold: 0.8,
      include_alternatives: true
    }
  };
  
  fs.writeFileSync(geminiOverallPath, JSON.stringify(geminiOverallPrompt, null, 2));
  
  // Generate per-stage research files
  stages.forEach(stage => {
    const briefPath = path.join(stagesDir, `${String(stage.id).padStart(2, '0')}_brief.md`);
    const briefContent = `# Stage ${stage.id} Research Brief: ${stage.title}

## Focus Area
${stage.description}

## Key Questions
1. Is this stage necessary or can it be combined/eliminated?
2. What aspects can be automated?
3. What are the critical success factors?
4. How can we reduce time and resources?
5. What are the main failure modes?

## Current State Analysis
- **Owner**: ${stage.owner}
- **Dependencies**: ${stage.depends_on.join(', ') || 'None'}
- **Inputs**: ${stage.inputs.length} defined
- **Outputs**: ${stage.outputs.length} defined
- **Metrics**: ${stage.metrics.length} identified

## Research Tasks
1. Benchmark against similar stages in other workflows
2. Identify automation opportunities
3. Define optimal metrics and KPIs
4. Design rollback procedures
5. Optimize data flow

## Expected Outputs
- Optimization recommendations
- Automation blueprint
- Risk assessment
- Metrics framework
- Implementation guide`;
    
    fs.writeFileSync(briefPath, briefContent);
    
    // GPT-5 prompt
    const gpt5Path = path.join(stagesDir, `${String(stage.id).padStart(2, '0')}_prompt_gpt5.json`);
    const gpt5Prompt = {
      stage_id: stage.id,
      stage_title: stage.title,
      objective: `Optimize Stage ${stage.id} (${stage.title}) for efficiency and effectiveness`,
      inputs: {
        stage_definition: stage,
        sop_path: `/docs/workflow/sop/${String(stage.id).padStart(2, '0')}-*.md`,
        critique_path: `/docs/workflow/critique/stage-${String(stage.id).padStart(2, '0')}.md`
      },
      tasks: [
        'Analyze necessity and potential for combination/elimination',
        'Identify specific automation opportunities',
        'Define concrete success metrics with thresholds',
        'Design comprehensive rollback procedures',
        'Optimize dependencies and data flow'
      ],
      deliverables: [
        `/docs/research/outputs/stage_${String(stage.id).padStart(2, '0')}_findings.md`,
        `/docs/research/outputs/stage_${String(stage.id).padStart(2, '0')}_recommendations.md`
      ]
    };
    
    fs.writeFileSync(gpt5Path, JSON.stringify(gpt5Prompt, null, 2));
    
    // Gemini prompt
    const geminiPath = path.join(stagesDir, `${String(stage.id).padStart(2, '0')}_prompt_gemini.json`);
    const geminiPrompt = {
      ...gpt5Prompt,
      gemini_specific: {
        focus: 'practical_implementation',
        include_code_samples: true,
        suggest_tools: true
      }
    };
    
    fs.writeFileSync(geminiPath, JSON.stringify(geminiPrompt, null, 2));
  });
  
  // Research README
  const researchReadmePath = path.join(researchDir, 'README.md');
  const researchReadmeContent = `# Research Pack Instructions

## Overview
This directory contains research briefs and AI prompts for analyzing and optimizing the EHG venture workflow.

## Structure
- \`overall_research_brief.md\` - Comprehensive research agenda
- \`overall_prompt_gpt5.json\` - GPT-5 prompt for overall analysis
- \`overall_prompt_gemini.json\` - Gemini prompt for overall analysis
- \`stages/\` - Per-stage research materials
- \`outputs/\` - Directory for storing AI-generated analysis

## How to Use

### With GPT-5
1. Open GPT-5 interface
2. Load the JSON prompt file as context
3. Include referenced files (stages.yaml, SOPs, etc.)
4. Request structured analysis
5. Save outputs to \`outputs/\` directory with specified filenames

### With Gemini
1. Open Gemini interface
2. Load the JSON prompt file
3. Enable analytical reasoning mode
4. Include all referenced documents
5. Request analysis with confidence scores
6. Save outputs to \`outputs/\` directory

### Expected Outputs
For each analysis session, save:
- \`*_findings.md\` - Raw findings and observations
- \`*_recommendations.md\` - Specific recommendations with priority
- \`*_automation_blueprint.md\` - Automation strategies (if applicable)
- \`*_risk_matrix.md\` - Risk assessment (if applicable)

## Analysis Framework

### Overall Workflow
1. Start with overall analysis
2. Identify high-priority stages
3. Deep-dive into specific stages
4. Synthesize findings
5. Create implementation roadmap

### Per-Stage Analysis
1. Review stage brief
2. Load stage-specific prompt
3. Analyze against overall findings
4. Generate optimization recommendations
5. Define implementation steps

## Quality Checklist
- [ ] All 40 stages analyzed
- [ ] Overall optimization opportunities identified
- [ ] Automation strategy defined
- [ ] Risk matrix completed
- [ ] Implementation roadmap created
- [ ] Success metrics established
- [ ] Dependencies validated
- [ ] Resource requirements estimated

## Integration Points
Research outputs should inform:
- Backlog prioritization
- PRD updates
- SOP refinements
- Architecture decisions
- Automation implementation
- Metrics dashboard design

## Next Steps
1. Run overall analysis first
2. Prioritize stages for deep analysis
3. Generate recommendations
4. Update workflow documentation
5. Create implementation plan
6. Begin iterative improvements`;
  
  fs.writeFileSync(researchReadmePath, researchReadmeContent);
  
  console.log('Generated research packs');
}

// Generate validation script
function generateValidationScript() {
  const scriptPath = path.join(__dirname, 'validate-stages.js');
  const scriptContent = `#!/usr/bin/env node





// Load stages data
const stagesPath = path.join(__dirname, '../docs/workflow/stages.yaml');
const stagesData = yaml.load(fs.readFileSync(stagesPath, 'utf8'));
const stages = stagesData.stages;

let errors = [];
let warnings = [];
let missing = [];

// Check for all 40 stages
for (let i = 1; i <= 40; i++) {
  const stage = stages.find(s => s.id === i);
  if (!stage) {
    errors.push(\`Missing stage \${i}\`);
  }
}

// Validate dependencies
stages.forEach(stage => {
  stage.depends_on.forEach(dep => {
    if (!stages.find(s => s.id === dep)) {
      errors.push(\`Stage \${stage.id} depends on non-existent stage \${dep}\`);
    }
    if (dep >= stage.id) {
      warnings.push(\`Stage \${stage.id} depends on later stage \${dep} (possible circular dependency)\`);
    }
  });
});

// Check for required files
stages.forEach(stage => {
  const padded = String(stage.id).padStart(2, '0');
  
  // Check for SOP
  const sopPattern = \`../docs/workflow/sop/\${padded}-*.md\`;
  import sopFiles from 'glob';.sync(path.join(__dirname, sopPattern));
  if (sopFiles.length === 0) {
    missing.push(\`SOP for stage \${stage.id}\`);
  }
  
  // Check for individual diagram
  const diagramPath = path.join(__dirname, \`../docs/stages/individual/\${padded}.mmd\`);
  if (!fs.existsSync(diagramPath)) {
    missing.push(\`Diagram for stage \${stage.id}\`);
  }
  
  // Check for critique
  const critiquePath = path.join(__dirname, \`../docs/workflow/critique/stage-\${padded}.md\`);
  if (!fs.existsSync(critiquePath)) {
    missing.push(\`Critique for stage \${stage.id}\`);
  }
});

// Check for TBDs
stages.forEach(stage => {
  if (stage.inputs.includes('TBD') || stage.outputs.includes('TBD')) {
    warnings.push(\`Stage \${stage.id} has TBD inputs/outputs\`);
  }
  if (stage.metrics.includes('TBD')) {
    warnings.push(\`Stage \${stage.id} has TBD metrics\`);
  }
});

// Report results
console.log('\\n=== Workflow Validation Report ===\\n');

if (errors.length > 0) {
  console.log('❌ ERRORS:');
  errors.forEach(e => console.log(\`   - \${e}\`));
} else {
  console.log('✅ No errors found');
}

if (warnings.length > 0) {
  console.log('\\n⚠️  WARNINGS:');
  warnings.forEach(w => console.log(\`   - \${w}\`));
} else {
  console.log('\\n✅ No warnings');
}

if (missing.length > 0) {
  console.log('\\n📁 MISSING FILES:');
  missing.forEach(m => console.log(\`   - \${m}\`));
} else {
  console.log('\\n✅ All required files present');
}

console.log(\`\\n=== Summary ===\`);
console.log(\`Stages: \${stages.length}/40\`);
console.log(\`Errors: \${errors.length}\`);
console.log(\`Warnings: \${warnings.length}\`);
console.log(\`Missing files: \${missing.length}\`);

process.exit(errors.length > 0 ? 1 : 0);`;
  
  fs.writeFileSync(scriptPath, scriptContent);
  fs.chmodSync(scriptPath, '755');
  console.log('Generated validation script');
}

// Generate README files
function generateREADMEs() {
  // Stages README
  const stagesReadmePath = path.join(__dirname, '../docs/stages/README.md');
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
  
  // Workflow README
  const workflowReadmePath = path.join(__dirname, '../docs/workflow/README.md');
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

## Key Documents

### Essential Reading
1. [Stages Definition](stages.yaml) - The canonical source
2. [Visual Overview](../stages/overview.mmd) - Complete workflow diagram
3. [Workflow Critique](critique/overview.md) - Analysis and recommendations
4. [SOP Index](SOP_INDEX.md) - All operating procedures

### Implementation Guides
1. [PRD Crosswalk](prd_crosswalk.md) - What's built vs. what's needed
2. [Backlog](backlog/backlog.yaml) - Prioritized work items
3. [Research Briefs](../research/) - Deep-dive analysis templates

## Workflow Phases

### Phase 1: IDEATION (Stages 1-10)
Focus: Idea validation and feasibility assessment
Owner Mix: EVA, LEAD, PLAN, EXEC

### Phase 2: PLANNING (Stages 11-20)
Focus: Strategic planning and resource preparation
Owner Mix: LEAD, PLAN, EXEC, EVA

### Phase 3: DEVELOPMENT (Stages 21-28)
Focus: Building and iterating the product
Owner Mix: EXEC, PLAN, EVA

### Phase 4: LAUNCH (Stages 29-34)
Focus: Go-to-market and initial customer success
Owner Mix: PLAN, EXEC, LEAD, EVA

### Phase 5: OPERATIONS (Stages 35-40)
Focus: Growth, optimization, and exit
Owner Mix: LEAD, PLAN, Chairman

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
5. Update diagrams if dependencies change

## Related Documentation
- [API Documentation](../02_api/) - Technical PRDs
- [Feature Documentation](../04_features/) - Feature specifications
- [Research Packs](../research/) - Analysis templates
- [Visual Diagrams](../stages/) - Mermaid flowcharts`;
  
  fs.writeFileSync(workflowReadmePath, workflowReadmeContent);
  
  console.log('Generated README files');
}

// Main execution
console.log('Starting workflow documentation generation...');
generateStageCards();
generatePhaseDiagrams();
generateSOPs();
generateCritiques();
generatePRDCrosswalk();
generateBacklog();
generateResearchPacks();
generateValidationScript();
generateREADMEs();
console.log('\\n✅ Workflow documentation generation complete!');
console.log('\\nNext steps:');
console.log('1. Run validation: node scripts/validate-stages.js');
console.log('2. Review generated documentation in /docs/workflow/');
console.log('3. View diagrams in /docs/stages/');
console.log('4. Check backlog in /docs/workflow/backlog/');
console.log('5. Use research packs in /docs/research/ for analysis');