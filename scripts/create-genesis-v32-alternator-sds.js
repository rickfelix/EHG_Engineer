#!/usr/bin/env node

/**
 * Create Genesis V32 ALTERNATOR Strategic Directives
 *
 * Inserts all 5 SDs for Virtual Bunker Consolidation:
 * - 1 Parent SD (orchestrator): SD-GENESIS-V32-ALTERNATOR
 * - 4 Child SDs:
 *   - SD-GENESIS-V32-PULSE (infrastructure) - Self-Healing Heart
 *   - SD-GENESIS-V32-SCAFFOLD (feature) - Pattern Library
 *   - SD-GENESIS-V32-EPHEMERAL (feature) - Preview Pipeline
 *   - SD-GENESIS-V32-REGEN (feature) - Soul Extraction
 *
 * Per LEO Protocol v4.3.3 and Triangulated Plan (OpenAI + AntiGravity + Claude)
 * Ratified: 2025-12-31
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// ============================================================================
// SD DEFINITIONS - All 5 Strategic Directives for Genesis V32 ALTERNATOR
// ============================================================================

const GENESIS_V32_SDS = {
  // -------------------------------------------------------------------------
  // LEVEL 0: PARENT SD (Orchestrator)
  // -------------------------------------------------------------------------
  alternator: {
    id: 'SD-GENESIS-V32-ALTERNATOR',
    sd_key: 'genesis-v32-alternator',
    sd_key: 'SD-GENESIS-V32-ALTERNATOR',
    title: 'Genesis V32 - Virtual Bunker Consolidation',

    description: 'Consolidate and harden the Virtual Bunker architecture for Genesis. This parent SD orchestrates four child SDs that wire existing lib/genesis/* modules together and fix critical gaps discovered during triangulation. Key focus areas: P0 fix for missing leo_error_log table, retry/resilience infrastructure, pattern library consolidation, preview pipeline hardening, and Stage 16/17 soul extraction + regeneration mechanics. Virtual Bunker principle: simulations are ephemeral thought experiments; physical repos created ONLY at Stage 17 via regeneration.',

    scope: 'Full consolidation of Virtual Bunker: resilience layer (PULSE), pattern library consolidation (SCAFFOLD), preview pipeline hardening (EPHEMERAL), and soul extraction/regeneration mechanics (REGEN).',

    rationale: 'Genesis V31 created a Governance Shell. V32 consolidates and hardens existing lib/genesis/* modules, fixes critical schema/logging gaps (leo_error_log), and adds Stage 16/17 regeneration mechanics. Triangulation with OpenAI and AntiGravity revealed existing code to REUSE/HARDEN rather than greenfield build.',

    category: 'infrastructure',
    sd_type: 'orchestrator',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'parent',
    parent_sd_id: null,
    sequence_rank: 1,
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Fix P0 critical gaps: leo_error_log table, schema drift, mock mode naming',
      'REUSE existing lib/genesis/pattern-*.js modules',
      'HARDEN existing vercel-deploy.js, ttl-cleanup.js, branch-lifecycle.js',
      'Implement retry/resilience infrastructure for external API calls',
      'Add Stage 16/17 soul extraction and regeneration mechanics'
    ],

    success_criteria: [
      'leo_error_log table exists and captures critical failures',
      'Retry executor handles external API failures with exponential backoff + jitter',
      'ScaffoldEngine orchestrates pattern selection, assembly, and quality gates',
      'Genesis pipeline deploys simulations to Vercel preview with mock enforcement',
      'Soul extraction captures validated requirements at Stage 16',
      'Regeneration creates fresh production code at Stage 17 (no simulation copy)'
    ],

    success_metrics: [
      { metric: 'All 4 child SDs completed', target: '100%', measurement: 'Child SD completion status' },
      { metric: 'API call retry success rate', target: '>95%', measurement: 'Successful retries / total retries' },
      { metric: 'Simulation deployment success rate', target: '>90%', measurement: 'Successful deploys / total attempts' }
    ],

    key_principles: [
      'Consolidate over Greenfield: REUSE existing lib/genesis/* modules',
      'Virtual Bunker: Simulations are ephemeral thought experiments',
      'Stage 17 Only: Physical repos created ONLY at Stage 17 via regeneration',
      'Triangulation: OpenAI + AntiGravity + Claude consensus on all decisions'
    ],

    metadata: {
      vision_spec_references: {
        version: 'GENESIS-V32',
        primary_spec: 'docs/vision/GENESIS_VIRTUAL_BUNKER_ADDENDUM.md',
        supporting_specs: [
          'docs/prompts/virtual-bunker-validation-openai.md',
          'docs/prompts/virtual-bunker-validation-antigravity.md'
        ]
      },
      triangulation: {
        openai_reviewed: true,
        antigravity_reviewed: true,
        consensus: 'GO WITH CHANGES',
        key_insight: 'lib/genesis/* already exists - consolidate, not greenfield'
      },
      cosmic_alignment: 'Saturn in Aries - Structure earned through validation, not premature permanence',
      capacity: {
        children: [
          'SD-GENESIS-V32-PULSE',
          'SD-GENESIS-V32-SCAFFOLD',
          'SD-GENESIS-V32-EPHEMERAL',
          'SD-GENESIS-V32-REGEN'
        ]
      }
    },

    dependencies: [],

    risks: [
      {
        risk: 'P0: leo_error_log table MISSING but code writes to it',
        severity: 'critical',
        mitigation: 'Create migration immediately in PULSE (first child SD)',
        found_by: 'Both councils'
      },
      {
        risk: 'Schema drift: vercel-deploy.js uses wrong tables',
        severity: 'high',
        mitigation: 'HARDEN to use simulation_sessions as canonical state',
        found_by: 'OpenAI'
      },
      {
        risk: 'Mock mode naming mismatch (EHG_MOCK_MODE vs VITE_MOCK_MODE)',
        severity: 'medium',
        mitigation: 'Bridge naming in generated code',
        found_by: 'OpenAI'
      }
    ]
  },

  // -------------------------------------------------------------------------
  // LEVEL 1: CHILD SDs
  // -------------------------------------------------------------------------

  pulse: {
    id: 'SD-GENESIS-V32-PULSE',
    sd_key: 'genesis-v32-pulse',
    sd_key: 'SD-GENESIS-V32-PULSE',
    title: 'Self-Healing Heart - Retry & Recovery System',

    description: 'Build resilient retry/backoff infrastructure for all external API calls (OpenAI, Vercel, Supabase). Fix P0 critical gap: create leo_error_log table that code writes to but does not exist. Implement exponential backoff with jitter to prevent thundering herd. Refactor _logErrorSilently to _attemptRecovery with actionable guidance.',

    scope: 'Resilience layer: retry-executor.js module, leo_error_log table migration, HandoffRecorder refactoring for recovery.',

    rationale: 'PULSE must run first - cannot build reliability on shaky ground. Both councils agreed on P0 priority for leo_error_log fix and retry infrastructure.',

    category: 'infrastructure',
    sd_type: 'infrastructure',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V32-ALTERNATOR',
    sequence_rank: 1,
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Create leo_error_log table for critical failure persistence (P0 fix)',
      'Implement retry-executor.js with exponential backoff + jitter',
      'Detect non-retryable errors (401/403) and fail fast',
      'Refactor _logErrorSilently to _attemptRecovery with recovery guidance'
    ],

    success_criteria: [
      'leo_error_log table exists with proper schema (id, timestamp, error_type, context, recovery_guidance)',
      'Retry executor retries 3 times with exponential backoff + jitter',
      'Auth failures (401/403) fail immediately without retry',
      'Failed operations after 3 retries log CRITICAL to leo_error_log',
      '_attemptRecovery provides actionable next steps on failure'
    ],

    success_metrics: [
      { metric: 'leo_error_log table created', target: '1', measurement: 'Table exists in database' },
      { metric: 'Retry executor test coverage', target: '>80%', measurement: 'Unit test pass rate' },
      { metric: 'Error recovery rate', target: '>90%', measurement: 'Recoverable errors / total errors' }
    ],

    key_principles: [
      'P0 First: Fix critical gaps before building features',
      'Exponential Backoff: Always use jitter to prevent thundering herd',
      'Fail Fast: Non-retryable errors (401/403) should not retry',
      'Recovery Guidance: Every error should provide actionable next steps'
    ],

    metadata: {
      triangulation: {
        openai_emphasis: 'Idempotency keys for retry safety',
        antigravity_emphasis: 'PULSE must run first - foundation matters'
      },
      files_to_create: [
        'scripts/modules/resilience/retry-executor.js',
        'database/migrations/YYYYMMDD_leo_error_log.sql'
      ],
      files_to_modify: [
        'scripts/modules/handoff/recording/HandoffRecorder.js'
      ],
      prd_requirements: {
        functional_requirements: 3,
        acceptance_criteria: 3,
        test_scenarios: 0, // Infrastructure type - no E2E
        requires_architecture: false,
        requires_risks: false
      }
    },

    dependencies: [],

    risks: []
  },

  scaffold: {
    id: 'SD-GENESIS-V32-SCAFFOLD',
    sd_key: 'genesis-v32-scaffold',
    sd_key: 'SD-GENESIS-V32-SCAFFOLD',
    title: 'Pattern Library - Code Generation Engine',

    description: 'Build the pattern library and code generation engine that creates simulation code from PRD requirements. REUSE existing lib/genesis/pattern-library.js, pattern-assembler.js, and quality-gates.js. ADD pattern selection logic (PRD features -> pattern IDs) and ScaffoldEngine orchestrator. Seed 20+ large patterns (full pages, not components). Enforce mock-mode in all generated code.',

    scope: 'Pattern library consolidation: pattern-selector.js (NEW), ScaffoldEngine.js (NEW), seed-patterns.js (NEW). REUSE pattern-library.js, pattern-assembler.js, quality-gates.js.',

    rationale: 'OpenAI discovered lib/genesis/* already exists. V32 consolidates rather than duplicates. Large patterns preferred to reduce "code compiler" risk (AntiGravity).',

    category: 'feature',
    sd_type: 'feature',
    priority: 'critical',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V32-ALTERNATOR',
    sequence_rank: 2,
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Deterministic PRD -> pattern selection (same inputs -> same outputs)',
      'REUSE existing pattern-library.js and pattern-assembler.js',
      'Enforce mock-mode in all generated code entrypoints',
      'Run quality gates (TypeScript, ESLint, Build) and block on failure',
      'Seed 20+ large patterns (pages/layouts, not components)'
    ],

    success_criteria: [
      'pattern-selector.js maps PRD features to pattern IDs deterministically',
      'ScaffoldEngine orchestrates library + assembler + gates',
      'All generated code includes mock-mode enforcement check',
      'Quality gates block deployment on tsc/eslint/build failure',
      'scaffold_patterns table seeded with 20+ large patterns'
    ],

    success_metrics: [
      { metric: 'Patterns seeded', target: '20+', measurement: 'Count of patterns in scaffold_patterns table' },
      { metric: 'Pattern selection accuracy', target: '100%', measurement: 'Same inputs produce same outputs' },
      { metric: 'Quality gate pass rate', target: '>85%', measurement: 'Generated code passes tsc/eslint/build' }
    ],

    key_principles: [
      'REUSE Over Create: Leverage existing lib/genesis/pattern-*.js modules',
      'Deterministic Selection: Same inputs must produce same pattern outputs',
      'Large Patterns: Prefer full pages over small components (reduce compiler risk)',
      'Mock Enforcement: All generated code must include mock-mode check'
    ],

    metadata: {
      triangulation: {
        openai_emphasis: 'Keep pattern selection deterministic in v1 (no LLM in selection loop)',
        antigravity_emphasis: 'Large patterns reduce composition risk'
      },
      reuse_files: [
        'lib/genesis/pattern-library.js',
        'lib/genesis/pattern-assembler.js',
        'lib/genesis/quality-gates.js'
      ],
      files_to_create: [
        'scripts/genesis/pattern-selector.js',
        'lib/genesis/ScaffoldEngine.js',
        'scripts/seed-patterns.js'
      ],
      prd_requirements: {
        functional_requirements: 5,
        acceptance_criteria: 5,
        test_scenarios: 5,
        requires_architecture: true,
        requires_risks: true
      }
    },

    dependencies: ['SD-GENESIS-V32-PULSE'],

    risks: [
      {
        risk: 'Pattern mismatch between mock/prod variants',
        mitigation: 'Add variant column to scaffold_patterns, ensure strict alignment'
      }
    ]
  },

  ephemeral: {
    id: 'SD-GENESIS-V32-EPHEMERAL',
    sd_key: 'genesis-v32-ephemeral',
    sd_key: 'SD-GENESIS-V32-EPHEMERAL',
    title: 'Preview Pipeline - Ephemeral Deployment System',

    description: 'Build the pipeline that takes generated code -> deploys to Vercel preview -> manages lifecycle. HARDEN existing vercel-deploy.js, ttl-cleanup.js, branch-lifecycle.js. ADD genesis-pipeline.js orchestrator and genesis-gate.js for ratification. Use simulation_sessions as canonical state (fix schema drift).',

    scope: 'Preview pipeline: HARDEN vercel-deploy.js, ttl-cleanup.js. ADD genesis-pipeline.js, genesis-gate.js, /api/genesis/ratify endpoint.',

    rationale: 'OpenAI found schema drift in vercel-deploy.js. V32 hardens existing files and adds pipeline orchestration with Genesis Gate ratification.',

    category: 'feature',
    sd_type: 'feature',
    priority: 'high',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V32-ALTERNATOR',
    sequence_rank: 3,
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Orchestrate genesis pipeline (seed -> PRD -> SCAFFOLD -> deploy)',
      'HARDEN Vercel deploy to write preview_url to simulation_sessions',
      'Implement Genesis Gate ratification endpoint',
      'Enforce TTL lifecycle and manual incineration',
      'Validate mock-mode is enabled in deployed preview'
    ],

    success_criteria: [
      '"leo genesis create" generates code and deploys to Vercel preview',
      'Preview URL returned: {venture}-{hash}.vercel.app',
      'Genesis Gate (/ratify) creates venture at Stage 1',
      'TTL management: 90-day auto-cleanup',
      'Post-deploy verification confirms mock-mode enabled'
    ],

    success_metrics: [
      { metric: 'End-to-end pipeline success rate', target: '>80%', measurement: 'Successful deploys / total attempts' },
      { metric: 'Vercel preview deployment time', target: '<5min', measurement: 'Time from code generation to live URL' },
      { metric: 'Mock-mode verification pass rate', target: '100%', measurement: 'All deployed previews have mock-mode enabled' }
    ],

    key_principles: [
      'HARDEN Over Create: Fix existing vercel-deploy.js, do not duplicate',
      'simulation_sessions Canonical: Use as single source of truth for state',
      'Post-Deploy Verification: Always verify mock-mode after deployment',
      'TTL Enforcement: 90-day auto-cleanup is non-negotiable'
    ],

    metadata: {
      triangulation: {
        openai_emphasis: 'Standardize on simulation_sessions (eliminate genesis_deployments dependency)',
        antigravity_emphasis: 'Post-deploy mock verify catches production leakage'
      },
      harden_files: [
        'lib/genesis/vercel-deploy.js',
        'lib/genesis/ttl-cleanup.js',
        'lib/genesis/branch-lifecycle.js'
      ],
      files_to_create: [
        'scripts/genesis/genesis-pipeline.js',
        'scripts/genesis/genesis-gate.js',
        'pages/api/genesis/ratify.ts'
      ],
      prd_requirements: {
        functional_requirements: 5,
        acceptance_criteria: 5,
        test_scenarios: 5,
        requires_architecture: true,
        requires_risks: true
      }
    },

    dependencies: ['SD-GENESIS-V32-SCAFFOLD'],

    risks: [
      {
        risk: 'Mock mode bypass in deployed preview',
        mitigation: 'Post-deploy verification step checks mock-mode header/URL'
      }
    ]
  },

  regen: {
    id: 'SD-GENESIS-V32-REGEN',
    sd_key: 'genesis-v32-regen',
    sd_key: 'SD-GENESIS-V32-REGEN',
    title: 'Soul Extraction - Stage 16/17 Regeneration',

    description: 'Build the regeneration mechanics that extract validated requirements from simulations (Stage 16) and generate fresh production-ready code (Stage 17). Soul = WHAT worked, not HOW it was coded. Physical repos created ONLY at Stage 17, not during simulation phases. Simulation code NEVER migrates to production.',

    scope: 'Soul extraction and regeneration: soul-extractor.js (Stage 16), regeneration-gate.js (Stage 16/17 validation), production-generator.js (fresh code), repo-creator.js (Stage 17 GitHub only).',

    rationale: 'Both councils emphasized: simulations capture validated requirements, but production gets FRESH code from soul, not simulation copy. This prevents simulation artifacts from contaminating production.',

    category: 'feature',
    sd_type: 'feature',
    priority: 'high',
    status: 'draft',
    relationship_type: 'child',
    parent_sd_id: 'SD-GENESIS-V32-ALTERNATOR',
    sequence_rank: 4,
    created_by: 'LEO',
    version: '1.0',

    strategic_objectives: [
      'Extract "soul" from simulation (validated requirements, data model, user flows)',
      'Implement regeneration gate validating Stage 16/17 prerequisites',
      'Generate FRESH production code from soul (not simulation copy)',
      'Create GitHub repo ONLY during Stage 17',
      'Validate no simulation markers in regenerated output'
    ],

    success_criteria: [
      'soul_extractions table captures validated requirements from Stage 1-15',
      'Stage 16 gate validates all user stories pass UAT',
      'Stage 17 regeneration creates fresh code from extracted soul',
      'Physical GitHub repo created ONLY after Stage 17 regeneration',
      'Regenerated code contains zero simulation markers'
    ],

    success_metrics: [
      { metric: 'Soul extraction completeness', target: '100%', measurement: 'All validated requirements captured in soul_extractions' },
      { metric: 'Regeneration success rate', target: '>90%', measurement: 'Fresh code passes quality gates' },
      { metric: 'Simulation marker removal rate', target: '100%', measurement: 'Zero simulation markers in production code' }
    ],

    key_principles: [
      'Soul = WHAT, Not HOW: Extract validated requirements, not implementation details',
      'Stage 17 Only: Physical repos created ONLY after regeneration',
      'Fresh Code: Generate new production code, never copy simulation artifacts',
      'Zero Contamination: No simulation markers in regenerated output'
    ],

    metadata: {
      triangulation: {
        openai_emphasis: 'Soul extraction captures WHAT worked, not HOW it was coded',
        antigravity_emphasis: 'Regeneration prevents simulation artifacts from reaching production'
      },
      files_to_create: [
        'scripts/genesis/soul-extractor.js',
        'scripts/genesis/regeneration-gate.js',
        'scripts/genesis/production-generator.js',
        'lib/genesis/repo-creator.js'
      ],
      prd_requirements: {
        functional_requirements: 5,
        acceptance_criteria: 5,
        test_scenarios: 5,
        requires_architecture: true,
        requires_risks: true
      }
    },

    dependencies: ['SD-GENESIS-V32-EPHEMERAL'],

    risks: [
      {
        risk: 'Soul extraction complexity',
        mitigation: 'Clear schema separation (simulation vs production), structured extraction format'
      },
      {
        risk: 'Regeneration drift from simulation',
        mitigation: 'Fresh code generation from soul, never copy simulation'
      }
    ]
  }
};

// ============================================================================
// INSERTION ORDER - Respects parent-child hierarchy
// ============================================================================

const INSERTION_ORDER = [
  'alternator',  // Parent orchestrator
  'pulse',       // Child 1: Infrastructure (FIRST)
  'scaffold',    // Child 2: Feature (depends on PULSE)
  'ephemeral',   // Child 3: Feature (depends on SCAFFOLD)
  'regen'        // Child 4: Feature (depends on EPHEMERAL)
];

// ============================================================================
// MAIN INSERTION FUNCTION
// ============================================================================

async function createGenesisV32SDs() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   GENESIS V32 ALTERNATOR - STRATEGIC DIRECTIVE CREATION       ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║  Mission: "Consolidate + Harden" Virtual Bunker Architecture  ║');
  console.log('║  Triangulated: OpenAI + AntiGravity + Claude                  ║');
  console.log('║  Total SDs: 5 (1 parent orchestrator, 4 children)             ║');
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
    inserted: [],
    updated: [],
    failed: []
  };

  console.log('📋 Inserting SDs in hierarchy order...\n');

  for (const key of INSERTION_ORDER) {
    const sd = GENESIS_V32_SDS[key];

    // Prepare the record for database insertion
    const record = {
      id: sd.id,
      sd_key: sd.sd_key,
      sd_key: sd.sd_key,
      title: sd.title,
      description: sd.description,
      scope: sd.scope,
      rationale: sd.rationale,
      category: sd.category,
      sd_type: sd.sd_type,
      priority: sd.priority,
      status: sd.status,
      relationship_type: sd.relationship_type,
      parent_sd_id: sd.parent_sd_id,
      sequence_rank: sd.sequence_rank,
      created_by: sd.created_by,
      version: sd.version,
      strategic_objectives: sd.strategic_objectives,
      success_criteria: sd.success_criteria,
      success_metrics: sd.success_metrics,
      key_principles: sd.key_principles,
      metadata: sd.metadata,
      dependencies: sd.dependencies,
      risks: sd.risks
    };

    try {
      // Try to insert, on conflict update
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .upsert(record, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        console.error(`   ❌ ${sd.id}: ${error.message}`);
        results.failed.push({ id: sd.id, error: error.message });
      } else {
        console.log(`   ✅ ${sd.id} (${sd.sd_type})`);
        results.inserted.push(sd.id);
      }
    } catch (err) {
      console.error(`   ❌ ${sd.id}: ${err.message}`);
      results.failed.push({ id: sd.id, error: err.message });
    }
  }

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                         SUMMARY                               ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log(`║  ✅ Inserted/Updated: ${results.inserted.length} SDs                                  ║`);
  console.log(`║  ❌ Failed: ${results.failed.length} SDs                                         ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  if (results.failed.length > 0) {
    console.log('Failed SDs:');
    results.failed.forEach(f => console.log(`  - ${f.id}: ${f.error}`));
    process.exit(1);
  }

  // Show SD hierarchy
  console.log('📊 SD Hierarchy:');
  console.log('');
  console.log('  SD-GENESIS-V32-ALTERNATOR (orchestrator)');
  console.log('  ├── SD-GENESIS-V32-PULSE (infrastructure) [ORDER: 1]');
  console.log('  │   └── P0: Fix leo_error_log, add circuit breaker');
  console.log('  ├── SD-GENESIS-V32-SCAFFOLD (feature) [ORDER: 2]');
  console.log('  │   └── REUSE lib/genesis/pattern-*.js, add selection logic');
  console.log('  ├── SD-GENESIS-V32-EPHEMERAL (feature) [ORDER: 3]');
  console.log('  │   └── HARDEN vercel-deploy.js, fix mock mode');
  console.log('  └── SD-GENESIS-V32-REGEN (feature) [ORDER: 4]');
  console.log('      └── Stage 16/17 soul extraction + regeneration');
  console.log('');

  console.log('📝 Next steps:');
  console.log('1. Execute LEAD-TO-PLAN for SD-GENESIS-V32-PULSE (first child)');
  console.log('   node scripts/handoff.js execute LEAD-TO-PLAN SD-GENESIS-V32-PULSE');
  console.log('2. Create PRD using add-prd-to-database.js');
  console.log('3. Follow LEAD→PLAN→EXEC for each SD in order');
  console.log('');
  console.log('🎯 Ultimate Test: leo genesis create "Uber for Dog Walking"');
  console.log('');
}

// Run
createGenesisV32SDs().catch(console.error);
