#!/usr/bin/env node

/**
 * Add SD-LEO-RESILIENCE-001 (LEO Protocol Shift-Left Validation) to database
 * LEO Protocol v4.3.3 - Database First Approach
 *
 * Purpose: Add database-level enforcement that prevents SDs from entering
 * phases without required prerequisites (PRD, user stories, handoffs) in
 * canonical locations.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function addLEOResilienceSD() {
  console.log('🚀 LEO Protocol v4.3.3 - SD Creation');
  console.log('================================================');
  console.log('Document: SD-LEO-RESILIENCE-001 - Shift-Left Prerequisite Validation\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. Insert Strategic Directive
    console.log('📋 Inserting Strategic Directive...');
    const { data: sdData, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .upsert({
        id: 'SD-LEO-RESILIENCE-001',
        sd_key: 'leo-resilience-001',
        title: 'LEO Protocol Resilience - Shift-Left Prerequisite Validation',
        status: 'draft',
        current_phase: 'LEAD_APPROVAL',
        category: 'infrastructure',
        priority: 'high',
        description: `Implement database-level enforcement that prevents Strategic Directives from transitioning to phases without required prerequisites in canonical database locations. This addresses the root cause where SDs can be marked as "in_progress" in EXEC phase while missing PRD, user stories, and handoff records - violating LEO Protocol but not being caught until manual inspection.

The system should enforce:
- PLAN phase requires: SD approved in LEAD
- EXEC phase requires: PRD exists in product_requirements_v2, user stories exist in user_stories table, PLAN-TO-EXEC handoff exists in sd_phase_handoffs
- Completion requires: All handoffs complete, all user stories validated

This is a "shift-left" approach - catching violations at the database level before they propagate into broken workflow states.`,
        rationale: `During SD-STAGE-ARCH-001-P4 execution, the SD was found in EXEC phase with:
- 0 PRDs in product_requirements_v2
- 0 user stories in user_stories table
- 0 handoffs in sd_phase_handoffs

This violated LEO Protocol but was not caught by the system. Manual backfill was required to restore compliance. This pattern has likely occurred with other SDs and will continue without systemic prevention.`,
        scope: `Database triggers and constraints for strategic_directives_v2 table that enforce prerequisite existence before phase transitions. Includes:
1. Database trigger: validate_sd_phase_transition() - fires BEFORE UPDATE on current_phase
2. Validation functions for each phase transition
3. Clear error messages when prerequisites missing
4. Optional bypass for specific SD types (docs-only, infrastructure)
5. Migration to add constraints
6. Tests to verify enforcement`,
        strategic_objectives: [
          'Prevent SDs from entering PLAN phase without LEAD approval',
          'Prevent SDs from entering EXEC phase without PRD and user stories',
          'Prevent SD completion without all handoffs recorded',
          'Provide clear error messages identifying missing prerequisites',
          'Allow bypass for docs-only and infrastructure SDs where appropriate'
        ],
        success_criteria: [
          'Database trigger blocks EXEC transition when PRD missing',
          'Database trigger blocks EXEC transition when user stories missing',
          'Database trigger blocks completion when handoffs missing',
          'Error messages clearly identify which prerequisites are missing',
          'Legitimate phase transitions still work correctly',
          'Bypass works for docs-only SDs',
          'All existing SDs remain in valid states after migration'
        ],
        metadata: {
          sd_type: 'infrastructure',
          target_application: 'EHG_Engineer',
          affects_tables: [
            'strategic_directives_v2',
            'product_requirements_v2',
            'user_stories',
            'sd_phase_handoffs'
          ],
          implementation_approach: 'database_triggers',
          risk_level: 'medium',
          estimated_effort: '4-6 hours',
          triggered_by: 'SD-STAGE-ARCH-001-P4 compliance gap discovery',
          related_sds: ['SD-STAGE-ARCH-001-P4']
        },
        created_by: 'LEAD-v4.3.3',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select();

    if (sdError) {
      console.log('❌ Error inserting SD:', sdError.message);
      process.exit(1);
    }

    console.log('✅ Strategic Directive inserted successfully');
    console.log('   ID:', sdData?.[0]?.id || 'SD-LEO-RESILIENCE-001');

    // 2. Create initial PRD shell
    console.log('\n📋 Creating PRD shell...');
    const { error: prdError } = await supabase
      .from('product_requirements_v2')
      .upsert({
        id: 'PRD-SD-LEO-RESILIENCE-001',
        sd_key: 'SD-LEO-RESILIENCE-001',
        title: 'LEO Protocol Resilience - Shift-Left Prerequisite Validation',
        status: 'draft',
        category: 'infrastructure',
        priority: 'high',
        executive_summary: 'Implement database-level enforcement to prevent SD phase transitions without required prerequisites.',
        content: `# PRD: LEO Protocol Shift-Left Prerequisite Validation

## Executive Summary

This PRD covers the implementation of database-level enforcement that prevents Strategic Directives from transitioning to phases without required prerequisites in canonical database locations.

## Problem Statement

SDs can currently be marked as "in_progress" in EXEC phase while missing:
- PRD in product_requirements_v2 table
- User stories in user_stories table
- Handoffs in sd_phase_handoffs table

This violates LEO Protocol but is not caught until manual inspection, causing compliance gaps and rework.

## Solution Overview

Implement PostgreSQL triggers on strategic_directives_v2 that validate prerequisites exist before allowing phase transitions.

## Functional Requirements

### FR-01: PLAN Phase Gate
**Trigger**: BEFORE UPDATE on current_phase TO 'PLAN'
**Validation**: SD status must be 'approved' from LEAD phase

### FR-02: EXEC Phase Gate
**Trigger**: BEFORE UPDATE on current_phase TO 'EXEC'
**Validation**:
- PRD must exist in product_requirements_v2 with matching sd_key
- At least 1 user story must exist in user_stories with matching sd_id
- PLAN-TO-EXEC handoff must exist in sd_phase_handoffs

### FR-03: Completion Gate
**Trigger**: BEFORE UPDATE on status TO 'completed'
**Validation**:
- All required handoffs exist (LEAD-TO-PLAN, PLAN-TO-EXEC, EXEC-TO-PLAN, PLAN-TO-LEAD)
- All user stories have status 'completed' or 'validated'

### FR-04: Bypass Mechanism
**For SD types**: 'docs-only', 'infrastructure', 'config'
**Behavior**: Skip user story requirement, still require PRD and handoffs

### FR-05: Clear Error Messages
**Format**: 'Cannot transition SD {id} to {phase}: Missing {prerequisite}'
**Include**: List of missing items with table names

## Technical Architecture

### Database Objects

\`\`\`sql
-- Main validation function
CREATE OR REPLACE FUNCTION validate_sd_phase_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Check transitions and validate prerequisites
END;
$$ LANGUAGE plpgsql;

-- Trigger
CREATE TRIGGER enforce_sd_phase_prerequisites
BEFORE UPDATE OF current_phase ON strategic_directives_v2
FOR EACH ROW
EXECUTE FUNCTION validate_sd_phase_transition();
\`\`\`

### Migration Strategy

1. Create validation function
2. Create trigger (initially disabled)
3. Audit existing SDs for compliance
4. Fix non-compliant SDs or mark as legacy
5. Enable trigger
6. Monitor for issues

## Test Scenarios

### TS-01: Block EXEC without PRD
Given: SD in PLAN phase, no PRD exists
When: Attempt to update current_phase to EXEC
Then: Update blocked with error message

### TS-02: Allow EXEC with prerequisites
Given: SD in PLAN phase, PRD exists, stories exist, handoff exists
When: Attempt to update current_phase to EXEC
Then: Update succeeds

### TS-03: Bypass for docs-only
Given: SD with type 'docs-only', no user stories
When: Attempt to update current_phase to EXEC
Then: Update succeeds (stories not required)

## Success Criteria

1. Zero SDs can enter EXEC without PRD
2. Zero SDs can complete without handoffs
3. Clear error messages on violation
4. No impact on legitimate workflows
5. Bypass works for appropriate SD types

---
*Generated: ${new Date().toISOString()}*
`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (prdError) {
      console.log('⚠️  PRD creation warning:', prdError.message);
    } else {
      console.log('✅ PRD shell created');
    }

    // 3. Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ SD-LEO-RESILIENCE-001 CREATED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`
📋 Strategic Directive: SD-LEO-RESILIENCE-001
   Title: LEO Protocol Resilience - Shift-Left Prerequisite Validation
   Status: draft
   Phase: LEAD_APPROVAL
   Priority: high
   Category: infrastructure

📝 PRD: PRD-SD-LEO-RESILIENCE-001
   Status: draft

🎯 Scope:
   - Database triggers for phase transition validation
   - Validation functions for prerequisites
   - Clear error messages
   - Bypass for docs-only SDs
   - Migration and tests

📌 To start working on this SD in another Claude Code instance:

   1. Run: npm run sd:next
   2. Select: SD-LEO-RESILIENCE-001
   3. Execute LEAD approval workflow
   4. Follow LEO Protocol: LEAD → PLAN → EXEC

⚡ Quick start prompt for other instance:
   "Start working on SD-LEO-RESILIENCE-001 - LEO Protocol Resilience"
`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addLEOResilienceSD();
