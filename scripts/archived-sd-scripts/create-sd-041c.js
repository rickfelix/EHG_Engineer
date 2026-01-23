#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
// import { randomUUID } from 'crypto'; // Unused - IDs are provided externally
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createSD() {
  console.log('📋 Creating SD-041C - Chairman Approval UI Dashboard\n');

  const sdData = {
    id: 'SD-041C',
    sd_key: 'SD-041C',
    title: 'Chairman Approval UI Dashboard',
    description: 'Build Chairman dashboard for reviewing opportunity blueprints with approve/reject workflow',

    scope: `**Must-Haves** (from SD-041B AC-004):
1. Blueprint list view with status filtering
2. Blueprint detail card with all information
3. Approve button with comment field
4. Reject button with feedback field
5. Needs_revision action with guidance field
6. Status badge display (pending/approved/rejected)

**Nice-to-Haves**:
- Create Venture button for approved blueprints
- Approval history timeline
- Export blueprint as PDF
- Email notification to creator`,

    strategic_intent: `Context: SD-041B implemented the database schema and service layer for opportunity blueprints with chairman_status workflow (pending/approved/rejected/needs_revision). However, no UI exists for the Chairman to review and approve blueprints.

Integration Points:
- Builds on SD-041B database schema (opportunity_blueprints table)
- Uses ventureIdeationService methods (getOpportunityBlueprints, updateBlueprintStatus)
- Integrates with existing Chairman dashboard (if exists) or creates new view`,

    rationale: `Simplicity-First Approach:
- Reuse existing UI patterns from EHG application
- Single-page dashboard view (no multi-step wizard)
- Leverage SD-041B service layer (no new backend logic)
- Simple approve/reject buttons with comment field`,

    status: 'draft',
    priority: 'medium',
    category: 'UI/UX Enhancement',

    strategic_objectives: `1. Display pending opportunity blueprints for Chairman review
2. Provide approve/reject/needs_revision actions with comments
3. Show blueprint details (problem, solution, evidence, score)
4. Track approval history and timestamps
5. Integrate with Stage 4 Venture Cloning workflow`,

    success_criteria: `AC-001: Blueprint list displays with key metrics
AC-002: Blueprint detail view shows full information
AC-003: Chairman can approve with comments
AC-004: Chairman can reject with feedback
AC-005: Chairman can mark as needs_revision
AC-006: Approved blueprints show Create Venture option`,

    metadata: {
      acceptance_criteria: [
        'AC-001: Blueprint list displays with key metrics (title, score, status, created date)',
        'AC-002: Blueprint detail view shows full information (problem statement, solution concept, competitive gaps, customer evidence, opportunity score)',
        'AC-003: Chairman can approve blueprint with comments → status becomes approved, approved_at timestamp set',
        'AC-004: Chairman can reject blueprint with feedback → status becomes rejected, chairman_feedback stored',
        'AC-005: Chairman can mark as needs_revision with specific guidance',
        'AC-006: Approved blueprints show option to Create Venture (future SD-041C-2 integration)'
      ],
      parent_sd: 'SD-041B',
      relationship: 'follow_up',
      estimated_hours: 4,
      complexity: 'medium',
      requires_design_review: true,
      integration_touchpoints: [
        'SD-041B ventureIdeationService',
        'opportunity_blueprints table',
        'Chairman dashboard (existing or new)'
      ],
      deferred_from: 'SD-041B AC-004 partial implementation'
    }
  };

  const { data: _data, error } = await supabase
    .from('strategic_directives_v2')
    .insert([sdData])
    .select();

  if (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  console.log('✅ SD-041C created successfully!\n');
  console.log('📊 SD Summary:');
  console.log('   SD Key: SD-041C');
  console.log('   Title: Chairman Approval UI Dashboard');
  console.log('   Priority: MEDIUM');
  console.log('   Status: draft');
  console.log('   Parent SD: SD-041B');
  console.log('   Estimated: 4 hours');
  console.log('   Design Review: Required');
  console.log('\n🎯 Next: LEAD agent to activate SD and create LEAD→PLAN handoff');
}

createSD().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
