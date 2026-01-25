#!/usr/bin/env node

/**
 * Update Genesis v3.1 SDs with Agentic Layer Requirements
 *
 * Based on "The Codebase Singularity" analysis:
 * - Memory-as-Code: Context stored in .claude/ directory alongside source code
 * - Context Crystallization: PRD/Tech Spec written to .claude/context/
 * - Agentic Layer Preservation: .claude/ directory preserved during elevation
 *
 * ALIGNED WITH EHG_ENGINEER ACTUAL STRUCTURE:
 * .claude/
 * ├── agents/           ← Venture-specific agent prompts (Builder, Reviewer, QA)
 * ├── commands/         ← Venture-specific slash commands
 * ├── context/          ← Domain context: VENTURE-SPEC.md, TECH-STACK.md, CONSTRAINTS.md
 * ├── hooks/            ← Automation hooks
 * ├── logs/             ← Decision log, generation history
 * ├── session-state.md  ← Current venture state (active context)
 * └── settings.json     ← Venture configuration
 *
 * Updates:
 * - SD-GENESIS-V31-MASON-P2: Scaffolder with .claude/ directory generation
 * - SD-GENESIS-V31-DREAM-P2: Schema/Repo with Context Crystallization
 * - SD-GENESIS-V31-MIRROR-ELEV: Elevation with Agentic Layer preservation
 *
 * Per LEO Protocol v4.3.3 and Vision Version GENESIS-V3.1
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// ============================================================================
// UPDATED SD DEFINITIONS - Agentic Layer Enhancement
// ============================================================================

const AGENTIC_LAYER_UPDATES = {
  // -------------------------------------------------------------------------
  // SD-GENESIS-V31-MASON-P2: Scaffolder with Agentic Layer
  // -------------------------------------------------------------------------
  'SD-GENESIS-V31-MASON-P2': {
    title: 'Mason Phase 2: Simulation Scaffolder with Agentic Layer',

    description: 'Build the repository and schema scaffolding systems with embedded Agentic Layer support. Create venture scaffold templates (Next.js SaaS starter, API service) that include a canonical .claude/ directory structure matching EHG_Engineer patterns. Implement automated repo creation in ehg-simulations org, set up git init and initial commit automation, build schema template library with pre-validated patterns, and create migration generator that converts JSON schema definitions to SQL migrations. CRITICAL: Every generated repo must include the .claude/ directory containing agents/, commands/, context/, hooks/, and logs/ subdirectories - this is the "agent manual" that enables autonomous operation.',

    scope: 'Repo template system with .claude/ directory scaffold, gh repo create automation, git init automation, schema template library, JSON-to-SQL migration generator, agentic layer directory structure (.claude/agents/, .claude/commands/, .claude/context/, .claude/hooks/, .claude/logs/).',

    rationale: 'With foundation in place, the scaffolder enables rapid generation of venture infrastructure. Templates ensure consistency while automation enables speed. The Agentic Layer (.claude/ directory) is the critical innovation - it ensures that future Builder Crews can "read the manual" directly from the repo, enabling true autonomous operation without relying solely on ephemeral database memory. Structure matches EHG_Engineer for consistency.',

    strategic_objectives: [
      'Create reusable venture scaffold templates with embedded .claude/ directory',
      'Automate GitHub repo creation in simulation org',
      'Build schema template library with validated patterns',
      'Implement migration generator from JSON schema',
      'Establish canonical Agentic Layer structure matching EHG_Engineer: .claude/agents/, .claude/commands/, .claude/context/, .claude/hooks/, .claude/logs/',
      'Include placeholder files: .claude/session-state.md, .claude/settings.json, .claude/context/VENTURE-SPEC.md'
    ],

    success_criteria: [
      'next-saas-starter template available and customizable',
      'gh repo create automation creates repos in ehg-simulations',
      'Initial commit automation pushes template with venture config',
      'Schema templates cover common SaaS patterns (users, subscriptions, etc.)',
      'Migration generator produces valid SQL from JSON schema',
      'Every generated repo includes .claude/ directory with agents/, commands/, context/, hooks/, logs/ subdirectories',
      '.claude/session-state.md exists with venture state placeholder',
      '.claude/context/VENTURE-SPEC.md exists with template for technical specifications',
      '.claude/agents/ directory includes venture-agents.md for Builder/Reviewer/QA prompts',
      '.claude/settings.json exists with venture configuration'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md',
        sections: ['Infrastructure Components', 'GitHub Integration']
      },
      must_read_before_prd: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      implementation_guidance: {
        creation_mode: 'CREATE_FROM_NEW',
        agentic_layer: {
          directory: '.claude/',
          subdirectories: ['agents/', 'commands/', 'context/', 'hooks/', 'logs/'],
          required_files: [
            '.claude/session-state.md',
            '.claude/settings.json',
            '.claude/context/VENTURE-SPEC.md',
            '.claude/context/TECH-STACK.md',
            '.claude/context/CONSTRAINTS.md',
            '.claude/agents/venture-agents.md',
            '.claude/logs/decisions.md'
          ],
          note: 'Structure matches EHG_Engineer .claude/ directory for consistency'
        }
      },
      timeline: { start: '2026-01-06', end: '2026-01-12', duration_days: 7 },
      capacity: { sds: 35, hours: 12 }
    },

    risks: [
      {
        risk: 'Agentic Layer structure may vary by venture type',
        mitigation: 'Define minimal canonical structure matching EHG_Engineer, allow venture-specific extensions'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // SD-GENESIS-V31-DREAM-P2: Context Crystallization
  // -------------------------------------------------------------------------
  'SD-GENESIS-V31-DREAM-P2': {
    title: 'Dreamcatcher Phase 2: Schema/Repo Simulation with Context Crystallization',

    description: 'Build PRD-to-artifact intelligence with Context Crystallization. Create PRD-to-schema extraction that infers data model from requirements, implement schema generator producing SQL tables with relationships, build RLS policy generator for automatic security rules, implement PRD-to-repo extraction for tech requirements, and create repo customizer that applies PRD context to scaffold templates. CRITICAL NEW REQUIREMENT: Implement "Context Crystallization" - the Dreamcatcher must write the generated PRD, Tech Spec, and initial System Prompts into the .claude/ directory using EHG_Engineer structure (.claude/session-state.md, .claude/context/TECH-STACK.md, .claude/agents/venture-agents.md). The simulation is not just code; it is a "frozen agent state" that future Builder Crews can resume.',

    scope: 'PRD-to-schema intelligence, schema generator, RLS generator, PRD-to-repo intelligence, repo customizer, Context Crystallization (.claude/ population using EHG_Engineer structure: context/, agents/, logs/).',

    rationale: 'With PRD generated, the system can now infer what database schema and application structure the venture needs. All generated artifacts are tagged as simulations (epistemic_status: simulation). The Context Crystallization step is essential for autonomous operation - by writing PRD insights, tech specs, and system prompts directly into .claude/context/ and .claude/agents/, we create a "frozen agent state" that preserves the Dreamcatcher\'s understanding for future Builder Crews. This is "memory-as-code" - the agent\'s brain and body (code) stay in sync.',

    strategic_objectives: [
      'Extract data model from PRD requirements',
      'Generate SQL schema with proper relationships',
      'Auto-generate RLS security policies',
      'Extract technology requirements from PRD',
      'Customize repo scaffold with venture specifics',
      'Implement Context Crystallization: write venture overview to .claude/session-state.md',
      'Crystallize Tech Spec: extract and write technical decisions to .claude/context/TECH-STACK.md',
      'Generate System Prompts: create agent-specific prompts in .claude/agents/venture-agents.md',
      'Record decision log: capture generation decisions in .claude/logs/decisions.md'
    ],

    success_criteria: [
      'PRD-to-schema identifies entities and relationships',
      'Schema generator produces valid SQL with foreign keys',
      'RLS policies enforce basic access control',
      'Tech requirements identify stack components',
      'Repo customizer updates package.json, README, config',
      '.claude/session-state.md contains: venture name, problem statement, solution hypothesis, current stage, key decisions',
      '.claude/context/TECH-STACK.md contains: stack components, architecture decisions, data model summary, API patterns',
      '.claude/agents/venture-agents.md contains: role-specific prompts for Builder, Reviewer, and QA agents',
      '.claude/logs/decisions.md contains: chronological log of generation decisions with rationale',
      'Context Crystallization completes before simulation is marked generated'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md',
        sections: ['Database Schema', 'Infrastructure Components']
      },
      must_read_before_prd: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      implementation_guidance: {
        creation_mode: 'CREATE_FROM_NEW',
        context_crystallization: {
          purpose: 'Create frozen agent state that Builder Crews can resume',
          structure_note: 'Uses EHG_Engineer .claude/ structure for consistency',
          outputs: {
            'session-state.md': 'Venture overview, current state, immediate next steps',
            'context/TECH-STACK.md': 'Technical decisions, architecture, constraints',
            'context/VENTURE-SPEC.md': 'Problem statement, solution hypothesis, requirements',
            'agents/venture-agents.md': 'Role-specific prompts for Builder/Reviewer/QA agents',
            'logs/decisions.md': 'Chronological record of why decisions were made'
          },
          principle: 'The simulation is not just code; it is a frozen agent state'
        }
      },
      timeline: { start: '2026-01-27', end: '2026-02-02', duration_days: 7 },
      capacity: { sds: 50, hours: 17 }
    },

    risks: [
      {
        risk: 'Context Crystallization may produce low-quality prompts',
        mitigation: 'Use structured templates, validate outputs, allow human override'
      },
      {
        risk: 'session-state.md may become stale',
        mitigation: 'Include last_updated timestamp, design for update-in-place'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // SD-GENESIS-V31-MIRROR-ELEV: Agentic Layer Preservation
  // -------------------------------------------------------------------------
  'SD-GENESIS-V31-MIRROR-ELEV': {
    title: 'Mirror: Elevation Logic with Agentic Layer Preservation',

    description: 'Implement the elevation mechanics that transform simulation to production with full Agentic Layer preservation. Build Stage 16 schema elevation (copy simulation schema to production namespace), Stage 17 repo elevation (fork simulation repo to production org), and elevation audit trail with Chairman signature requirement. CRITICAL: When elevating from Simulation (Aries) to Production (Saturn), the .claude/ directory MUST be preserved and git committed. The operational agents in production inherit the context crystallized during simulation - this is the "brain transplant" that ensures continuity. The .claude/session-state.md must be updated to reflect elevation status. CONSTRAINT: Complete by Feb 10 - no new logic after.',

    scope: 'Stage 16 schema elevation, Stage 17 repo elevation with .claude/ preservation (agents/, commands/, context/, hooks/, logs/), elevation audit trail with Chairman signature, Agentic Layer continuity verification.',

    rationale: 'Elevation is the ceremonial transformation from possible to real. The Chairman\'s signature requirement ensures human accountability for production changes. The Agentic Layer preservation is essential for production autonomy - without the .claude/ directory, production Builder Crews would lose all context from the simulation phase. This is the "brain transplant" - the frozen agent state from Dreamcatcher becomes the operational memory for production agents.',

    strategic_objectives: [
      'Copy simulation schema to production at Stage 16',
      'Fork simulation repo to production at Stage 17',
      'Log all elevations with Chairman signature',
      'Archive simulation after successful elevation',
      'Preserve .claude/ directory during elevation (git commit to production)',
      'Update .claude/session-state.md with elevation metadata',
      'Verify Agentic Layer integrity post-elevation',
      'Add elevation record to .claude/logs/decisions.md'
    ],

    success_criteria: [
      'Stage 16 creates production schema from simulation',
      'Stage 17 forks repo to ehg-ventures org',
      'elevation_log records Chairman signature for each elevation',
      'Simulation marked elevated after promotion',
      'Elevation fails if Chairman signature missing',
      '.claude/ directory present in production repo after elevation',
      '.claude/session-state.md updated with: elevated_at, elevated_by, production_repo_url, production_schema',
      '.claude/logs/decisions.md contains elevation event with Chairman signature',
      'All files in .claude/context/ and .claude/agents/ preserved without modification',
      'Agentic Layer integrity check passes: all required files present post-elevation'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/GENESIS_OATH_V3.md',
        sections: ['Elevation Mechanics (Simulation -> Reality)']
      },
      must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md'],
      must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
      implementation_guidance: {
        creation_mode: 'CREATE_FROM_NEW',
        critical_constraint: 'COMPLETE BY FEB 10 - NO NEW LOGIC AFTER',
        agentic_layer_elevation: {
          principle: 'Brain transplant - simulation context becomes production memory',
          structure_note: 'Uses EHG_Engineer .claude/ structure for consistency',
          preserved_paths: ['.claude/agents/', '.claude/commands/', '.claude/context/', '.claude/hooks/', '.claude/logs/'],
          updated_on_elevation: ['.claude/session-state.md', '.claude/logs/decisions.md'],
          integrity_check: 'Verify all required .claude/ files present after fork',
          failure_mode: 'Elevation BLOCKED if .claude/ directory missing or corrupt'
        }
      },
      timeline: { start: '2026-02-10', end: '2026-02-11', duration_days: 2 },
      capacity: { sds: 25, hours: 8 }
    },

    risks: [
      {
        risk: '.claude/ directory lost during git fork operation',
        mitigation: 'Explicit include in fork operation, post-fork integrity check'
      },
      {
        risk: 'Production agents may have different context needs than simulation',
        mitigation: 'Design .claude/ structure for extensibility, allow production-specific additions'
      }
    ]
  }
};

// ============================================================================
// MAIN UPDATE FUNCTION
// ============================================================================

async function updateGenesisAgenticLayer() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     GENESIS v3.1 - AGENTIC LAYER ENHANCEMENT UPDATE           ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║  Source: "The Codebase Singularity" Analysis                  ║');
  console.log('║  Concept: Memory-as-Code via .claude/ Directory                   ║');
  console.log('║  SDs to Update: 3                                             ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Track results
  const results = {
    updated: [],
    failed: []
  };

  console.log('📋 Updating SDs with Agentic Layer requirements...\n');

  for (const [sdId, updates] of Object.entries(AGENTIC_LAYER_UPDATES)) {
    console.log(`\n🔄 Updating ${sdId}...`);
    console.log(`   Title: ${updates.title}`);

    try {
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update({
          title: updates.title,
          description: updates.description,
          scope: updates.scope,
          rationale: updates.rationale,
          strategic_objectives: updates.strategic_objectives,
          success_criteria: updates.success_criteria,
          metadata: updates.metadata,
          risks: updates.risks,
          updated_at: new Date().toISOString()
        })
        .eq('id', sdId)
        .select('id, title')
        .single();

      if (error) {
        console.error(`   ❌ Error: ${error.message}`);
        results.failed.push({ id: sdId, error: error.message });
      } else {
        console.log('   ✅ Updated successfully');
        results.updated.push(sdId);
      }
    } catch (err) {
      console.error(`   ❌ Exception: ${err.message}`);
      results.failed.push({ id: sdId, error: err.message });
    }
  }

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                         SUMMARY                               ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log(`║  ✅ Updated: ${results.updated.length} SDs                                         ║`);
  console.log(`║  ❌ Failed: ${results.failed.length} SDs                                          ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  if (results.updated.length > 0) {
    console.log('Updated SDs:');
    results.updated.forEach(id => console.log(`  ✅ ${id}`));
  }

  if (results.failed.length > 0) {
    console.log('\nFailed SDs:');
    results.failed.forEach(f => console.log(`  ❌ ${f.id}: ${f.error}`));
    process.exit(1);
  }

  console.log('\n📋 Agentic Layer Enhancements (EHG_Engineer-aligned structure):');
  console.log('');
  console.log('  SD-GENESIS-V31-MASON-P2 (Scaffolder):');
  console.log('    → Now generates .claude/ directory in all repo templates');
  console.log('    → Includes agents/, commands/, context/, hooks/, logs/ subdirectories');
  console.log('    → Matches EHG_Engineer structure for consistency');
  console.log('');
  console.log('  SD-GENESIS-V31-DREAM-P2 (Schema/Repo):');
  console.log('    → Implements "Context Crystallization"');
  console.log('    → Writes to .claude/session-state.md, context/TECH-STACK.md, agents/venture-agents.md');
  console.log('    → Creates "frozen agent state" for Builder Crews');
  console.log('');
  console.log('  SD-GENESIS-V31-MIRROR-ELEV (Elevation):');
  console.log('    → Preserves .claude/ directory during Aries→Saturn elevation');
  console.log('    → Updates session-state.md with elevation metadata');
  console.log('    → Performs integrity check on Agentic Layer post-fork');
  console.log('');
  console.log('🧠 Principle: "The simulation is not just code; it is a frozen agent state"');
  console.log('');
}

// Run
updateGenesisAgenticLayer().catch(console.error);
