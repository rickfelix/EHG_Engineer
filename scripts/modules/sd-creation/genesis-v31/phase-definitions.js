/**
 * Genesis Oath v3.1 Phase SD Definitions
 * Contains Level 2 (Phase) SDs - children of Sprint SDs
 */

// MASON PHASES
export const masonP1 = {
  id: 'SD-GENESIS-V31-MASON-P1',
  sd_key: 'genesis-v31-mason-p1',
  // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
  title: 'Mason Phase 1: Ephemeral Foundation',
  description: 'Establish the foundational infrastructure for the Simulation Chamber. Create the ehg-simulations GitHub organization with proper isolation, configure *.possible.ehg.dev wildcard DNS, implement schema_sim_* database namespace convention in Supabase, build the epistemic_status tagging system, create simulation_artifacts table with full tracking, implement TTL auto-archive triggers, and set up GitHub API integration for the simulation org.',
  scope: 'GitHub org creation, DNS configuration, database namespace setup, epistemic tagging schema, TTL system implementation, simulation metadata table, GitHub API auth.',
  rationale: 'The ephemeral foundation creates the isolated container where simulations will live. Hard technical isolation (different accounts, credentials, orgs) prevents accidental production contamination.',
  category: 'infrastructure',
  priority: 'critical',
  status: 'draft',
  relationship_type: 'child',
  parent_sd_id: 'SD-GENESIS-V31-MASON',
  sequence_rank: 1,
  created_by: 'LEO',
  version: '3.1',
  strategic_objectives: ['Create ehg-simulations GitHub org with isolated credentials', 'Configure *.possible.ehg.dev wildcard DNS', 'Implement schema_sim_* namespace convention', 'Build epistemic_status tagging into all artifact tables', 'Create simulation_artifacts table with TTL tracking'],
  success_criteria: ['ehg-simulations org accessible at github.com/ehg-simulations', 'DNS *.possible.ehg.dev configured and resolving', 'CREATE SCHEMA schema_sim_test works in Supabase', 'epistemic_status enum exists: simulation, pending_elevation, elevated, archived', 'simulation_artifacts table includes expires_at calculation', 'TTL cleanup job scheduled and tested'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md', sections: ['The Two Namespaces (Hard Isolation)', 'Database Schema'] },
    must_read_before_prd: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
    timeline: { start: '2025-12-29', end: '2026-01-05', duration_days: 8 },
    capacity: { sds: 40, hours: 13 }
  },
  dependencies: [],
  risks: []
};

export const masonP2 = {
  id: 'SD-GENESIS-V31-MASON-P2',
  sd_key: 'genesis-v31-mason-p2',
  // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
  title: 'Mason Phase 2: Simulation Scaffolder',
  description: 'Build the repository and schema scaffolding systems. Create venture scaffold templates (Next.js SaaS starter, API service), implement automated repo creation in ehg-simulations org, set up git init and initial commit automation, build schema template library with pre-validated patterns, and create migration generator that converts JSON schema definitions to SQL migrations.',
  scope: 'Repo template system, gh repo create automation, git init automation, schema template library, JSON-to-SQL migration generator.',
  rationale: 'With foundation in place, the scaffolder enables rapid generation of venture infrastructure. Templates ensure consistency while automation enables speed.',
  category: 'infrastructure',
  priority: 'critical',
  status: 'draft',
  relationship_type: 'child',
  parent_sd_id: 'SD-GENESIS-V31-MASON',
  sequence_rank: 2,
  created_by: 'LEO',
  version: '3.1',
  strategic_objectives: ['Create reusable venture scaffold templates', 'Automate GitHub repo creation in simulation org', 'Build schema template library with validated patterns', 'Implement migration generator from JSON schema'],
  success_criteria: ['next-saas-starter template available and customizable', 'gh repo create automation creates repos in ehg-simulations', 'Initial commit automation pushes template with venture config', 'Schema templates cover common SaaS patterns (users, subscriptions, etc.)', 'Migration generator produces valid SQL from JSON schema'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md', sections: ['Infrastructure Components', 'GitHub Integration'] },
    must_read_before_prd: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
    timeline: { start: '2026-01-06', end: '2026-01-12', duration_days: 7 },
    capacity: { sds: 35, hours: 12 }
  },
  dependencies: ['SD-GENESIS-V31-MASON-P1'],
  risks: []
};

export const masonP3 = {
  id: 'SD-GENESIS-V31-MASON-P3',
  sd_key: 'genesis-v31-mason-p3',
  // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
  title: 'Mason Phase 3: Ephemeral Deploy',
  description: 'Build the ephemeral deployment pipeline. Set up Vercel simulation project with separate team account, implement deploy automation from repo push to live URL, create SIMULATION watermark overlay middleware, add health check endpoint with simulation metadata, implement cost cap enforcement to prevent runaway spending, and build garbage collection for Stage 3 rejection cleanup.',
  scope: 'Vercel project setup, deploy automation, watermark middleware, health endpoints, cost caps, garbage collection.',
  rationale: 'The deployment pipeline makes simulations visible as running applications. The watermark ensures users never mistake simulation for production. Cost caps and garbage collection prevent resource waste.',
  category: 'infrastructure',
  priority: 'critical',
  status: 'draft',
  relationship_type: 'child',
  parent_sd_id: 'SD-GENESIS-V31-MASON',
  sequence_rank: 3,
  created_by: 'LEO',
  version: '3.1',
  strategic_objectives: ['Deploy simulations to *.possible.ehg.dev automatically', 'Display SIMULATION watermark on all simulation URLs', 'Implement cost controls for simulation infrastructure', 'Clean up rejected simulations automatically'],
  success_criteria: ['Vercel simulation project with separate team credentials', 'Repo push triggers automatic deployment', 'SIMULATION banner displays on all simulation pages', '/health endpoint returns 200 with simulation metadata', 'Daily cost stays under $5 per simulation limit', 'Stage 3 rejection triggers infrastructure destruction'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md', sections: ['Deployment Infrastructure', 'Lifecycle Management'] },
    must_read_before_prd: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
    timeline: { start: '2026-01-13', end: '2026-01-19', duration_days: 7 },
    capacity: { sds: 35, hours: 12 }
  },
  dependencies: ['SD-GENESIS-V31-MASON-P1', 'SD-GENESIS-V31-MASON-P2'],
  risks: []
};

// DREAMCATCHER PHASES
export const dreamP1 = {
  id: 'SD-GENESIS-V31-DREAM-P1',
  sd_key: 'genesis-v31-dream-p1',
  // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
  title: 'Dreamcatcher Phase 1: PRD Generation',
  description: 'Build the text-to-PRD intelligence layer. Create venture seed parser that extracts structure from raw text, implement PRD template engine for Stage 1-2 artifact generation, build problem/solution extraction using NLP, generate functional requirements from seed analysis, and implement PRD quality validator with pass/fail gates.',
  scope: 'Seed parser, PRD template engine, NLP extraction, requirements generation, PRD validation gates.',
  rationale: 'The PRD is the official artifact (not simulation) that captures validated understanding of the venture concept. It scopes Stage 1-2 validation target, not solution commitment.',
  category: 'feature',
  priority: 'critical',
  status: 'draft',
  relationship_type: 'child',
  parent_sd_id: 'SD-GENESIS-V31-DREAMCATCHER',
  sequence_rank: 1,
  created_by: 'LEO',
  version: '3.1',
  strategic_objectives: ['Parse raw venture seed into structured data', 'Generate PRD as official Stage 1-2 artifact', 'Extract problem statement and solution hypothesis', 'Generate actionable functional requirements', 'Validate PRD quality before proceeding'],
  success_criteria: ['Seed parser handles various input formats', 'PRD template produces complete Stage 1-2 document', 'Problem/solution extraction accuracy > 80%', 'Generated requirements are specific and testable', 'PRD validator catches incomplete/low-quality output'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/GENESIS_OATH_V3.md', sections: ['PRD Scope Clarification'] },
    must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md'],
    must_read_before_exec: ['docs/vision/GENESIS_OATH_V3.md'],
    implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
    timeline: { start: '2026-01-20', end: '2026-01-26', duration_days: 7 },
    capacity: { sds: 45, hours: 15 }
  },
  dependencies: ['SD-GENESIS-V31-MASON'],
  risks: []
};

export const dreamP2 = {
  id: 'SD-GENESIS-V31-DREAM-P2',
  sd_key: 'genesis-v31-dream-p2',
  // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
  title: 'Dreamcatcher Phase 2: Schema/Repo Simulation',
  description: 'Build PRD-to-artifact intelligence. Create PRD-to-schema extraction that infers data model from requirements, implement schema generator producing SQL tables with relationships, build RLS policy generator for automatic security rules, implement PRD-to-repo extraction for tech requirements, and create repo customizer that applies PRD context to scaffold templates.',
  scope: 'PRD-to-schema intelligence, schema generator, RLS generator, PRD-to-repo intelligence, repo customizer.',
  rationale: 'With PRD generated, the system can now infer what database schema and application structure the venture needs. All generated artifacts are tagged as simulations (epistemic_status: simulation).',
  category: 'feature',
  priority: 'critical',
  status: 'draft',
  relationship_type: 'child',
  parent_sd_id: 'SD-GENESIS-V31-DREAMCATCHER',
  sequence_rank: 2,
  created_by: 'LEO',
  version: '3.1',
  strategic_objectives: ['Extract data model from PRD requirements', 'Generate SQL schema with proper relationships', 'Auto-generate RLS security policies', 'Extract technology requirements from PRD', 'Customize repo scaffold with venture specifics'],
  success_criteria: ['PRD-to-schema identifies entities and relationships', 'Schema generator produces valid SQL with foreign keys', 'RLS policies enforce basic access control', 'Tech requirements identify stack components', 'Repo customizer updates package.json, README, config'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md', sections: ['Database Schema', 'Infrastructure Components'] },
    must_read_before_prd: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
    timeline: { start: '2026-01-27', end: '2026-02-02', duration_days: 7 },
    capacity: { sds: 50, hours: 17 }
  },
  dependencies: ['SD-GENESIS-V31-DREAM-P1'],
  risks: []
};

export const dreamP3 = {
  id: 'SD-GENESIS-V31-DREAM-P3',
  sd_key: 'genesis-v31-dream-p3',
  // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
  title: 'Dreamcatcher Phase 3: EVA + Approval Gate',
  description: 'Build the approval ceremony and venture creation. Implement /ratify CLI command for the Contract of Pain, create approval prompt UI showing 25-stage commitment, build venture creation flow for post-ratify instantiation, implement stage scheduler to auto-schedule Stage 3 kill gate, integrate with EVA orchestration, and create simulation summary generator for the "Possible Future" display.',
  scope: '/ratify command, Contract of Pain UI, venture creation, stage scheduling, EVA integration, simulation summary.',
  rationale: 'The /ratify command is the threshold moment - the Chairman commits to 25 stages of labor to earn reality. This is not permission to skip validation; it\'s acceptance of the work required.',
  category: 'feature',
  priority: 'critical',
  status: 'draft',
  relationship_type: 'child',
  parent_sd_id: 'SD-GENESIS-V31-DREAMCATCHER',
  sequence_rank: 3,
  created_by: 'LEO',
  version: '3.1',
  strategic_objectives: ['Implement /ratify CLI command with ceremony', 'Display Contract of Pain with 25 stages visible', 'Create venture at Stage 1 after ratification', 'Auto-schedule Stage 3 kill gate date', 'Integrate simulation lifecycle with EVA'],
  success_criteria: ['/ratify command triggers approval ceremony', 'Contract of Pain displays all 25 stages and 4 kill gates', 'Venture created in database at Stage 1 post-ratify', 'Stage 3 date calculated and stored', 'EVA receives notification of new venture', 'Simulation summary shows all generated artifacts'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/GENESIS_OATH_V3.md', sections: ['The /ratify Command: Scope Definition'] },
    must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md', 'docs/vision/GENESIS_RITUAL_SPECIFICATION.md'],
    must_read_before_exec: ['docs/vision/GENESIS_RITUAL_SPECIFICATION.md'],
    implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
    timeline: { start: '2026-02-03', end: '2026-02-08', duration_days: 6 },
    capacity: { sds: 45, hours: 15 }
  },
  dependencies: ['SD-GENESIS-V31-DREAM-P1', 'SD-GENESIS-V31-DREAM-P2'],
  risks: []
};

// MIRROR PHASES
export const mirrorInt = {
  id: 'SD-GENESIS-V31-MIRROR-INT',
  sd_key: 'genesis-v31-mirror-int',
  // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
  title: 'Mirror: Integration',
  description: 'Connect Dreamcatcher intelligence with Mason infrastructure. Build end-to-end pipeline that flows from seed text through all artifact generation, implement error recovery for graceful failure handling, add retry logic with idempotent re-execution, and create CLI status command for simulation display.',
  scope: 'End-to-end pipeline integration, error recovery, retry logic, CLI status command.',
  rationale: 'Integration connects the intelligence layer to the infrastructure layer. Error handling ensures the system degrades gracefully rather than failing catastrophically.',
  category: 'integration',
  priority: 'critical',
  status: 'draft',
  relationship_type: 'child',
  parent_sd_id: 'SD-GENESIS-V31-MIRROR',
  sequence_rank: 1,
  created_by: 'LEO',
  version: '3.1',
  strategic_objectives: ['Connect full text-to-simulation pipeline', 'Handle failures gracefully with recovery', 'Enable safe re-execution of failed steps', 'Provide visibility into simulation status'],
  success_criteria: ['Seed input triggers full artifact generation automatically', 'PRD failure does not corrupt downstream artifacts', 'Retry of failed step does not duplicate artifacts', 'leo status shows simulation state accurately'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/GENESIS_OATH_V3.md' },
    must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md'],
    must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    implementation_guidance: { creation_mode: 'CREATE_FROM_NEW' },
    timeline: { start: '2026-02-09', end: '2026-02-10', duration_days: 2 },
    capacity: { sds: 35, hours: 12 }
  },
  dependencies: ['SD-GENESIS-V31-MASON', 'SD-GENESIS-V31-DREAMCATCHER'],
  risks: []
};

export const mirrorElev = {
  id: 'SD-GENESIS-V31-MIRROR-ELEV',
  sd_key: 'genesis-v31-mirror-elev',
  // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
  title: 'Mirror: Elevation Logic',
  description: 'Implement the elevation mechanics that transform simulation to production. Build Stage 16 schema elevation (copy simulation schema to production namespace), Stage 17 repo elevation (fork simulation repo to production org), and elevation audit trail with Chairman signature requirement. CONSTRAINT: Complete by Feb 10 - no new logic after.',
  scope: 'Stage 16 schema elevation, Stage 17 repo elevation, elevation audit trail with Chairman signature.',
  rationale: 'Elevation is the ceremonial transformation from possible to real. The Chairman\'s signature requirement ensures human accountability for production changes.',
  category: 'integration',
  priority: 'critical',
  status: 'draft',
  relationship_type: 'child',
  parent_sd_id: 'SD-GENESIS-V31-MIRROR',
  sequence_rank: 2,
  created_by: 'LEO',
  version: '3.1',
  strategic_objectives: ['Copy simulation schema to production at Stage 16', 'Fork simulation repo to production at Stage 17', 'Log all elevations with Chairman signature', 'Archive simulation after successful elevation'],
  success_criteria: ['Stage 16 creates production schema from simulation', 'Stage 17 forks repo to ehg-ventures org', 'elevation_log records Chairman signature for each elevation', 'Simulation marked elevated after promotion', 'Elevation fails if Chairman signature missing'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/GENESIS_OATH_V3.md', sections: ['Elevation Mechanics (Simulation -> Reality)'] },
    must_read_before_prd: ['docs/vision/GENESIS_OATH_V3.md'],
    must_read_before_exec: ['docs/vision/SIMULATION_CHAMBER_ARCHITECTURE.md'],
    implementation_guidance: { creation_mode: 'CREATE_FROM_NEW', critical_constraint: 'COMPLETE BY FEB 10 - NO NEW LOGIC AFTER' },
    timeline: { start: '2026-02-10', end: '2026-02-11', duration_days: 2 },
    capacity: { sds: 25, hours: 8 }
  },
  dependencies: ['SD-GENESIS-V31-MIRROR-INT'],
  risks: []
};

export const mirrorTest = {
  id: 'SD-GENESIS-V31-MIRROR-TEST',
  sd_key: 'genesis-v31-mirror-test',
  // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
  title: 'Mirror: Reflex Testing',
  description: 'Comprehensive testing of the complete Genesis system. Execute happy path testing with full flow success scenarios, failure mode testing for error handling validation, and edge case testing for unusual inputs, timeouts, and boundary conditions. NOTE: Testing only - no new features during this phase.',
  scope: 'Happy path testing, failure mode testing, edge case testing. NO NEW FEATURES.',
  rationale: 'The final days before ritual must focus on verification, not creation. Mercury\'s pre-retrograde shadow increases confusion risk - best to test what exists rather than build new.',
  category: 'testing',
  priority: 'critical',
  status: 'draft',
  relationship_type: 'child',
  parent_sd_id: 'SD-GENESIS-V31-MIRROR',
  sequence_rank: 3,
  created_by: 'LEO',
  version: '3.1',
  strategic_objectives: ['Verify happy path works end-to-end', 'Confirm error handling works correctly', 'Test edge cases and unusual inputs', 'Document any issues for future resolution'],
  success_criteria: ['Happy path: seed -> simulation -> ratify -> venture works', 'Failure mode: partial failures recover gracefully', 'Edge cases: empty input, huge input, special chars handled', 'All critical paths documented with test evidence', 'Zero new features added during this phase'],
  metadata: {
    vision_spec_references: { version: 'GENESIS-V3.1', primary_spec: 'docs/vision/GENESIS_RITUAL_SPECIFICATION.md', sections: ['Success Criteria'] },
    must_read_before_prd: ['docs/vision/GENESIS_RITUAL_SPECIFICATION.md'],
    must_read_before_exec: ['docs/vision/GENESIS_RITUAL_SPECIFICATION.md'],
    implementation_guidance: { creation_mode: 'TEST_ONLY', critical_constraint: 'NO NEW FEATURES - TESTING ONLY' },
    timeline: { start: '2026-02-11', end: '2026-02-13', duration_days: 3 },
    capacity: { sds: 20, hours: 7 }
  },
  dependencies: ['SD-GENESIS-V31-MIRROR-INT', 'SD-GENESIS-V31-MIRROR-ELEV'],
  risks: []
};
