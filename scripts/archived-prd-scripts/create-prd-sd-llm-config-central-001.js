#!/usr/bin/env node

/**
 * PRD Creation Script Template
 *
 * This template follows all schema validation best practices.
 * Copy this file and customize for your specific Strategic Directive.
 *
 * Usage:
 *   1. Copy this template: cp templates/prd-script-template.js scripts/create-prd-sd-XXX.js
 *   2. Replace SD-LLM-CONFIG-CENTRAL-001 with your SD ID (e.g., SD-AUTH-001)
 *   3. Fill in PRD details
 *   4. Run: node scripts/create-prd-sd-XXX.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

// ============================================================================
// CONFIGURATION - Update these values
// ============================================================================

const SD_ID = 'SD-LLM-CONFIG-CENTRAL-001'; // TODO: Replace with your SD ID (e.g., 'SD-AUTH-001')
const PRD_TITLE = 'LLM Configuration Centralization: Single Source of Truth for Model Versions'; // TODO: Replace with your PRD title

// ============================================================================
// Supabase Client Setup
// ============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ============================================================================
// Main Function
// ============================================================================

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // -------------------------------------------------------------------------
  // STEP 1: Fetch Strategic Directive UUID (CRITICAL for handoff validation)
  // -------------------------------------------------------------------------

  console.log('\n1️⃣  Fetching Strategic Directive...');

  // SD ID Schema Cleanup: Use legacy_id for lookup, get UUID for FK
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, legacy_id, title, category, priority, description, strategic_objectives, success_criteria, scope, key_changes, metadata')
    .eq('legacy_id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   ID: ${sdData.id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  // -------------------------------------------------------------------------
  // STEP 2: Build PRD Data Object (Use only valid schema fields)
  // -------------------------------------------------------------------------

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    // Primary Keys & Foreign Keys (REQUIRED)
    // SD ID Schema Cleanup: sd_uuid column was DROPPED (2025-12-12)
    // sd_id is now the canonical FK to strategic_directives_v2.id (UUID)
    id: prdId,
    sd_id: sdData.id,               // FK to strategic_directives_v2.id (UUID)
    directive_id: sdData.id,        // Backward compatibility (UUID)

    // Core Metadata (REQUIRED)
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',              // draft, planning, in_progress, testing, approved, completed, archived
    category: sdData.category || 'technical',
    priority: sdData.priority || 'high', // critical, high, medium, low

    // Executive & Context
    executive_summary: `
Create a centralized LLM model configuration utility (lib/config/model-config.js) that eliminates hardcoded model names scattered across validation scripts.

Multiple scripts currently have hardcoded model names (e.g., 'gpt-5.2', 'gpt-4-turbo-preview') that bypass the existing LLM management system. This creates maintenance burden when new model versions are released - requiring manual discovery and updates across 5+ files.

The solution provides a single source of truth for model versions with environment variable overrides, reducing model upgrade effort from 5+ file edits to 1-2 config changes.
    `.trim(),

    business_context: `
**Problem**: Model version management friction
- When new models release (e.g., GPT-5.3), developers must grep the codebase to find all hardcoded references
- Easy to miss scripts, leading to outdated models in production
- One script still uses 'gpt-4-turbo-preview' (deprecated)

**Business Value**:
- Reduce model upgrade time from 30+ minutes to <5 minutes
- Prevent production issues from outdated model references
- Align with existing LLM management system philosophy
    `.trim(),

    technical_context: `
**Existing Infrastructure**:
- config/phase-model-config.json: Tier-based routing (haiku/sonnet/opus)
- lib/sub-agent-executor.js: Sub-agent model selection
- lib/ai/multimodal-client.js: Vision API with pricing
- Database: llm_models, llm_providers tables

**Gap**: Validation scripts bypass all of the above with direct hardcoded strings

**Integration Points**:
- OpenAI SDK (direct API calls)
- Environment variables (.env)
- Potentially database llm_models table (future enhancement)
    `.trim(),

    // Requirements (JSONB arrays)
    // CRITICAL: Minimum 3 functional requirements required by database constraint
    // PRD validation will FAIL if fewer than 3 requirements are provided
    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Comprehensive hardcoded model scan',
        description: 'Run grep patterns to identify ALL hardcoded model references in the codebase, including this.model=, model:, and model= patterns for both OpenAI and Anthropic models.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Grep scan covers patterns: this.model, model:, model = for gpt/claude/o1/o3 models',
          'Complete inventory of affected files with line numbers documented',
          'Categorize by purpose: validation, classification, generation, vision'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Create centralized model config utility',
        description: 'Create lib/config/model-config.js with getOpenAIModel(purpose) and getClaudeModel(purpose) functions that support environment variable overrides and sensible defaults.',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'lib/config/model-config.js file created with ESM exports',
          'getOpenAIModel(purpose) returns model name based on purpose (validation, classification, generation, vision)',
          'Environment variable override: OPENAI_MODEL_<PURPOSE> takes precedence',
          'Generic OPENAI_MODEL fallback if purpose-specific not set',
          'Sensible defaults when no env vars set'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Refactor identified scripts to use centralized config',
        description: 'Update all scripts with hardcoded models to import from the centralized config utility, removing direct string references.',
        priority: 'HIGH',
        acceptance_criteria: [
          'sd-type-classifier.js uses getOpenAIModel("classification")',
          'ai-quality-evaluator.js uses getOpenAIModel("validation")',
          'ShippingDecisionEvaluator.js uses getOpenAIModel("validation")',
          'api-relevance-classifier.js uses getOpenAIModel("classification")',
          'uat-to-strategic-directive-ai.js updated from gpt-4-turbo-preview',
          'add-prd-to-database.js uses getOpenAIModel("generation")',
          'All other scripts found in scan refactored'
        ]
      },
      {
        id: 'FR-4',
        requirement: 'Create npm run llm:audit command',
        description: 'Create a validation script that detects hardcoded model names, to be run in CI/CD or pre-commit to prevent future regressions.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'npm run llm:audit script created in package.json',
          'Script greps for hardcoded model patterns',
          'Excludes lib/config/model-config.js (the source of truth)',
          'Exit code 1 if hardcoded models found, 0 if clean',
          'Human-readable output with file:line references'
        ]
      },
      {
        id: 'FR-5',
        requirement: 'Update documentation',
        description: 'Update MODEL-VERSION-UPGRADE-RUNBOOK.md with new simplified process and remove Section 10 gap warning.',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Runbook Section 10 updated from "GAP" to "RESOLVED"',
          'New simplified upgrade process documented',
          'Environment variable documentation added',
          'npm run llm:audit documented'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'maintainability',
        requirement: 'Single source of truth for model versions',
        target_metric: 'Model upgrade requires editing <=2 files'
      },
      {
        type: 'backward_compatibility',
        requirement: 'Scripts work without changes if env vars not set',
        target_metric: 'Zero breaking changes to existing scripts'
      },
      {
        type: 'observability',
        requirement: 'Model selection is auditable',
        target_metric: 'npm run llm:audit detects regressions'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'ESM module exports',
        description: 'lib/config/model-config.js must use ES module syntax for compatibility with existing scripts',
        dependencies: ['Node.js ESM support']
      },
      {
        id: 'TR-2',
        requirement: 'dotenv integration',
        description: 'Must load environment variables using dotenv for local development',
        dependencies: ['dotenv package']
      },
      {
        id: 'TR-3',
        requirement: 'No external dependencies',
        description: 'Config utility should not add new npm dependencies beyond dotenv',
        dependencies: []
      }
    ],

    // Architecture & Design
    system_architecture: `
## Architecture Overview

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                    Environment Variables                     │
│  OPENAI_MODEL, OPENAI_MODEL_VALIDATION, OPENAI_MODEL_GEN   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              lib/config/model-config.js                      │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ getOpenAIModel()    │  │ getClaudeModel()    │          │
│  │ - validation        │  │ - validation        │          │
│  │ - classification    │  │ - generation        │          │
│  │ - generation        │  │ - vision            │          │
│  │ - vision            │  │                     │          │
│  └─────────────────────┘  └─────────────────────┘          │
└─────────────────────────────┬───────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ sd-type-      │    │ ai-quality-   │    │ prd-to-db.js  │
│ classifier.js │    │ evaluator.js  │    │               │
└───────────────┘    └───────────────┘    └───────────────┘
\`\`\`

## Data Flow
1. Script imports getOpenAIModel(purpose) from centralized config
2. Function checks OPENAI_MODEL_{PURPOSE} env var
3. Falls back to OPENAI_MODEL generic env var
4. Falls back to hardcoded defaults by purpose
5. Returns model name string for OpenAI SDK

## Integration Points
- OpenAI SDK: Model name passed to API calls
- dotenv: Environment variable loading
- Existing scripts: Import replacement only
    `.trim(),

    data_model: {
      tables: [],
      note: 'No database changes required - this is a config utility'
    },

    api_specifications: [],

    ui_ux_requirements: [],

    // Implementation
    implementation_approach: `
## Phase 1: Discovery (FR-1)
1. Run comprehensive grep scan for hardcoded model patterns
2. Document all findings with file:line references
3. Categorize scripts by purpose (validation, classification, generation, vision)

## Phase 2: Core Utility (FR-2)
1. Create lib/config/ directory if not exists
2. Create model-config.js with getOpenAIModel() and getClaudeModel()
3. Implement env var cascade: PURPOSE_SPECIFIC → GENERIC → DEFAULT
4. Export functions as ESM

## Phase 3: Refactoring (FR-3)
1. Update sd-type-classifier.js
2. Update ai-quality-evaluator.js
3. Update ShippingDecisionEvaluator.js
4. Update api-relevance-classifier.js
5. Update uat-to-strategic-directive-ai.js (fix outdated model!)
6. Update add-prd-to-database.js
7. Update any additional scripts found in scan

## Phase 4: Audit & Docs (FR-4, FR-5)
1. Create scripts/llm-audit.js
2. Add npm run llm:audit to package.json
3. Update MODEL-VERSION-UPGRADE-RUNBOOK.md
4. Test full workflow
    `.trim(),

    technology_stack: [
      'Node.js ESM',
      'dotenv',
      'OpenAI SDK',
      'grep/ripgrep for scanning'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'dotenv package',
        status: 'completed',
        blocker: false
      },
      {
        type: 'internal',
        name: 'Existing validation scripts',
        status: 'completed',
        blocker: false
      }
    ],

    // Testing & Validation
    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Default model selection',
        description: 'Call getOpenAIModel("validation") with no env vars set',
        expected_result: 'Returns "gpt-5.2" (current default)',
        test_type: 'unit'
      },
      {
        id: 'TS-2',
        scenario: 'Environment override',
        description: 'Set OPENAI_MODEL_VALIDATION=gpt-6, call getOpenAIModel("validation")',
        expected_result: 'Returns "gpt-6"',
        test_type: 'unit'
      },
      {
        id: 'TS-3',
        scenario: 'Generic fallback',
        description: 'Set OPENAI_MODEL=gpt-5.5 (no purpose-specific), call getOpenAIModel("validation")',
        expected_result: 'Returns "gpt-5.5"',
        test_type: 'unit'
      },
      {
        id: 'TS-4',
        scenario: 'Audit detects hardcoded models',
        description: 'Add hardcoded model to test file, run npm run llm:audit',
        expected_result: 'Exit code 1, file:line reported',
        test_type: 'integration'
      },
      {
        id: 'TS-5',
        scenario: 'Audit passes on clean codebase',
        description: 'After refactoring, run npm run llm:audit',
        expected_result: 'Exit code 0, "No hardcoded models found"',
        test_type: 'integration'
      }
    ],

    acceptance_criteria: [
      'npm run llm:audit exits with code 0 (no hardcoded models)',
      'All refactored scripts import from lib/config/model-config.js',
      'Environment variable override works (tested manually)',
      'Scripts function identically before and after refactoring',
      'MODEL-VERSION-UPGRADE-RUNBOOK.md updated'
    ],

    performance_requirements: {
      note: 'No performance requirements - config utility has negligible overhead'
    },

    // Checklists
    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: false },
      { text: 'Technical architecture defined', checked: false },
      { text: 'Implementation approach documented', checked: false },
      { text: 'Test scenarios defined', checked: false },
      { text: 'Acceptance criteria established', checked: false },
      { text: 'User stories generated (STORIES sub-agent)', checked: false },
      { text: 'Database schema reviewed (DATABASE sub-agent)', checked: false },
      { text: 'Security assessment completed (SECURITY sub-agent)', checked: false }
    ],

    exec_checklist: [
      { text: 'Development environment setup', checked: false },
      { text: 'Core functionality implemented', checked: false },
      { text: 'Unit tests written and passing', checked: false },
      { text: 'E2E tests written and passing', checked: false },
      { text: 'Code review completed', checked: false },
      { text: 'Documentation updated', checked: false },
      { text: 'Performance requirements validated', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Security review completed', checked: false },
      { text: 'User acceptance testing passed', checked: false },
      { text: 'Deployment readiness confirmed', checked: false }
    ],

    // Progress Tracking
    progress: 10, // 0-100
    phase: 'planning', // planning, design, implementation, verification, approval
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 10,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    // Risks & Constraints
    risks: [
      {
        category: 'Technical',
        risk: 'TODO: Potential risk',
        severity: 'MEDIUM', // LOW, MEDIUM, HIGH, CRITICAL
        probability: 'MEDIUM', // LOW, MEDIUM, HIGH
        impact: 'TODO: Impact if risk occurs',
        mitigation: 'TODO: How to prevent/handle'
      }
    ],

    constraints: [
      {
        type: 'technical',
        constraint: 'TODO: Technical constraint',
        impact: 'TODO: How this limits the solution'
      }
    ],

    assumptions: [
      {
        assumption: 'TODO: What we\'re assuming',
        validation_method: 'TODO: How to validate this assumption'
      }
    ],

    // Stakeholders & Timeline
    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks

    // Metadata (for custom fields that don't fit schema)
    metadata: {
      // REQUIRED: exploration_summary - Documents files explored during PLAN phase
      // Minimum 3 files required for GATE_EXPLORATION_AUDIT to pass (PLAN→EXEC handoff)
      // Format: Array of objects with file_path, purpose, key_findings
      exploration_summary: [
        // TODO: Add at least 3-5 files explored during planning
        // Example:
        // {
        //   file_path: 'lib/hooks/useExample.ts',
        //   purpose: 'Understand existing hook pattern',
        //   key_findings: 'Uses React Query for caching, follows established patterns'
        // },
        // {
        //   file_path: 'database/schema/example_table.sql',
        //   purpose: 'Review existing table structure',
        //   key_findings: 'Has RLS policies, UUID primary key, created_at timestamps'
        // }
      ],
      // Other optional metadata:
      // ui_components: [...],
      // success_metrics: [...],
      // database_changes: {...},
      // estimated_hours: 40,
    },

    // Audit Trail
    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // -------------------------------------------------------------------------
  // STEP 3: Validate PRD Data (CRITICAL - catches schema mismatches)
  // -------------------------------------------------------------------------

  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    console.error('   Fix the errors above before inserting to database');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  // -------------------------------------------------------------------------
  // STEP 4: Check if PRD already exists
  // -------------------------------------------------------------------------

  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', prdId)
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists!`);
    console.log(`   Created: ${existing.created_at}`);
    console.log(`   Status: ${existing.status}`);
    console.log('\n   Options:');
    console.log('   1. Delete the existing PRD first');
    console.log('   2. Use an UPDATE script instead');
    console.log('   3. Change the SD_ID to create a different PRD');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 5: Insert PRD into database
  // -------------------------------------------------------------------------

  console.log('\n5️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed to insert PRD:', insertError.message);
    console.error('   Code:', insertError.code);
    console.error('   Details:', insertError.details);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // STEP 6: Auto-invoke PLAN phase sub-agents (Gap #1 Fix)
  // -------------------------------------------------------------------------

  console.log('\n6️⃣  Auto-invoking PLAN phase sub-agents...');

  try {
    // Dynamic import to avoid circular dependencies
    const { orchestrate } = await import('./orchestrate-phase-subagents.js');
    const orchestrationResult = await orchestrate('PLAN_PRD', SD_ID, { autoRemediate: true });

    if (orchestrationResult.status === 'PASS' || orchestrationResult.status === 'COMPLETE') {
      console.log(`   ✅ Sub-agents completed: ${orchestrationResult.executed?.join(', ') || 'All required'}`);
    } else if (orchestrationResult.status === 'PARTIAL') {
      console.log(`   ⚠️  Some sub-agents had issues: ${JSON.stringify(orchestrationResult.summary)}`);
    } else {
      console.log(`   ⚠️  Sub-agent orchestration status: ${orchestrationResult.status}`);
      console.log('   You may need to run sub-agents manually for full compliance');
    }
  } catch (orchestrationError) {
    console.warn('   ⚠️  Sub-agent auto-invocation failed:', orchestrationError.message);
    console.log('   Sub-agents can be run manually later with:');
    console.log(`      node scripts/orchestrate-phase-subagents.js PLAN_PRD ${SD_ID}`);
  }

  // -------------------------------------------------------------------------
  // STEP 7: Success Summary
  // -------------------------------------------------------------------------

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD ID: ${insertedPRD.sd_id || insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps:');
  console.log('   1. Update TODO items in PRD (executive_summary, requirements, etc.)');
  console.log('   2. Verify sub-agent results in database (auto-invoked above)');
  console.log('   3. Mark plan_checklist items as complete');
  console.log('   4. Create PLAN→EXEC handoff when ready');
  console.log('');
}

// ============================================================================
// Execute
// ============================================================================

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
