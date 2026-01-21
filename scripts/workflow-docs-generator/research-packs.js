/**
 * Research Packs Generator
 * Generates research briefs and AI prompts for analysis
 *
 * Extracted from generate-workflow-docs.js for modularity
 * SD-LEO-REFACTOR-WORKFLOW-DOCS-001
 */

import fs from 'fs';
import path from 'path';
import { docsDir, ensureDir, padStageId, getStages } from './data-loader.js';

/**
 * Generate research packs
 */
export function generateResearchPacks() {
  const stages = getStages();
  const researchDir = path.join(docsDir, 'research');
  const stagesResearchDir = path.join(researchDir, 'stages');
  ensureDir(stagesResearchDir);

  // Generate overall research brief
  generateOverallBrief(researchDir);

  // Generate GPT-5 and Gemini prompts for overall
  generateOverallPrompts(researchDir);

  // Generate per-stage research files
  stages.forEach(stage => {
    generateStageResearchFiles(stagesResearchDir, stage);
  });

  // Generate research README
  generateResearchReadme(researchDir);

  console.log('Generated research packs');
}

/**
 * Generate overall research brief
 * @param {string} dir - Output directory
 */
function generateOverallBrief(dir) {
  const overallBriefPath = path.join(dir, 'overall_research_brief.md');
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

### 3. Risk and Failure Analysis
- What are the top 10 failure modes across all stages?
- Which stages have the highest risk of venture failure?

### 4. Automation and AI Integration
- Which stages benefit most from AI agent automation?
- How can we achieve 80% automation across the workflow?

### 5. Metrics and Success Prediction
- What metrics best predict venture success at each stage?
- How can we build a success prediction model?

## Hypotheses to Test
1. The 40-stage workflow can be compressed to 25 stages without loss of quality
2. 80% of stages can be fully automated with AI agents
3. 30% of stages can run in parallel rather than sequentially
4. Success can be predicted with 80% accuracy by stage 10
5. Workflow completion time can be reduced from 12 months to 6 months

## Expected Deliverables
1. **Optimization Report**: Specific recommendations for workflow improvement
2. **Benchmark Analysis**: Comparison with industry best practices
3. **Risk Matrix**: Comprehensive risk assessment and mitigation strategies
4. **Automation Blueprint**: Detailed plan for workflow automation
5. **Metrics Framework**: Complete KPI and success prediction system

## Success Criteria
- Identify 20+ concrete optimization opportunities
- Reduce projected cycle time by 40%+
- Increase success prediction accuracy to 75%+
- Define automation strategy for 80%+ of stages`;

  fs.writeFileSync(overallBriefPath, overallBriefContent);
}

/**
 * Generate overall AI prompts
 * @param {string} dir - Output directory
 */
function generateOverallPrompts(dir) {
  const gpt5Prompt = {
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
      'Design optimal automation strategy'
    ],
    deliverables: [
      '/docs/research/outputs/overall_findings.md',
      '/docs/research/outputs/overall_recommendations.md'
    ]
  };

  fs.writeFileSync(
    path.join(dir, 'overall_prompt_gpt5.json'),
    JSON.stringify(gpt5Prompt, null, 2)
  );

  const geminiPrompt = {
    ...gpt5Prompt,
    gemini_specific: {
      reasoning_mode: 'analytical',
      response_format: 'structured',
      confidence_threshold: 0.8
    }
  };

  fs.writeFileSync(
    path.join(dir, 'overall_prompt_gemini.json'),
    JSON.stringify(geminiPrompt, null, 2)
  );
}

/**
 * Generate research files for individual stage
 * @param {string} dir - Output directory
 * @param {Object} stage - Stage object
 */
function generateStageResearchFiles(dir, stage) {
  const briefPath = path.join(dir, `${padStageId(stage.id)}_brief.md`);
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

## Expected Outputs
- Optimization recommendations
- Automation blueprint
- Risk assessment`;

  fs.writeFileSync(briefPath, briefContent);

  // GPT-5 prompt
  const gpt5Prompt = {
    stage_id: stage.id,
    stage_title: stage.title,
    objective: `Optimize Stage ${stage.id} (${stage.title}) for efficiency`,
    tasks: [
      'Analyze necessity and potential for combination/elimination',
      'Identify specific automation opportunities',
      'Define concrete success metrics with thresholds'
    ]
  };

  fs.writeFileSync(
    path.join(dir, `${padStageId(stage.id)}_prompt_gpt5.json`),
    JSON.stringify(gpt5Prompt, null, 2)
  );

  // Gemini prompt
  const geminiPrompt = {
    ...gpt5Prompt,
    gemini_specific: { focus: 'practical_implementation' }
  };

  fs.writeFileSync(
    path.join(dir, `${padStageId(stage.id)}_prompt_gemini.json`),
    JSON.stringify(geminiPrompt, null, 2)
  );
}

/**
 * Generate research README
 * @param {string} dir - Output directory
 */
function generateResearchReadme(dir) {
  const researchReadmePath = path.join(dir, 'README.md');
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
4. Save outputs to \`outputs/\` directory

### With Gemini
1. Open Gemini interface
2. Load the JSON prompt file
3. Enable analytical reasoning mode
4. Save outputs to \`outputs/\` directory

## Quality Checklist
- [ ] All 40 stages analyzed
- [ ] Overall optimization opportunities identified
- [ ] Automation strategy defined
- [ ] Risk matrix completed
- [ ] Implementation roadmap created`;

  fs.writeFileSync(researchReadmePath, researchReadmeContent);
}
