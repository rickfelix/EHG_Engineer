#!/usr/bin/env node

/**
 * Insert PRD for SD-CREWAI-ARCHITECTURE-001
 * Maps comprehensive user-provided JSONB structures to actual schema fields
 *
 * Schema Mapping:
 * - User's "scope" → functional_requirements + metadata.scope
 * - User's "requirements" → functional_requirements + non_functional_requirements
 * - User's "architecture" → system_architecture + data_model + metadata.architecture
 * - User's "test_plan" → test_scenarios + acceptance_criteria
 * - User's "risks" → risks (direct mapping)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function insertPRD() {
  console.log('📋 Inserting PRD for SD-CREWAI-ARCHITECTURE-001...\n');

  const prdData = {
    id: 'PRD-CREWAI-ARCHITECTURE-001',
    sd_id: 'SD-CREWAI-ARCHITECTURE-001',
    sd_uuid: '0e5ba543-54b4-4664-8e1d-9e77feccf994',
    title: 'CrewAI Architecture Integration',
    status: 'draft',
    phase: 'planning',
    progress: 0,
    created_by: 'PLAN',

    // Functional Requirements (CHECK constraint: min 3 required)
    functional_requirements: [
      {
        id: 'FR-001',
        requirement: 'Governance Bridge Table - Create leo_to_crewai_agent_mapping table to link LEO agents (governance) with CrewAI agents (operational)',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Table created with columns: leo_agent_id, crewai_agent_id, sync_status, last_synced_at',
          'Foreign keys established to leo_agents (EHG_Engineer) and crewai_agents (EHG Application)',
          'RLS policies applied for row-level security',
          'Initial data seeded for 30 operational agents'
        ]
      },
      {
        id: 'FR-002',
        requirement: 'RLS Policies for Partition Tables - Implement RLS policies for agent_executions_2025_10, agent_executions_2025_11, agent_executions_2025_12',
        priority: 'HIGH',
        acceptance_criteria: [
          'SELECT policy: Users can only read their own agent executions',
          'INSERT policy: Users can only insert executions for agents they own',
          'UPDATE policy: Users can only update their own executions',
          'DELETE policy: No direct deletes allowed (soft delete via status)',
          'All policies tested and verified'
        ]
      },
      {
        id: 'FR-003',
        requirement: 'Schema Versioning Framework - Add schema_version column to 4 duplicate tables (crewai_flows, crewai_flow_executions, crewai_flow_templates, sub_agent_execution_results)',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'schema_version column added to all 4 tables',
          'Validation script verifies schema compatibility across databases',
          'Migration coordination strategy documented',
          'Automated alerts for schema divergence configured'
        ]
      },
      {
        id: 'FR-004',
        requirement: 'Agent Registration Migration - Create migration script to register 30 operational agents in governance system',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All 30 agents registered in leo_to_crewai_agent_mapping',
          'Agent roles cross-referenced (Python vs database)',
          'Conflict resolution logic handles duplicate agents',
          'Dry-run migration validates without data changes',
          'Rollback plan documented'
        ]
      },
      {
        id: 'FR-005',
        requirement: 'Crew Registration Workflow - Register 14 missing crews in crewai_crews table',
        priority: 'HIGH',
        acceptance_criteria: [
          'All 16 Python crews registered (14 new + 2 existing)',
          'Crew names match Python class names',
          'Process type, verbose, cache, max_rpm configured',
          'Crew member assignments populated in crew_members table'
        ]
      },
      {
        id: 'FR-006',
        requirement: 'Stage→Agent Mapping Schema - Create stage_agent_mappings table linking 40 stages to ~160 agents',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Table created with columns: stage_id, agent_id, crew_id, role, required',
          'Seed data for known stages (1-3) backfilled',
          'Query layer supports Stage Operating Dossier generation',
          'Documentation provided for adding new mappings'
        ]
      },
      {
        id: 'FR-007',
        requirement: 'Bidirectional Sync Mechanism - Design and implement sync between operational and governance databases',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Event-driven triggers for agent deployment (operational → governance)',
          'Policy update propagation (governance → operational)',
          'Conflict resolution logic (last-write-wins or manual review)',
          'Sync status tracked in leo_to_crewai_agent_mapping.sync_status',
          'Failed syncs logged and alertable'
        ]
      },
      {
        id: 'FR-008',
        requirement: 'Cross-Database Validation Scripts - Create validation scripts to ensure schema compatibility and data consistency',
        priority: 'LOW',
        acceptance_criteria: [
          'Schema compatibility check (validate-schema-sync.js)',
          'Data consistency validation (agent counts, crew counts)',
          'Automated alerts for divergence (>5% mismatch)',
          'Daily cron job scheduled'
        ]
      }
    ],

    // Non-Functional Requirements
    non_functional_requirements: [
      {
        id: 'NFR-001',
        type: 'Performance',
        requirement: 'Agent registration and sync operations must complete within acceptable time limits',
        target_metric: 'Agent registration: <100ms per agent (3 seconds for 30 agents); Crew registration: <50ms per crew (1 second for 16 crews); Sync mechanism: <5 seconds for full sync; Validation scripts: <10 seconds for full validation'
      },
      {
        id: 'NFR-002',
        type: 'Security',
        requirement: 'All database operations must respect RLS policies and prevent unauthorized access',
        target_metric: '100% RLS coverage on agent execution tables; Service role used only for admin operations; Anon key blocked from write operations; Audit log entries for all governance changes'
      },
      {
        id: 'NFR-003',
        type: 'Data Integrity',
        requirement: 'Cross-database references must remain consistent',
        target_metric: 'No orphaned records (agents without crews, crews without agents); Foreign key constraints enforced where possible; Sync status accurately reflects operational state; Rollback procedures tested and documented'
      }
    ],

    // System Architecture (TEXT field)
    system_architecture: `# System Architecture

## Overview
Two-database architecture with governance bridge. EHG_Engineer database (dedlbzhpgkmetvhbkyzq) stores governance data (LEO agents, strategic directives). EHG Application database (liapbndqlqxdcgpwntbv) stores operational data (CrewAI agents, crews, executions). Bridge table (leo_to_crewai_agent_mapping) links agents across databases.

## Components

### 1. Governance Bridge
**Table**: leo_to_crewai_agent_mapping (EHG_Engineer database)
**Columns**: leo_agent_id (FK), crewai_agent_id (varchar), sync_status (enum), last_synced_at (timestamp)
**Relationships**: FK to leo_agents; Logical FK to crewai_agents (cross-database)

### 2. Stage Mapping Table
**Table**: stage_agent_mappings
**Columns**: stage_id (int), agent_id (varchar), crew_id (varchar), role (text), required (boolean)
**Purpose**: Enable queries like: SELECT agents WHERE stage_id = 4

### 3. RLS Policies
**Tables**: agent_executions_2025_10, agent_executions_2025_11, agent_executions_2025_12
**Policy Types**: SELECT, INSERT, UPDATE, DELETE

### 4. Schema Version Columns
**Tables**: crewai_flows, crewai_flow_executions, crewai_flow_templates, sub_agent_execution_results
**Column**: schema_version (varchar, default 'v1.0.0')

## Sync Mechanism
**Approach**: Event-driven with fallback batch sync
**Triggers**:
- Agent deployed (operational) → Register in governance
- Policy updated (governance) → Propagate to operational
- Schema changed (either) → Alert for manual review

**Conflict Resolution**: Last-write-wins for agent metadata, manual review for policy conflicts
**Monitoring**: Sync status dashboard showing pending/failed syncs with alerting`,

    // Data Model (JSONB)
    data_model: {
      leo_to_crewai_agent_mapping: {
        leo_agent_id: 'UUID (FK to leo_agents.id)',
        crewai_agent_id: 'VARCHAR (logical FK to crewai_agents.id in EHG Application DB)',
        sync_status: "ENUM ('synced', 'pending', 'failed', 'manual')",
        last_synced_at: 'TIMESTAMP',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP'
      },
      stage_agent_mappings: {
        id: 'UUID PRIMARY KEY',
        stage_id: 'INT (1-40)',
        agent_id: 'VARCHAR (FK to crewai_agents.id)',
        crew_id: 'VARCHAR (FK to crewai_crews.id)',
        role: 'TEXT (agent role in this stage)',
        required: 'BOOLEAN (is agent mandatory for stage)',
        created_at: 'TIMESTAMP'
      }
    },

    // Test Scenarios (CHECK constraint: min 1 required)
    test_scenarios: [
      {
        id: 'TS-001',
        scenario: 'Governance bridge table creates successfully',
        expected_result: 'Table exists with correct columns and constraints',
        test_type: 'smoke'
      },
      {
        id: 'TS-002',
        scenario: 'RLS policies apply without errors',
        expected_result: 'All 3 partition tables have SELECT, INSERT, UPDATE, DELETE policies',
        test_type: 'smoke'
      },
      {
        id: 'TS-003',
        scenario: 'Agent registration script runs without failures',
        expected_result: '30 agents registered in leo_to_crewai_agent_mapping',
        test_type: 'smoke'
      },
      {
        id: 'TS-004',
        scenario: 'End-to-end crew execution with governance tracking',
        expected_result: 'Crew executes successfully and governance records are created',
        test_type: 'e2e'
      },
      {
        id: 'TS-005',
        scenario: 'Cross-database sync mechanism verification',
        expected_result: 'Changes in operational DB propagate to governance DB within 5 seconds',
        test_type: 'e2e'
      },
      {
        id: 'TS-006',
        scenario: 'Stage→agent mapping queries return expected results',
        expected_result: 'Query for stage_id = 4 returns all agents assigned to that stage',
        test_type: 'e2e'
      },
      {
        id: 'TS-007',
        scenario: 'RLS policies block unauthorized access',
        expected_result: 'Anon key cannot read other users agent executions',
        test_type: 'e2e'
      }
    ],

    // Acceptance Criteria (CHECK constraint: min 1 required)
    acceptance_criteria: [
      {
        id: 'AC-001',
        criterion: '100% of operational agents visible in governance dashboard',
        verification_method: 'Query governance DB and verify 30 agents present'
      },
      {
        id: 'AC-002',
        criterion: 'All 3 partition tables have RLS policies applied',
        verification_method: 'Query pg_policies table and verify 12 policies (4 per table)'
      },
      {
        id: 'AC-003',
        criterion: 'Stage→agent mapping queries functional',
        verification_method: 'Execute test query for stage_id = 4 and verify results'
      },
      {
        id: 'AC-004',
        criterion: 'Schema validation scripts pass',
        verification_method: 'Run validate-schema-sync.js and verify 0 errors'
      },
      {
        id: 'AC-005',
        criterion: 'All migrations apply cleanly in test environment',
        verification_method: 'Execute migrations in test DB and verify no errors'
      }
    ],

    // Risks (JSONB)
    risks: [
      {
        id: 'R-001',
        risk: 'Data Loss During Migration',
        impact: 'HIGH',
        probability: 'LOW',
        mitigation: 'Backup both databases before migration; Dry-run migrations validate without data changes; Rollback plan documented and tested; Stage migrations (test → staging → production)'
      },
      {
        id: 'R-002',
        risk: 'Schema Migration Breaks Existing Code',
        impact: 'HIGH',
        probability: 'MEDIUM',
        mitigation: 'Backward-compatible changes only (additive columns, no deletions); Feature flags for gradual rollout; Comprehensive E2E testing before deployment; 24-hour monitoring post-deployment with instant rollback capability'
      },
      {
        id: 'R-003',
        risk: 'Governance Overhead Slows Development',
        impact: 'MEDIUM',
        probability: 'MEDIUM',
        mitigation: 'Automated registration (developers dont manually register agents); Lightweight approval process (auto-approve for non-critical agents); Clear documentation and onboarding for new developers; Governance dashboard shows value (audit trails, execution history)'
      },
      {
        id: 'R-004',
        risk: 'Duplicate Agents Created During Sync',
        impact: 'MEDIUM',
        probability: 'MEDIUM',
        mitigation: 'Unique constraints on agent identifiers (name + role); Conflict resolution logic (last-write-wins or manual review); Validation scripts detect duplicates; Weekly cleanup job removes orphaned records'
      },
      {
        id: 'R-005',
        risk: 'Cross-Database FK Enforcement',
        impact: 'LOW',
        probability: 'HIGH',
        mitigation: 'Validation scripts simulate FK constraints; Daily cron job checks for orphaned records; Monitoring alerts for integrity violations; Documentation clearly states reliance on application-level enforcement'
      }
    ],

    // Metadata (store user's original scope structure for reference)
    metadata: {
      original_user_scope: {
        in_scope: [
          'Governance-operational bridge architecture design',
          'RLS policy implementation for 3 partition tables (agent_executions_2025_10/11/12)',
          'Schema versioning framework for 4 duplicate tables',
          'Migration plan for 30 agents to governance system',
          'Crew registration workflow for 14 missing crews',
          'Stage→agent mapping schema design (~160 mappings for 40 stages)',
          'Bidirectional sync mechanism (operational ↔ governance)',
          'Cross-database validation scripts'
        ],
        out_of_scope: [
          'Refactoring Python code to read from database (future iteration)',
          'Visual workflow UI for crewai_flows (future work)',
          'Migrating Node.js sub-agents to database (separate system)',
          'Agent performance optimization (separate SD)',
          'CrewAI platform port changes (infrastructure concern)'
        ]
      },
      discovery_context: {
        findings: '16 Python crews, 45 agents (19,033 LOC); 2 crews registered in DB, 30 agents registered; 14 crews missing (88% gap), 15 agents missing (33% gap); 100% governance gap (30 operational agents ungoverned); 3 RLS policy gaps (partition tables); 0 stage→agent mappings (need ~160)',
        deliverables_count: 10,
        deliverables_size: '921 KB'
      }
    }
  };

  try {
    // Verify SD exists
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, uuid_id, title')
      .eq('id', 'SD-CREWAI-ARCHITECTURE-001')
      .single();

    if (sdError || !sdData) {
      console.error('❌ SD-CREWAI-ARCHITECTURE-001 not found in database');
      console.log('   Create SD first before creating PRD');
      process.exit(1);
    }

    console.log(`✅ SD found: ${sdData.title}`);
    console.log(`   UUID: ${sdData.uuid_id}\n`);

    // Insert PRD
    const { data, error } = await supabase
      .from('product_requirements_v2')
      .insert(prdData)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        console.log('⚠️  PRD-CREWAI-ARCHITECTURE-001 already exists in database');
        console.log('   Use UPDATE query if you need to modify it');
      } else {
        console.error('❌ Database insert error:', error.message);
        console.error('   Details:', error);
      }
      process.exit(1);
    }

    console.log('✅ PRD-CREWAI-ARCHITECTURE-001 inserted successfully!\n');
    console.log('📊 Summary:');
    console.log(`   - ID: ${data.id}`);
    console.log(`   - Status: ${data.status}`);
    console.log(`   - Phase: ${data.phase}`);
    console.log(`   - Functional Requirements: ${data.functional_requirements.length}`);
    console.log(`   - Non-Functional Requirements: ${data.non_functional_requirements.length}`);
    console.log(`   - Test Scenarios: ${data.test_scenarios.length}`);
    console.log(`   - Acceptance Criteria: ${data.acceptance_criteria.length}`);
    console.log(`   - Risks: ${data.risks.length}`);

    console.log('\n📝 Next steps:');
    console.log('1. Review PRD in management dashboard');
    console.log('2. Create user stories: node scripts/create-user-stories-crewai-architecture-001.mjs');
    console.log('3. Begin PLAN phase validation');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

insertPRD();
