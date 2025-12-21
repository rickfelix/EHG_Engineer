#!/usr/bin/env node

/**
 * Create PRD for SD-UAT-009: Replace Mock Data with Real Database
 * Foundation layer - all features depend on this
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  const sdId = '0d5f1ecc-80b1-4a9c-b4e1-d1bd4a373cda';

  console.log('📝 Creating PRD for SD-UAT-009...\n');

  const prd = {
    sd_id: sdId,
    prd_key: 'PRD-UAT-009-V1',
    title: 'Replace Mock Data with Real Database Connection in Venture Portfolio Dashboard',
    version: '1.0',
    status: 'approved',
    priority: 'critical',

    overview: `## Overview

The Venture Portfolio Management Dashboard currently uses hardcoded mock data instead of connecting to the real database. This implementation:
- Displays 6 static ventures regardless of actual database content
- Prevents search and filter functionality from working
- Creates a non-functional user experience
- Undermines platform credibility

**This PRD defines the implementation to replace ALL mock data with live database queries.**

## Target Application
**EHG Application** (/mnt/c/_EHG/EHG)
- Database: liapbndqlqxdcgpwntbv.supabase.co
- Component: src/components/venture/VentureGrid.tsx
- Page: src/pages/Ventures.tsx`,

    // FIX: user_stories moved to separate table
    // user_stories: [
      {
        id: 'US-1',
        role: 'Chairman',
        goal: 'view real venture data from the database',
        benefit: 'make informed investment decisions based on actual data',
        acceptance_criteria: [
          'No mock data displayed on venture dashboard',
          'All ventures shown are from database',
          'Venture count reflects actual database records',
          'Dashboard updates when database changes'
        ],
        priority: 'critical'
      },
      {
        id: 'US-2',
        role: 'Portfolio Manager',
        goal: 'search for specific ventures by name',
        benefit: 'quickly find ventures I need to review',
        acceptance_criteria: [
          'Search input filters ventures in real-time',
          'Search matches venture name (case-insensitive)',
          'Search shows "No results" when no matches',
          'Search works with database-backed data'
        ],
        priority: 'high'
      },
      {
        id: 'US-3',
        role: 'Investment Analyst',
        goal: 'filter ventures by stage',
        benefit: 'focus on ventures at specific lifecycle stages',
        acceptance_criteria: [
          'Stage filter dropdown is functional',
          'Selecting stage filters ventures in real-time',
          '"All Stages" option shows all ventures',
          'Filter works with database-backed data'
        ],
        priority: 'high'
      },
      {
        id: 'US-4',
        role: 'User',
        goal: 'see accurate venture statistics',
        benefit: 'understand portfolio composition at a glance',
        acceptance_criteria: [
          'Total Ventures count matches database',
          'Active count shows ventures with status="active"',
          'High Risk count shows ventures with risk_score="high"',
          'Average AI Score calculated from real data'
        ],
        priority: 'medium'
      },
      {
        id: 'US-5',
        role: 'Developer',
        goal: 'have clear error handling for database failures',
        benefit: 'debug issues and provide user feedback',
        acceptance_criteria: [
          'Loading state shown while fetching data',
          'Error state shown if database query fails',
          'Empty state shown if no ventures exist',
          'User-friendly error messages'
        ],
        priority: 'high'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        category: 'Database',
        requirement: 'Connect to EHG Supabase database (liapbndqlqxdcgpwntbv)',
        rationale: 'Source of truth for venture data',
        acceptance: 'Query succeeds and returns venture records'
      },
      {
        id: 'TR-2',
        category: 'Data Fetching',
        requirement: 'Implement React Query or similar for data management',
        rationale: 'Caching, loading states, error handling',
        acceptance: 'useQuery hook fetches ventures on mount'
      },
      {
        id: 'TR-3',
        category: 'Search',
        requirement: 'Client-side search filtering on venture name',
        rationale: 'Fast, responsive user experience',
        acceptance: 'Search filters ventures without API calls'
      },
      {
        id: 'TR-4',
        category: 'Filtering',
        requirement: 'Client-side stage filtering',
        rationale: 'Fast, responsive filtering',
        acceptance: 'Stage filter updates view immediately'
      },
      {
        id: 'TR-5',
        category: 'Performance',
        requirement: 'Dashboard loads within 3 seconds',
        rationale: 'User experience requirement',
        acceptance: 'Lighthouse TTI < 3s'
      },
      {
        id: 'TR-6',
        category: 'Security',
        requirement: 'RLS policies enforced for ventures table',
        rationale: 'Data access control',
        acceptance: 'Only authorized ventures visible to user'
      }
    ],

    implementation_approach: `## Implementation Approach

### Phase 1: Database Schema Verification
1. Verify ventures table exists in EHG database
2. Document schema (columns, types, constraints)
3. Test RLS policies
4. Identify any schema mismatches with TypeScript interface

### Phase 2: Supabase Client Setup
1. Verify Supabase client configuration in EHG app
2. Test database connection
3. Create ventures query function

### Phase 3: Replace Mock Data
1. Remove mockVentures array from VentureGrid.tsx
2. Add data fetching with loading/error states
3. Update VentureCard to use real data
4. Update stats summary to use real data

### Phase 4: Implement Search & Filter
1. Add search state management
2. Filter ventures by name
3. Add stage filter state
4. Filter ventures by stage

### Phase 5: Testing & Validation
1. Test with no ventures (empty state)
2. Test with many ventures (performance)
3. Test search functionality
4. Test filter functionality
5. Test error handling (network failure)
6. Accessibility audit (WCAG AA)`,

    test_plan: [
      {
        id: 'TP-1',
        type: 'unit',
        description: 'Test venture fetching function',
        steps: ['Mock Supabase client', 'Call fetch function', 'Verify data returned'],
        expected: 'Function returns ventures array'
      },
      {
        id: 'TP-2',
        type: 'integration',
        description: 'Test VentureGrid with real database',
        steps: ['Mount component', 'Wait for data load', 'Verify ventures displayed'],
        expected: 'Ventures from database rendered'
      },
      {
        id: 'TP-3',
        type: 'e2e',
        description: 'Test search functionality',
        steps: ['Navigate to /ventures', 'Type in search box', 'Verify filtered results'],
        expected: 'Only matching ventures shown'
      },
      {
        id: 'TP-4',
        type: 'e2e',
        description: 'Test stage filter',
        steps: ['Navigate to /ventures', 'Select stage filter', 'Verify filtered results'],
        expected: 'Only ventures in selected stage shown'
      },
      {
        id: 'TP-5',
        type: 'performance',
        description: 'Test load time',
        steps: ['Clear cache', 'Navigate to /ventures', 'Measure TTI'],
        expected: 'TTI < 3 seconds'
      },
      {
        id: 'TP-6',
        type: 'accessibility',
        description: 'Test WCAG AA compliance',
        steps: ['Run axe-core', 'Verify keyboard navigation', 'Check screen reader'],
        expected: 'Zero critical accessibility issues'
      },
      {
        id: 'TP-7',
        type: 'security',
        description: 'Test RLS policies',
        steps: ['Login as different users', 'Verify venture visibility', 'Test unauthorized access'],
        expected: 'RLS policies properly enforced'
      }
    ],

    acceptance_criteria: [
      'Zero mock data present in VentureGrid.tsx',
      'All venture data comes from database queries',
      'Search functionality filters ventures by name',
      'Stage filter works and shows correct ventures',
      'Statistics (Total, Active, High Risk, Avg AI Score) calculated from real data',
      'Loading state shown while fetching',
      'Error state shown on database failure',
      'Empty state shown when no ventures exist',
      'Dashboard loads within 3 seconds',
      'WCAG AA compliance maintained',
      'RLS policies enforced'
    ],

    dependencies: {
      internal: [
        'Supabase client configuration in EHG app',
        'Ventures table in EHG database',
        'RLS policies for ventures table'
      ],
      external: [
        '@supabase/supabase-js package',
        'React Query or similar data fetching library'
      ],
      blocked_by: []
    },

    risks: [
      {
        risk: 'Database schema mismatch',
        probability: 'medium',
        impact: 'high',
        mitigation: 'Verify schema in Phase 1 before coding'
      },
      {
        risk: 'RLS policies incomplete or missing',
        probability: 'medium',
        impact: 'critical',
        mitigation: 'Test RLS policies with multiple user roles'
      },
      {
        risk: 'Performance degradation with large datasets',
        probability: 'high',
        impact: 'medium',
        mitigation: 'Implement pagination if >50 ventures'
      },
      {
        risk: 'Breaking changes to other components',
        probability: 'low',
        impact: 'high',
        mitigation: 'Comprehensive testing before merge'
      }
    ],

    rollout_plan: `## Rollout Plan

### Step 1: Feature Branch
- Create branch: feature/SD-UAT-009-replace-mock-data
- Implement changes
- Run all tests

### Step 2: Code Review
- Submit PR with detailed description
- Address review comments
- Verify CI/CD passes

### Step 3: Staging Deployment
- Deploy to staging environment
- Manual testing with real data
- Performance testing
- Accessibility audit

### Step 4: Production Deployment
- Deploy during low-traffic window
- Monitor for errors
- Verify metrics
- Rollback plan ready

### Rollback Plan
If issues arise:
1. Revert to previous deployment
2. Restore mock data temporarily
3. Debug issues in staging
4. Re-deploy with fixes`,

    notes: `## Important Notes

### Database Connection
The EHG application uses Supabase database: liapbndqlqxdcgpwntbv
Verify connection credentials in /mnt/c/_EHG/EHG/.env

### Schema Discovery
First step is to query the ventures table and document its schema.
TypeScript interface may need updates to match database structure.

### Search & Filter Strategy
Using client-side filtering for fast UX. If venture count exceeds 100,
consider server-side filtering with query parameters.

### RLS Security
CRITICAL: Test RLS policies thoroughly. Users should only see ventures
they're authorized to access.

### Performance Considerations
- Implement pagination if venture count > 50
- Add caching with React Query (5-minute stale time)
- Lazy load venture details on click
- Consider virtual scrolling for large lists`
  };

  const { data, error } = await supabase
    .from('product_requirement_documents')
    .insert(prd)
    .select();

  if (error) {
    console.error('❌ Error creating PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD created successfully!');
  console.log(`   PRD ID: ${data[0].id}`);
  console.log(`   PRD Key: ${data[0].prd_key}`);
  console.log(`   Status: ${data[0].status}`);
  console.log(`   Priority: ${data[0].priority}`);
  console.log('\n📊 PRD Contents:');
  console.log(`   User Stories: ${prd.user_stories.length}`);
  console.log(`   Technical Requirements: ${prd.technical_requirements.length}`);
  console.log(`   Test Cases: ${prd.test_plan.length}`);
  console.log(`   Acceptance Criteria: ${prd.acceptance_criteria.length}`);
  console.log(`   Risks Identified: ${prd.risks.length}`);
  console.log('\n🎯 PRD ready for PLAN→EXEC handoff\n');

  return data[0];
}

createPRD().catch(console.error);
