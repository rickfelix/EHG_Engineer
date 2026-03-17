#!/usr/bin/env node

/**
 * Create SD-LEO-COMPLETION-GATES-001
 * LEO Protocol Completion Gates & SD Type Governance
 *
 * Root Cause: P10 (SD-STAGE-ARCH-001-P10) was marked complete without
 * fulfilling user story US-003 (create follow-up SDs in database).
 * Six explorer agents identified systemic gaps in LEO Protocol enforcement.
 *
 * Created: 2025-12-30
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createSD() {
  console.log('📋 Creating SD-LEO-COMPLETION-GATES-001 - LEO Protocol Completion Gates & SD Type Governance\n');

  const sdData = {
    id: 'SD-LEO-COMPLETION-GATES-001',
    sd_key: 'SD-LEO-COMPLETION-GATES-001',
    title: 'LEO Protocol Completion Gates & SD Type Governance',

    description: `Implement comprehensive completion gates and SD type governance to prevent SDs from being marked complete without fulfilling their stated objectives. This SD addresses systemic gaps identified through root cause analysis of SD-STAGE-ARCH-001-P10 completion failure.

ROOT CAUSE ANALYSIS FINDINGS:
1. User story completion not enforced for infrastructure SDs
2. Progress calculation has backwards logic (0 stories = pass)
3. SD type changes used to bypass validation requirements (57% bypass rate)
4. No risk assessment on type changes
5. No orphan protection for deliverables/stories
6. AI classifier exists but not enforced at creation`,

    scope: `PHASE 1 - Progress Calculation Fix (P0):
- Fix backwards logic in calculate_sd_progress()
- If SD type requires stories AND stories exist, they MUST be validated
- Consult sd_type_validation_profiles.requires_e2e_tests

PHASE 2 - User Story Enforcement (P0):
- Add gate: If requires_e2e_tests=true, user_story_count > 0 required
- Add PLAN-TO-LEAD validation for story existence
- Shift-left: Catch missing stories before EXEC phase

PHASE 3 - SD Type Change Governance (P1):
- Deploy assess_sd_type_change_risk() function
- Implement risk scoring (0-100) with levels: LOW/MEDIUM/HIGH/CRITICAL
- Block CRITICAL risk changes (security downgrade, massive reduction)
- Require Chairman approval for HIGH risk changes
- Store risk assessment in governance_metadata

PHASE 4 - Orphan Protection (P1):
- Block type changes that orphan completed deliverables
- Block type changes that orphan validated user stories
- Warn on type changes that invalidate progress

PHASE 5 - Timing Restrictions (P2):
- Cannot change type after EXEC phase started (exception: upgrades)
- Cannot change type within 24 hours of completion
- Auto-trigger AI re-classification on scope changes`,

    strategic_intent: `This SD ensures LEO Protocol integrity by closing systemic gaps that allow SDs to complete without delivering promised work. The "Silent Success" anti-pattern (all checkboxes green but actual work not done) must be eliminated.

Key Principle: Process compliance must equal deliverable completion.`,

    rationale: `Evidence from SD-STAGE-ARCH-001-P10:
- P10 had 5 user stories all in draft status
- US-003 required "Follow-up SD proposals created in draft status"
- P10 was marked complete without creating any follow-up SDs
- 57% of P4-P10 reclassifications appear to be requirement bypasses
- Total impact: Undermines trust in LEO Protocol completion guarantees`,

    status: 'draft',
    priority: 'critical',
    category: 'Governance',
    sd_type: 'infrastructure',

    strategic_objectives: `1. Eliminate "Silent Success" anti-pattern where SDs complete without delivering
2. Ensure user stories are validated for SD types that require them
3. Prevent SD type changes from being used as validation bypasses
4. Protect completed work from being orphaned by type changes
5. Maintain audit trail for all governance decisions`,

    success_criteria: `AC-001: Progress calculation correctly validates user stories based on SD type profile
AC-002: PLAN-TO-LEAD handoff blocks if required user stories don't exist
AC-003: SD type changes blocked for CRITICAL risk level
AC-004: SD type changes require Chairman approval for HIGH risk level
AC-005: Risk assessment stored in governance_metadata for all type changes
AC-006: Type changes blocked if they orphan completed deliverables
AC-007: Type changes blocked after EXEC phase (upgrades excepted)
AC-008: AI classifier warnings surfaced during SD creation`,

    metadata: {
      acceptance_criteria: [
        'AC-001: Progress calculation correctly validates user stories based on SD type profile',
        'AC-002: PLAN-TO-LEAD handoff blocks if required user stories don\'t exist',
        'AC-003: SD type changes blocked for CRITICAL risk level',
        'AC-004: SD type changes require Chairman approval for HIGH risk level',
        'AC-005: Risk assessment stored in governance_metadata for all type changes',
        'AC-006: Type changes blocked if they orphan completed deliverables',
        'AC-007: Type changes blocked after EXEC phase (upgrades excepted)',
        'AC-008: AI classifier warnings surfaced during SD creation'
      ],
      root_cause_sd: 'SD-STAGE-ARCH-001-P10',
      investigation_agents: [
        'Investigation 1: SD Type User Story Requirements',
        'Investigation 2: User Story Completion Enforcement',
        'Investigation 3: SD Type Change Process Audit',
        'Investigation 4: SD Type Bypass Pattern Analysis',
        'Investigation 5: SD Type Appropriateness Validation',
        'Investigation 6: Intelligent SD Type Governance Design'
      ],
      estimated_hours: 16,
      complexity: 'high',
      affected_files: [
        'database/migrations/ (new: progress calculation fix)',
        'database/migrations/ (new: type change risk assessment)',
        'scripts/handoff.js (PLAN-TO-LEAD validation)',
        'scripts/modules/PlanToLeadExecutor.js (story existence check)',
        'scripts/add-prd-to-database.js (AI classifier integration)',
        'lib/utils/sd-type-guard.js (enforcement upgrade)'
      ],
      sprint: 'mason_sprint',
      track: 'C',
      prevents_patterns: [
        'Silent Success anti-pattern',
        'SD type bypass for validation avoidance',
        'Orphaned deliverables and user stories'
      ]
    },

    key_principles: 'Process compliance must equal deliverable completion. SD completion gates must verify actual work delivery, not just process artifacts.',

    created_by: 'CLAUDE_CODE',
    updated_by: 'CLAUDE_CODE'
  };

  // First check if SD already exists
  const { data: existing } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('id', 'SD-LEO-COMPLETION-GATES-001')
    .single();

  if (existing) {
    console.log('⚠️ SD-LEO-COMPLETION-GATES-001 already exists. Skipping creation.');
    process.exit(0);
  }

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert([sdData])
    .select();

  if (error) {
    console.error('❌ Error creating SD:', error.message);
    console.error('Details:', error);
    process.exit(1);
  }

  console.log('✅ SD-LEO-COMPLETION-GATES-001 created successfully!');
  console.log('\nSD Details:');
  console.log('  ID:', data[0].id);
  console.log('  Title:', data[0].title);
  console.log('  Priority:', data[0].priority);
  console.log('  Status:', data[0].status);
  console.log('  Type:', data[0].sd_type);

  console.log('\n📋 Next Steps:');
  console.log('  1. Run LEAD validation: node scripts/phase-preflight.js --phase PLAN --sd-id SD-LEO-COMPLETION-GATES-001');
  console.log('  2. Create PRD: node scripts/add-prd-to-database.js SD-LEO-COMPLETION-GATES-001');
  console.log('  3. Execute LEAD-TO-PLAN handoff: node scripts/handoff.js execute LEAD-TO-PLAN SD-LEO-COMPLETION-GATES-001');

  process.exit(0);
}

createSD().catch(console.error);
