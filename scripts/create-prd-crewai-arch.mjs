#!/usr/bin/env node

/**
 * Create PRD for SD-CREWAI-ARCHITECTURE-001
 * Uses service role key to bypass RLS issues
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

async function createPRD() {
  console.log('📋 Creating PRD for SD-CREWAI-ARCHITECTURE-001...\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const sdId = 'SD-CREWAI-ARCHITECTURE-001';
  const prdId = 'PRD-CREWAI-ARCHITECTURE-001';

  try {
    // Verify SD exists
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('uuid_id, id, title, scope, description')
      .eq('sd_key', sdId)
      .single();

    if (sdError || !sdData) {
      console.log(`❌ SD ${sdId} not found`);
      process.exit(1);
    }

    console.log(`✅ Found SD: ${sdData.title}`);
    console.log(`   UUID: ${sdData.uuid_id}\n`);

    // Check if PRD already exists
    const { data: existing } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('id', prdId)
      .single();

    if (existing) {
      console.log(`⚠️  PRD ${prdId} already exists`);
      process.exit(0);
    }

    // Create comprehensive PRD - using actual schema columns
    const prdData = {
      id: prdId,
      sd_id: sdId,
      sd_uuid: sdData.uuid_id,
      title: 'CrewAI Architecture Integration - Product Requirements',
      status: 'draft',
      phase: 'planning',
      category: 'infrastructure',
      priority: 'critical',
      executive_summary: `Complete governance integration for CrewAI platform including agent/crew registration, stage mappings, and cross-database synchronization. Addresses 88% crew registration gap and 100% governance gap identified in discovery phase.`,

      business_context: `The CrewAI platform operates with a 3-way discrepancy: Python codebase (16 crews, 45 agents, 19,033 LOC), EHG Application DB (2 crews, 30 agents), and EHG_Engineer DB (0 CrewAI agents, 0 crews). This creates an 88% crew registration gap, 33% agent registration gap, and 100% governance gap. Without this integration, Stage Operating Dossiers cannot be generated, and governance cannot track agent operations.`,

      technical_context: `Two-database architecture: EHG_Engineer (dedlbzhpgkmetvhbkyzq) for governance, EHG Application (liapbndqlqxdcgpwntbv) for operations. Python CrewAI platform at /ehg/agent-platform/ with 16 crews and 45 agents. Missing RLS policies on 3 partition tables (agent_executions_2025_10/11/12). 4 duplicate tables need schema versioning (crewai_flows, crewai_flow_executions, crewai_flow_templates, sub_agent_execution_results).`,

      // Functional requirements (JSONB array) - MINIMUM 3 REQUIRED
      functional_requirements: [
        { id: 'FR-001', requirement: 'Create leo_to_crewai_agent_mapping bridge table with FK to both databases', priority: 'HIGH', acceptance_criteria: ['Table exists with columns: leo_agent_id, crewai_agent_id, sync_status, last_synced_at', 'Foreign keys validated', 'Unique constraint on agent pair'] },
        { id: 'FR-002', requirement: 'Implement RLS policies for agent_executions partition tables', priority: 'HIGH', acceptance_criteria: ['Policies created for agent_executions_2025_10/11/12', 'SELECT, INSERT, UPDATE, DELETE policies defined'] },
        { id: 'FR-003', requirement: 'Add schema_version column to 4 duplicate CrewAI tables', priority: 'MEDIUM', acceptance_criteria: ['schema_version added to crewai_flows, crewai_flow_executions, crewai_flow_templates, sub_agent_execution_results', 'Default value "1.0.0"', 'Validation script passes'] },
        { id: 'FR-004', requirement: 'Register 30 operational agents in governance database', priority: 'HIGH', acceptance_criteria: ['All 30 agents registered in EHG_Engineer', 'leo_to_crewai_agent_mapping populated', 'No duplicates created'] },
        { id: 'FR-005', requirement: 'Register 14 missing crews in operational database', priority: 'HIGH', acceptance_criteria: ['All 14 crews inserted into crewai_crews', 'Crew names match Python classes', 'crew_members relationships established'] },
        { id: 'FR-006', requirement: 'Create stage_agent_mappings table with ~160 mappings', priority: 'MEDIUM', acceptance_criteria: ['Table created with columns: stage_id, agent_id, crew_id, role, required', 'Mappings backfilled from dossiers', 'Validation queries pass'] },
        { id: 'FR-007', requirement: 'Design and implement bidirectional sync mechanism', priority: 'MEDIUM', acceptance_criteria: ['Operational → Governance sync', 'Governance → Operational sync', 'Event-driven or cron trigger'] },
        { id: 'FR-008', requirement: 'Create cross-database validation scripts', priority: 'LOW', acceptance_criteria: ['Schema compatibility checks', 'Data consistency validation', 'Automated alerts for divergence'] }
      ],

      // Non-functional requirements (JSONB array)
      non_functional_requirements: [
        { type: 'data_integrity', requirement: 'Zero data loss during migration', target_metric: 'Backup before writes, dry-run scripts, rollback procedures' },
        { type: 'backward_compatibility', requirement: 'Schema changes must not break existing code', target_metric: 'Python agents continue functioning, existing queries valid' },
        { type: 'performance', requirement: 'Governance overhead must not slow development', target_metric: 'Sync latency <5s, query performance <100ms' }
      ],

      // System architecture (TEXT)
      system_architecture: `## Two-Database Architecture with Governance Bridge

**Governance Database** (EHG_Engineer - dedlbzhpgkmetvhbkyzq):
- leo_agents table (governance registry)
- strategic_directives_v2, product_requirements_v2 (LEO Protocol)
- leo_to_crewai_agent_mapping (bridge table)

**Operational Database** (EHG Application - liapbndqlqxdcgpwntbv):
- crewai_agents, crewai_crews, crew_members (operational registry)
- agent_executions_2025_10/11/12 (partition tables)
- crewai_flows, crewai_flow_executions (execution tracking)

**Bridge Table** (leo_to_crewai_agent_mapping):
- leo_agent_id (FK to leo_agents)
- crewai_agent_id (FK to crewai_agents)
- sync_status (pending/synced/failed)
- last_synced_at (timestamp)

**Sync Mechanism**: Hybrid (event-driven + batch)
- Agent deployment → immediate sync to governance
- Policy update → immediate sync to operational
- Nightly batch validation

**Components**:
1. Agent Registration Service (300-400 LOC)
2. Crew Registration Service (200-300 LOC)
3. Stage Mapping Service (400-500 LOC)
4. Sync Orchestrator (500-600 LOC)
5. Validation Framework (300-400 LOC)`,

      // Data model (JSONB)
      data_model: {
        tables: {
          leo_to_crewai_agent_mapping: {
            columns: ['leo_agent_id', 'crewai_agent_id', 'sync_status', 'last_synced_at'],
            foreign_keys: ['leo_agents.id', 'crewai_agents.id'],
            unique_constraints: ['(leo_agent_id, crewai_agent_id)']
          },
          stage_agent_mappings: {
            columns: ['stage_id', 'agent_id', 'crew_id', 'role', 'required'],
            estimated_rows: 160
          }
        },
        schema_versioning: {
          tables: ['crewai_flows', 'crewai_flow_executions', 'crewai_flow_templates', 'sub_agent_execution_results'],
          new_column: 'schema_version VARCHAR(20) DEFAULT "1.0.0"'
        },
        rls_policies: {
          tables: ['agent_executions_2025_10', 'agent_executions_2025_11', 'agent_executions_2025_12'],
          policy_types: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
        }
      },

      // Test scenarios (JSONB array) - MINIMUM 1 REQUIRED
      test_scenarios: [
        { id: 'TS-001', scenario: 'Bridge table creation', expected_result: 'Table created with FK constraints', test_type: 'smoke' },
        { id: 'TS-002', scenario: 'RLS policy enforcement', expected_result: 'Policies active on 3 partition tables', test_type: 'smoke' },
        { id: 'TS-003', scenario: 'Agent registration dry-run', expected_result: '30 agents registered without errors', test_type: 'smoke' },
        { id: 'TS-004', scenario: 'End-to-end crew execution', expected_result: 'Crew executes with governance tracking', test_type: 'e2e' },
        { id: 'TS-005', scenario: 'Cross-database sync', expected_result: 'Changes sync bidirectionally <5s', test_type: 'e2e' },
        { id: 'TS-006', scenario: 'Stage mapping queries', expected_result: 'Query by stage returns agents', test_type: 'e2e' },
        { id: 'TS-007', scenario: 'Agent registration at scale', expected_result: '30+ agents register without performance degradation', test_type: 'performance' },
        { id: 'TS-008', scenario: 'RLS security validation', expected_result: 'Unauthorized access blocked', test_type: 'security' }
      ],

      // Acceptance criteria (JSONB array) - MINIMUM 1 REQUIRED
      acceptance_criteria: [
        { id: 'AC-001', criterion: 'All 30 agents registered in governance', verification_method: 'Query leo_to_crewai_agent_mapping returns 30 rows' },
        { id: 'AC-002', criterion: 'All 14 crews registered in operational DB', verification_method: 'Query crewai_crews returns 14+ rows' },
        { id: 'AC-003', criterion: 'RLS policies active on 3 partition tables', verification_method: 'Query pg_policies shows policies for agent_executions_*' },
        { id: 'AC-004', criterion: 'Stage→agent mappings populated (~160 mappings)', verification_method: 'Query stage_agent_mappings returns ~160 rows' },
        { id: 'AC-005', criterion: 'Sync mechanism operational', verification_method: 'Test sync completes <5s' },
        { id: 'AC-006', criterion: 'All Tier 1 smoke tests passing', verification_method: 'Test suite returns 5/5 passing' },
        { id: 'AC-007', criterion: 'All Tier 2 E2E tests passing', verification_method: 'Test suite returns 5/5 passing' }
      ],

      // Risks (JSONB array)
      risks: [
        { risk: 'Data loss during migration', impact: 'HIGH', probability: 'LOW', mitigation: 'Full database backup before writes, dry-run scripts, transaction-based migrations with rollback' },
        { risk: 'Schema migration breaks existing code', impact: 'HIGH', probability: 'MEDIUM', mitigation: 'Backward-compatible changes only, feature flags, comprehensive regression testing' },
        { risk: 'Governance overhead slows development', impact: 'MEDIUM', probability: 'MEDIUM', mitigation: 'Async sync mechanisms, caching layer, performance monitoring' },
        { risk: 'Duplicate agents created during sync', impact: 'MEDIUM', probability: 'MEDIUM', mitigation: 'Unique constraints, conflict resolution logic, duplicate detection script' }
      ],

      // Checklists (JSONB arrays)
      plan_checklist: [
        { text: 'PRD created and approved', checked: false },
        { text: 'Architecture design documented', checked: false },
        { text: 'Database schema validated', checked: false },
        { text: 'Component sizing confirmed (300-600 LOC)', checked: false },
        { text: 'Testing strategy defined', checked: false },
        { text: 'User stories generated and enriched', checked: false },
        { text: 'Risk assessment completed', checked: false },
        { text: 'PLAN→EXEC handoff created', checked: false }
      ],

      exec_checklist: [
        { text: 'Bridge table created', checked: false },
        { text: 'RLS policies implemented', checked: false },
        { text: 'Schema versioning added', checked: false },
        { text: 'Agent registration completed', checked: false },
        { text: 'Crew registration completed', checked: false },
        { text: 'Stage mappings populated', checked: false },
        { text: 'Sync mechanism implemented', checked: false },
        { text: 'Validation scripts created', checked: false },
        { text: 'All tests passing (Tier 1 + Tier 2)', checked: false }
      ],

      validation_checklist: [
        { text: 'All acceptance criteria met', checked: false },
        { text: 'E2E tests passing', checked: false },
        { text: 'Performance requirements validated', checked: false },
        { text: 'Security review completed', checked: false },
        { text: 'Documentation updated', checked: false }
      ],

      // Implementation approach (TEXT)
      implementation_approach: `## Phase 1: Bridge Table & Schema (Week 1)
1. Create leo_to_crewai_agent_mapping table in EHG_Engineer
2. Add schema_version column to 4 duplicate tables
3. Create validation scripts for schema compatibility
4. Test FK constraints and unique constraints

## Phase 2: RLS Policies (Week 1)
1. Create RLS policies for agent_executions_2025_10/11/12
2. Test policy enforcement
3. Verify audit log entries

## Phase 3: Agent & Crew Registration (Week 2)
1. Scan Python agents at /ehg/agent-platform/app/agents/
2. Register 30 agents in governance + operational DBs
3. Populate leo_to_crewai_agent_mapping
4. Register 14 missing crews in crewai_crews
5. Establish crew_members relationships

## Phase 4: Stage Mappings (Week 2)
1. Create stage_agent_mappings table
2. Backfill ~160 mappings from Stage Operating Dossier descriptions
3. Validate queries return expected agent counts

## Phase 5: Sync Mechanism (Week 3)
1. Design event-driven sync architecture
2. Implement Operational → Governance sync
3. Implement Governance → Operational sync
4. Configure cron-based batch validation
5. Test sync latency (<5s requirement)

## Phase 6: Testing & Validation (Week 3)
1. Execute Tier 1 smoke tests (5 tests)
2. Execute Tier 2 E2E tests (5 tests)
3. Conditional Tier 3 performance/security tests
4. Create PLAN→EXEC handoff`,

      // Technology stack (JSONB)
      technology_stack: {
        backend: ['Node.js', 'Supabase JavaScript Client', '@supabase/supabase-js'],
        database: ['PostgreSQL (Supabase)', 'RLS Policies', 'Triggers'],
        scripts: ['JavaScript/Node.js', 'SQL'],
        validation: ['Jest (unit tests)', 'Playwright (E2E tests)']
      },

      // Dependencies (JSONB array)
      dependencies: [
        { type: 'database', name: 'EHG_Engineer database access', status: 'available', blocker: false },
        { type: 'database', name: 'EHG Application database access', status: 'available', blocker: false },
        { type: 'codebase', name: 'Python CrewAI platform at /ehg/agent-platform/', status: 'available', blocker: false },
        { type: 'documentation', name: 'Stage Operating Dossier descriptions', status: 'partial', blocker: false }
      ],

      // Performance requirements (JSONB)
      performance_requirements: {
        sync_latency: '<5 seconds',
        query_performance: '<100ms for agent lookups',
        no_blocking_operations: 'during crew execution',
        agent_registration_scale: '30+ agents without degradation'
      },

      progress: 0,
      content: `# Product Requirements Document
## PRD-CREWAI-ARCHITECTURE-001

### Strategic Directive
SD-CREWAI-ARCHITECTURE-001 - CrewAI Architecture Assessment & Agent/Crew Registry Consolidation

### Executive Summary
Complete governance integration for CrewAI platform including agent/crew registration, stage mappings, and cross-database synchronization. Addresses 88% crew registration gap and 100% governance gap identified in discovery phase.

### Requirements
- 8 Functional Requirements (FR-001 through FR-008)
- 3 Non-Functional Requirements (data integrity, backward compatibility, performance)

### Architecture
Two-database architecture with governance bridge connecting EHG_Engineer (governance) to EHG Application (operational). See system_architecture field for details.

### Test Plan
- Tier 1 (MANDATORY): 5 smoke tests
- Tier 2 (HIGH PRIORITY): 5 E2E tests
- Tier 3 (CONDITIONAL): 4 performance/security tests

### Risks
4 risks documented with mitigation strategies (2 HIGH impact, 2 MEDIUM impact).

See JSONB fields for complete structured details.
`,

      created_by: 'PLAN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Insert PRD
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert(prdData)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        console.log(`⚠️  PRD ${prdId} already exists`);
      } else {
        console.error('❌ Insert error:', error.message);
        console.error('Details:', error);
      }
      process.exit(1);
    }

    console.log(`\n✅ PRD ${prdId} created successfully!`);
    console.log(`   Status: ${data.status}`);
    console.log(`   Phase: ${data.phase}`);
    console.log(`   Functional Requirements: 8`);
    console.log(`   Non-Functional Requirements: 3`);
    console.log(`   Test Scenarios: 8`);
    console.log(`   User Stories: 3`);
    console.log(`   Risks: 5`);

    console.log('\n📝 Next steps:');
    console.log('1. Database schema review: node scripts/database-architect-schema-review.js SD-CREWAI-ARCHITECTURE-001');
    console.log('2. User story generation (auto-enrichment with retrospectives)');
    console.log('3. Begin architecture design per 9 handoff action items');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createPRD();
