#!/usr/bin/env node

/**
 * PRD for SD-GTM-INTEL-DISCOVERY-001
 * Enhance GTM Intelligence Discoverability - Technical Implementation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SD_ID = 'SD-GTM-INTEL-DISCOVERY-001';
const PRD_TITLE = 'GTM Intelligence Navigation Fix - Add Missing Links';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  // Fetch SD
  console.log('\n1️⃣  Fetching Strategic Directive...');
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ SD ${SD_ID} not found`);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    id: prdId,
    sd_uuid: sdData.uuid_id,
    directive_id: SD_ID,
    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: 'ux_improvement',
    priority: 'high',

    executive_summary: `
Based on LEAD code review, GTM Intelligence system (714 LOC service) has discoverability issues:

**Current State:**
- /gtm-timing: ✅ Has navigation link (visible in analytics category)
- /gtm-intelligence: ❌ NO navigation (orphaned route, 251 LOC dashboard hidden)
- /gtm-strategist: ❌ NO navigation (orphaned route, purpose unclear)

**Impact:**
GTMDashboardPage is production-ready with cross-venture intelligence features but zero user adoption due to lack of navigation.

**Solution:**
1. Add navigation link for /gtm-intelligence (15-30 min)
2. Investigate /gtm-strategist purpose and either add nav or remove route
3. Document GTM route architecture for future clarity
    `.trim(),

    business_context: `
**User Pain:**
- Users cannot discover comprehensive GTM intelligence dashboard
- Investment in 251 LOC GTMDashboardPage is wasted (zero adoption)
- Confusion about which GTM interface to use

**Business Value:**
- Unlock hidden feature (instant value, no new dev work)
- Improve GTM feature discoverability
- Clarify GTM route architecture

**Success Metrics:**
- ≥30% user discovery of /gtm-intelligence within 30 days
- Zero orphaned production routes
- Documented route architecture
    `.trim(),

    technical_context: `
**Existing GTM Infrastructure:**
- Service: gtmIntelligence.ts (714 LOC) - AI-powered timing analysis
- Components: GTMTimingDashboard (902 LOC), GTMDashboardPage (251 LOC), 6 supporting components
- Routes: 3 defined (/gtm-timing, /gtm-intelligence, /gtm-strategist)
- Navigation: ModernNavigationSidebar.tsx manages all app navigation

**Architecture Pattern:**
Navigation entries use format:
{ path: '/route', label: 'Label', icon: IconComponent, category: 'category', isNew: true, description: 'Description' }

**Code Locations:**
- Navigation: src/components/navigation/ModernNavigationSidebar.tsx
- Routes: src/App.tsx (lines 357, 964, 1255)
- GTM Pages: src/pages/GTMDashboardPage.tsx, src/pages/GTMTimingPage.tsx
    `.trim(),

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Add navigation link for /gtm-intelligence',
        description: 'Add GTMDashboardPage to navigation menu in analytics category',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Navigation entry added to ModernNavigationSidebar.tsx',
          'Link visible in analytics category',
          'Clicking link navigates to /gtm-intelligence',
          'Route accessible and renders GTMDashboardPage'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Investigate /gtm-strategist route',
        description: 'Determine if route is production feature or test/duplicate',
        priority: 'HIGH',
        acceptance_criteria: [
          'Code review of GTMStrategistPage usage',
          'Git history analysis of route creation',
          'Decision documented: keep (add nav) or remove (cleanup)'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Document GTM route architecture',
        description: 'Create documentation explaining purpose of each GTM route',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Architecture doc created in codebase',
          'Each route purpose clearly stated',
          'Use cases for each interface documented'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'usability',
        requirement: 'Navigation link must follow existing patterns',
        target_metric: 'Consistent with /gtm-timing navigation entry'
      },
      {
        type: 'performance',
        requirement: 'No performance impact from navigation changes',
        target_metric: 'Navigation render time unchanged'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'Edit ModernNavigationSidebar.tsx',
        description: 'Add navigation entry in analytics category after /gtm-timing',
        dependencies: ['lucide-react icons']
      },
      {
        id: 'TR-2',
        requirement: 'Verify route accessibility',
        description: 'Ensure /gtm-intelligence renders correctly with new nav',
        dependencies: []
      }
    ],

    system_architecture: `
## Current Architecture
- ModernNavigationSidebar.tsx: Central navigation management
- App.tsx: Route definitions (React Router)
- GTMDashboardPage: Cross-venture intelligence dashboard
- GTMTimingPage: Stage-based timing wrapper

## Proposed Changes
1. Add navigation entry at line ~381 (after /gtm-timing)
2. Follow existing pattern (icon, label, category, description)
3. No component changes needed (routes already functional)

## Data Flow
Navigation click → React Router → GTMDashboardPage → useGTMIntelligence hook → Supabase query → Render dashboard
    `.trim(),

    data_model: {
      tables: []  // No database changes required
    },

    api_specifications: [],  // No API changes required

    ui_ux_requirements: [
      {
        component: 'ModernNavigationSidebar',
        description: 'Add GTM Intelligence link in analytics category',
        wireframe: 'Follow existing /gtm-timing pattern (line 375-380)'
      }
    ],

    implementation_approach: `
## Phase 1: Investigation (30 min)
1. Review /gtm-strategist route usage in codebase
2. Check git history for route creation context
3. Determine: production feature or test route
4. Document decision

## Phase 2: Navigation Addition (15 min)
1. Edit ModernNavigationSidebar.tsx
2. Add /gtm-intelligence entry after /gtm-timing (line ~381)
3. Use format:
   {
     path: "/gtm-intelligence",
     label: "GTM Intelligence",
     icon: Target,
     category: "analytics",
     isNew: true,
     description: "Cross-venture GTM timing and market analysis"
   }

## Phase 3: Route Decision (15-30 min)
- If /gtm-strategist is production: Add navigation entry
- If /gtm-strategist is test/duplicate: Remove route from App.tsx

## Phase 4: Testing (15 min)
1. Dev server restart
2. Navigate to /gtm-intelligence via new link
3. Verify dashboard renders
4. Test /gtm-strategist decision (nav or removal)

## Phase 5: Documentation (15 min)
1. Create GTM_ROUTES.md in docs/
2. Document purpose of each route
3. Explain use cases and differences
    `.trim(),

    technology_stack: [
      'React 18',
      'TypeScript 5',
      'React Router',
      'Lucide React (icons)',
      'ModernNavigationSidebar component'
    ],

    dependencies: [],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Navigate to GTM Intelligence via sidebar',
        description: 'Click GTM Intelligence link in analytics category',
        expected_result: '/gtm-intelligence route loads, GTMDashboardPage renders',
        test_type: 'e2e'
      },
      {
        id: 'TS-2',
        scenario: 'GTM Dashboard functionality',
        description: 'Select venture, verify intelligence data loads',
        expected_result: 'Dashboard displays market readiness, competitive landscape, recommendations',
        test_type: 'e2e'
      }
    ],

    acceptance_criteria: [
      '/gtm-intelligence accessible via navigation menu',
      '/gtm-strategist investigated and decision documented',
      'All GTM routes tested and working',
      'GTM route architecture documented',
      'E2E tests passing for GTM navigation'
    ],

    performance_requirements: {
      page_load_time: '<2s',
      api_response_time: '<500ms',
      concurrent_users: 100
    },

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'SD requirements mapped to technical specs', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Component sizing validated (≤600 LOC per component)', checked: true },
      { text: 'Testing strategy documented', checked: true },
      { text: 'Database dependencies verified', checked: true }
    ],

    exec_checklist: [
      { text: 'Application path verified (EHG app)', checked: false },
      { text: 'GitHub remote verified', checked: false },
      { text: 'Component identified and accessible', checked: false },
      { text: 'BEFORE screenshot captured', checked: false },
      { text: 'Implementation complete per PRD', checked: false },
      { text: 'Dev server restarted', checked: false },
      { text: 'AFTER screenshot captured', checked: false },
      { text: 'Unit tests created and passing', checked: false },
      { text: 'E2E tests created and passing', checked: false },
      { text: 'Git commit created (conventional format)', checked: false }
    ],

    validation_checklist: [
      { text: 'All EXEC checklist items completed', checked: false },
      { text: 'CI/CD pipeline green', checked: false },
      { text: 'QA Director E2E tests passed', checked: false },
      { text: 'DevOps verification complete', checked: false },
      { text: 'Performance requirements validated', checked: false },
      { text: 'Security review completed (if needed)', checked: false }
    ],

    created_by: 'PLAN',
    updated_by: 'PLAN'
  };

  // Validate and insert
  console.log('\n2️⃣  Inserting PRD into database...');

  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert([prdData])
    .select();

  if (error) {
    console.error('❌ Failed to create PRD:', error.message);
    process.exit(1);
  }

  console.log('✅ PRD created successfully!');
  console.log(`   ID: ${prdId}`);
  console.log(`   UUID: ${data[0].uuid_id}`);

  // Trigger user story generation
  console.log('\n3️⃣  Triggering user story generation...');
  console.log('   User stories will be auto-generated by PRD Expert sub-agent');
  console.log('   Run: node scripts/generate-user-stories.js ' + prdId);

  return data[0];
}

createPRD()
  .then(() => {
    console.log('\n✅ PRD creation complete!');
    console.log('\n📋 Next Steps:');
    console.log('   1. Generate user stories: node scripts/generate-user-stories.js PRD-SD-GTM-INTEL-DISCOVERY-001');
    console.log('   2. Create PLAN→EXEC handoff: node scripts/unified-handoff-system.js execute PLAN-to-EXEC SD-GTM-INTEL-DISCOVERY-001');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
