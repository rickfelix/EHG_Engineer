#!/usr/bin/env node

/**
 * LEAD Approval: SD-047A Venture Timeline Tab
 * Update status from draft → active
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function approveSD() {
  console.log('📋 LEAD Approval: SD-047A Venture Timeline Tab\n');

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({
      status: 'active',
      approval_date: new Date().toISOString(),
      approved_by: 'LEAD Agent',
      metadata: {
        lead_approval: {
          approved_date: new Date().toISOString(),
          simplicity_first_review: 'PASSED',
          rationale: 'Leverages existing gantt-task-react library, proven patterns from StrategicInitiativeTracking.tsx, and extends implemented 40-stage lifecycle. Focused scope with clear business value.',
          estimated_hours: 28,
          complexity_assessment: 'Medium - UI-heavy but using established patterns',
          risk_level: 'Low - Building on proven infrastructure'
        },
        related_sds: ['SD-2025-09-11-ventures-list-consolidated (cancelled)', 'SD-047B (Documents Tab)'],
        technical_foundation: {
          library: 'gantt-task-react',
          existing_patterns: 'StrategicInitiativeTracking.tsx, EnhancedMilestoneView.tsx',
          database_needs: 'venture_milestones table, ventures.metadata updates'
        },
        database_migrations_required: true,
        design_subagent_required: true
      }
    })
    .eq('sd_key', 'SD-047A')
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ SD-047A approved by LEAD\n');
  console.log('📊 Approval Details:');
  console.log('   Status: active');
  console.log('   Approved By: LEAD Agent');
  console.log('   Simplicity-First Review: PASSED');
  console.log('   Risk Level: Low');
  console.log('   Estimated Hours: 28');
  console.log('\n✅ Ready for LEAD→PLAN handoff\n');
}

approveSD();
