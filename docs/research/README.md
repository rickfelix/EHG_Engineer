# Research Pack Instructions

## Overview
This directory contains research briefs and AI prompts for analyzing and optimizing the EHG venture workflow.

## Structure
- `overall_research_brief.md` - Comprehensive research agenda
- `overall_prompt_gpt5.json` - GPT-5 prompt for overall analysis
- `overall_prompt_gemini.json` - Gemini prompt for overall analysis
- `stages/` - Per-stage research materials
- `outputs/` - Directory for storing AI-generated analysis

## How to Use

### With GPT-5
1. Open GPT-5 interface
2. Load the JSON prompt file as context
3. Include referenced files (stages.yaml, SOPs, etc.)
4. Request structured analysis
5. Save outputs to `outputs/` directory with specified filenames

### With Gemini
1. Open Gemini interface
2. Load the JSON prompt file
3. Enable analytical reasoning mode
4. Include all referenced documents
5. Request analysis with confidence scores
6. Save outputs to `outputs/` directory

### Expected Outputs
For each analysis session, save:
- `*_findings.md` - Raw findings and observations
- `*_recommendations.md` - Specific recommendations with priority
- `*_automation_blueprint.md` - Automation strategies (if applicable)
- `*_risk_matrix.md` - Risk assessment (if applicable)

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
6. Begin iterative improvements