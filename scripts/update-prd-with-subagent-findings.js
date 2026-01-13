#!/usr/bin/env node

/**
 * Update PRD with Sub-Agent Findings for SD-HARDENING-V1-000
 *
 * Critical findings from DATABASE and SECURITY sub-agents:
 * 1. fn_is_chairman() function DOES NOT EXIST - chairman auth is broken
 * 2. venture_decisions table DOES NOT EXIST - API references non-existent table
 * 3. Board governance tables have USING(true) for ALL operations
 * 4. 250 tables with USING(true) policies
 * 5. ~40 functions without fn_ prefix
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updatePrdWithFindings() {
  const sdId = 'SD-HARDENING-V1-000';

  console.log('Updating PRD for', sdId, 'with sub-agent findings...\n');

  // Get SD UUID
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .or(`id.eq.${sdId},legacy_id.eq.${sdId}`)
    .single();

  if (sdError || !sd) {
    console.error('SD not found:', sdError?.message);
    return;
  }

  console.log('SD UUID:', sd.id);

  // Get existing PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .select('id, metadata')
    .eq('sd_id', sd.id)
    .single();

  if (prdError || !prd) {
    console.error('PRD not found:', prdError?.message);
    return;
  }

  console.log('PRD ID:', prd.id);

  // Critical findings from sub-agents
  const criticalFindings = {
    database_agent: {
      timestamp: new Date().toISOString(),
      severity: 'CRITICAL',
      findings: [
        {
          id: 'DB-001',
          severity: 'CRITICAL',
          title: 'venture_decisions table DOES NOT EXIST',
          description: 'API code at /ehg/src/pages/api/v2/chairman/decisions.ts line 47 queries venture_decisions table, but this table does not exist. The actual table is chairman_decisions from 20251206_factory_architecture.sql',
          impact: 'Chairman decisions API will FAIL - broken production endpoint',
          fix: 'Either create venture_decisions table or update API to use chairman_decisions',
          files_affected: [
            '../ehg/src/pages/api/v2/chairman/decisions.ts:47'
          ]
        },
        {
          id: 'DB-002',
          severity: 'CRITICAL',
          title: '250 tables with USING(true) RLS policies',
          description: 'Found 250 tables using permissive USING(true) pattern that grants unrestricted access to anyone',
          impact: 'Any authenticated user can read/modify any data - major security vulnerability',
          fix: 'Replace USING(true) with proper ownership/role checks'
        },
        {
          id: 'DB-003',
          severity: 'HIGH',
          title: '~40 functions missing fn_ prefix',
          description: 'Function naming drift detected. Some functions use fn_ prefix, others do not (e.g., advance_venture_stage vs fn_advance_venture_stage)',
          impact: 'Code inconsistency, potential for duplicate function creation',
          fix: 'Standardize all functions to use fn_ prefix'
        }
      ]
    },
    security_agent: {
      timestamp: new Date().toISOString(),
      severity: 'CRITICAL',
      findings: [
        {
          id: 'SEC-001',
          severity: 'CRITICAL',
          title: 'fn_is_chairman() function DOES NOT EXIST',
          description: 'Chairman authentication middleware references fn_is_chairman() RPC function, but this function is not defined in any database migration',
          impact: 'Chairman authentication is BROKEN - all chairman-only endpoints will fail or grant access incorrectly',
          fix: 'Create fn_is_chairman() function that checks user role against app_config or users table',
          recommended_migration: `
-- Create fn_is_chairman function
CREATE OR REPLACE FUNCTION fn_is_chairman()
RETURNS BOOLEAN AS $$
DECLARE
  chairman_user_id UUID;
BEGIN
  -- Get chairman user ID from app_config
  SELECT (config->>'chairman_user_id')::UUID
  INTO chairman_user_id
  FROM app_config
  WHERE key = 'system';

  -- Compare with current user
  RETURN auth.uid() = chairman_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
          `
        },
        {
          id: 'SEC-002',
          severity: 'CRITICAL',
          title: 'app_config table does not exist',
          description: 'fn_is_chairman() function should reference app_config table for chairman user ID, but this table does not exist',
          impact: 'Chairman identification has no source of truth',
          fix: 'Create app_config table with chairman_user_id configuration'
        },
        {
          id: 'SEC-003',
          severity: 'CRITICAL',
          title: 'Board governance tables have USING(true) for ALL operations',
          description: 'board_members, board_meetings, board_decisions tables allow ANY authenticated user to INSERT, UPDATE, DELETE',
          impact: 'Any user can delete board members, modify board meetings, or create fake decisions',
          fix: 'Replace with chairman-only policies using fn_is_chairman()'
        }
      ]
    },
    stories_agent: {
      timestamp: new Date().toISOString(),
      total_stories: 18,
      total_story_points: 73,
      child_sds: [
        { id: 'SD-HARDENING-V1-001', stories: 3, points: 13, focus: 'RLS Hardening - ehg repo' },
        { id: 'SD-HARDENING-V1-002', stories: 3, points: 13, focus: 'RLS Hardening - EHG_Engineer repo' },
        { id: 'SD-HARDENING-V1-003', stories: 3, points: 13, focus: 'Decision Split-Brain Resolution' },
        { id: 'SD-HARDENING-V1-004', stories: 3, points: 11, focus: 'Function Naming Standardization' },
        { id: 'SD-HARDENING-V1-005', stories: 3, points: 13, focus: 'N+1 Query Elimination' },
        { id: 'SD-HARDENING-V1-006', stories: 3, points: 10, focus: 'Type Safety Improvements' }
      ]
    }
  };

  // Priority reassessment based on findings
  const priorityReassessment = {
    P0_IMMEDIATE: [
      'Create fn_is_chairman() function - chairman auth is BROKEN',
      'Create app_config table with chairman_user_id',
      'Fix venture_decisions reference - create table or update API',
      'Fix board governance RLS - ANY user can delete board members'
    ],
    P1_THIS_SPRINT: [
      'Replace USING(true) policies on critical tables (users, companies, ventures, decisions)',
      'Audit and fix N+1 query pattern in decisions.ts lines 93-134',
      'Standardize function naming to fn_ prefix'
    ],
    P2_NEXT_SPRINT: [
      'Replace USING(true) on remaining 200+ tables',
      'Complete type safety refactoring (as any casts)',
      'Add query performance monitoring'
    ]
  };

  // Merge findings into PRD metadata
  const updatedMetadata = {
    ...(prd.metadata || {}),
    subagent_findings: criticalFindings,
    priority_reassessment: priorityReassessment,
    findings_updated_at: new Date().toISOString(),
    critical_discovery_summary: `
## CRITICAL DISCOVERIES FROM SUB-AGENTS

### P0 - IMMEDIATE ACTION REQUIRED:

1. **fn_is_chairman() DOES NOT EXIST** (SEC-001)
   - Chairman authentication middleware calls this function
   - Function is not defined anywhere in database
   - Impact: ALL chairman-only endpoints will fail
   - Fix: Create function + app_config table

2. **venture_decisions TABLE DOES NOT EXIST** (DB-001)
   - API at decisions.ts:47 queries this table
   - Table does not exist - actual table is chairman_decisions
   - Impact: Chairman decisions API will return errors
   - Fix: Create view or update API code

3. **Board Governance WIDE OPEN** (SEC-003)
   - board_members, board_meetings tables have USING(true)
   - ANY authenticated user can DELETE board members
   - Impact: Critical governance vulnerability
   - Fix: Add chairman-only RLS policies

### P1 - THIS SPRINT:
- 250 tables with USING(true) policies
- N+1 query pattern (101 queries for 100 decisions)
- Function naming drift (~40 functions)

### STORIES GENERATED:
- 18 user stories across 6 child SDs
- 73 total story points
- INVEST criteria validated
`.trim()
  };

  // Update PRD
  const { data: _updated, error: updateError } = await supabase
    .from('product_requirements_v2')
    .update({
      metadata: updatedMetadata,
      updated_at: new Date().toISOString()
    })
    .eq('id', prd.id)
    .select('id, metadata');

  if (updateError) {
    console.error('Update error:', updateError.message);
    return;
  }

  console.log('\n✅ PRD updated with sub-agent findings\n');

  console.log('=== CRITICAL DISCOVERY SUMMARY ===\n');
  console.log(updatedMetadata.critical_discovery_summary);

  console.log('\n=== NEXT ACTIONS ===');
  console.log('1. Create migration for fn_is_chairman() + app_config');
  console.log('2. Create venture_decisions table/view');
  console.log('3. Fix board governance RLS policies');
  console.log('4. Execute PLAN-TO-EXEC handoff when ready\n');
}

updatePrdWithFindings().catch(console.error);
