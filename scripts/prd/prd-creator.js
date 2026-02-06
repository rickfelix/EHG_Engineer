/**
 * PRD Database Operations
 * Handles PRD creation, updates, and metadata management
 *
 * Extracted from add-prd-to-database.js for modularity
 * SD-LEO-REFACTOR-PRD-DB-002
 *
 * Refactored SD-LEO-INFRA-CONTEXT-AWARE-LLM-001C:
 * - Added createPRDWithValidatedContent() for "generate first, then insert" pattern
 * - No more placeholder PRDs - only validated LLM content gets inserted
 */

import { formatPRDContent } from './formatters.js';

/**
 * Create initial PRD entry in database
 * @param {Object} supabase - Supabase client
 * @param {string} prdId - PRD ID
 * @param {string} sdId - Strategic Directive ID
 * @param {string} sdIdValue - SD primary key value
 * @param {string} prdTitle - PRD title
 * @param {Array} stakeholderPersonas - Stakeholder personas array
 * @returns {Promise<Object>} Created PRD data
 */
export async function createPRDEntry(supabase, prdId, sdId, sdIdValue, prdTitle, stakeholderPersonas = []) {
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: prdId,
      directive_id: sdId,
      sd_id: sdIdValue,
      title: prdTitle || `Product Requirements for ${sdId}`,
      status: 'planning',
      category: 'technical',
      priority: 'high',
      executive_summary: `Product requirements document for Strategic Directive ${sdId}`,
      phase: 'planning',
      created_by: 'PLAN',
      plan_checklist: [
        { text: 'PRD created and saved', checked: true },
        { text: 'SD requirements mapped to technical specs', checked: false },
        { text: 'Technical architecture defined', checked: false },
        { text: 'Implementation approach documented', checked: false },
        { text: 'Test scenarios defined', checked: false },
        { text: 'Acceptance criteria established', checked: false },
        { text: 'Resource requirements estimated', checked: false },
        { text: 'Timeline and milestones set', checked: false },
        { text: 'Risk assessment completed', checked: false }
      ],
      exec_checklist: [
        { text: 'Development environment setup', checked: false },
        { text: 'Core functionality implemented', checked: false },
        { text: 'Unit tests written', checked: false },
        { text: 'Integration tests completed', checked: false },
        { text: 'Code review completed', checked: false },
        { text: 'Documentation updated', checked: false }
      ],
      validation_checklist: [
        { text: 'All acceptance criteria met', checked: false },
        { text: 'Performance requirements validated', checked: false },
        { text: 'Security review completed', checked: false },
        { text: 'User acceptance testing passed', checked: false },
        { text: 'Deployment readiness confirmed', checked: false }
      ],
      acceptance_criteria: [
        'All functional requirements implemented',
        'All tests passing (unit + E2E)',
        'No regressions introduced'
      ],
      functional_requirements: [
        { id: 'FR-1', requirement: 'To be defined based on SD objectives', priority: 'HIGH' },
        { id: 'FR-2', requirement: 'To be defined during planning', priority: 'MEDIUM' },
        { id: 'FR-3', requirement: 'To be defined during technical analysis', priority: 'MEDIUM' }
      ],
      test_scenarios: [
        { id: 'TS-1', scenario: 'To be defined during planning', test_type: 'unit' }
      ],
      progress: 10,
      stakeholders: stakeholderPersonas,
      content: buildInitialPRDContent(sdId)
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`PRD ${prdId} already exists in database`);
    }
    throw error;
  }

  return data;
}

/**
 * Create PRD with validated LLM content (no placeholders)
 * SD-LEO-INFRA-CONTEXT-AWARE-LLM-001C: "Generate first, then insert" pattern
 *
 * @param {Object} supabase - Supabase client
 * @param {string} prdId - PRD ID
 * @param {string} sdId - Strategic Directive ID
 * @param {string} sdIdValue - SD primary key value
 * @param {string} prdTitle - PRD title
 * @param {Object} sdData - SD data for content formatting
 * @param {Object} llmContent - Validated LLM-generated content
 * @param {Array} stakeholderPersonas - Stakeholder personas array
 * @returns {Promise<Object>} Created PRD data
 */
export async function createPRDWithValidatedContent(
  supabase,
  prdId,
  sdId,
  sdIdValue,
  prdTitle,
  sdData,
  llmContent,
  stakeholderPersonas = []
) {
  // Build plan checklist based on what LLM generated
  const hasIntegrationSection = llmContent.integration_operationalization &&
    Object.keys(llmContent.integration_operationalization).length >= 5;
  const hasExplorationSummary = llmContent.exploration_summary &&
    (llmContent.exploration_summary.files_read?.length > 0 ||
     llmContent.exploration_summary.patterns_identified?.length > 0);

  const planChecklist = [
    { text: 'PRD created and saved', checked: true },
    { text: 'SD requirements mapped to technical specs', checked: true },
    { text: 'Technical architecture defined', checked: !!llmContent.system_architecture },
    { text: 'Implementation approach documented', checked: !!llmContent.implementation_approach },
    { text: 'Test scenarios defined', checked: llmContent.test_scenarios?.length > 0 },
    { text: 'Acceptance criteria established', checked: llmContent.acceptance_criteria?.length > 0 },
    { text: 'Integration & operationalization documented', checked: hasIntegrationSection },
    { text: 'Exploration summary documented', checked: hasExplorationSummary },
    { text: 'Resource requirements estimated', checked: false },
    { text: 'Timeline and milestones set', checked: false },
    { text: 'Risk assessment completed', checked: llmContent.risks?.length > 0 }
  ];

  // Calculate progress
  const checkedCount = planChecklist.filter(item => item.checked).length;
  const progress = Math.round((checkedCount / planChecklist.length) * 100);

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: prdId,
      directive_id: sdId,
      sd_id: sdIdValue,
      title: prdTitle || `Product Requirements for ${sdId}`,
      status: 'approved',  // Auto-approved: grounding validation passed
      category: 'technical',
      priority: 'high',
      executive_summary: llmContent.executive_summary || `Product requirements document for Strategic Directive ${sdId}`,
      phase: 'planning',
      created_by: 'PLAN',
      plan_checklist: planChecklist,
      exec_checklist: [
        { text: 'Development environment setup', checked: false },
        { text: 'Core functionality implemented', checked: false },
        { text: 'Unit tests written', checked: false },
        { text: 'Integration tests completed', checked: false },
        { text: 'Code review completed', checked: false },
        { text: 'Documentation updated', checked: false }
      ],
      validation_checklist: [
        { text: 'All acceptance criteria met', checked: false },
        { text: 'Performance requirements validated', checked: false },
        { text: 'Security review completed', checked: false },
        { text: 'User acceptance testing passed', checked: false },
        { text: 'Deployment readiness confirmed', checked: false }
      ],
      // Use LLM-generated content instead of placeholders
      acceptance_criteria: llmContent.acceptance_criteria || [
        'All functional requirements implemented',
        'All tests passing (unit + E2E)',
        'No regressions introduced'
      ],
      functional_requirements: llmContent.functional_requirements || [],
      technical_requirements: llmContent.technical_requirements || [],
      system_architecture: llmContent.system_architecture || null,
      implementation_approach: llmContent.implementation_approach || null,
      test_scenarios: llmContent.test_scenarios || [],
      risks: llmContent.risks || [],
      integration_operationalization: llmContent.integration_operationalization || null,
      exploration_summary: llmContent.exploration_summary || null,
      progress: progress,
      stakeholders: stakeholderPersonas,
      content: formatPRDContent(sdId, sdData, llmContent),
      metadata: llmContent.metadata || {}
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`PRD ${prdId} already exists in database`);
    }
    throw error;
  }

  return data;
}

/**
 * Build initial PRD content (template)
 * @deprecated Use createPRDWithValidatedContent instead - this creates placeholder content
 */
function buildInitialPRDContent(sdId) {
  return `# Product Requirements Document

## Strategic Directive
${sdId}

## Status
Planning

## Executive Summary
This PRD defines the technical requirements and implementation approach for ${sdId}.

## Functional Requirements
- To be defined based on SD objectives

## Technical Requirements
- To be defined based on technical analysis

## Implementation Approach
- To be defined by EXEC agent

## Test Scenarios
- To be defined during planning

## Acceptance Criteria
- To be defined based on success metrics
`;
}

/**
 * Update PRD with sub-agent analysis results
 * @param {Object} supabase - Supabase client
 * @param {string} prdId - PRD ID
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} existingMetadata - Current PRD metadata
 * @param {Object} analyses - Analysis results {designAnalysis, databaseAnalysis}
 * @param {Object} sdData - SD data
 */
export async function updatePRDWithAnalyses(supabase, prdId, sdId, existingMetadata, analyses, sdData) {
  const { designAnalysis, databaseAnalysis } = analyses;

  const { error } = await supabase
    .from('product_requirements_v2')
    .update({
      metadata: {
        ...(existingMetadata || {}),
        design_analysis: designAnalysis ? {
          generated_at: new Date().toISOString(),
          sd_context: {
            id: sdId,
            title: sdData.title,
            scope: sdData.scope
          },
          raw_analysis: designAnalysis.substring(0, 5000)
        } : null,
        database_analysis: databaseAnalysis ? {
          generated_at: new Date().toISOString(),
          sd_context: {
            id: sdId,
            title: sdData.title,
            scope: sdData.scope
          },
          raw_analysis: databaseAnalysis.substring(0, 5000),
          design_informed: !!designAnalysis
        } : null
      }
    })
    .eq('id', prdId);

  if (error) {
    console.warn('Failed to update PRD with analyses:', error.message);
    return false;
  }

  console.log('PRD updated with design + database schema analyses\n');
  return true;
}

/**
 * Update PRD with LLM-generated content
 * @param {Object} supabase - Supabase client
 * @param {string} prdId - PRD ID
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} sdData - SD data
 * @param {Object} llmContent - LLM-generated PRD content
 */
export async function updatePRDWithLLMContent(supabase, prdId, sdId, sdData, llmContent) {
  console.log('\nUpdating PRD with LLM-generated content...');

  const prdUpdate = {
    updated_at: new Date().toISOString()
  };

  // Update executive_summary
  if (llmContent.executive_summary) {
    prdUpdate.executive_summary = llmContent.executive_summary;
  }

  // Update functional_requirements
  if (llmContent.functional_requirements && llmContent.functional_requirements.length > 0) {
    prdUpdate.functional_requirements = llmContent.functional_requirements;
  }

  // Update technical_requirements
  if (llmContent.technical_requirements && llmContent.technical_requirements.length > 0) {
    prdUpdate.technical_requirements = llmContent.technical_requirements;
  }

  // Update system_architecture
  if (llmContent.system_architecture) {
    prdUpdate.system_architecture = llmContent.system_architecture;
  }

  // Update test_scenarios
  if (llmContent.test_scenarios && llmContent.test_scenarios.length > 0) {
    prdUpdate.test_scenarios = llmContent.test_scenarios;
  }

  // Update acceptance_criteria
  if (llmContent.acceptance_criteria && llmContent.acceptance_criteria.length > 0) {
    prdUpdate.acceptance_criteria = llmContent.acceptance_criteria;
  }

  // Update risks
  if (llmContent.risks && llmContent.risks.length > 0) {
    prdUpdate.risks = llmContent.risks;
  }

  // Update implementation_approach
  if (llmContent.implementation_approach) {
    prdUpdate.implementation_approach = llmContent.implementation_approach;
  }

  // Update integration_operationalization (SD-LEO-INFRA-PRD-INTEGRATION-SECTION-001)
  if (llmContent.integration_operationalization) {
    prdUpdate.integration_operationalization = llmContent.integration_operationalization;
  }

  // Update exploration_summary (GATE_EXPLORATION_AUDIT requirement)
  if (llmContent.exploration_summary) {
    prdUpdate.exploration_summary = llmContent.exploration_summary;
  }

  // Update content field with formatted PRD
  prdUpdate.content = formatPRDContent(sdId, sdData, llmContent);

  // Check if integration section is complete
  const hasIntegrationSection = llmContent.integration_operationalization &&
    Object.keys(llmContent.integration_operationalization).length >= 5;
  const hasExplorationSummary = llmContent.exploration_summary &&
    (llmContent.exploration_summary.files_read?.length > 0 ||
     llmContent.exploration_summary.patterns_identified?.length > 0);

  // Mark checklist items as complete
  prdUpdate.plan_checklist = [
    { text: 'PRD created and saved', checked: true },
    { text: 'SD requirements mapped to technical specs', checked: true },
    { text: 'Technical architecture defined', checked: !!llmContent.system_architecture },
    { text: 'Implementation approach documented', checked: !!llmContent.implementation_approach },
    { text: 'Test scenarios defined', checked: llmContent.test_scenarios?.length > 0 },
    { text: 'Acceptance criteria established', checked: llmContent.acceptance_criteria?.length > 0 },
    { text: 'Integration & operationalization documented', checked: hasIntegrationSection },
    { text: 'Exploration summary documented', checked: hasExplorationSummary },
    { text: 'Resource requirements estimated', checked: false },
    { text: 'Timeline and milestones set', checked: false },
    { text: 'Risk assessment completed', checked: llmContent.risks?.length > 0 }
  ];

  // Calculate progress
  const checkedCount = prdUpdate.plan_checklist.filter(item => item.checked).length;
  prdUpdate.progress = Math.round((checkedCount / prdUpdate.plan_checklist.length) * 100);

  const { error } = await supabase
    .from('product_requirements_v2')
    .update(prdUpdate)
    .eq('id', prdId);

  if (error) {
    console.warn('   Failed to update PRD with LLM content:', error.message);
    return false;
  }

  console.log('   PRD updated with LLM-generated content');
  console.log(`   Progress: ${prdUpdate.progress}%`);
  console.log(`   Functional Requirements: ${llmContent.functional_requirements?.length || 0}`);
  console.log(`   Test Scenarios: ${llmContent.test_scenarios?.length || 0}`);
  console.log(`   Risks Identified: ${llmContent.risks?.length || 0}`);
  return true;
}

/**
 * Update PRD metadata with component recommendations
 * @param {Object} supabase - Supabase client
 * @param {string} prdId - PRD ID
 * @param {Object} currentMetadata - Current PRD metadata
 */
export async function updatePRDWithComponentRecommendations(supabase, prdId, currentMetadata) {
  const updatedMetadata = {
    ...(currentMetadata || {}),
    component_recommendations_generated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('product_requirements_v2')
    .update({
      metadata: updatedMetadata,
      updated_at: new Date().toISOString()
    })
    .eq('id', prdId);

  if (error) {
    console.warn('Failed to update PRD with component recommendations:', error.message);
    return false;
  }

  console.log('Component recommendations added to PRD metadata\n');
  return true;
}

/**
 * Check if product_requirements_v2 table exists
 * @param {Object} supabase - Supabase client
 * @returns {Promise<boolean>} True if table exists
 */
export async function checkPRDTableExists(supabase) {
  const { error } = await supabase
    .from('product_requirements_v2')
    .select('id')
    .limit(1);

  if (error && error.message.includes('relation')) {
    return false;
  }
  return true;
}

/**
 * Print table creation SQL for product_requirements_v2
 * @param {string} supabaseUrl - Supabase URL for navigation
 */
export function printTableCreationSQL(supabaseUrl) {
  console.log('Table product_requirements_v2 does not exist!');
  console.log('\nPlease create it first by running this SQL in Supabase SQL Editor:');
  console.log('----------------------------------------');
  console.log(`
CREATE TABLE IF NOT EXISTS product_requirements_v2 (
    id VARCHAR(100) PRIMARY KEY,
    directive_id VARCHAR(50),
    title VARCHAR(500) NOT NULL,
    version VARCHAR(20) DEFAULT '1.0',
    status VARCHAR(50) DEFAULT 'draft',
    category VARCHAR(50) DEFAULT 'technical',
    priority VARCHAR(20) DEFAULT 'high',
    executive_summary TEXT,
    plan_checklist JSONB DEFAULT '[]'::jsonb,
    exec_checklist JSONB DEFAULT '[]'::jsonb,
    validation_checklist JSONB DEFAULT '[]'::jsonb,
    progress INTEGER DEFAULT 0,
    phase VARCHAR(50) DEFAULT 'planning',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100) DEFAULT 'PLAN',
    content TEXT
);
  `);
  console.log('----------------------------------------');
  console.log(`\nGo to: ${supabaseUrl}`);
  console.log('Navigate to: SQL Editor -> New Query');
  console.log('Paste the SQL above and click "Run"');
}

/**
 * Fetch existing user stories for PRD consistency
 * @param {Object} supabase - Supabase client
 * @param {string} sdIdValue - SD primary key value
 * @returns {Promise<Array>} Existing user stories
 */
export async function fetchExistingUserStories(supabase, sdIdValue) {
  const { data } = await supabase
    .from('user_stories')
    .select('story_key, title, user_role, user_want, user_benefit, acceptance_criteria')
    .eq('sd_id', sdIdValue)
    .order('story_key');

  return data || [];
}
