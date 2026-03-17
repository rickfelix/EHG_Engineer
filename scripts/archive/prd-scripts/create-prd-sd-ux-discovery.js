#!/usr/bin/env node

/**
 * PRD Creation Script: SD-UX-DISCOVERY
 * Settings Navigation Discovery Spike
 *
 * Discovery Type: Research + Documentation
 * Purpose: Audit existing navigation patterns and recommend consolidation approach
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validatePRDSchema, printValidationReport } from '../lib/prd-schema-validator.js';

dotenv.config();

const SD_ID = 'e5ef51cd-06d8-473b-b3f4-bec33eb6c0b6'; // SD-UX-DISCOVERY UUID
const PRD_TITLE = 'P2: Settings Navigation Discovery Spike - Audit & Recommendations';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log(`\n📋 Creating PRD for ${SD_ID}`);
  console.log('='.repeat(70));

  console.log('\n1️⃣  Fetching Strategic Directive...');

  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, category, priority')
    .eq('id', SD_ID)
    .single();

  if (sdError || !sdData) {
    console.error(`❌ Strategic Directive ${SD_ID} not found in database`);
    console.error('   Please create the SD first before creating its PRD');
    if (sdError) console.error('   Error:', sdError.message);
    process.exit(1);
  }

  console.log(`✅ Found SD: ${sdData.title}`);
  console.log(`   ID: ${sdData.id}`);
  console.log(`   Category: ${sdData.category}`);
  console.log(`   Priority: ${sdData.priority}`);

  console.log('\n2️⃣  Building PRD data...');

  const prdId = `PRD-${SD_ID}`;

  const prdData = {
    id: 'PRD-SD-UX-DISCOVERY',
    sd_id: SD_ID,
    directive_id: 'SD-UX-DISCOVERY',

    title: PRD_TITLE,
    version: '1.0',
    status: 'planning',
    category: sdData.category || 'ux',
    priority: sdData.priority || 'medium',

    executive_summary: `
## Settings Navigation Discovery Spike

This is a research and documentation spike to audit the current EHG application's
navigation patterns, specifically focusing on the settings section and layout
consolidation opportunities.

### Current State (Discovered)
The codebase has **3 competing layout patterns** and **7 settings navigation tabs**:

1. **AuthenticatedLayout** (src/components/layouts/) - Main app layout with ModernNavigationSidebar
2. **AdminLayout** (src/components/layouts/) - Admin section with vertical sidebar
3. **ChairmanLayout** (src/components/layouts/) - Executive dashboard layout

Settings section uses horizontal tabs:
- Navigation (route visibility preferences)
- Security (password, 2FA settings)
- Notifications (email/push preferences)
- Data Management
- Profile
- Billing
- Admin (conditional)

### Spike Objectives
1. Document all navigation patterns currently in use
2. Identify consolidation opportunities
3. Recommend unified layout approach for SD-UX-LAYOUT-CONSOLIDATION

### Deliverables
- Navigation pattern audit document
- Recommended layout architecture
- Migration risk assessment
    `.trim(),

    business_context: `
This discovery spike informs the larger UX System consolidation effort (SD-UX-MINOR-2025-12).

**User Pain Points:**
- Inconsistent navigation patterns between app sections
- Settings spread across multiple locations
- No unified theme/layout management

**Business Objectives:**
- Reduce UX fragmentation
- Enable faster feature development with standardized layouts
- Improve user onboarding through consistent navigation

**Success Metrics:**
- Document all layout patterns in use (target: 100% coverage)
- Identify specific consolidation opportunities (target: ≥3)
- Provide actionable recommendations for SD-UX-LAYOUT-CONSOLIDATION
    `.trim(),

    technical_context: `
## Existing Navigation Systems

### Layout Components Identified:
| Component | Location | Usage |
|-----------|----------|-------|
| AuthenticatedLayout | src/components/layouts/AuthenticatedLayout.tsx | Main app shell |
| AdminLayout | src/components/layouts/AdminLayout.tsx | Admin sections |
| ChairmanLayout | src/components/layouts/ChairmanLayout.tsx | Executive views |

### Settings Architecture:
| File | Purpose | Tabs |
|------|---------|------|
| settings.tsx | Main settings page | 7 horizontal tabs |
| NavigationSettings.tsx | Route visibility | Collapsible sections |
| SecuritySettings.tsx | Security preferences | Forms with DB persistence |
| NotificationSettings.tsx | Notification config | Category toggles |

### Integration Points:
- Supabase for settings persistence
- React Router for navigation
- Tailwind CSS for styling (dark mode classes scattered)
- shadcn/ui components throughout
    `.trim(),

    functional_requirements: [
      {
        id: 'FR-1',
        requirement: 'Audit all layout components',
        description: 'Document every layout pattern in the codebase with usage locations',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'All layout files identified and documented',
          'Usage patterns mapped to routes',
          'Component hierarchy documented'
        ]
      },
      {
        id: 'FR-2',
        requirement: 'Document settings navigation structure',
        description: 'Map all settings tabs and their implementations',
        priority: 'HIGH',
        acceptance_criteria: [
          'All 7 settings tabs documented',
          'Data flow for each tab mapped',
          'State management patterns identified'
        ]
      },
      {
        id: 'FR-3',
        requirement: 'Identify consolidation opportunities',
        description: 'Find patterns that can be unified into a master layout',
        priority: 'HIGH',
        acceptance_criteria: [
          'At least 3 consolidation opportunities identified',
          'Risk assessment for each opportunity',
          'Recommended migration approach'
        ]
      }
    ],

    non_functional_requirements: [
      {
        type: 'documentation',
        requirement: 'Complete audit coverage',
        target_metric: '100% of layout components documented'
      },
      {
        type: 'quality',
        requirement: 'Actionable recommendations',
        target_metric: 'Recommendations directly usable by SD-UX-LAYOUT-CONSOLIDATION'
      }
    ],

    technical_requirements: [
      {
        id: 'TR-1',
        requirement: 'No code changes in this spike',
        description: 'This is research only - document findings for future implementation',
        dependencies: []
      }
    ],

    system_architecture: `
## Discovery Scope Architecture

This spike audits the following architectural areas:

### Layout Layer
\`\`\`
src/components/layouts/
├── AuthenticatedLayout.tsx    [PRIMARY]
├── AdminLayout.tsx            [ADMIN]
├── ChairmanLayout.tsx         [EXECUTIVE]
└── (potential consolidation target)
\`\`\`

### Settings Layer
\`\`\`
src/pages/settings/
├── settings.tsx               [ROUTER]
├── NavigationSettings.tsx     [TAB]
├── SecuritySettings.tsx       [TAB]
├── NotificationSettings.tsx   [TAB]
└── ...
\`\`\`

### Navigation Components
\`\`\`
src/components/navigation/
├── ModernNavigationSidebar    [MAIN]
├── AdminSidebar               [ADMIN]
└── (discovery target)
\`\`\`

No new architecture in this spike - output is recommendations only.
    `.trim(),

    data_model: {
      tables: [],
      note: 'No database changes in this discovery spike'
    },

    api_specifications: [],

    ui_ux_requirements: [
      {
        component: 'Audit Document',
        description: 'Output document capturing all navigation patterns',
        wireframe: 'N/A - documentation deliverable'
      }
    ],

    implementation_approach: `
## Discovery Approach

### Phase 1: Layout Audit ✓ COMPLETE
Files to examine:
- AuthenticatedLayout.tsx ✓
- AdminLayout.tsx ✓
- ChairmanLayout.tsx (pending)
- All sidebar components

### Phase 2: Settings Audit ✓ COMPLETE
Files examined:
- settings.tsx (7 tabs) ✓
- NavigationSettings.tsx ✓
- SecuritySettings.tsx ✓
- NotificationSettings.tsx ✓

### Phase 3: Recommendations (IN PROGRESS)
Synthesize findings into:
- Unified layout architecture proposal
- Settings consolidation plan
- Risk assessment

### Deliverable
Create docs/audits/navigation-patterns-audit.md with:
- Complete layout inventory
- Settings tab analysis
- Recommended consolidation approach
    `.trim(),

    technology_stack: [
      'React 18 (analysis)',
      'React Router (navigation analysis)',
      'Tailwind CSS (styling analysis)',
      'shadcn/ui (component analysis)'
    ],

    dependencies: [
      {
        type: 'internal',
        name: 'SD-UX-DESIGN-SYSTEM-COLORS',
        status: 'in_progress',
        blocker: false,
        note: 'Color system independent of navigation discovery'
      }
    ],

    test_scenarios: [
      {
        id: 'TS-1',
        scenario: 'Audit completeness validation',
        description: 'Verify all layout components are documented',
        expected_result: 'Documentation covers 100% of identified layouts',
        test_type: 'manual'
      }
    ],

    acceptance_criteria: [
      'All 3 layout patterns documented with usage locations',
      'All 7 settings tabs analyzed with data flow maps',
      'At least 3 consolidation opportunities identified',
      'Risk assessment completed for each recommendation',
      'Output document created in docs/audits/'
    ],

    performance_requirements: {
      note: 'No performance requirements - documentation spike only'
    },

    plan_checklist: [
      { text: 'PRD created and saved to database', checked: true },
      { text: 'Layout audit scope defined', checked: true },
      { text: 'Settings analysis scope defined', checked: true },
      { text: 'Deliverable format specified', checked: true },
      { text: 'Dependencies identified', checked: true }
    ],

    exec_checklist: [
      { text: 'Layout audit completed', checked: false },
      { text: 'Settings navigation analyzed', checked: false },
      { text: 'Consolidation opportunities identified', checked: false },
      { text: 'Risk assessment completed', checked: false },
      { text: 'Recommendations documented', checked: false },
      { text: 'Output document created', checked: false }
    ],

    validation_checklist: [
      { text: 'All acceptance criteria met', checked: false },
      { text: 'Document reviewed for completeness', checked: false },
      { text: 'Recommendations actionable by dependent SDs', checked: false }
    ],

    progress: 30,
    phase: 'planning',
    phase_progress: {
      LEAD_PRE_APPROVAL: 100,
      PLAN_PRD: 100,
      EXEC_IMPL: 0,
      PLAN_VERIFY: 0,
      LEAD_FINAL: 0
    },

    risks: [
      {
        category: 'Technical',
        risk: 'Undiscovered layout patterns',
        severity: 'LOW',
        probability: 'MEDIUM',
        impact: 'May need to update audit after initial discovery',
        mitigation: 'Use comprehensive file search patterns'
      },
      {
        category: 'Scope',
        risk: 'Discovery scope creep into implementation',
        severity: 'MEDIUM',
        probability: 'LOW',
        impact: 'Would delay dependent SDs',
        mitigation: 'Strict adherence to research-only deliverables'
      }
    ],

    constraints: [
      {
        type: 'scope',
        constraint: 'No code changes in this spike',
        impact: 'All recommendations are for future implementation only'
      }
    ],

    assumptions: [
      {
        assumption: 'All layout components are in standard locations',
        validation_method: 'Comprehensive file search in src/components/layouts'
      },
      {
        assumption: 'Settings structure follows current React patterns',
        validation_method: 'File-by-file analysis of src/pages/settings'
      }
    ],

    stakeholders: [
      {
        name: 'PLAN Agent',
        role: 'Technical Planning',
        involvement_level: 'high'
      },
      {
        name: 'SD-UX-LAYOUT-CONSOLIDATION',
        role: 'Consumer of recommendations',
        involvement_level: 'medium'
      }
    ],

    planned_start: new Date().toISOString(),
    planned_end: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),

    metadata: {
      spike_type: 'discovery',
      output_format: 'markdown_document',
      output_location: 'docs/audits/navigation-patterns-audit.md',
      findings_so_far: {
        layouts_found: 3,
        settings_tabs: 7,
        navigation_components: 2
      }
    },

    created_by: 'PLAN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  console.log('\n3️⃣  Validating PRD schema...');

  const validation = validatePRDSchema(prdData);
  printValidationReport(validation);

  if (!validation.valid) {
    console.error('\n❌ PRD validation failed!');
    console.error('   Fix the errors above before inserting to database');
    process.exit(1);
  }

  console.log('✅ PRD schema validation passed!');

  console.log('\n4️⃣  Checking for existing PRD...');

  const { data: existing } = await supabase
    .from('product_requirements_v2')
    .select('id, status, created_at')
    .eq('id', 'PRD-SD-UX-DISCOVERY')
    .single();

  if (existing) {
    console.warn(`⚠️  PRD ${prdId} already exists!`);
    console.log(`   Created: ${existing.created_at}`);
    console.log(`   Status: ${existing.status}`);
    console.log('\n   Options:');
    console.log('   1. Delete the existing PRD first');
    console.log('   2. Use an UPDATE script instead');
    console.log('   3. Change the SD_ID to create a different PRD');
    process.exit(1);
  }

  console.log('\n5️⃣  Inserting PRD into database...');

  const { data: insertedPRD, error: insertError } = await supabase
    .from('product_requirements_v2')
    .insert(prdData)
    .select()
    .single();

  if (insertError) {
    console.error('❌ Failed to insert PRD:', insertError.message);
    console.error('   Code:', insertError.code);
    console.error('   Details:', insertError.details);
    process.exit(1);
  }

  console.log('\n✅ PRD created successfully!');
  console.log('='.repeat(70));
  console.log(`   PRD ID: ${insertedPRD.id}`);
  console.log(`   SD ID: ${insertedPRD.sd_id || insertedPRD.sd_uuid}`);
  console.log(`   Title: ${insertedPRD.title}`);
  console.log(`   Status: ${insertedPRD.status}`);
  console.log(`   Phase: ${insertedPRD.phase}`);
  console.log(`   Progress: ${insertedPRD.progress}%`);

  console.log('\n📝 Next Steps for Discovery Spike:');
  console.log('   1. Run PLAN-TO-EXEC handoff');
  console.log('   2. Complete layout audit (examine ChairmanLayout)');
  console.log('   3. Synthesize recommendations');
  console.log('   4. Create docs/audits/navigation-patterns-audit.md');
  console.log('   5. Complete handoff cycle');
  console.log('');
}

createPRD().catch(error => {
  console.error('\n❌ Error creating PRD:', error.message);
  console.error(error.stack);
  process.exit(1);
});
