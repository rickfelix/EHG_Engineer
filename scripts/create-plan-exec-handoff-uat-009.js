#!/usr/bin/env node

/**
 * Create PLAN → EXEC Handoff for SD-UAT-009
 * LEO Protocol v4.2.0 - 7 Mandatory Elements
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createHandoff() {
  console.log('🔄 Creating PLAN → EXEC Handoff for SD-UAT-009\n');

  const handoff = {
    sd_id: '0d5f1ecc-80b1-4a9c-b4e1-d1bd4a373cda',
    from_agent: 'PLAN',
    to_agent: 'EXEC',
    handoff_type: 'PLAN-to-EXEC',
    status: 'active',

    // Element 1: Executive Summary
    executive_summary: `PLAN phase complete for SD-UAT-009: Replace Mock Data with Real Database Connection.

**What was accomplished:**
- Comprehensive PRD created (PRD-SD-UAT-009)
- 7 functional requirements defined
- 6 technical requirements specified
- 6 test scenarios documented
- 11 acceptance criteria established
- 4 risks identified with mitigation
- Implementation approach detailed

**What EXEC needs to do:**
Replace mockVentures array in VentureGrid.tsx with live Supabase database queries, implement search/filter functionality, and ensure <3s load time.

**Critical path:** Database schema verification → Mock data removal → Search/filter implementation → Testing`,

    // Element 2: Completeness Report
    completeness_report: {
      plan_checklist_items: 9,
      plan_checklist_completed: 9,
      plan_completion_percentage: 100,
      deliverables: [
        { name: 'PRD-SD-UAT-009', status: 'complete', location: 'product_requirements_v2 table' },
        { name: 'Functional Requirements', status: 'complete', count: 7 },
        { name: 'Technical Requirements', status: 'complete', count: 6 },
        { name: 'Test Scenarios', status: 'complete', count: 6 },
        { name: 'Acceptance Criteria', status: 'complete', count: 11 },
        { name: 'Risk Assessment', status: 'complete', count: 4 },
        { name: 'Implementation Approach', status: 'complete', details: '7 phases defined' }
      ],
      quality_score: 100,
      missing_items: []
    },

    // Element 3: Deliverables Manifest
    deliverables_manifest: [
      {
        item: 'PRD-SD-UAT-009',
        location: 'product_requirements_v2 table, ID: PRD-SD-UAT-009',
        status: 'complete',
        verification: 'Database query confirms existence'
      },
      {
        item: 'Target Component Identified',
        location: '/mnt/c/_EHG/ehg/src/components/venture/VentureGrid.tsx',
        status: 'verified',
        verification: 'File read confirms mock data on lines 40-120'
      },
      {
        item: 'Database Connection Details',
        location: 'EHG app, database: liapbndqlqxdcgpwntbv.supabase.co',
        status: 'documented',
        verification: 'Technical context in PRD'
      },
      {
        item: 'Implementation Phases',
        location: 'PRD implementation_approach field',
        status: 'complete',
        verification: '7 phases with time estimates'
      },
      {
        item: 'Test Plan',
        location: 'PRD test_scenarios field',
        status: 'complete',
        verification: '6 test scenarios defined'
      }
    ],

    // Element 4: Key Decisions & Rationale
    key_decisions: [
      {
        decision: 'Use client-side search and filtering',
        rationale: 'Fast UX without server round-trips. If ventures >100, will refactor to server-side.',
        impact: 'Immediate responsiveness, may need optimization later',
        alternatives_considered: 'Server-side filtering (rejected for initial implementation due to complexity)'
      },
      {
        decision: 'Use React Query for data fetching',
        rationale: 'Built-in caching, loading states, error handling',
        impact: 'Cleaner code, better UX',
        alternatives_considered: 'useState + useEffect (rejected due to boilerplate)'
      },
      {
        decision: 'No pagination in initial implementation',
        rationale: 'Unknown venture count, implement only if >50 ventures',
        impact: 'Faster initial delivery, may need follow-up work',
        alternatives_considered: 'Pagination from start (rejected as premature optimization)'
      },
      {
        decision: 'Target application is EHG, not EHG_Engineer',
        rationale: 'Customer-facing features go in EHG app. EHG_Engineer is management dashboard only.',
        impact: 'CRITICAL - EXEC must navigate to /mnt/c/_EHG/ehg',
        alternatives_considered: 'None - this is architectural requirement'
      }
    ],

    // Element 5: Known Issues & Risks
    known_issues_risks: [
      {
        type: 'risk',
        severity: 'high',
        description: 'Database schema may not match TypeScript Venture interface',
        mitigation: 'EXEC MUST verify schema before implementation (Phase 1)',
        blocking: true
      },
      {
        type: 'risk',
        severity: 'critical',
        description: 'RLS policies may be incomplete or missing',
        mitigation: 'Test with multiple user roles before deployment',
        blocking: true
      },
      {
        type: 'risk',
        severity: 'medium',
        description: 'Performance issues with large datasets',
        mitigation: 'Implement pagination if ventures >50',
        blocking: false
      },
      {
        type: 'unknown',
        severity: 'medium',
        description: 'React Query may not be installed in EHG app',
        mitigation: 'Check package.json, install if needed',
        blocking: false
      },
      {
        type: 'issue',
        severity: 'low',
        description: 'Mock data serves as backup if implementation fails',
        mitigation: 'Keep mockVentures as commented code for rollback',
        blocking: false
      }
    ],

    // Element 6: Resource Utilization
    resource_utilization: {
      estimated_implementation_time: '4-5 hours',
      time_breakdown: {
        'Phase 1: Schema Discovery': '30 minutes',
        'Phase 2: Data Fetching Setup': '45 minutes',
        'Phase 3: Mock Data Replacement': '1 hour',
        'Phase 4: Search Implementation': '30 minutes',
        'Phase 5: Stage Filter': '30 minutes',
        'Phase 6: Statistics Update': '15 minutes',
        'Phase 7: Testing & Validation': '1 hour'
      },
      required_skills: ['React', 'TypeScript', 'Supabase', 'React Query', 'Testing'],
      dependencies: [
        '@supabase/supabase-js (exists)',
        '@tanstack/react-query (verify needed)',
        'EHG ventures table (verify needed)',
        'RLS policies (verify needed)'
      ],
      environment_requirements: [
        'Access to /mnt/c/_EHG/ehg directory',
        'EHG database credentials in .env',
        'Dev server capability (npm run dev)',
        'Testing environment'
      ]
    },

    // Element 7: Action Items for EXEC
    action_items: [
      {
        id: 'AI-1',
        priority: 'critical',
        action: 'Navigate to EHG application directory',
        command: 'cd /mnt/c/_EHG/ehg && pwd',
        verification: 'Output shows /mnt/c/_EHG/ehg (NOT EHG_Engineer!)',
        blocking: true
      },
      {
        id: 'AI-2',
        priority: 'critical',
        action: 'Verify database schema for ventures table',
        command: 'Check .env for credentials, query ventures table',
        verification: 'Document columns and types, compare with Venture interface',
        blocking: true
      },
      {
        id: 'AI-3',
        priority: 'critical',
        action: 'Check React Query installation',
        command: 'grep "@tanstack/react-query" package.json',
        verification: 'Package exists or install it',
        blocking: true
      },
      {
        id: 'AI-4',
        priority: 'high',
        action: 'Read VentureGrid.tsx completely',
        command: 'Read /mnt/c/_EHG/ehg/src/components/venture/VentureGrid.tsx',
        verification: 'Understand current implementation',
        blocking: false
      },
      {
        id: 'AI-5',
        priority: 'critical',
        action: 'Remove mockVentures array',
        command: 'Edit VentureGrid.tsx, comment out lines 40-120',
        verification: 'Mock data no longer in code',
        blocking: true
      },
      {
        id: 'AI-6',
        priority: 'critical',
        action: 'Implement useVentures hook',
        command: 'Create hook with useQuery, fetch from database',
        verification: 'Hook returns ventures, loading, error states',
        blocking: true
      },
      {
        id: 'AI-7',
        priority: 'high',
        action: 'Implement search by name',
        command: 'Add useState for searchTerm, filter ventures',
        verification: 'Search input filters ventures in real-time',
        blocking: false
      },
      {
        id: 'AI-8',
        priority: 'high',
        action: 'Implement stage filter',
        command: 'Add useState for selectedStage, filter ventures',
        verification: 'Stage dropdown filters ventures',
        blocking: false
      },
      {
        id: 'AI-9',
        priority: 'medium',
        action: 'Update statistics calculations',
        command: 'Recalculate stats from filtered ventures',
        verification: 'Stats reflect real data',
        blocking: false
      },
      {
        id: 'AI-10',
        priority: 'critical',
        action: 'Test all scenarios from PRD',
        command: 'Run test scenarios TS-1 through TS-6',
        verification: 'All scenarios pass',
        blocking: true
      },
      {
        id: 'AI-11',
        priority: 'high',
        action: 'Run accessibility audit',
        command: 'Use axe-core or Lighthouse',
        verification: 'Zero critical accessibility issues',
        blocking: false
      },
      {
        id: 'AI-12',
        priority: 'critical',
        action: 'Restart dev server and test',
        command: 'pkill node && npm run dev',
        verification: 'Dashboard loads with real data',
        blocking: true
      }
    ],

    metadata: {
      prd_id: 'PRD-SD-UAT-009',
      sd_key: 'SD-UAT-009',
      handoff_date: new Date().toISOString(),
      plan_agent: 'PLAN',
      exec_agent: 'EXEC',
      protocol_version: 'v4.2.0'
    }
  };

  const { data, error } = await supabase
    .from('leo_handoff_executions')
    .insert(handoff)
    .select();

  if (error) {
    console.error('❌ Error creating handoff:', error.message);
    process.exit(1);
  }

  console.log('✅ PLAN → EXEC Handoff created successfully!\n');
  console.log('📋 Handoff ID:', data[0].id);
  console.log('📊 Summary:');
  console.log(`   From: ${handoff.from_agent}`);
  console.log(`   To: ${handoff.to_agent}`);
  console.log(`   SD: SD-UAT-009`);
  console.log(`   PRD: PRD-SD-UAT-009`);
  console.log(`   Action Items: ${handoff.action_items.length}`);
  console.log(`   Risks: ${handoff.known_issues_risks.length}`);
  console.log(`   Estimated Time: ${handoff.resource_utilization.estimated_implementation_time}`);
  console.log('\n🎯 EXEC agent authorized to begin implementation\n');

  return data[0];
}

createHandoff().catch(console.error);
