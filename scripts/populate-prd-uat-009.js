#!/usr/bin/env node

/**
 * Populate PRD-SD-UAT-009 with comprehensive requirements
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function populatePRD() {
  const prdId = 'PRD-SD-UAT-009';

  console.log('📝 Populating PRD-SD-UAT-009 with detailed requirements...\n');

  const updates = {
    status: 'approved',
    priority: 'critical',

    executive_summary: `Replace hardcoded mock data in VentureGrid component with live database queries. Currently displays 6 static ventures; must connect to EHG Supabase database and implement functional search/filter capabilities. Foundation for all venture-related features.`,

    business_context: `**Current Problem**: Venture Portfolio Dashboard uses mock data (mockVentures array), making it impossible to manage real ventures. Search and filter buttons are non-functional, undermining platform credibility.

**Business Impact**:
- Cannot make data-driven investment decisions
- Platform appears incomplete/non-functional
- Blocks all downstream features (analytics, reporting)
- Risk of user churn due to lack of trust

**Target Users**: Chairman, Portfolio Managers, Investment Analysts`,

    technical_context: `**Application**: EHG (/mnt/c/_EHG/ehg)
**Database**: liapbndqlqxdcgpwntbv.supabase.co
**Component**: src/components/venture/VentureGrid.tsx (lines 40-120 contain mock data)
**Page**: src/pages/Ventures.tsx
**Current Stack**: React, TypeScript, Vite, Shadcn UI, Supabase`,

    functional_requirements: [
      { id: 'FR-1', priority: 'critical', description: 'Fetch all ventures from database on page load', rationale: 'Replace mock data with real data' },
      { id: 'FR-2', priority: 'high', description: 'Display loading state while fetching', rationale: 'User feedback during async operation' },
      { id: 'FR-3', priority: 'high', description: 'Display error state if fetch fails', rationale: 'Graceful error handling' },
      { id: 'FR-4', priority: 'high', description: 'Display empty state if no ventures exist', rationale: 'Handle edge case of empty database' },
      { id: 'FR-5', priority: 'critical', description: 'Search ventures by name (case-insensitive)', rationale: 'Functional search requirement' },
      { id: 'FR-6', priority: 'critical', description: 'Filter ventures by stage', rationale: 'Functional filter requirement' },
      { id: 'FR-7', priority: 'medium', description: 'Calculate statistics from real data', rationale: 'Accurate metrics display' }
    ],

    technical_requirements: [
      { id: 'TR-1', category: 'database', requirement: 'Use Supabase client from EHG app', implementation: 'Import configured client, query ventures table' },
      { id: 'TR-2', category: 'data-fetching', requirement: 'React Query for state management', implementation: 'useQuery hook with caching' },
      { id: 'TR-3', category: 'typescript', requirement: 'Update Venture interface to match schema', implementation: 'Verify database columns match TypeScript types' },
      { id: 'TR-4', category: 'search', requirement: 'Client-side search filtering', implementation: 'Filter ventures array by name.toLowerCase()' },
      { id: 'TR-5', category: 'filter', requirement: 'Client-side stage filtering', implementation: 'Filter ventures by stage field' },
      { id: 'TR-6', category: 'performance', requirement: 'Page load < 3 seconds', implementation: 'Lighthouse CI validation' }
    ],

    implementation_approach: `## Step-by-Step Implementation

### PHASE 1: Database Schema Discovery (30 min)
1. Navigate to /mnt/c/_EHG/ehg
2. Check .env for database credentials
3. Query ventures table: SELECT * FROM ventures LIMIT 1
4. Document schema (columns, types)
5. Compare with TypeScript Venture interface

### PHASE 2: Setup Data Fetching (45 min)
1. Check if React Query is installed (package.json)
2. If not: npm install @tanstack/react-query
3. Setup QueryClient provider (if needed)
4. Create useVentures hook

### PHASE 3: Replace Mock Data (1 hour)
1. BACKUP: Save mockVentures array as comment
2. Remove lines 40-120 (mock data)
3. Add useVentures() hook
4. Add loading/error/empty states
5. Update VentureCard to use real data

### PHASE 4: Implement Search (30 min)
1. Add useState for searchTerm
2. Add useCallback for filtering
3. Connect search Input to state
4. Filter ventures by name

### PHASE 5: Implement Stage Filter (30 min)
1. Add useState for selectedStage
2. Add useCallback for stage filtering
3. Connect DropdownMenu to state
4. Filter ventures by stage

### PHASE 6: Update Statistics (15 min)
1. Calculate totalVentures from real data
2. Calculate activeCount from real data
3. Calculate highRiskCount from real data
4. Calculate avgAIScore from real data

### PHASE 7: Testing (1 hour)
1. Test with empty database
2. Test with 1 venture
3. Test with 50+ ventures
4. Test search functionality
5. Test filter functionality
6. Test error handling (disconnect network)
7. Accessibility audit (axe-core)`,

    test_scenarios: [
      { id: 'TS-1', scenario: 'Empty database', steps: ['Clear ventures table', 'Navigate to /ventures'], expected: 'Empty state displayed' },
      { id: 'TS-2', scenario: 'Loading state', steps: ['Throttle network to Slow 3G', 'Navigate to /ventures'], expected: 'Loading spinner shown' },
      { id: 'TS-3', scenario: 'Error state', steps: ['Disconnect network', 'Navigate to /ventures'], expected: 'Error message displayed' },
      { id: 'TS-4', scenario: 'Search ventures', steps: ['Navigate to /ventures', 'Type "AI" in search'], expected: 'Only ventures with "AI" in name shown' },
      { id: 'TS-5', scenario: 'Filter by stage', steps: ['Navigate to /ventures', 'Select "Development" stage'], expected: 'Only Development stage ventures shown' },
      { id: 'TS-6', scenario: 'Real data display', steps: ['Navigate to /ventures'], expected: 'Ventures from database displayed, not mock data' }
    ],

    acceptance_criteria: [
      'mockVentures array removed from VentureGrid.tsx',
      'All venture data fetched from database',
      'Search input filters ventures by name (case-insensitive)',
      'Stage filter dropdown functional',
      'Statistics calculated from real data',
      'Loading state shows during fetch',
      'Error state shows on fetch failure',
      'Empty state shows when no ventures',
      'Page load time < 3 seconds (Lighthouse)',
      'Zero accessibility violations (axe-core)',
      'RLS policies enforced (verify with test user)'
    ],

    performance_requirements: {
      page_load: '< 3 seconds TTI',
      search_response: '< 100ms (client-side)',
      filter_response: '< 100ms (client-side)',
      database_query: '< 500ms',
      target_lighthouse_score: '>= 90'
    },

    dependencies: [
      { name: '@supabase/supabase-js', version: 'latest', type: 'runtime', status: 'exists' },
      { name: '@tanstack/react-query', version: '^4.0.0', type: 'runtime', status: 'verify_needed' },
      { name: 'EHG ventures table', version: 'n/a', type: 'database', status: 'verify_needed' },
      { name: 'RLS policies for ventures', version: 'n/a', type: 'security', status: 'verify_needed' }
    ],

    risks: [
      { description: 'Database schema mismatch with TypeScript interface', probability: 'medium', impact: 'high', mitigation: 'Verify schema first' },
      { description: 'RLS policies missing or incomplete', probability: 'medium', impact: 'critical', mitigation: 'Security audit before deployment' },
      { description: 'Performance issues with large datasets', probability: 'high', impact: 'medium', mitigation: 'Implement pagination if >50 ventures' },
      { description: 'Breaking changes to dependent components', probability: 'low', impact: 'high', mitigation: 'Comprehensive testing' }
    ],

    constraints: [
      'Must use existing EHG database (cannot modify schema)',
      'Must maintain WCAG AA accessibility',
      'Must load within 3 seconds',
      'Must work with existing Supabase RLS policies',
      'Cannot add new npm packages without justification'
    ],

    content: `# PRD: Replace Mock Data with Real Database Connection

## Executive Summary
Replace hardcoded mock data in VentureGrid component with live database queries from EHG Supabase database.

## Target Application
**EHG Application** (/mnt/c/_EHG/ehg)
- Database: liapbndqlqxdcgpwntbv.supabase.co
- Component: src/components/venture/VentureGrid.tsx
- Page: src/pages/Ventures.tsx

## Critical Changes Required
1. Remove mockVentures array (lines 40-120)
2. Add database query with useQuery hook
3. Implement search by name
4. Implement filter by stage
5. Add loading/error/empty states
6. Update statistics calculations

## Implementation Time Estimate
**Total: 4-5 hours**
- Schema discovery: 30 min
- Data fetching setup: 45 min
- Mock data replacement: 1 hour
- Search implementation: 30 min
- Filter implementation: 30 min
- Statistics update: 15 min
- Testing & validation: 1 hour

## Success Criteria
✅ Zero mock data in production
✅ All ventures from database
✅ Search functional
✅ Filter functional
✅ < 3 second load time
✅ WCAG AA compliant
✅ RLS policies enforced

## EXEC Agent Checklist
- [ ] Navigate to /mnt/c/_EHG/ehg (NOT EHG_Engineer!)
- [ ] Verify database schema for ventures table
- [ ] Check Supabase client configuration
- [ ] Remove mockVentures array
- [ ] Implement useVentures hook with React Query
- [ ] Add loading/error/empty states
- [ ] Implement search functionality
- [ ] Implement stage filter
- [ ] Update statistics calculations
- [ ] Test all scenarios
- [ ] Run accessibility audit
- [ ] Verify RLS policies
- [ ] Create PR with screenshots`,

    plan_checklist: [
      { text: 'PRD created and saved', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Implementation approach documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true },
      { text: 'Resource requirements estimated', checked: true },
      { text: 'Timeline and milestones set', checked: true },
      { text: 'Risk assessment completed', checked: true }
    ],

    progress: 100,
    phase: 'ready_for_exec'
  };

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .update(updates)
    .eq('id', prdId)
    .select();

  if (error) {
    console.error('❌ Error updating PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD-SD-UAT-009 populated successfully!\n');
  console.log('📊 PRD Details:');
  console.log(`   Status: ${data[0].status}`);
  console.log(`   Priority: ${data[0].priority}`);
  console.log(`   Phase: ${data[0].phase}`);
  console.log(`   Progress: ${data[0].progress}%`);
  console.log(`   Functional Requirements: ${data[0].functional_requirements.length}`);
  console.log(`   Technical Requirements: ${data[0].technical_requirements.length}`);
  console.log(`   Test Scenarios: ${data[0].test_scenarios.length}`);
  console.log(`   Acceptance Criteria: ${data[0].acceptance_criteria.length}`);
  console.log(`   Risks: ${data[0].risks.length}`);
  console.log('\n🎯 PRD ready for PLAN→EXEC handoff\n');

  return data[0];
}

populatePRD().catch(console.error);
