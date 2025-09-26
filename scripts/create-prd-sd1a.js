#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRDForSD1A() {
  console.log('\n📋 === CREATING PRD FOR SD-1A ===\n');

  const prd = {
    id: 'PRD-SD-1A-2025-09-24',
    directive_id: 'SD-1A',
    sd_id: 'SD-1A',
    title: 'Stage-1 Opportunity Sourcing Modes - Technical Requirements',
    version: '1.0',
    status: 'draft',
    category: 'feature',
    priority: 'high',
    executive_summary: 'Technical requirements for implementing multiple opportunity sourcing modes in the EHG application, enabling dynamic opportunity discovery and categorization.',

    business_context: {
      problem_statement: 'Users need flexible ways to discover and capture business opportunities from multiple sources',
      value_proposition: 'Enable systematic opportunity capture through multiple sourcing modes',
      success_metrics: [
        'Number of opportunities captured per mode',
        'Time to opportunity qualification',
        'Conversion rate from opportunity to venture'
      ]
    },

    functional_requirements: [
      'FR-001: Manual opportunity entry form with customizable fields',
      'FR-002: Web scraping mode for automated opportunity discovery',
      'FR-003: Email parsing mode for opportunity extraction',
      'FR-004: API integration mode for third-party data sources',
      'FR-005: Bulk import mode via CSV/Excel',
      'FR-006: Opportunity categorization and tagging system',
      'FR-007: Duplicate detection and merging capabilities',
      'FR-008: Opportunity scoring and prioritization'
    ],

    technical_requirements: [
      'TR-001: React-based UI components for opportunity forms',
      'TR-002: Node.js backend API endpoints for CRUD operations',
      'TR-003: PostgreSQL schema for opportunity storage',
      'TR-004: Real-time opportunity feed updates',
      'TR-005: Background job processing for automated sourcing',
      'TR-006: Integration with EHG database (liapbndqlqxdcgpwntbv)',
      'TR-007: Authentication and authorization for opportunity access'
    ],

    ui_ux_requirements: [
      'UX-001: Dashboard view showing all sourcing modes',
      'UX-002: Mode selector with clear icons and descriptions',
      'UX-003: Opportunity creation wizard with step-by-step guidance',
      'UX-004: Real-time validation and feedback',
      'UX-005: Mobile-responsive design',
      'UX-006: Accessibility compliance (WCAG 2.1 AA)'
    ],

    data_model: {
      opportunities: {
        id: 'UUID',
        title: 'VARCHAR(255)',
        description: 'TEXT',
        source_mode: 'ENUM(manual, web, email, api, import)',
        source_url: 'VARCHAR(500)',
        category: 'VARCHAR(100)',
        tags: 'JSON',
        score: 'DECIMAL(5,2)',
        status: 'ENUM(new, qualified, rejected, converted)',
        metadata: 'JSON',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP'
      }
    },

    api_specifications: [
      {
        endpoint: '/api/opportunities',
        method: 'GET',
        description: 'List all opportunities with filtering'
      },
      {
        endpoint: '/api/opportunities',
        method: 'POST',
        description: 'Create new opportunity'
      },
      {
        endpoint: '/api/opportunities/:id',
        method: 'PUT',
        description: 'Update opportunity'
      },
      {
        endpoint: '/api/sourcing-modes',
        method: 'GET',
        description: 'Get available sourcing modes'
      }
    ],

    test_scenarios: [
      'TS-001: Create opportunity via manual entry',
      'TS-002: Import bulk opportunities from CSV',
      'TS-003: Detect and handle duplicate opportunities',
      'TS-004: Score and prioritize opportunities',
      'TS-005: Filter opportunities by source mode'
    ],

    acceptance_criteria: [
      'All 5 sourcing modes are functional',
      'Opportunities can be created, read, updated, and deleted',
      'Duplicate detection accuracy > 95%',
      'Page load time < 2 seconds',
      'Mobile responsive on all screen sizes',
      'All test scenarios pass'
    ],

    technology_stack: [
      'Frontend: React 18, TypeScript, Tailwind CSS',
      'Backend: Node.js, Express',
      'Database: PostgreSQL (EHG database)',
      'Testing: Jest, React Testing Library',
      'Build: Vite'
    ],

    plan_checklist: [
      { text: 'PRD created and saved', checked: true },
      { text: 'Technical architecture defined', checked: true },
      { text: 'Database schema designed', checked: true },
      { text: 'API endpoints specified', checked: true },
      { text: 'UI/UX requirements documented', checked: true },
      { text: 'Test scenarios defined', checked: true },
      { text: 'Acceptance criteria established', checked: true }
    ],

    phase: 'planning',
    progress: 35,
    created_by: 'PLAN',
    created_at: new Date().toISOString()
  };

  // Insert PRD into database
  const { data, error } = await supabase
    .from('product_requirements_v2')
    .insert(prd)
    .select()
    .single();

  if (error) {
    console.error('Error creating PRD:', error.message);
  } else {
    console.log('✅ PRD created successfully!');
    console.log('PRD ID:', data.id);
    console.log('\nKey Features:');
    console.log('- 5 different sourcing modes');
    console.log('- Opportunity scoring and prioritization');
    console.log('- Duplicate detection');
    console.log('- Real-time updates');
    console.log('- Mobile responsive UI');
  }

  // Update SD-1A progress
  await supabase
    .from('strategic_directives_v2')
    .update({
      metadata: {
        prd_created: true,
        prd_id: data?.id,
        current_phase: 'PLAN_DESIGN',
        phase_progress: {
          LEAD_PLANNING: 100,
          PLAN_DESIGN: 35
        }
      }
    })
    .eq('id', 'SD-1A');

  console.log('\n📋 Next Steps:');
  console.log('1. Generate user stories from PRD');
  console.log('2. Create PLAN → EXEC handoff');
  console.log('3. Begin implementation phase');
}

createPRDForSD1A().catch(console.error);