#!/usr/bin/env node
/**
 * Create Refactoring Child SDs
 *
 * Creates Strategic Directives for the codebase refactoring initiative
 * identified by Claude Code exploration on 2025-12-27.
 *
 * Usage:
 *   node scripts/create-refactoring-child-sds.js [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
// import { randomUUID } from 'crypto'; // Unused - IDs are provided externally
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const dryRun = process.argv.includes('--dry-run');

// Parent SD for all refactoring work
const PARENT_SD_ID = 'SD-REFACTOR-CODEBASE-001';

// Refactoring SDs based on exploration findings
const REFACTORING_SDS = [
  {
    id: 'SD-REFACTOR-SCRIPTS-001',
    title: 'Script Framework Consolidation',
    category: 'infrastructure',
    priority: 'high',
    description: 'Consolidate 51 duplicate scripts (37 create-prd + 14 add-user-stories) into a shared framework with parametric execution.',
    rationale: 'Current state: 46,000+ lines of duplicated code across similar scripts. Each script repeats Supabase initialization, validation, and insertion patterns. This creates maintenance burden and inconsistency.',
    scope: `Scope includes:
- Create PRDFactory class for 37 create-prd scripts
- Create UserStoryBuilder/Inserter for 14 add-user-stories scripts
- Extract shared patterns into lib/scripts/ directory
- Convert scripts to thin wrappers calling framework

Files affected:
- scripts/create-prd-*.js (37 files)
- scripts/add-user-stories-*.js (14 files)
- lib/scripts/prd-factory.js (new)
- lib/scripts/user-story-builder.js (new)`,
    strategic_objectives: [
      'Reduce script codebase by 60-70% (30,000+ lines)',
      'Enable non-engineers to generate scripts via configuration',
      'Establish consistent patterns for future script creation'
    ],
    success_criteria: [
      'All 51 scripts converted to use shared framework',
      'No functional regression in PRD/story creation',
      'New scripts can be created in <50 lines using framework'
    ],
    estimated_lines_saved: 30000
  },
  {
    id: 'SD-REFACTOR-SUBAGENTS-001',
    title: 'Sub-Agent Base Class & Pattern Extraction',
    category: 'infrastructure',
    priority: 'high',
    description: 'Create base class for 26 sub-agents to eliminate 100% structural duplication (Supabase init, result objects, phase execution).',
    rationale: 'All 26 sub-agents duplicate: Supabase lazy init (200-250 lines), result object structure (150-200 lines), phase-based execution (1,000-1,500 lines), and recommendation generation (200-300 lines).',
    scope: `Scope includes:
- Create lib/sub-agents/base-subagent.js with common patterns
- Extract phase-based executor utility
- Create unified result builder
- Extract Supabase wrapper to shared utility
- Consolidate duplicate functions (printSummary, evaluate*)

Files affected:
- lib/sub-agents/*.js (26 files)
- lib/sub-agents/base-subagent.js (new)
- lib/utils/supabase-client-pool.js (new)
- lib/utils/result-builder.js (new)`,
    strategic_objectives: [
      'Reduce sub-agent boilerplate by 3,000-5,000 lines',
      'Enable consistent testing across all sub-agents',
      'Simplify creation of new sub-agents'
    ],
    success_criteria: [
      'All 26 sub-agents extend base class',
      'Zero functional regression',
      'New sub-agent creation requires <200 lines of domain logic'
    ],
    estimated_lines_saved: 4000
  },
  {
    id: 'SD-REFACTOR-DESIGN-001',
    title: 'Design Sub-Agent Modularization',
    category: 'infrastructure',
    priority: 'medium',
    description: 'Split design.js (2,563 lines, largest sub-agent) into 4 focused modules with extracted configuration.',
    rationale: 'Design sub-agent is 4x larger than recommended component size (600 LOC). Contains 33 helper functions mixing accessibility, component analysis, design system enforcement, and responsive design validation.',
    scope: `Scope includes:
- Extract AccessibilityValidator class (500+ lines)
- Extract ComponentAnalyzer class (400+ lines)
- Extract DesignMetricsCalculator class (400+ lines)
- Move inline design patterns to config/design-standards/
- Consolidate with lib/agents/design-sub-agent.js (remove duplicate)

Files affected:
- lib/sub-agents/design.js (2,563 lines → 4 modules)
- lib/agents/design-sub-agent.js (1,441 lines → merge or remove)
- config/design-standards/*.json (new)`,
    strategic_objectives: [
      'Reduce design.js to <600 lines',
      'Enable independent testing of accessibility, component, design validators',
      'Externalize design standards for easy updates'
    ],
    success_criteria: [
      'Each module under 600 lines',
      'Design standards in config files',
      'All design validation tests pass'
    ],
    estimated_lines_saved: 1500
  },
  {
    id: 'SD-REFACTOR-RETRO-001',
    title: 'Retrospective Sub-Agent Modularization',
    category: 'infrastructure',
    priority: 'medium',
    description: 'Split retro.js (2,082 lines) into 3 focused modules with learning templates in database.',
    rationale: 'Retrospective sub-agent contains 22 helper functions covering learning categorization, retrospective generation, SMART action items, and improvement areas. 600+ lines are hardcoded learning templates.',
    scope: `Scope includes:
- Extract RetroEvidenceCollector class
- Extract RetroAnalyzer class
- Extract RetroActionGenerator class
- Move learning templates to database table
- Extract semantic deduplication to shared utility

Files affected:
- lib/sub-agents/retro.js (2,082 lines → 3 modules)
- lib/utils/semantic-deduplication.js (new, 140 lines)
- database/schema/retrospective_templates.sql (new)`,
    strategic_objectives: [
      'Reduce retro.js to <700 lines per module',
      'Enable dynamic learning templates via database',
      'Share semantic deduplication across codebase'
    ],
    success_criteria: [
      'Each module under 700 lines',
      'Learning templates queryable from database',
      'Retrospective generation unchanged'
    ],
    estimated_lines_saved: 800
  },
  {
    id: 'SD-REFACTOR-AGENTS-001',
    title: 'Agent Library Modularization',
    category: 'infrastructure',
    priority: 'medium',
    description: 'Refactor 10 large agent files (600-950 lines each) into focused classes with shared utilities.',
    rationale: 'Ten agent files exceed 600-line target: dependency-sub-agent (947), cost-sub-agent (896), api-sub-agent (875), plan-verification-tool (796), auto-fix-engine (779), intelligent-multi-selector (765), learning-system (730), learning-database (702), testing-sub-agent (663), response-integrator (662).',
    scope: `Scope includes:
- Extract FileScanner utility (9 files use duplicate scanning)
- Extract CircuitBreakerManager (reusable resilience)
- Extract CacheManager (unified caching)
- Split each agent into 3-5 focused classes
- Create strategy patterns for analyzers

Files affected:
- lib/agents/*.js (10 files)
- lib/utils/file-scanner.js (new)
- lib/utils/circuit-breaker.js (new)
- lib/utils/cache-manager.js (new)`,
    strategic_objectives: [
      'Reduce each agent file to <500 lines',
      'Create reusable file scanning utility',
      'Establish circuit breaker pattern for resilience'
    ],
    success_criteria: [
      'All 10 agents under 500 lines',
      'FileScanner used by 9+ files',
      'No functional regression'
    ],
    estimated_lines_saved: 3000
  },
  {
    id: 'SD-REFACTOR-UTILS-001',
    title: 'Utility Library Consolidation',
    category: 'infrastructure',
    priority: 'medium',
    description: 'Consolidate scattered utility functions and create missing abstractions identified across codebase.',
    rationale: 'lib/utils has 14 files with 5,036 lines. test-intelligence.js (657 lines) is oversized. Duplicate patterns found: Supabase init (6 files), keyword extraction (4 files), file scanning (2 files), SD classification (3 files).',
    scope: `Scope includes:
- Split test-intelligence.js into 3 modules
- Create supabase-client-pool.js (6 files affected)
- Create text-analysis.js (4 files affected)
- Create file-scanner.js (2 files affected)
- Create sd-classifier.js (consolidate 3 files)
- Create specialist-base.js for quickfix-specialists.js

Files affected:
- lib/utils/test-intelligence.js (657 → 3 modules)
- lib/utils/quickfix-specialists.js (410 → base class)
- lib/utils/sd-type-*.js (3 files → consolidate)
- lib/utils/*.js (new utilities)`,
    strategic_objectives: [
      'Reduce test-intelligence.js to 3 focused modules',
      'Eliminate 400-500 lines of duplicated utility code',
      'Create reusable text analysis and file scanning'
    ],
    success_criteria: [
      'No utility file over 400 lines',
      'Duplicate patterns consolidated',
      'All tests pass'
    ],
    estimated_lines_saved: 700
  },
  {
    id: 'SD-REFACTOR-GOVERNANCE-001',
    title: 'Governance Library Unification',
    category: 'infrastructure',
    priority: 'medium',
    description: 'Unify 6 governance modules with shared base class, exception hierarchy, and configuration management.',
    rationale: 'Governance modules (hard-halt, four-oaths, manifesto-mode, crew-governance, semantic-diff, portfolio-calibrator) duplicate: exception classes (18 total), singleton patterns (5x), Supabase init (5x), logging (6 different prefixes), caching (3 different approaches).',
    scope: `Scope includes:
- Create GovernanceError hierarchy (consolidate 18 exceptions)
- Create GovernanceModule base class
- Create GovernanceConfig (unified configuration)
- Create GovernanceRepository (database patterns)
- Standardize logging with GovernanceLogger

Files affected:
- lib/governance/*.js (6 files)
- lib/governance/base/governance-error.js (new)
- lib/governance/base/governance-module.js (new)
- lib/governance/config/governance-config.js (new)`,
    strategic_objectives: [
      'Consolidate 18 exception classes into hierarchy',
      'Reduce governance boilerplate by 30%',
      'Enable environment-configurable governance'
    ],
    success_criteria: [
      'All governance modules extend base class',
      'Single exception hierarchy',
      'Configuration via environment variables'
    ],
    estimated_lines_saved: 500
  },
  {
    id: 'SD-REFACTOR-SERVER-001',
    title: 'Server Route Extraction',
    category: 'infrastructure',
    priority: 'high',
    description: 'Extract 59 route handlers from monolithic server.js (2,478 lines) into 11 modular route files.',
    rationale: 'server.js contains all route handlers, WebSocket logic, state management, and service initialization. Route handlers span 8 major domains with significant code duplication.',
    scope: `Scope includes:
- Extract routes/sdip.js (250 lines, 6 endpoints)
- Extract routes/backlog.js (350 lines, 4 endpoints)
- Extract routes/prd.js (200 lines, 4 endpoints)
- Extract routes/dashboard.js (80 lines, 9 endpoints)
- Extract routes/pr-reviews.js (60 lines, 3 endpoints)
- Extract routes/discovery.js (200 lines, 6 endpoints)
- Extract routes/calibration.js (130 lines, 4 endpoints)
- Extract routes/testing-campaign.js (280 lines, 6 endpoints)
- Extract routes/ventures.js (360 lines, 7 endpoints)
- Extract routes/venture-scoped.js (80 lines, 3 endpoints)
- Create routes/index.js for registration
- Create lib/backlog-formatter.js utility
- Create lib/openai-utilities.js utility

Files affected:
- server.js (2,478 → ~300 lines)
- routes/*.js (11 new files)
- lib/*.js (3 new utilities)`,
    strategic_objectives: [
      'Reduce server.js by 85% (2,178 lines)',
      'Enable independent route testing',
      'Establish modular route architecture'
    ],
    success_criteria: [
      'All 59 endpoints functional',
      'server.js under 400 lines',
      'Route files under 400 lines each'
    ],
    estimated_lines_saved: 700
  },
  {
    id: 'SD-REFACTOR-HANDOFF-001',
    title: 'Handoff Executor Optimization',
    category: 'infrastructure',
    priority: 'medium',
    description: 'Optimize 5 handoff executor classes that share 40-50% duplicate code despite using BaseExecutor inheritance.',
    rationale: 'Handoff executors (PlanToExec, PlanToLead, LeadToPlan, ExecToPlan, LeadFinalApproval) total 4,775 lines. Despite inheriting from BaseExecutor (263 lines), each duplicates: gate configuration (30-50%), prerequisite handoff validation, repository determination, session claiming, and error handling.',
    scope: `Scope includes:
- Extract PrerequisiteHandoffValidator component
- Create GateComposer for auto-generating common gates
- Move repository determination to RepositoryDetectionStrategy
- Create SessionClaimManager singleton
- Reduce each executor to 300-400 lines (methodology-specific only)

Files affected:
- scripts/modules/handoff/executors/PlanToExecExecutor.js (1,338 lines)
- scripts/modules/handoff/executors/PlanToLeadExecutor.js (1,183 lines)
- scripts/modules/handoff/executors/LeadToPlanExecutor.js (849 lines)
- scripts/modules/handoff/executors/ExecToPlanExecutor.js (748 lines)
- scripts/modules/handoff/executors/LeadFinalApprovalExecutor.js (657 lines)
- scripts/modules/handoff/executors/BaseExecutor.js (263 lines → enhanced)
- scripts/modules/handoff/components/*.js (new extracted components)`,
    strategic_objectives: [
      'Reduce total executor code by 40-50% (2,000+ lines)',
      'Enable consistent gate behavior across all executors',
      'Simplify creation of new handoff executors'
    ],
    success_criteria: [
      'Each executor under 400 lines',
      'All handoff transitions functional',
      'Shared components tested independently'
    ],
    estimated_lines_saved: 2000
  },
  {
    id: 'SD-REFACTOR-VERIFY-001',
    title: 'Verify Handoff Script Decomposition',
    category: 'infrastructure',
    priority: 'medium',
    description: 'Decompose 2 large verify-handoff scripts into modular components with reusable validation logic.',
    rationale: 'verify-handoff-lead-to-plan.js (1,497 lines) and verify-handoff-plan-to-exec.js (1,120 lines) contain 5 mixed responsibilities each: SD validation, orchestrator detection, handoff template management, execution record creation, and phase transition updates. Orchestrator special-case handling adds 60 lines of inline logic breaking single responsibility.',
    scope: `Scope includes:
- Extract HandoffValidationOrchestrator (shared validation logic)
- Extract OrchestratorDetectionStrategy (special-case handling)
- Extract HandoffTemplateRepository (template management)
- Extract ExecutionRecorder (record creation)
- Create shared verification base class

Files affected:
- scripts/verify-handoff-lead-to-plan.js (1,497 lines → ~500 lines)
- scripts/verify-handoff-plan-to-exec.js (1,120 lines → ~400 lines)
- scripts/modules/handoff/validators/HandoffValidationOrchestrator.js (new)
- scripts/modules/handoff/validators/OrchestratorDetectionStrategy.js (new)
- scripts/modules/handoff/validators/HandoffTemplateRepository.js (new)
- scripts/modules/handoff/validators/ExecutionRecorder.js (new)`,
    strategic_objectives: [
      'Reduce verify scripts by ~40% (1,000+ lines)',
      'Enable reusable validation components',
      'Isolate orchestrator special-case logic'
    ],
    success_criteria: [
      'Each verify script under 600 lines',
      'Validation components tested independently',
      'All handoff verifications pass'
    ],
    estimated_lines_saved: 1000
  }
];

async function checkExistingSD(sdId) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, status')
    .eq('id', sdId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return data;
}

async function createSD(sd) {
  // Generate sd_key from id (e.g., SD-REFACTOR-SCRIPTS-001 -> SD-REFACTOR-SCRIPTS-001)
  const sdKey = sd.id;

  const sdData = {
    id: sd.id,
    sd_key: sdKey,
    title: sd.title,
    version: '1.0',
    status: 'draft',
    category: sd.category,
    priority: sd.priority,
    description: sd.description,
    rationale: sd.rationale,
    scope: sd.scope,
    strategic_intent: 'Improve codebase maintainability through targeted refactoring',
    strategic_objectives: sd.strategic_objectives,
    success_criteria: sd.success_criteria,
    key_changes: [
      `Estimated lines saved: ${sd.estimated_lines_saved}`,
      'Improved testability and modularity',
      'Reduced code duplication'
    ],
    dependencies: [PARENT_SD_ID],
    risks: [
      {
        description: 'Functional regression during refactoring',
        mitigation: 'Comprehensive test coverage before changes',
        severity: 'medium'
      },
      {
        description: 'Increased complexity during transition',
        mitigation: 'Incremental migration with feature flags',
        severity: 'low'
      }
    ],
    metadata: {
      parent_sd: PARENT_SD_ID,
      sd_type: 'infrastructure',
      estimated_lines_saved: sd.estimated_lines_saved,
      created_by: 'Claude Code Refactoring Analysis',
      created_at: new Date().toISOString()
    },
    created_by: 'Claude Code',
    updated_by: 'Claude Code'
  };

  if (dryRun) {
    console.log(`[DRY-RUN] Would create SD: ${sd.id}`);
    console.log(`  Title: ${sd.title}`);
    console.log(`  Priority: ${sd.priority}`);
    console.log(`  Estimated lines saved: ${sd.estimated_lines_saved}`);
    return { id: sd.id, status: 'dry-run' };
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(sdData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create SD ${sd.id}: ${error.message}`);
  }

  return data;
}

async function main() {
  console.log('='.repeat(60));
  console.log('REFACTORING CHILD SD CREATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`Parent SD: ${PARENT_SD_ID}`);
  console.log(`SDs to create: ${REFACTORING_SDS.length}`);
  console.log('');

  const results = {
    created: [],
    skipped: [],
    errors: []
  };

  for (const sd of REFACTORING_SDS) {
    try {
      const existing = await checkExistingSD(sd.id);
      if (existing) {
        console.log(`SKIP: ${sd.id} already exists (status: ${existing.status})`);
        results.skipped.push(sd.id);
        continue;
      }

      const _created = await createSD(sd);
      console.log(`CREATE: ${sd.id} - ${sd.title}`);
      console.log(`  Lines saved: ~${sd.estimated_lines_saved}`);
      results.created.push(sd.id);
    } catch (error) {
      console.error(`ERROR: ${sd.id} - ${error.message}`);
      results.errors.push({ id: sd.id, error: error.message });
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Created: ${results.created.length}`);
  console.log(`Skipped: ${results.skipped.length}`);
  console.log(`Errors: ${results.errors.length}`);

  const totalLinesSaved = REFACTORING_SDS
    .filter(sd => results.created.includes(sd.id))
    .reduce((sum, sd) => sum + sd.estimated_lines_saved, 0);

  console.log(`Total estimated lines saved: ${totalLinesSaved.toLocaleString()}`);
  console.log('');

  if (results.errors.length > 0) {
    console.log('Errors:');
    for (const err of results.errors) {
      console.log(`  - ${err.id}: ${err.error}`);
    }
  }

  return results;
}

main().catch(console.error);
