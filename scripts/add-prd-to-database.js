#!/usr/bin/env node

/**
 * Add PRD to database
 * Creates a PRD entry for a given Strategic Directive
 *
 * Enhanced with:
 * - Auto-trigger for Product Requirements Expert (STORIES sub-agent)
 * - Semantic component recommendations with explainable AI
 *
 * Part of Phase 3.2: User story validation enforcement
 * Part of Semantic Component Selector: PRD enhancement
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
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

async function addPRDToDatabase(sdId, prdTitle) {
  console.log(`📋 Adding PRD for ${sdId} to database...\n`);
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Use service role key for full access to LEO tables (anon key blocked by RLS on some tables)
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Generate PRD ID
  const prdId = `PRD-${sdId}`;
  
  try {
    // First check if table exists
    const { error: checkError } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .limit(1);
    
    if (checkError && checkError.message.includes('relation')) {
      console.log('❌ Table product_requirements_v2 does not exist!');
      console.log('\n📝 Please create it first by running this SQL in Supabase SQL Editor:');
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
      console.log('Navigate to: SQL Editor → New Query');
      console.log('Paste the SQL above and click "Run"');
      process.exit(1);
    }

    // SD ID SCHEMA CLEANUP (2025-12-12):
    // - strategic_directives_v2.id is the canonical identifier (PRIMARY KEY)
    // - uuid_id column is DEPRECATED - do not use for FK relationships
    // - product_requirements_v2.sd_id references strategic_directives_v2.id
    //
    // Query supports both legacy_id (SD-XXX-001) and UUID formats.
    // The SD's "id" column is used for the PRD's sd_id foreign key.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sdId);
    const queryField = isUUID ? 'id' : 'legacy_id';

    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, scope, description, strategic_objectives, title, sd_type, category, metadata')
      .eq(queryField, sdId)
      .single();

    if (sdError || !sdData) {
      console.log(`❌ Strategic Directive ${sdId} not found in database`);
      console.log('   Create SD first before creating PRD');
      process.exit(1);
    }

    // Use SD.id (the primary key) for FK relationships
    const sdIdValue = sdData.id;
    console.log(`   SD ID: ${sdIdValue}`);
    console.log(`   SD legacy_id: ${sdData.legacy_id}`);

    // SD-TECH-DEBT-DOCS-001: Auto-detect sd_type and warn if documentation-only
    const typeDetection = autoDetectSdType(sdData);
    const currentSdType = sdData.sd_type || 'feature';

    console.log(`   SD Type (current): ${currentSdType}`);
    console.log(`   SD Type (detected): ${typeDetection.sd_type} (${typeDetection.confidence}% confidence)`);

    // Check for sd_type mismatch
    if (typeDetection.detected && typeDetection.sd_type !== currentSdType && typeDetection.confidence >= 70) {
      console.log('\n   ⚠️  SD TYPE MISMATCH DETECTED');
      console.log(`      Current: ${currentSdType}`);
      console.log(`      Detected: ${typeDetection.sd_type}`);
      console.log(`      Reason: ${typeDetection.reason}`);

      // Auto-update sd_type if confidence is high enough
      if (typeDetection.confidence >= 80) {
        console.log(`\n   🔄 Auto-updating sd_type to '${typeDetection.sd_type}'...`);
        const { error: updateError } = await supabase
          .from('strategic_directives_v2')
          .update({ sd_type: typeDetection.sd_type })
          .eq('id', sdId);

        if (updateError) {
          console.log(`   ⚠️  Failed to update sd_type: ${updateError.message}`);
        } else {
          console.log(`   ✅ Updated sd_type to '${typeDetection.sd_type}'`);
          sdData.sd_type = typeDetection.sd_type;  // Update local reference
        }
      } else {
        console.log('\n   💡 Consider manually setting sd_type:');
        console.log(`      UPDATE strategic_directives_v2 SET sd_type = '${typeDetection.sd_type}' WHERE id = '${sdId}';`);
      }
    }

    // Warn if documentation-only SD is going through full workflow
    const validationReqs = getValidationRequirements(sdData);
    if (validationReqs.skipCodeValidation) {
      console.log('\n   ⚠️  DOCUMENTATION-ONLY SD DETECTED');
      console.log('      This SD does NOT require code validation (TESTING/GITHUB)');
      console.log(`      Reason: ${validationReqs.reason}`);
      console.log('\n   💡 Consider using Quick Fix workflow for documentation-only tasks:');
      console.log('      /quick-fix [describe the documentation task]');
    }

    // ═══════════════════════════════════════════════════════════
    // PERSONA INGESTION (Vision Discovery Pipeline)
    // ═══════════════════════════════════════════════════════════
    let stakeholderPersonas = [];
    let personaSource = 'disabled';

    if (isPersonaIngestionEnabled()) {
      const personaResult = extractPersonasFromSD(sdData);
      stakeholderPersonas = personaResult.personas;
      personaSource = personaResult.source;

      if (personaResult.source === 'metadata') {
        console.log(`\n   👥 PERSONA_INGESTION: found ${personaResult.count} personas in SD.metadata`);
        stakeholderPersonas.forEach(p => console.log(`      - ${p.name}`));
      } else if (personaResult.source === 'defaults') {
        console.log(`\n   👥 PERSONA_INGESTION: using ${personaResult.count} defaults (reason: missing/empty in metadata)`);
        stakeholderPersonas.forEach(p => console.log(`      - ${p.name}`));
      }
    } else {
      console.log('\n   ℹ️  PERSONA_INGESTION: disabled via PERSONA_INGESTION_ENABLED=false');
    }

    // ═══════════════════════════════════════════════════════════
    // SOFT GATE: Feature SDs require approved vision brief
    // ═══════════════════════════════════════════════════════════
    const effectiveSdType = sdData.sd_type || 'unknown';
    const hasRealPersonas = personaSource === 'metadata'; // From SD.metadata, not auto-generated defaults
    const briefApproved = isVisionBriefApproved(sdData);
    const skipVisionBrief = process.argv.includes('--skip-vision-brief');

    // Gate requires: soft gate enabled + ingestion enabled + feature type
    // Must have BOTH: real personas from metadata AND approved vision brief
    if (isPersonaSoftGateEnabled() && isPersonaIngestionEnabled() && effectiveSdType === 'feature') {
      const gatePass = hasRealPersonas && briefApproved;

      if (!gatePass && !skipVisionBrief) {
        console.log('\n   ⚠️  PERSONA SOFT GATE: Feature SD requires approved vision brief');

        if (!hasRealPersonas) {
          // Case 1: No persona payload at all
          console.log('      No persona payload found in SD.metadata.vision_discovery');
          console.log('      Feature SDs benefit from stakeholder personas for better PRD quality.\n');
          console.log('   💡 Generate vision brief:');
          console.log('      node scripts/generate-vision-brief.js ' + sdId + ' --confirm\n');
        } else if (!briefApproved) {
          // Case 2: Personas exist but not approved
          const currentStatus = sdData?.metadata?.vision_discovery?.approval?.status || 'unknown';
          console.log(`      Persona payload exists but is not approved (status: ${currentStatus})`);
          console.log('      Chairman must approve vision brief before PRD creation.\n');
          console.log('   💡 Approve vision brief:');
          console.log('      node scripts/approve-vision-brief.js ' + sdId + '\n');
        }

        console.log('   🚫 Blocking PRD creation. To proceed without approval:');
        console.log('      node scripts/add-prd-to-database.js ' + sdId + ' --skip-vision-brief\n');
        process.exit(1);
      } else if (!gatePass && skipVisionBrief) {
        console.log('\n   ⏭️  Proceeding without approved vision brief (--skip-vision-brief flag provided)\n');
      }
    }

    // Create PRD entry
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert({
        id: prdId,
        directive_id: sdId,
        sd_id: sdIdValue,  // Canonical FK to strategic_directives_v2.id
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
        content: `# Product Requirements Document

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
`
      })
      .select()
      .single();
    
    if (error) {
      if (error.code === '23505') {
        console.log(`⚠️  PRD ${prdId} already exists in database`);
      } else {
        console.error('❌ Database insert error:', error.message);
      }
      process.exit(1);
    }
    
    console.log(`✅ ${prdId} added to database successfully!`);
    console.log('Database record:', JSON.stringify(data, null, 2));

    // ═══════════════════════════════════════════════════════════
    // BUILD PERSONA CONTEXT FOR SUB-AGENT PROMPTS
    // ═══════════════════════════════════════════════════════════
    let personaContextBlock = '';

    if (isPersonaPromptInjectionEnabled() && stakeholderPersonas.length > 0) {
      const { context, truncated } = buildPersonaContextString(stakeholderPersonas);
      personaContextBlock = context;

      if (truncated) {
        console.log('\n   ⚠️  PERSONA_PROMPT_INJECTION: context truncated (exceeded max length)');
      } else {
        console.log(`\n   ✅ PERSONA_PROMPT_INJECTION: built context for ${stakeholderPersonas.length} personas`);
      }
    } else if (!isPersonaPromptInjectionEnabled()) {
      console.log('\n   ℹ️  PERSONA_PROMPT_INJECTION: disabled via PERSONA_PROMPT_INJECTION_ENABLED=false');
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: DESIGN ANALYSIS (UI/UX workflows → informs user stories)
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🎨 PHASE 1: DESIGN ANALYSIS');
    console.log('═══════════════════════════════════════════════════');

    let designAnalysis = null;

    try {
      console.log('🔍 Invoking DESIGN sub-agent to analyze UI/UX workflows...\n');

      const { execSync } = await import('child_process');

      // Prepare context for design agent (with persona injection if available)
      const designPrompt = `Analyze UI/UX design and user workflows for Strategic Directive: ${sdId}

**SD Title**: ${sdData.title || 'N/A'}
**SD Scope**: ${sdData.scope || 'N/A'}
**SD Description**: ${sdData.description || 'N/A'}
**SD Objectives**: ${sdData.strategic_objectives || 'N/A'}
${personaContextBlock ? `\n${personaContextBlock}` : ''}
**Task**:
1. Identify user workflows and interaction patterns
2. Determine UI components and layouts needed
3. Analyze user journey and navigation flows
4. Identify data that users will view/create/edit
5. Determine what user actions trigger database changes

**Output Format**:
{
  "user_workflows": [
    {
      "workflow_name": "Workflow 1",
      "steps": ["step1", "step2"],
      "user_actions": ["create", "edit", "delete"],
      "data_displayed": ["field1", "field2"],
      "data_modified": ["field1", "field2"]
    }
  ],
  "ui_components_needed": ["component1", "component2"],
  "user_journey": "Description of user flow",
  "data_requirements": {
    "fields_to_display": ["field1", "field2"],
    "fields_to_edit": ["field1"],
    "relationships": ["parent_entity -> child_entity"]
  }
}

Please analyze user workflows and design requirements.`;

      // Write prompt to temp file
      const fs = await import('fs');
      const path = await import('path');
      const designPromptFile = path.join('/tmp', `design-agent-prompt-${Date.now()}.txt`);
      fs.writeFileSync(designPromptFile, designPrompt);

      console.log('📝 Prompt written to:', designPromptFile);
      console.log('\n🤖 Executing DESIGN sub-agent...\n');

      // Execute design sub-agent
      const designOutput = execSync(
        `node lib/sub-agent-executor.js DESIGN --context-file "${designPromptFile}"`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
          timeout: 120000
        }
      );

      console.log('✅ Design analysis complete!\n');
      console.log('─────────────────────────────────────────────────');
      console.log(designOutput);
      console.log('─────────────────────────────────────────────────\n');

      designAnalysis = designOutput;

      // Clean up temp file
      fs.unlinkSync(designPromptFile);

    } catch (error) {
      console.warn('⚠️  Design analysis failed:', error.message);
      console.log('   Continuing with manual design review...\n');
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: DATABASE SCHEMA ANALYSIS (based on design + user stories)
    // ═══════════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 PHASE 2: DATABASE SCHEMA ANALYSIS');
    console.log('═══════════════════════════════════════════════════');

    try {
      console.log('🔍 Invoking DATABASE sub-agent to analyze schema and recommend changes...\n');

      const { execSync } = await import('child_process');

      // Prepare context for database agent (including design analysis and personas if available)
      const dbAgentPrompt = `Analyze database schema for Strategic Directive: ${sdId}

**SD Title**: ${sdData.title || 'N/A'}
**SD Scope**: ${sdData.scope || 'N/A'}
**SD Description**: ${sdData.description || 'N/A'}
**SD Objectives**: ${sdData.strategic_objectives || 'N/A'}
${personaContextBlock ? `\n${personaContextBlock}` : ''}
${designAnalysis ? `
**DESIGN ANALYSIS CONTEXT** (from DESIGN sub-agent):
${designAnalysis}

Use this design analysis to understand:
- What data users will view/create/edit (drives table structure)
- User workflows and actions (drives CRUD requirements)
- UI component data needs (drives column selection)
- Data relationships (drives foreign keys and joins)
` : ''}

**Task**:
1. Review the EHG_Engineer database schema documentation at docs/reference/schema/engineer/database-schema-overview.md
2. ${designAnalysis ? 'Based on design analysis, ' : ''}Identify which tables will be affected by this SD
3. Recommend specific database changes (new tables, new columns, modified columns, new RLS policies)
4. ${designAnalysis ? 'Ensure schema supports all user workflows identified in design analysis' : 'Provide technical_approach recommendations for database integration'}
5. List any schema dependencies or constraints to be aware of

**Output Format**:
{
  "affected_tables": ["table1", "table2"],
  "new_tables": [
    {
      "name": "table_name",
      "purpose": "description",
      "key_columns": ["col1", "col2"]
    }
  ],
  "table_modifications": [
    {
      "table": "existing_table",
      "changes": ["add column x", "modify column y"]
    }
  ],
  "rls_policies_needed": ["policy description 1", "policy description 2"],
  "technical_approach": "Detailed technical approach for database integration",
  "dependencies": ["dependency 1", "dependency 2"],
  "migration_complexity": "LOW|MEDIUM|HIGH",
  "estimated_migration_lines": 50
}

Please analyze and provide structured recommendations.`;

      // Write prompt to temp file
      const fs = await import('fs');
      const path = await import('path');
      const promptFile = path.join('/tmp', `db-agent-prompt-${Date.now()}.txt`);
      fs.writeFileSync(promptFile, dbAgentPrompt);

      console.log('📝 Prompt written to:', promptFile);
      console.log('\n🤖 Executing DATABASE sub-agent...\n');

      // Execute database sub-agent
      const dbAgentOutput = execSync(
        `node lib/sub-agent-executor.js DATABASE --context-file "${promptFile}"`,
        {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer
          timeout: 120000 // 2 minute timeout
        }
      );

      console.log('✅ Database sub-agent analysis complete!\n');
      console.log('─────────────────────────────────────────────────');
      console.log(dbAgentOutput);
      console.log('─────────────────────────────────────────────────\n');

      // Parse output to extract recommendations (if structured output available)
      // For now, we'll store the full output in PRD metadata
      const { error: updateError } = await supabase
        .from('product_requirements_v2')
        .update({
          metadata: {
            ...(data.metadata || {}),
            design_analysis: designAnalysis ? {
              generated_at: new Date().toISOString(),
              sd_context: {
                id: sdId,
                title: sdData.title,
                scope: sdData.scope
              },
              raw_analysis: designAnalysis.substring(0, 5000) // Store first 5000 chars
            } : null,
            database_analysis: {
              generated_at: new Date().toISOString(),
              sd_context: {
                id: sdId,
                title: sdData.title,
                scope: sdData.scope
              },
              raw_analysis: dbAgentOutput.substring(0, 5000), // Store first 5000 chars
              design_informed: designAnalysis ? true : false
            }
          }
        })
        .eq('id', prdId);

      if (updateError) {
        console.warn('⚠️  Failed to update PRD with analyses:', updateError.message);
      } else {
        console.log('✅ PRD updated with design + database schema analyses\n');
      }

      // Clean up temp file
      fs.unlinkSync(promptFile);

    } catch (error) {
      console.warn('⚠️  Database schema analysis failed:', error.message);
      console.log('   Continuing with manual schema review...\n');
    }

    // Generate semantic component recommendations
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🎨 SEMANTIC COMPONENT RECOMMENDATIONS');
    console.log('═══════════════════════════════════════════════════');

    try {
      console.log('🔍 Analyzing SD scope and generating component recommendations...\n');

      const { recommendations, summary } = await getComponentRecommendations({
        sdScope: sdData.scope || sdData.title || sdId,
        sdDescription: sdData.description || '',
        sdObjectives: sdData.strategic_objectives || '',
        maxComponents: 8,
        similarityThreshold: 0.65, // Lower threshold to show more options
        supabase
      });

      if (recommendations.length > 0) {
        console.log(`✅ Found ${recommendations.length} component recommendations:\n`);

        recommendations.forEach((rec, idx) => {
          console.log(`${idx + 1}. ${rec.component_name} (${rec.registry_source})`);
          console.log(`   Priority: ${rec.explanation.installation_priority}`);
          console.log(`   Confidence: ${rec.explanation.confidence_percentage}% (${rec.explanation.confidence_tier})`);
          console.log(`   Install: ${rec.install_command}`);
          console.log(`   Reason: ${rec.explanation.reasons.join('; ')}`);
          if (rec.explanation.warnings.length > 0) {
            console.log(`   ⚠️  Warnings: ${rec.explanation.warnings.map(w => w.message).join('; ')}`);
          }
          console.log('');
        });

        // Format for PRD
        const _prdComponents = formatForPRD(recommendations); // Unused: ui_components fields don't exist in schema

        // Update PRD with component recommendations in metadata field
        // NOTE: ui_components and ui_components_summary fields don't exist in schema
        // Store in metadata JSONB field instead
        const { data: currentPrd, error: fetchError } = await supabase
          .from('product_requirements_v2')
          .select('metadata')
          .eq('id', prdId)
          .single();

        if (fetchError) {
          console.warn('⚠️  Failed to fetch PRD for component update:', fetchError.message);
        } else {
          const updatedMetadata = {
            ...(currentPrd.metadata || {}),
            // FIX: ui_components moved to metadata

            // ui_components: prdComponents.ui_components,
            // FIX: ui_components_summary moved to metadata

            // ui_components_summary: prdComponents.ui_components_summary,
            component_recommendations_generated_at: new Date().toISOString()
          };

          const { error: updateError } = await supabase
            .from('product_requirements_v2')
            .update({
              metadata: updatedMetadata,
              updated_at: new Date().toISOString()
            })
            .eq('id', prdId);

          if (updateError) {
            console.warn('⚠️  Failed to update PRD with component recommendations:', updateError.message);
          } else {
            console.log('✅ Component recommendations added to PRD metadata\n');
          }
        }

        // Generate installation script
        const installScript = generateInstallScript(recommendations, ['CRITICAL', 'RECOMMENDED']);
        if (installScript) {
          console.log('📦 Installation Script (Critical + Recommended):');
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
        console.log('ℹ️  No component recommendations found above confidence threshold');
        console.log(`   Threshold: ${0.65 * 100}%`);
        console.log('   Consider lowering threshold or refining SD description');
      }

    } catch (componentError) {
      console.warn('⚠️  Component recommendation warning:', componentError.message);
      console.log('   PRD created successfully, but component recommendations could not be generated');
      console.log('   This is likely due to:');
      console.log('   - Missing OPENAI_API_KEY in .env');
      console.log('   - component_registry_embeddings table not yet created');
      console.log('   - No components seeded in registry');
    }

    // Auto-trigger Product Requirements Expert sub-agent
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
        console.log('✅ User stories already exist, auto-trigger skipped');
      } else if (storiesResult.executed) {
        console.log('✅ User stories generated successfully');
      } else if (storiesResult.recommendation) {
        console.log('⚠️  User stories need to be generated manually');
        console.log(`   Recommendation: ${storiesResult.recommendation}`);
      }
    } catch (triggerError) {
      console.warn('⚠️  Auto-trigger warning:', triggerError.message);
      console.log('   User stories will need to be created manually');
    }

    console.log('\n📝 Next steps:');
    console.log('1. Review component recommendations in PRD metadata.ui_components field');
    console.log('2. Install recommended components using the generated installation script');
    console.log('3. Update PRD with actual requirements');
    console.log('4. Mark checklist items as complete');
    console.log('5. Update phase as work progresses');
    console.log('6. If user stories not auto-generated, run: node scripts/create-user-stories-[sd-id].mjs');
    
  } catch (error) {
    console.error('❌ Error adding PRD to database:', error.message);
    process.exit(1);
  }
}

// Get parameters from command line
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node scripts/add-prd-to-database.js <SD-ID> [PRD-Title]');
  console.log('Example: node scripts/add-prd-to-database.js SD-DASHBOARD-AUDIT-2025-08-31-A "Dashboard Audit PRD"');
  process.exit(1);
}

const sdId = args[0];
const prdTitle = args.slice(1).join(' ');
addPRDToDatabase(sdId, prdTitle);