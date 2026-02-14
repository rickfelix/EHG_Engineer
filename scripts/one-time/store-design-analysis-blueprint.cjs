/**
 * One-time script: Store DESIGN sub-agent analysis results for SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const detailedAnalysis = {
    assessment_type: 'backend_module_design_analysis',
    sd_key: 'SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001',
    ui_applicable: false,
    accessibility_applicable: false,
    responsive_design_applicable: false,

    module_api_analysis: {
      verdict: 'PASS',
      established_patterns: {
        export_naming: 'analyzeStageNN (e.g., analyzeStage13, analyzeStage14, analyzeStage15, analyzeStage16)',
        import_pattern: 'import { getLLMClient } from "../../../llm/index.js"',
        function_signature: 'async function analyzeStageNN({ stage1Data, ...upstreamData, ventureName })',
        return_type: 'Promise<Object> - structured JSON with normalized/validated fields',
        error_handling: 'throw new Error() for missing required input; parseJSON() helper for LLM response parsing',
        output_normalization: 'clamp() for numeric ranges, String() coercion, fallback defaults for missing fields',
        private_helpers: 'clamp(val, min, max) and parseJSON(text) as module-private functions',
        llm_client_usage: 'getLLMClient({ purpose: "content-generation" }) then client.complete(SYSTEM_PROMPT, userPrompt)',
      },
    },

    template_upgrade_analysis: {
      verdict: 'PASS',
      current_state: {
        stage_13: { version: '1.0.0', has_analysisStep: false, loc: 203 },
        stage_14: { version: '1.0.0', has_analysisStep: false, loc: 157 },
        stage_15: { version: '1.0.0', has_analysisStep: false, loc: 160 },
        stage_16: { version: '1.0.0', has_analysisStep: false, loc: 231 },
      },
      upgrade_pattern: {
        description: 'Add analysisStep property and bump version to 2.0.0',
        evidence: 'Exact pattern used in stage-01.js (line 105), stage-05.js (line 341), stage-06.js (line 125), stage-09.js (line 221)'
      }
    },

    index_registration_analysis: {
      verdict: 'PASS',
      file: 'lib/eva/stage-templates/analysis-steps/index.js',
      current_state: 'Registers stages 1-9 only (THE TRUTH + THE ENGINE)',
      file_naming: {
        convention: 'stage-NN-slug.js where slug matches TEMPLATE.slug',
        stage_13: 'stage-13-roadmap.js',
        stage_14: 'stage-14-architecture.js',
        stage_15: 'stage-15-resource-planning.js',
        stage_16: 'stage-16-financial-projections.js',
      }
    },

    component_sizing: {
      verdict: 'PASS',
      analysis: [
        { file: 'stage-13-roadmap.js', estimated_loc: '140-180', within_range: true },
        { file: 'stage-14-architecture.js', estimated_loc: '150-190', within_range: true },
        { file: 'stage-15-resource-planning.js', estimated_loc: '150-180', within_range: true },
        { file: 'stage-16-financial-projections.js', estimated_loc: '160-200', within_range: true },
      ],
    },

    cross_stage_data_flow: {
      verdict: 'PASS',
      analysis: {
        stage_13_inputs: ['stage1Data', 'stage5Data', 'ventureName'],
        stage_14_inputs: ['stage1Data', 'stage13Data', 'ventureName'],
        stage_15_inputs: ['stage1Data', 'stage14Data', 'stage5Data', 'ventureName'],
        stage_16_inputs: ['stage1Data', 'stage5Data', 'stage13Data', 'stage15Data', 'ventureName'],
      },
    },

    design_checklist: {
      module_api_consistency: 'PASS',
      file_naming_convention: 'PASS',
      import_path_structure: 'PASS',
      error_handling_pattern: 'PASS',
      output_normalization: 'PASS',
      template_version_bump: 'PASS',
      index_registration: 'PASS',
      accessibility: 'N/A',
      responsive_design: 'N/A',
      component_sizing: 'PASS'
    },
  };

  const recommendations = [
    'MUST: Each analysis step file must export a single async function named analyzeStageNN',
    'MUST: Include module-private parseJSON() and clamp() helper functions (follow existing duplication pattern)',
    'MUST: SYSTEM_PROMPT as module-level const with JSON schema documentation and rules',
    'MUST: First parameter check - throw Error if required upstream data missing',
    'MUST: Normalize all LLM output fields before returning - never trust raw LLM JSON',
    'SHOULD: Export domain-specific constants alongside the analysis function',
    'SHOULD: Upstream data parameters should use optional chaining with fallback context strings',
  ];

  const warnings = [
    'parseJSON and clamp helpers duplicated across all analysis step files (follow existing pattern for now)',
    'Stage 10-12 (THE IDENTITY) analysis steps missing - gap in stage numbering for index.js (document in comments)',
  ];

  const result = {
    sd_id: 'b84edc1a-48e0-4172-b3cc-0c95a4c843b9',
    sub_agent_code: 'DESIGN',
    sub_agent_name: 'Senior Design Sub-Agent',
    verdict: 'PASS',
    confidence: 92,
    critical_issues: [],
    warnings: warnings,
    recommendations: recommendations,
    detailed_analysis: detailedAnalysis,
    summary: 'Backend-only LLM analysis steps for EVA Stages 13-16. No UI, no accessibility concerns. Module API design validated against 9 existing analysis steps (stages 1-9) and 4 existing stage templates (stages 13-16). All patterns consistent. Score: 92/100.',
    source: 'design-agent',
    metadata: {
      phase: 'LEAD_PRE_APPROVAL',
      overall_score: 92,
      blocking_issues: 0,
      recommendations_count: 7,
      files_analyzed: 12,
      model: 'claude-opus-4-6'
    }
  };

  const { data, error } = await client.from('sub_agent_execution_results').insert(result).select('id');
  if (error) {
    console.error('Insert error:', JSON.stringify(error));
    process.exit(1);
  } else {
    console.log('Stored DESIGN analysis result with ID:', data[0].id);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
