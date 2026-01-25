#!/usr/bin/env node

/**
 * Update Genesis v3.1 SDs with Grade 4 Feedback Loop Enhancements
 *
 * Based on "The Codebase Singularity" analysis:
 * - Grade 4 Feedback Loop: Plan → Build → Review → Fix cycle
 * - EVA Local Context Priority: Read .claude/ before Supabase queries
 * - Build hooks that auto-update session-state.md
 *
 * Updates:
 * - SD-GENESIS-V31-MASON-P2: Add feedback hooks to scaffold
 * - SD-GENESIS-V31-DREAM-P3: Add EVA optimization and agent instructions
 *
 * Per LEO Protocol v4.3.3 and Vision Version GENESIS-V3.1
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// ============================================================================
// UPDATED SD DEFINITIONS - Grade 4 Feedback Loop Enhancement
// ============================================================================

const GRADE4_FEEDBACK_UPDATES = {
  // -------------------------------------------------------------------------
  // SD-GENESIS-V31-MASON-P2: Add Grade 4 Feedback Hooks to Scaffold
  // -------------------------------------------------------------------------
  'SD-GENESIS-V31-MASON-P2': {
    title: 'Mason Phase 2: Simulation Scaffolder with Agentic Layer',

    description: 'Build the repository and schema scaffolding systems with embedded Agentic Layer support and Grade 4 Feedback Loop mechanisms. Create venture scaffold templates (Next.js SaaS starter, API service) that include a canonical .claude/ directory structure matching EHG_Engineer patterns. Implement automated repo creation in ehg-simulations org, set up git init and initial commit automation, build schema template library with pre-validated patterns, and create migration generator that converts JSON schema definitions to SQL migrations. CRITICAL: Every generated repo must include the .claude/ directory containing agents/, commands/, context/, hooks/, and logs/ subdirectories. The scaffold must seed the Grade 4 Feedback Loop mechanisms including build-wrapper hooks that capture output to .claude/logs/ for autonomous self-correction.',

    scope: 'Repo template system with .claude/ directory scaffold, gh repo create automation, git init automation, schema template library, JSON-to-SQL migration generator, agentic layer directory structure (.claude/agents/, .claude/commands/, .claude/context/, .claude/hooks/, .claude/logs/), Grade 4 Feedback Loop hooks (build-wrapper.sh, session-state auto-update).',

    rationale: 'With foundation in place, the scaffolder enables rapid generation of venture infrastructure. Templates ensure consistency while automation enables speed. The Agentic Layer (.claude/ directory) is the critical innovation - it ensures that future Builder Crews can "read the manual" directly from the repo, enabling true autonomous operation without relying solely on ephemeral database memory. Structure matches EHG_Engineer for consistency. The Grade 4 Feedback Loop hooks enable autonomous self-correction by capturing build output and updating session state automatically.',

    strategic_objectives: [
      'Create reusable venture scaffold templates with embedded .claude/ directory',
      'Automate GitHub repo creation in simulation org',
      'Build schema template library with validated patterns',
      'Implement migration generator from JSON schema',
      'Establish canonical Agentic Layer structure matching EHG_Engineer: .claude/agents/, .claude/commands/, .claude/context/, .claude/hooks/, .claude/logs/',
      'Include placeholder files: .claude/session-state.md, .claude/settings.json, .claude/context/VENTURE-SPEC.md',
      "Implement 'Grade 4' Feedback Hooks: Scaffold includes hooks/build-wrapper.sh to capture stdout/stderr to .claude/logs/",
      'Seed .claude/logs/build-history.md template for tracking build pass/fail cycles'
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
      '.claude/settings.json exists with venture configuration',
      'Scaffold includes .claude/hooks/build-wrapper.sh that captures stdout/stderr to .claude/logs/build-output.log',
      'Scaffold includes standard hooks that auto-update .claude/session-state.md with build pass/fail status',
      '.claude/logs/build-history.md exists with template for tracking build cycles'
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
            '.claude/logs/decisions.md',
            '.claude/logs/build-history.md',
            '.claude/hooks/build-wrapper.sh'
          ],
          note: 'Structure matches EHG_Engineer .claude/ directory for consistency'
        },
        grade4_feedback_loop: {
          principle: 'Plan → Build → Review (.claude/logs/) → Fix',
          hooks: {
            'build-wrapper.sh': 'Wraps npm/yarn build to capture stdout/stderr to .claude/logs/build-output.log',
            'post-build.sh': 'Updates .claude/session-state.md with build status (PASS/FAIL) and timestamp'
          },
          logs: {
            'build-output.log': 'Raw stdout/stderr from most recent build',
            'build-history.md': 'Chronological record of build attempts with pass/fail status'
          },
          auto_update: '.claude/session-state.md updated after each build with status and next action'
        }
      },
      timeline: { start: '2026-01-06', end: '2026-01-12', duration_days: 7 },
      capacity: { sds: 35, hours: 12 }
    },

    risks: [
      {
        risk: 'Agentic Layer structure may vary by venture type',
        mitigation: 'Define minimal canonical structure matching EHG_Engineer, allow venture-specific extensions'
      },
      {
        risk: 'Build hooks may not work across all build systems',
        mitigation: 'Provide npm/yarn/pnpm variants, document extension points'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // SD-GENESIS-V31-DREAM-P3: Add EVA Optimization and Agent Instructions
  // -------------------------------------------------------------------------
  'SD-GENESIS-V31-DREAM-P3': {
    title: 'Dreamcatcher Phase 3: EVA + Approval Gate',

    description: 'Build the approval ceremony and venture creation with EVA token optimization. Implement /ratify CLI command for the Contract of Pain, create approval prompt UI showing 25-stage commitment, build venture creation flow for post-ratify instantiation, implement stage scheduler to auto-schedule Stage 3 kill gate, integrate with EVA orchestration using LOCAL_CONTEXT_PRIORITY pattern, and create simulation summary generator for the "Possible Future" display. EVA must read .claude/session-state.md before querying Supabase to minimize token usage. Generated agent prompts must explicitly instruct the Grade 4 Feedback Loop.',

    scope: '/ratify command, Contract of Pain UI, venture creation, stage scheduling, EVA integration with LOCAL_CONTEXT_PRIORITY, simulation summary, Grade 4 agent instructions in venture-agents.md.',

    rationale: 'The /ratify command is the threshold moment - the Chairman commits to 25 stages of labor to earn reality. This is not permission to skip validation; it is acceptance of the work required. EVA token optimization through local context priority reduces costs and improves response latency. The Grade 4 Feedback Loop instructions ensure Builder Crews operate autonomously with self-correction capabilities.',

    strategic_objectives: [
      'Implement /ratify CLI command with ceremony',
      'Display Contract of Pain with 25 stages visible',
      'Create venture at Stage 1 after ratification',
      'Auto-schedule Stage 3 kill gate date',
      'Integrate simulation lifecycle with EVA',
      'Implement EVA_LOCAL_CONTEXT_PRIORITY: EVA reads .claude/session-state.md before querying Supabase to optimize token usage',
      'Generate venture-agents.md with explicit Grade 4 Feedback Loop instructions for Builder Crews'
    ],

    success_criteria: [
      '/ratify command triggers approval ceremony',
      'Contract of Pain displays all 25 stages and 4 kill gates',
      'Venture created in database at Stage 1 post-ratify',
      'Stage 3 date calculated and stored',
      'EVA receives notification of new venture',
      'Simulation summary shows all generated artifacts',
      'EVA reads .claude/session-state.md FIRST before any Supabase query (LOCAL_CONTEXT_PRIORITY)',
      'EVA token usage reduced by >30% through local context caching',
      'Generated venture-agents.md explicitly instructs Builder Crews to execute the Plan → Build → Review (.claude/logs/) → Fix loop',
      'venture-agents.md includes section: "After each build, read .claude/logs/build-output.log and update .claude/session-state.md with findings"'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V3.1',
        primary_spec: 'docs/vision/GENESIS_OATH_V3.md',
        sections: ['The /ratify Command: Scope Definition']
      },
      must_read_before_prd: [
        'docs/vision/GENESIS_OATH_V3.md',
        'docs/vision/GENESIS_RITUAL_SPECIFICATION.md'
      ],
      must_read_before_exec: ['docs/vision/GENESIS_RITUAL_SPECIFICATION.md'],
      implementation_guidance: {
        creation_mode: 'CREATE_FROM_NEW',
        eva_optimization: {
          principle: 'LOCAL_CONTEXT_PRIORITY - read .claude/ before Supabase',
          read_order: [
            '1. .claude/session-state.md (current context)',
            '2. .claude/logs/build-output.log (if build-related)',
            '3. .claude/context/VENTURE-SPEC.md (if requirements-related)',
            '4. Supabase (only if local context insufficient)'
          ],
          token_savings_target: '30% reduction through local caching',
          cache_invalidation: 'session-state.md last_updated timestamp'
        },
        grade4_agent_instructions: {
          principle: 'Plan → Build → Review → Fix autonomous loop',
          venture_agents_template: {
            builder_crew: [
              '1. Read .claude/session-state.md for current task',
              '2. Read .claude/context/TECH-STACK.md for constraints',
              '3. Implement changes in src/',
              '4. Run build via .claude/hooks/build-wrapper.sh',
              '5. Read .claude/logs/build-output.log for errors',
              '6. If errors: diagnose, fix, return to step 4',
              '7. If success: update .claude/session-state.md with completion'
            ],
            reviewer_agent: [
              '1. Read .claude/logs/build-history.md for recent activity',
              '2. Review changes against .claude/context/VENTURE-SPEC.md',
              '3. Log review findings to .claude/logs/decisions.md'
            ]
          }
        }
      },
      timeline: { start: '2026-02-03', end: '2026-02-08', duration_days: 6 },
      capacity: { sds: 45, hours: 15 }
    },

    risks: [
      {
        risk: 'EVA local context may become stale',
        mitigation: 'Use last_updated timestamp in session-state.md, invalidate cache if >1hr old'
      },
      {
        risk: 'Builder Crews may not follow Grade 4 loop instructions',
        mitigation: 'Embed instructions in venture-agents.md header as CRITICAL, validate in DREAM-P2 generation'
      }
    ]
  }
};

// ============================================================================
// MAIN UPDATE FUNCTION
// ============================================================================

async function updateGrade4Feedback() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     GENESIS v3.1 - GRADE 4 FEEDBACK LOOP ENHANCEMENT          ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║  Source: "The Codebase Singularity" Analysis                  ║');
  console.log('║  Concept: Plan → Build → Review → Fix Autonomous Loop         ║');
  console.log('║  SDs to Update: 2                                             ║');
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

  console.log('📋 Updating SDs with Grade 4 Feedback Loop requirements...\n');

  for (const [sdId, updates] of Object.entries(GRADE4_FEEDBACK_UPDATES)) {
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

  console.log('\n📋 Grade 4 Feedback Loop Enhancements:');
  console.log('');
  console.log('  SD-GENESIS-V31-MASON-P2 (Scaffolder):');
  console.log('    → Now includes .claude/hooks/build-wrapper.sh');
  console.log('    → Auto-updates .claude/session-state.md with build status');
  console.log('    → Seeds .claude/logs/build-history.md for tracking');
  console.log('');
  console.log('  SD-GENESIS-V31-DREAM-P3 (EVA + Gate):');
  console.log('    → EVA reads .claude/session-state.md BEFORE Supabase');
  console.log('    → Target: 30% token reduction via local context');
  console.log('    → venture-agents.md instructs: Plan → Build → Review → Fix loop');
  console.log('');
  console.log('🔄 Principle: "The agent reads the plan, builds, reviews output, and self-corrects"');
  console.log('');
}

// Run
updateGrade4Feedback().catch(console.error);
