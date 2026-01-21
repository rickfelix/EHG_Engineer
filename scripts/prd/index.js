#!/usr/bin/env node

/**
 * PRD Generator - Main Entry Point
 * Creates a PRD entry for a given Strategic Directive
 *
 * Enhanced with:
 * - Auto-trigger for Product Requirements Expert (STORIES sub-agent)
 * - Semantic component recommendations with explainable AI
 * - LLM-based PRD content generation
 *
 * Refactored from add-prd-to-database.js for modularity
 * SD-LEO-REFACTOR-PRD-DB-002
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Import modular components
import { generatePRDContentWithLLM } from './llm-generator.js';
import {
  executeDesignAnalysis,
  executeDatabaseAnalysis,
  executeSecurityAnalysis,
  executeRiskAnalysis
} from './sub-agent-orchestrator.js';
import {
  createPRDEntry,
  updatePRDWithAnalyses,
  updatePRDWithLLMContent,
  updatePRDWithComponentRecommendations,
  checkPRDTableExists,
  printTableCreationSQL,
  fetchExistingUserStories
} from './prd-creator.js';

// Import external dependencies
import { autoTriggerStories } from '../modules/auto-trigger-stories.mjs';
import { getComponentRecommendations, formatForPRD, generateInstallScript } from '../../lib/shadcn-semantic-explainable-selector.js';
import {
  autoDetectSdType,
  shouldSkipCodeValidation as _shouldSkipCodeValidation,
  getValidationRequirements
} from '../../lib/utils/sd-type-validation.js';
import {
  extractPersonasFromSD,
  isPersonaIngestionEnabled,
  isPersonaPromptInjectionEnabled,
  isPersonaSoftGateEnabled,
  isVisionBriefApproved,
  buildPersonaContextString
} from '../lib/persona-extractor.js';

dotenv.config();

/**
 * Main PRD creation function
 * @param {string} sdId - Strategic Directive ID
 * @param {string} prdTitle - Optional PRD title
 */
export async function addPRDToDatabase(sdId, prdTitle) {
  console.log(`Adding PRD for ${sdId} to database...\n`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const prdId = `PRD-${sdId}`;

  try {
    // Check if table exists
    const tableExists = await checkPRDTableExists(supabase);
    if (!tableExists) {
      printTableCreationSQL(supabaseUrl);
      process.exit(1);
    }

    // Fetch SD data
    const sdData = await fetchSDData(supabase, sdId);
    if (!sdData) {
      console.log(`Strategic Directive ${sdId} not found in database`);
      console.log('   Create SD first before creating PRD');
      process.exit(1);
    }

    const sdIdValue = sdData.id;
    console.log(`   SD ID: ${sdIdValue}`);
    console.log(`   SD legacy_id: ${sdData.legacy_id}`);

    // SD type detection and validation
    await handleSDTypeDetection(supabase, sdId, sdData);

    // Persona ingestion
    const { stakeholderPersonas, personaSource: _personaSource, personaContextBlock } =
      await handlePersonaIngestion(sdData, sdId);

    // Create initial PRD entry
    let data;
    try {
      data = await createPRDEntry(supabase, prdId, sdId, sdIdValue, prdTitle, stakeholderPersonas);
      console.log(`PRD ${prdId} added to database successfully!`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log(`PRD ${prdId} already exists in database`);
      } else {
        console.error('Database insert error:', error.message);
      }
      process.exit(1);
    }

    // Execute sub-agent analyses
    const designAnalysis = await executeDesignAnalysis(sdId, sdData, personaContextBlock);
    const databaseAnalysis = await executeDatabaseAnalysis(sdId, sdData, designAnalysis, personaContextBlock);
    const securityAnalysis = await executeSecurityAnalysis(sdId, sdData);
    const riskAnalysis = await executeRiskAnalysis(sdId, sdData);

    // Update PRD with analyses
    await updatePRDWithAnalyses(supabase, prdId, sdId, data.metadata, {
      designAnalysis,
      databaseAnalysis
    }, sdData);

    // LLM-based PRD generation
    await handleLLMPRDGeneration(supabase, prdId, sdId, sdIdValue, sdData, {
      designAnalysis,
      databaseAnalysis,
      securityAnalysis,
      riskAnalysis,
      stakeholderPersonas
    });

    // Component recommendations
    await handleComponentRecommendations(supabase, prdId, sdData, sdId);

    // Auto-invoke PLAN phase sub-agents
    await autoInvokePlanSubAgents(supabase, sdId, prdId, stakeholderPersonas);

    console.log('\nNext steps:');
    console.log('1. Review sub-agent results (auto-invoked above)');
    console.log('2. Verify PRD metadata and component recommendations');
    console.log('3. Mark checklist items as complete');
    console.log('4. Run PLAN-TO-EXEC handoff when ready');

  } catch (error) {
    console.error('Error adding PRD to database:', error.message);
    process.exit(1);
  }
}

/**
 * Fetch SD data from database
 */
async function fetchSDData(supabase, sdId) {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
  const queryField = isUUID ? 'id' : 'legacy_id';

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, scope, description, strategic_objectives, title, sd_type, category, metadata, target_application, priority, status, rationale, success_criteria, key_changes, dependencies, risks, strategic_intent, success_metrics')
    .eq(queryField, sdId)
    .single();

  if (error || !data) {
    return null;
  }
  return data;
}

/**
 * Handle SD type detection and auto-update
 */
async function handleSDTypeDetection(supabase, sdId, sdData) {
  const typeDetection = autoDetectSdType(sdData);
  const currentSdType = sdData.sd_type || 'feature';

  console.log(`   SD Type (current): ${currentSdType}`);
  console.log(`   SD Type (detected): ${typeDetection.sd_type} (${typeDetection.confidence}% confidence)`);

  if (typeDetection.detected && typeDetection.sd_type !== currentSdType && typeDetection.confidence >= 70) {
    console.log('\n   SD TYPE MISMATCH DETECTED');
    console.log(`      Current: ${currentSdType}`);
    console.log(`      Detected: ${typeDetection.sd_type}`);
    console.log(`      Reason: ${typeDetection.reason}`);

    if (typeDetection.confidence >= 80) {
      console.log(`\n   Auto-updating sd_type to '${typeDetection.sd_type}'...`);
      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ sd_type: typeDetection.sd_type })
        .eq('id', sdId);

      if (error) {
        console.log(`   Failed to update sd_type: ${error.message}`);
      } else {
        console.log(`   Updated sd_type to '${typeDetection.sd_type}'`);
        sdData.sd_type = typeDetection.sd_type;
      }
    } else {
      console.log('\n   Consider manually setting sd_type:');
      console.log(`      UPDATE strategic_directives_v2 SET sd_type = '${typeDetection.sd_type}' WHERE id = '${sdId}';`);
    }
  }

  // Warn if documentation-only SD
  const validationReqs = getValidationRequirements(sdData);
  if (validationReqs.skipCodeValidation) {
    console.log('\n   DOCUMENTATION-ONLY SD DETECTED');
    console.log('      This SD does NOT require code validation (TESTING/GITHUB)');
    console.log(`      Reason: ${validationReqs.reason}`);
    console.log('\n   Consider using Quick Fix workflow for documentation-only tasks:');
    console.log('      /quick-fix [describe the documentation task]');
  }
}

/**
 * Handle persona ingestion and vision brief validation
 */
async function handlePersonaIngestion(sdData, sdId) {
  let stakeholderPersonas = [];
  let personaSource = 'disabled';
  let personaContextBlock = '';

  if (isPersonaIngestionEnabled()) {
    const personaResult = extractPersonasFromSD(sdData);
    stakeholderPersonas = personaResult.personas;
    personaSource = personaResult.source;

    if (personaResult.source === 'metadata') {
      console.log(`\n   PERSONA_INGESTION: found ${personaResult.count} personas in SD.metadata`);
      stakeholderPersonas.forEach(p => console.log(`      - ${p.name}`));
    } else if (personaResult.source === 'defaults') {
      console.log(`\n   PERSONA_INGESTION: using ${personaResult.count} defaults (reason: missing/empty in metadata)`);
      stakeholderPersonas.forEach(p => console.log(`      - ${p.name}`));
    }
  } else {
    console.log('\n   PERSONA_INGESTION: disabled via PERSONA_INGESTION_ENABLED=false');
  }

  // Soft gate check for feature SDs
  const effectiveSdType = sdData.sd_type || 'unknown';
  const hasRealPersonas = personaSource === 'metadata';
  const briefApproved = isVisionBriefApproved(sdData);
  const skipVisionBrief = process.argv.includes('--skip-vision-brief');

  if (isPersonaSoftGateEnabled() && isPersonaIngestionEnabled() && effectiveSdType === 'feature') {
    const gatePass = hasRealPersonas && briefApproved;

    if (!gatePass && !skipVisionBrief) {
      console.log('\n   PERSONA SOFT GATE: Feature SD requires approved vision brief');

      if (!hasRealPersonas) {
        console.log('      No persona payload found in SD.metadata.vision_discovery');
        console.log('      Feature SDs benefit from stakeholder personas for better PRD quality.\n');
        console.log('   Generate vision brief:');
        console.log('      node scripts/generate-vision-brief.js ' + sdId + ' --confirm\n');
      } else if (!briefApproved) {
        const currentStatus = sdData?.metadata?.vision_discovery?.approval?.status || 'unknown';
        console.log(`      Persona payload exists but is not approved (status: ${currentStatus})`);
        console.log('      Chairman must approve vision brief before PRD creation.\n');
        console.log('   Approve vision brief:');
        console.log('      node scripts/approve-vision-brief.js ' + sdId + '\n');
      }

      console.log('   Blocking PRD creation. To proceed without approval:');
      console.log('      node scripts/add-prd-to-database.js ' + sdId + ' --skip-vision-brief\n');
      process.exit(1);
    } else if (!gatePass && skipVisionBrief) {
      console.log('\n   Proceeding without approved vision brief (--skip-vision-brief flag provided)\n');
    }
  }

  // Build persona context for sub-agent prompts
  if (isPersonaPromptInjectionEnabled() && stakeholderPersonas.length > 0) {
    const { context, truncated } = buildPersonaContextString(stakeholderPersonas);
    personaContextBlock = context;

    if (truncated) {
      console.log('\n   PERSONA_PROMPT_INJECTION: context truncated (exceeded max length)');
    } else {
      console.log(`\n   PERSONA_PROMPT_INJECTION: built context for ${stakeholderPersonas.length} personas`);
    }
  } else if (!isPersonaPromptInjectionEnabled()) {
    console.log('\n   PERSONA_PROMPT_INJECTION: disabled via PERSONA_PROMPT_INJECTION_ENABLED=false');
  }

  return { stakeholderPersonas, personaSource, personaContextBlock };
}

/**
 * Handle LLM-based PRD content generation
 */
async function handleLLMPRDGeneration(supabase, prdId, sdId, sdIdValue, sdData, analyses) {
  console.log('\n='.repeat(55));
  console.log('PHASE 3: LLM-BASED PRD CONTENT GENERATION');
  console.log('='.repeat(55));

  try {
    const existingStories = await fetchExistingUserStories(supabase, sdIdValue);
    if (existingStories.length > 0) {
      console.log(`   Found ${existingStories.length} existing user stories for consistency`);
    }

    const llmPrdContent = await generatePRDContentWithLLM(sdData, {
      ...analyses,
      personas: analyses.stakeholderPersonas,
      existingStories
    });

    if (llmPrdContent) {
      await updatePRDWithLLMContent(supabase, prdId, sdId, sdData, llmPrdContent);
    } else {
      console.log('   LLM generation skipped or failed, PRD has template content');
      console.log('   PRD content will need manual updates to pass quality validation');
    }
  } catch (error) {
    console.warn('LLM PRD generation failed:', error.message);
    console.log('   Continuing with template PRD content...');
  }
}

/**
 * Handle semantic component recommendations
 */
async function handleComponentRecommendations(supabase, prdId, sdData, sdId) {
  console.log('\n='.repeat(55));
  console.log('SEMANTIC COMPONENT RECOMMENDATIONS');
  console.log('='.repeat(55));

  try {
    console.log('Analyzing SD scope and generating component recommendations...\n');

    const { recommendations, summary } = await getComponentRecommendations({
      sdScope: sdData.scope || sdData.title || sdId,
      sdDescription: sdData.description || '',
      sdObjectives: sdData.strategic_objectives || '',
      maxComponents: 8,
      similarityThreshold: 0.65,
      supabase
    });

    if (recommendations.length > 0) {
      console.log(`Found ${recommendations.length} component recommendations:\n`);

      recommendations.forEach((rec, idx) => {
        console.log(`${idx + 1}. ${rec.component_name} (${rec.registry_source})`);
        console.log(`   Priority: ${rec.explanation.installation_priority}`);
        console.log(`   Confidence: ${rec.explanation.confidence_percentage}% (${rec.explanation.confidence_tier})`);
        console.log(`   Install: ${rec.install_command}`);
        console.log(`   Reason: ${rec.explanation.reasons.join('; ')}`);
        if (rec.explanation.warnings.length > 0) {
          console.log(`   Warnings: ${rec.explanation.warnings.map(w => w.message).join('; ')}`);
        }
        console.log('');
      });

      // Format for PRD (unused but kept for reference)
      formatForPRD(recommendations);

      // Update PRD metadata
      const { data: currentPrd, error: fetchError } = await supabase
        .from('product_requirements_v2')
        .select('metadata')
        .eq('id', prdId)
        .single();

      if (!fetchError) {
        await updatePRDWithComponentRecommendations(supabase, prdId, currentPrd.metadata);
      }

      // Generate installation script
      const installScript = generateInstallScript(recommendations, ['CRITICAL', 'RECOMMENDED']);
      if (installScript) {
        console.log('Installation Script (Critical + Recommended):');
        console.log('-'.repeat(70));
        console.log(installScript);
        console.log('-'.repeat(70));
        console.log('');
      }

      console.log('Summary:');
      console.log(`- ${summary.breakdown.critical} CRITICAL components`);
      console.log(`- ${summary.breakdown.recommended} RECOMMENDED components`);
      console.log(`- ${summary.breakdown.optional} OPTIONAL components`);

      if (summary.top_recommendation) {
        console.log(`\nTop recommendation: ${summary.top_recommendation.component} (${summary.top_recommendation.confidence}% confidence, ${summary.top_recommendation.priority} priority)`);
      }
    } else {
      console.log('No component recommendations found above confidence threshold');
      console.log(`   Threshold: ${0.65 * 100}%`);
      console.log('   Consider lowering threshold or refining SD description');
    }
  } catch (error) {
    console.warn('Component recommendation warning:', error.message);
    console.log('   PRD created successfully, but component recommendations could not be generated');
    console.log('   This is likely due to:');
    console.log('   - Missing OPENAI_API_KEY in .env');
    console.log('   - component_registry_embeddings table not yet created');
    console.log('   - No components seeded in registry');
  }
}

/**
 * Auto-invoke PLAN phase sub-agents
 */
async function autoInvokePlanSubAgents(supabase, sdId, prdId, stakeholderPersonas) {
  console.log('\n='.repeat(55));
  console.log('AUTO-INVOKE: PLAN Phase Sub-Agents (orchestrate)');
  console.log('='.repeat(55));

  try {
    const { orchestrate } = await import('../orchestrate-phase-subagents.js');
    const orchestrationResult = await orchestrate('PLAN_PRD', sdId, {
      autoRemediate: true,
      skipIfExists: true
    });

    if (orchestrationResult.status === 'PASS' || orchestrationResult.status === 'COMPLETE') {
      console.log('Sub-agents completed successfully');
      if (orchestrationResult.executed?.length > 0) {
        console.log(`   Executed: ${orchestrationResult.executed.join(', ')}`);
      }
      if (orchestrationResult.skipped?.length > 0) {
        console.log(`   Skipped (already exist): ${orchestrationResult.skipped.join(', ')}`);
      }
    } else if (orchestrationResult.status === 'PARTIAL') {
      console.log('Some sub-agents completed with issues');
      console.log(`   Summary: ${JSON.stringify(orchestrationResult.summary || {})}`);
    } else {
      console.log(`Sub-agent orchestration status: ${orchestrationResult.status}`);
      console.log('   Some sub-agents may need manual invocation');
    }
  } catch (error) {
    console.error('');
    console.error('Sub-agent orchestration failed:', error.message);
    console.error('');
    console.error('   SD ID: ' + sdId);
    console.error('   PRD ID: ' + prdId);
    console.error('');
    console.error('   To invoke sub-agents manually, run:');
    console.error(`   node scripts/orchestrate-phase-subagents.js PLAN_PRD ${sdId}`);
    console.error('');

    // Fallback: try just stories
    try {
      console.log('   Attempting fallback: STORIES sub-agent only...');
      const storiesResult = await autoTriggerStories(supabase, sdId, prdId, {
        skipIfExists: true,
        notifyOnSkip: true,
        logExecution: true,
        personaContext: stakeholderPersonas
      });
      if (storiesResult.executed) {
        console.log('   Fallback: User stories generated');
      }
    } catch (fallbackError) {
      console.error('   Fallback also failed:', fallbackError.message);
    }
  }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('index.js')) {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.log('Usage: node scripts/prd/index.js <SD-ID> [PRD-Title]');
    console.log('Example: node scripts/prd/index.js SD-DASHBOARD-AUDIT-2025-08-31-A "Dashboard Audit PRD"');
    process.exit(1);
  }

  const sdId = args[0];
  const prdTitle = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
  addPRDToDatabase(sdId, prdTitle);
}
