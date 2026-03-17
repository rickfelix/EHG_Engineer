#!/usr/bin/env node

/**
 * Create Parent SD: SD-GENESIS-COMPLETE-001
 * Genesis Completion - Multi-Phase Parent SD
 *
 * Origin: Triangulation Research (OpenAI + Gemini + Claude Code analysis)
 * Blueprint: docs/architecture/SD-GENESIS-COMPLETION-BLUEPRINT.md
 *
 * This is a PARENT SD that will spawn 6-7 child SDs across 5 phases:
 * - Phase A: Research (SD-GENESIS-RESEARCH-001)
 * - Phase B: Data Model (SD-GENESIS-DATAMODEL-001)
 * - Phase C: Core Integration (SD-GENESIS-PRD-001, SD-GENESIS-STAGE16-17-001)
 * - Phase D: UI (SD-GENESIS-UI-001, SD-GENESIS-UI-002)
 * - Phase E: Testing (SD-GENESIS-E2E-001)
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createGenesisParentSD() {
  console.log('Creating Parent SD: SD-GENESIS-COMPLETE-001...\n');

  const strategicDirective = {
    // ========================================================================
    // REQUIRED FIELDS
    // ========================================================================
    id: 'SD-GENESIS-COMPLETE-001',

    title: 'Genesis Completion - Simulation-Based Venture Development System',

    description: 'Complete the Genesis simulation-based venture development system. Genesis enables "fail fast, fail cheap" testing of business ideas before committing real resources. Triangulation research (OpenAI + Gemini + Claude Code) revealed Genesis is ~45-50% complete - architecture is sound and building blocks exist, but they\'re not connected into a working end-to-end flow. This parent SD coordinates 6-7 child SDs across 5 phases to achieve full Genesis operability.',

    rationale: 'Genesis was designed to power Stages 1-15 of the 25-stage venture workflow, enabling rapid prototyping through AI-assisted simulation, pattern reuse, and staged quality gates. Current state: infrastructure works (pattern library, mock mode, quality gates) but core features are stubbed or disconnected (PRD generation returns hardcoded template, Stage 16/17 scripts exist but aren\'t wired to orchestrator, no UI for simulation creation). Additionally, Genesis creates orphan PRDs without parent SDs, violating the data model. This SD addresses all gaps identified in triangulation research.',

    scope: JSON.stringify({
      included: [
        'Research phase to answer 11 open architecture questions',
        'Data model alignment (PRD→SD relationship, simulation tables)',
        'PRD generation with real LLM integration',
        'Stage 16/17 orchestrator integration',
        'Simulation creation UI',
        'End-to-end testing suite'
      ],
      excluded: [
        'Changes to pattern library (already working)',
        'Changes to mock mode enforcement (already working)',
        'Changes to quality gates logic (already working)',
        'Advanced features (pattern composition, analytics dashboard) - future SD'
      ],
      boundaries: [
        'Genesis spans two codebases: EHG_Engineer (infrastructure) and ehg (pipeline/UI)',
        'Must maintain backward compatibility with existing ratification API',
        'Must not break existing venture workflow for non-Genesis ventures'
      ]
    }),

    category: 'product_feature',

    priority: 'high',

    status: 'draft',

    // ========================================================================
    // LEO PROTOCOL COMPLIANCE FIELDS
    // ========================================================================
    sd_key: 'SD-GENESIS-COMPLETE-001',

    // Both codebases involved - primary target is EHG (frontend/orchestration)
    target_application: 'EHG',

    current_phase: 'LEAD',

    sd_type: 'feature',

    strategic_intent: 'Enable rapid venture prototyping through a complete, operational Genesis simulation system that creates SDs with PRDs from seed ideas, integrates with the 25-stage workflow, and provides UI for simulation creation and management.',

    strategic_objectives: [
      'Complete PRD generation with real LLM integration (replace stubbed implementation)',
      'Fix data model to create SDs before PRDs (prevent orphan PRDs)',
      'Wire Stage 16/17 scripts to orchestrator (soul-extractor, production-generator)',
      'Build simulation creation UI (currently CLI-only)',
      'Achieve end-to-end simulation→venture flow'
    ],

    success_criteria: [
      'User can create simulation via UI (not just CLI)',
      'Simulation creates SD + PRD (not orphan PRD)',
      'PRD content is LLM-generated from seed idea (not hardcoded template)',
      'Stage 16/17 show correct components in CompleteWorkflowOrchestrator',
      'One simulation can be ratified to real venture via existing API',
      'E2E tests pass for full simulation lifecycle'
    ],

    key_changes: [
      'Replace generatePRD() stub in genesis-pipeline.js with LLM call',
      'Add simulation→SD creation before PRD creation',
      'Wire soul-extractor.js to Stage 16 in CompleteWorkflowOrchestrator.tsx',
      'Wire production-generator.js to Stage 17 in CompleteWorkflowOrchestrator.tsx',
      'Create simulation creation wizard UI components',
      'Add genesis_simulations table or simulation_id FK to strategic_directives_v2'
    ],

    key_principles: [
      'Database-first: All Genesis state in database, no file-based state',
      'Two-codebase awareness: Changes span EHG_Engineer and ehg repos',
      'Pattern reuse: Use existing pattern library, dont reinvent',
      'SSOT compliance: Fix orchestrator to match venture-workflow.ts',
      'Research before implementation: Answer open questions in Phase A before coding'
    ],

    created_by: 'LEAD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),

    // ========================================================================
    // PARENT SD FIELDS
    // ========================================================================
    uuid_id: randomUUID(),
    version: '1.0',
    phase_progress: 0,
    progress: 0,
    is_active: true,

    dependencies: [
      'Existing pattern library must remain operational',
      'Existing ratification API must remain operational',
      'Access to LLM API (OpenAI or Claude) for PRD generation'
    ],

    risks: [
      {
        description: 'LLM costs for PRD generation could be high',
        mitigation: 'Cache patterns, limit tokens, use cheaper models for drafts',
        severity: 'medium'
      },
      {
        description: 'SSOT divergence could recur after fix',
        mitigation: 'Add automated SSOT consistency check in CI',
        severity: 'medium'
      },
      {
        description: 'Two-codebase complexity causes developer confusion',
        mitigation: 'Documentation complete (PR #147), add cross-repo scripts',
        severity: 'low'
      },
      {
        description: 'Scope creep in research phase delays implementation',
        mitigation: 'Timebox research to single SD, answer only critical questions',
        severity: 'medium'
      }
    ],

    success_metrics: [
      'Genesis simulation creation time < 5 minutes',
      'PRD quality score >= 7/10 (human evaluation)',
      'Stage 16/17 orchestrator components match SSOT',
      'Zero orphan PRDs created by Genesis',
      'E2E test suite passes with >= 95% reliability'
    ],

    implementation_guidelines: [
      'Start with Research SD to answer architecture questions',
      'Data model changes before feature implementation',
      'Core integration before UI',
      'Each child SD goes through full LEAD→PLAN→EXEC',
      'Reference blueprint: docs/architecture/SD-GENESIS-COMPLETION-BLUEPRINT.md'
    ],

    metadata: {
      origin: 'Triangulation Research (OpenAI + Gemini + Claude Code)',
      blueprint_path: 'docs/architecture/SD-GENESIS-COMPLETION-BLUEPRINT.md',
      documentation_pr: '#147',
      estimated_child_sds: 7,
      phases: ['A: Research', 'B: Data Model', 'C: Core', 'D: UI', 'E: Testing'],
      codebases_affected: ['EHG_Engineer', 'ehg'],
      triangulation_consensus: '45-50% complete',
      key_files: {
        stubbed_prd: 'ehg/scripts/genesis/genesis-pipeline.js:190-212',
        soul_extractor: 'ehg/scripts/genesis/soul-extractor.js',
        production_generator: 'ehg/scripts/genesis/production-generator.js',
        orchestrator: 'ehg/src/components/ventures/workflow/CompleteWorkflowOrchestrator.tsx',
        ratify_api: 'ehg/src/pages/api/genesis/ratify.ts'
      }
    }
  };

  try {
    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', strategicDirective.id)
      .single();

    if (existing) {
      console.log(`⚠️  SD ${strategicDirective.id} already exists. Updating...`);

      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', strategicDirective.id)
        .select()
        .single();

      if (error) throw error;
      console.log(`✅ SD ${strategicDirective.id} updated successfully!`);
      return data;
    }

    // Create new SD
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .insert(strategicDirective)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ SD ${strategicDirective.id} created successfully!`);
    console.log('\n📊 Strategic Directive Details:');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`ID:                 ${data.id}`);
    console.log(`Title:              ${data.title}`);
    console.log(`Priority:           ${data.priority}`);
    console.log(`Status:             ${data.status}`);
    console.log(`Target Application: ${data.target_application}`);
    console.log(`Current Phase:      ${data.current_phase}`);
    console.log(`SD Type:            ${data.sd_type}`);
    console.log(`Is Parent:          ${data.is_parent ? 'Yes' : 'No'}`);
    console.log('════════════════════════════════════════════════════════════');

    console.log('\n📋 Next Steps:');
    console.log('1. Run LEAD validation: node lib/sub-agent-executor.js VALIDATION SD-GENESIS-COMPLETE-001');
    console.log('2. Create PRD: node scripts/add-prd-to-database.js SD-GENESIS-COMPLETE-001');
    console.log('3. Get LEAD approval for parent SD');
    console.log('4. During PLAN phase, decompose into child SDs per blueprint');
    console.log('\n📄 Blueprint: docs/architecture/SD-GENESIS-COMPLETION-BLUEPRINT.md');

    return data;

  } catch (error) {
    console.error('❌ Error creating SD:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    throw error;
  }
}

// Run if executed directly
createGenesisParentSD()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
