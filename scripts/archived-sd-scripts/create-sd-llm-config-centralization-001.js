#!/usr/bin/env node

/**
 * LEAD Agent: Create Strategic Directive for LLM Configuration Centralization
 * Following LEO Protocol v4.3.3 database_first
 *
 * Problem: Multiple scripts have hardcoded model names (e.g., 'gpt-5.2', 'gpt-4-turbo-preview')
 * that are NOT connected to the LLM management system. When new model versions release,
 * these require manual discovery and updates.
 *
 * Solution: Create a centralized model configuration utility that all scripts can import,
 * with environment variable overrides and database fallback.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createLLMConfigCentralizationSD() {
  console.log('🎯 LEAD Agent: Creating Strategic Directive for LLM Config Centralization');
  console.log('========================================================================');
  console.log('📋 Infrastructure Enhancement: Centralize Model Configuration');
  console.log('');

  const sdId = 'SD-LLM-CONFIG-CENTRAL-001';
  const now = new Date().toISOString();

  // Check if SD already exists
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, status')
    .or(`id.eq.${sdId},legacy_id.eq.${sdId}`)
    .maybeSingle();

  if (existing) {
    console.log(`⚠️  SD ${sdId} already exists with status: ${existing.status}`);
    console.log('   To reset: DELETE FROM strategic_directives_v2 WHERE legacy_id = \'' + sdId + '\';');
    return;
  }

  // Generate UUID for id
  const uuid = crypto.randomUUID();

  // Strategic Directive data (database-first, no files)
  const strategicDirective = {
    id: uuid,
    sd_key: uuid,
    legacy_id: sdId,
    title: 'LLM Configuration Centralization: Single Source of Truth for Model Versions',
    version: '1.0',
    status: 'draft',
    current_phase: 'LEAD',
    category: 'infrastructure',
    priority: 'medium',
    sd_type: 'infrastructure',

    description: `Create a centralized LLM model configuration utility that eliminates hardcoded model names across the codebase.

**Problem Identified:**
Multiple validation scripts have hardcoded model names that bypass the existing LLM management system:
- scripts/modules/sd-type-classifier.js → 'gpt-5.2'
- scripts/modules/ai-quality-evaluator.js → 'gpt-5.2'
- scripts/modules/shipping/ShippingDecisionEvaluator.js → 'gpt-5.2'
- lib/sub-agents/api-relevance-classifier.js → 'gpt-5-mini'
- scripts/uat-to-strategic-directive-ai.js → 'gpt-4-turbo-preview' (OUTDATED!)
- Plus potentially more discovered during comprehensive scan

**Impact:**
When new model versions are released (e.g., GPT-5.3, Claude 5), these scripts require manual discovery and updates that are easy to miss.

**Solution:**
Create \`lib/config/model-config.js\` utility that:
1. Provides centralized model configuration by purpose (validation, classification, generation, vision)
2. Supports environment variable overrides (OPENAI_MODEL_VALIDATION, etc.)
3. Falls back to sensible defaults
4. Can optionally query database \`llm_models\` table for active models
5. Logs model usage for tracking

Then refactor all identified scripts to use this utility instead of hardcoded strings.`,

    strategic_intent: 'Reduce operational overhead when upgrading LLM model versions by centralizing configuration and eliminating scattered hardcoded model names.',

    rationale: 'The existing LLM management system (config/phase-model-config.json, database llm_models table, lib/ai/multimodal-client.js) is well-designed but has a gap: validation scripts bypass it entirely with hardcoded model names. This creates maintenance burden and risk of outdated models in production.',

    scope: `Infrastructure Enhancement:
- Comprehensive codebase scan for ALL hardcoded model references
- New lib/config/model-config.js utility
- Refactor identified scripts to use centralized config
- Update MODEL-VERSION-UPGRADE-RUNBOOK.md with new process
- Add validation command to detect future hardcoded models`,

    strategic_objectives: [
      'Comprehensive scan: Identify ALL hardcoded model references in codebase (grep patterns: this.model, model:, model =)',
      'Create lib/config/model-config.js with getOpenAIModel(purpose) and getClaudeModel(purpose) functions',
      'Support environment variable overrides: OPENAI_MODEL, OPENAI_MODEL_VALIDATION, OPENAI_MODEL_CLASSIFICATION, etc.',
      'Refactor all identified scripts to import from centralized config',
      'Create npm script to detect hardcoded models: npm run llm:audit',
      'Update docs/reference/MODEL-VERSION-UPGRADE-RUNBOOK.md with new streamlined process'
    ],

    success_criteria: [
      'Zero hardcoded model names in validation/classification scripts (verified by npm run llm:audit)',
      'All OpenAI SDK calls use getOpenAIModel() from centralized config',
      'Environment variable override tested and documented',
      'Model upgrade process reduced from 5+ file edits to 1-2 config changes',
      'Outdated gpt-4-turbo-preview reference updated to current model'
    ],

    key_changes: [
      'New file: lib/config/model-config.js',
      'Refactored: scripts/modules/sd-type-classifier.js',
      'Refactored: scripts/modules/ai-quality-evaluator.js',
      'Refactored: scripts/modules/shipping/ShippingDecisionEvaluator.js',
      'Refactored: lib/sub-agents/api-relevance-classifier.js',
      'Refactored: scripts/uat-to-strategic-directive-ai.js',
      'Refactored: scripts/add-prd-to-database.js (LLM_PRD_CONFIG)',
      'Plus any additional scripts found in comprehensive scan',
      'New: npm run llm:audit command',
      'Updated: docs/reference/MODEL-VERSION-UPGRADE-RUNBOOK.md'
    ],

    key_principles: [
      'Database-first: Config utility can optionally read from llm_models table',
      'Environment override: Always allow env vars to override defaults',
      'Backward compatible: Scripts work without changes if env vars not set',
      'Purpose-based selection: Different models for different use cases (validation vs generation)',
      'Auditable: npm run llm:audit catches future regressions',
      'Documented: Runbook updated with new simplified process'
    ],

    metadata: {
      created_by: 'LEAD',
      created_at: now,
      protocol_version: 'v4.3.3',
      source: 'Model upgrade friction analysis + runbook gap identification',
      complexity: 'MEDIUM',
      estimated_loc: 300,
      affected_files_estimate: '10-15 files',
      known_hardcoded_scripts: [
        { file: 'scripts/modules/sd-type-classifier.js', line: 67, model: 'gpt-5.2' },
        { file: 'scripts/modules/ai-quality-evaluator.js', line: 65, model: 'gpt-5.2' },
        { file: 'scripts/modules/shipping/ShippingDecisionEvaluator.js', line: 33, model: 'gpt-5.2' },
        { file: 'lib/sub-agents/api-relevance-classifier.js', line: 38, model: 'gpt-5-mini' },
        { file: 'scripts/uat-to-strategic-directive-ai.js', line: 32, model: 'gpt-4-turbo-preview' },
        { file: 'scripts/add-prd-to-database.js', line: 51, model: 'gpt-5.2' }
      ],
      scan_patterns: [
        'this.model.*=.*[\'"]gpt',
        'this.model.*=.*[\'"]claude',
        'model:.*[\'"]gpt',
        'model:.*[\'"]claude',
        'model.*=.*[\'"]o1',
        'model.*=.*[\'"]o3'
      ],
      related_documentation: [
        'docs/reference/MODEL-VERSION-UPGRADE-RUNBOOK.md',
        'docs/reference/MODEL-ALLOCATION-STRATEGY.md',
        'docs/research/HAIKU-FIRST-STRATEGY.md'
      ],
      implementation_phases: [
        { phase: 1, name: 'Discovery', items: ['Comprehensive grep scan', 'Document all hardcoded references', 'Categorize by purpose'] },
        { phase: 2, name: 'Core Utility', items: ['Create lib/config/model-config.js', 'Add getOpenAIModel()', 'Add getClaudeModel()', 'Add env var support'] },
        { phase: 3, name: 'Refactoring', items: ['Update sd-type-classifier.js', 'Update ai-quality-evaluator.js', 'Update shipping evaluator', 'Update all identified scripts'] },
        { phase: 4, name: 'Audit & Docs', items: ['Create npm run llm:audit', 'Update runbook', 'Add to CI/CD pre-commit check (optional)'] }
      ]
    },

    target_application: 'EHG_Engineer',
    is_active: true,
    created_at: now,
    updated_at: now
  };

  // Insert into database
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(strategicDirective)
    .select()
    .single();

  if (error) {
    console.error('❌ Failed to create SD:', error.message);
    console.error('   Details:', JSON.stringify(error, null, 2));
    return;
  }

  console.log('✅ Strategic Directive created successfully!');
  console.log('');
  console.log('📊 Summary:');
  console.log(`   ID: ${data.legacy_id}`);
  console.log(`   UUID: ${data.id}`);
  console.log(`   Title: ${data.title}`);
  console.log(`   Status: ${data.status}`);
  console.log(`   Phase: ${data.current_phase}`);
  console.log(`   Type: ${data.sd_type}`);
  console.log(`   Priority: ${data.priority}`);
  console.log('');
  console.log('📋 Next Steps (LEAD Phase):');
  console.log('   1. Review SD scope and objectives');
  console.log('   2. Run LEAD validation: node lib/sub-agent-executor.js VALIDATION ' + data.legacy_id);
  console.log('   3. Approve and transition to PLAN: node scripts/handoff.js execute LEAD-TO-PLAN ' + data.legacy_id);
  console.log('');
  console.log('🔍 Comprehensive Scan Patterns (for PLAN phase):');
  console.log('   grep -rn "this.model.*=.*gpt" --include="*.js" --include="*.mjs" --include="*.ts"');
  console.log('   grep -rn "this.model.*=.*claude" --include="*.js" --include="*.mjs" --include="*.ts"');
  console.log('   grep -rn "model:.*gpt" --include="*.js" --include="*.mjs" --include="*.ts"');
}

createLLMConfigCentralizationSD().catch(console.error);
