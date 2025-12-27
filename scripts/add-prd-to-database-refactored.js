#!/usr/bin/env node

/**
 * Add PRD to database - Refactored Version
 * Creates a PRD entry for a given Strategic Directive
 *
 * Part of SD-REFACTOR-2025-001-P2-001: add-prd-to-database Refactoring
 *
 * This is the main orchestrator that delegates to:
 * - prd-database-service.mjs: Database operations
 * - prd-llm-service.mjs: LLM content generation
 * - prd-business-logic.mjs: Formatting and business logic
 *
 * @version 2.0.0
 */

import dotenv from 'dotenv';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Database service
import {
  getSupabaseClient,
  getStrategicDirective,
  checkPRDExists,
  createPRD,
  updatePRD,
  getUserStoriesBySdId
} from './modules/prd-database-service.mjs';

// LLM service
import {
  isLLMAvailable,
  generatePRDContentWithLLM,
  buildPRDGenerationContext
} from './modules/prd-llm-service.mjs';

// Business logic
import {
  formatArrayField,
  formatRisks,
  formatMetadata,
  formatObjectives,
  formatPRDContent,
  DEFAULT_PLAN_CHECKLIST,
  DEFAULT_EXEC_CHECKLIST,
  DEFAULT_VALIDATION_CHECKLIST,
  buildUpdatedPlanChecklist,
  calculateChecklistProgress
} from './modules/prd-business-logic.mjs';

// External dependencies
import { autoTriggerStories } from './modules/auto-trigger-stories.mjs';
import { getComponentRecommendations, formatForPRD, generateInstallScript } from '../lib/shadcn-semantic-explainable-selector.js';
import {
  autoDetectSdType,
  shouldSkipCodeValidation,
  getValidationRequirements
} from '../lib/utils/sd-type-validation.js';
import {
  extractPersonasFromSD,
  isPersonaIngestionEnabled,
  isPersonaPromptInjectionEnabled,
  isPersonaSoftGateEnabled,
  isVisionBriefApproved,
  buildPersonaContextString
} from './lib/persona-extractor.js';

dotenv.config();

// =============================================================================
// SUB-AGENT EXECUTION
// =============================================================================

/**
 * Execute a sub-agent with context
 * @param {string} agentType - Agent type (DESIGN, DATABASE, SECURITY, RISK)
 * @param {string} prompt - Prompt content
 * @returns {Promise<string|null>} Agent output or null
 */
async function executeSubAgent(agentType, prompt) {
  try {
    const promptFile = path.join('/tmp', `${agentType.toLowerCase()}-agent-prompt-${Date.now()}.txt`);
    fs.writeFileSync(promptFile, prompt);

    console.log(`📝 Prompt written to: ${promptFile}`);
    console.log(`\n🤖 Executing ${agentType} sub-agent...\n`);

    const output = execSync(
      `node lib/sub-agent-executor.js ${agentType} --context-file "${promptFile}"`,
      {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000
      }
    );

    console.log(`✅ ${agentType} analysis complete!\n`);
    console.log('─'.repeat(50));
    console.log(output);
    console.log('─'.repeat(50) + '\n');

    fs.unlinkSync(promptFile);
    return output;
  } catch (error) {
    console.warn(`⚠️  ${agentType} analysis failed:`, error.message);
    return null;
  }
}

/**
 * Build design agent prompt
 */
function buildDesignPrompt(sdData, personaContextBlock) {
  return `Analyze UI/UX design and user workflows for Strategic Directive: ${sdData.id}

## STRATEGIC DIRECTIVE - COMPLETE CONTEXT

**ID**: ${sdData.id}
**Title**: ${sdData.title || 'N/A'}
**Type**: ${sdData.sd_type || sdData.category || 'feature'}
**Scope**: ${sdData.scope || 'N/A'}
**Description**: ${sdData.description || 'N/A'}

**Strategic Objectives**:
${formatObjectives(sdData.strategic_objectives)}

**Success Criteria**:
${formatArrayField(sdData.success_criteria, 'criterion')}

${sdData.metadata ? `## SD METADATA\n${formatMetadata(sdData.metadata)}` : ''}
${personaContextBlock || ''}

**Task**:
1. Identify user workflows and interaction patterns
2. Determine UI components and layouts needed
3. Analyze user journey and navigation flows
4. Identify data that users will view/create/edit

**Output Format**: JSON with user_workflows, ui_components_needed, user_journey, data_requirements`;
}

/**
 * Build database agent prompt
 */
function buildDatabasePrompt(sdData, designAnalysis, personaContextBlock) {
  return `Analyze database schema for Strategic Directive: ${sdData.id}

## STRATEGIC DIRECTIVE - COMPLETE CONTEXT

**ID**: ${sdData.id}
**Title**: ${sdData.title || 'N/A'}
**Type**: ${sdData.sd_type || sdData.category || 'feature'}
**Scope**: ${sdData.scope || 'N/A'}
**Description**: ${sdData.description || 'N/A'}

${sdData.metadata ? `## SD METADATA\n${formatMetadata(sdData.metadata)}` : ''}
${personaContextBlock || ''}
${designAnalysis ? `\n## DESIGN ANALYSIS (from DESIGN sub-agent):\n${designAnalysis}\n` : ''}

**Task**:
1. Identify which tables will be affected
2. Recommend database changes (new tables, columns, RLS policies)
3. Provide technical approach for database integration

**Output Format**: JSON with affected_tables, new_tables, table_modifications, rls_policies_needed`;
}

/**
 * Build security agent prompt
 */
function buildSecurityPrompt(sdData) {
  return `Analyze security requirements for Strategic Directive: ${sdData.id}

## STRATEGIC DIRECTIVE - SECURITY ANALYSIS

**ID**: ${sdData.id}
**Title**: ${sdData.title || 'N/A'}
**Scope**: ${sdData.scope || 'N/A'}
**Description**: ${sdData.description || 'N/A'}

**Task**:
1. Identify authentication requirements
2. Analyze authorization needs (roles, permissions, RLS)
3. Identify data sensitivity levels
4. Recommend security test scenarios

**Output Format**: JSON with auth_requirements, authorization_model, data_sensitivity, security_test_scenarios`;
}

/**
 * Build risk agent prompt
 */
function buildRiskPrompt(sdData) {
  return `Analyze implementation risks for Strategic Directive: ${sdData.id}

## STRATEGIC DIRECTIVE - RISK ANALYSIS

**ID**: ${sdData.id}
**Title**: ${sdData.title || 'N/A'}
**Scope**: ${sdData.scope || 'N/A'}
**Description**: ${sdData.description || 'N/A'}

**Dependencies**:
${formatArrayField(sdData.dependencies, 'dependency')}

**Known Risks**:
${formatRisks(sdData.risks)}

**Task**:
1. Identify technical implementation risks
2. Assess probability and impact
3. Propose concrete mitigation strategies
4. Define rollback plans

**Output Format**: JSON with technical_risks, dependency_risks, timeline_risks, overall_risk_level`;
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

async function addPRDToDatabase(sdId, prdTitle) {
  console.log(`📋 Adding PRD for ${sdId} to database...\n`);

  const supabase = getSupabaseClient();
  const prdId = `PRD-${sdId}`;

  try {
    // Step 1: Fetch Strategic Directive
    console.log('1️⃣  Fetching Strategic Directive...');
    const sdData = await getStrategicDirective(sdId);

    if (!sdData) {
      console.log(`❌ Strategic Directive ${sdId} not found`);
      process.exit(1);
    }

    console.log(`✅ Found SD: ${sdData.title}`);
    console.log(`   ID: ${sdData.id}`);

    // Step 2: SD Type Detection
    const typeDetection = autoDetectSdType(sdData);
    console.log(`   SD Type: ${sdData.sd_type || 'feature'} (detected: ${typeDetection.sd_type})`);

    // Auto-update sd_type if confidence is high
    if (typeDetection.confidence >= 80 && typeDetection.sd_type !== sdData.sd_type) {
      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ sd_type: typeDetection.sd_type })
        .eq('id', sdId);

      if (!error) {
        console.log(`   🔄 Updated sd_type to '${typeDetection.sd_type}'`);
        sdData.sd_type = typeDetection.sd_type;
      }
    }

    // Step 3: Persona Ingestion
    let stakeholderPersonas = [];
    let personaSource = 'disabled';
    let personaContextBlock = '';

    if (isPersonaIngestionEnabled()) {
      const personaResult = extractPersonasFromSD(sdData);
      stakeholderPersonas = personaResult.personas;
      personaSource = personaResult.source;
      console.log(`   👥 Personas: ${personaResult.count} (source: ${personaSource})`);

      if (isPersonaPromptInjectionEnabled() && stakeholderPersonas.length > 0) {
        const { context } = buildPersonaContextString(stakeholderPersonas);
        personaContextBlock = context;
      }
    }

    // Step 4: Soft Gate Check for Feature SDs
    const skipVisionBrief = process.argv.includes('--skip-vision-brief');
    if (isPersonaSoftGateEnabled() && sdData.sd_type === 'feature') {
      const hasRealPersonas = personaSource === 'metadata';
      const briefApproved = isVisionBriefApproved(sdData);

      if (!hasRealPersonas && !briefApproved && !skipVisionBrief) {
        console.log('\n   ⚠️  PERSONA SOFT GATE: Feature SD requires approved vision brief');
        console.log('   Use --skip-vision-brief to proceed without approval\n');
        process.exit(1);
      }
    }

    // Step 5: Check for Existing PRD
    console.log('\n2️⃣  Checking for existing PRD...');
    const existing = await checkPRDExists(prdId);

    if (existing) {
      console.log(`⚠️  PRD ${prdId} already exists (status: ${existing.status})`);
      process.exit(1);
    }

    // Step 6: Create Initial PRD
    console.log('\n3️⃣  Creating PRD...');
    const prdData = {
      id: prdId,
      directive_id: sdId,
      sd_id: sdData.id,
      title: prdTitle || `Product Requirements for ${sdId}`,
      status: 'planning',
      category: 'technical',
      priority: 'high',
      executive_summary: `Product requirements for ${sdId}`,
      phase: 'planning',
      created_by: 'PLAN',
      plan_checklist: DEFAULT_PLAN_CHECKLIST,
      exec_checklist: DEFAULT_EXEC_CHECKLIST,
      validation_checklist: DEFAULT_VALIDATION_CHECKLIST,
      acceptance_criteria: ['All functional requirements implemented', 'All tests passing'],
      functional_requirements: [{ id: 'FR-1', requirement: 'To be defined', priority: 'HIGH' }],
      test_scenarios: [{ id: 'TS-1', scenario: 'To be defined', test_type: 'unit' }],
      progress: 10,
      stakeholders: stakeholderPersonas,
      content: `# PRD for ${sdId}\n\nInitial template - will be enhanced with LLM content.`
    };

    const createdPRD = await createPRD(prdData);
    if (!createdPRD) {
      console.log('❌ Failed to create PRD');
      process.exit(1);
    }
    console.log(`✅ PRD ${prdId} created`);

    // Step 7: Sub-Agent Analyses
    let designAnalysis = null;
    let databaseAnalysis = null;
    let securityAnalysis = null;
    let riskAnalysis = null;

    console.log('\n═══════════════════════════════════════════════════');
    console.log('🎨 PHASE 1: DESIGN ANALYSIS');
    console.log('═══════════════════════════════════════════════════');
    designAnalysis = await executeSubAgent('DESIGN', buildDesignPrompt(sdData, personaContextBlock));

    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 PHASE 2: DATABASE SCHEMA ANALYSIS');
    console.log('═══════════════════════════════════════════════════');
    databaseAnalysis = await executeSubAgent('DATABASE', buildDatabasePrompt(sdData, designAnalysis, personaContextBlock));

    // Security analysis for security-related SDs
    const needsSecurity = sdData.sd_type === 'security' ||
                         sdData.scope?.toLowerCase().includes('auth') ||
                         sdData.description?.toLowerCase().includes('permission');

    if (needsSecurity) {
      console.log('\n═══════════════════════════════════════════════════');
      console.log('🔒 PHASE 2.1: SECURITY ANALYSIS');
      console.log('═══════════════════════════════════════════════════');
      securityAnalysis = await executeSubAgent('SECURITY', buildSecurityPrompt(sdData));
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('⚠️  PHASE 2.2: RISK ANALYSIS');
    console.log('═══════════════════════════════════════════════════');
    riskAnalysis = await executeSubAgent('RISK', buildRiskPrompt(sdData));

    // Update PRD with analyses metadata
    await updatePRD(prdId, {
      metadata: {
        design_analysis: designAnalysis ? { generated_at: new Date().toISOString(), raw: designAnalysis.substring(0, 5000) } : null,
        database_analysis: databaseAnalysis ? { generated_at: new Date().toISOString(), raw: databaseAnalysis.substring(0, 5000) } : null,
        security_analysis: securityAnalysis ? { generated_at: new Date().toISOString(), raw: securityAnalysis.substring(0, 4000) } : null,
        risk_analysis: riskAnalysis ? { generated_at: new Date().toISOString(), raw: riskAnalysis.substring(0, 4000) } : null
      }
    });

    // Step 8: LLM-Based PRD Content Generation
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🧠 PHASE 3: LLM-BASED PRD CONTENT GENERATION');
    console.log('═══════════════════════════════════════════════════');

    if (isLLMAvailable()) {
      // Fetch existing stories for consistency
      const existingStories = await getUserStoriesBySdId(sdData.id);
      if (existingStories.length > 0) {
        console.log(`   📚 Found ${existingStories.length} existing user stories`);
      }

      const llmContent = await generatePRDContentWithLLM(sdData, {
        designAnalysis,
        databaseAnalysis,
        securityAnalysis,
        riskAnalysis,
        personas: stakeholderPersonas,
        existingStories
      });

      if (llmContent) {
        const updatedChecklist = buildUpdatedPlanChecklist(llmContent);
        const progress = calculateChecklistProgress(updatedChecklist);

        await updatePRD(prdId, {
          executive_summary: llmContent.executive_summary,
          functional_requirements: llmContent.functional_requirements,
          technical_requirements: llmContent.technical_requirements,
          system_architecture: llmContent.system_architecture,
          test_scenarios: llmContent.test_scenarios,
          acceptance_criteria: llmContent.acceptance_criteria,
          risks: llmContent.risks,
          implementation_approach: llmContent.implementation_approach,
          content: formatPRDContent(sdId, sdData, llmContent),
          plan_checklist: updatedChecklist,
          progress
        });

        console.log(`   ✅ PRD updated with LLM content (progress: ${progress}%)`);
      }
    } else {
      console.log('   ℹ️  LLM generation not available');
    }

    // Step 9: Component Recommendations
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🎨 SEMANTIC COMPONENT RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════');

    try {
      const { recommendations, summary } = await getComponentRecommendations({
        sdScope: sdData.scope || sdData.title || sdId,
        sdDescription: sdData.description || '',
        sdObjectives: sdData.strategic_objectives || '',
        maxComponents: 8,
        similarityThreshold: 0.65,
        supabase
      });

      if (recommendations.length > 0) {
        console.log(`✅ Found ${recommendations.length} component recommendations`);
        recommendations.forEach((rec, i) => {
          console.log(`   ${i + 1}. ${rec.component_name} (${rec.explanation.confidence_percentage}% confidence)`);
        });

        const installScript = generateInstallScript(recommendations, ['CRITICAL', 'RECOMMENDED']);
        if (installScript) {
          console.log('\n📦 Installation script generated');
        }
      }
    } catch (error) {
      console.warn('   ⚠️  Component recommendations unavailable:', error.message);
    }

    // Step 10: Auto-Trigger Stories
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🤖 AUTO-TRIGGER: Product Requirements Expert');
    console.log('═══════════════════════════════════════════════════');

    try {
      const storiesResult = await autoTriggerStories(supabase, sdId, prdId, {
        skipIfExists: true,
        notifyOnSkip: true,
        logExecution: true,
        personaContext: stakeholderPersonas
      });

      if (storiesResult.skipped) {
        console.log('✅ User stories already exist');
      } else if (storiesResult.executed) {
        console.log('✅ User stories generated successfully');
      }
    } catch (error) {
      console.warn('   ⚠️  Auto-trigger warning:', error.message);
    }

    // Final summary
    console.log('\n' + '═'.repeat(70));
    console.log('✅ PRD CREATION COMPLETE');
    console.log('═'.repeat(70));
    console.log(`   PRD ID: ${prdId}`);
    console.log(`   SD ID: ${sdId}`);
    console.log(`   Status: planning`);
    console.log('\n📝 Next steps:');
    console.log('   1. Review generated PRD content');
    console.log('   2. Complete remaining checklist items');
    console.log('   3. Create PLAN→EXEC handoff when ready');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// =============================================================================
// CLI EXECUTION
// =============================================================================

const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node scripts/add-prd-to-database-refactored.js <SD-ID> [PRD-Title]');
  console.log('Example: node scripts/add-prd-to-database-refactored.js SD-DASHBOARD-001 "Dashboard PRD"');
  process.exit(1);
}

const sdId = args[0];
const prdTitle = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
addPRDToDatabase(sdId, prdTitle);
