import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('Creating comprehensive PRD for EHG Backlog Import System...');

  const sdId = 'fbe359b4-aa56-4740-8350-d51760de0a3b';

  // Create a comprehensive PRD for the Backlog Import System
  
  // FIX: Get SD uuid_id to populate sd_uuid field (prevents handoff validation failures)
  const { data: sdData, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('uuid_id, id')
    .eq('id', sdId)
    .single();

  if (sdError || !sdData) {
    console.log(`❌ Strategic Directive ${sdId} not found in database`);
    console.log('   Create SD first before creating PRD');
    process.exit(1);
  }

  const sdUuid = sdData.uuid_id;
  console.log(`   SD uuid_id: ${sdUuid}`);

const prdContent = {
    id: `PRD-${sdId}`,
    title: 'PRD: EHG Backlog Import System',
    is_consolidated: false,
    backlog_items: 0,
    priority_distribution: {
      'HIGH': 4,
      'MEDIUM': 3,
      'LOW': 3
    },
    // FIX: user_stories moved to separate table
    // user_stories: [
      {
        id: `US-${sdId}-001`,
        title: 'Backlog Import from CSV/JSON',
        description: 'As a product manager, I want to import backlog items from CSV or JSON files to quickly populate the system with existing work items',
        priority: 'HIGH',
        acceptance_criteria: [
          'Support CSV and JSON file formats',
          'Validate data structure and required fields',
          'Map fields to internal schema',
          'Handle duplicate detection and merging',
          'Provide import preview before confirmation'
        ]
      },
      {
        id: `US-${sdId}-002`,
        title: 'Automated User Story Generation',
        description: 'As a developer, I want the system to automatically generate user stories from backlog items using AI to save time on documentation',
        priority: 'HIGH',
        acceptance_criteria: [
          'Generate user stories from item descriptions',
          'Include acceptance criteria generation',
          'Maintain consistent story format',
          'Allow manual editing and refinement',
          'Track AI-generated vs manually created stories'
        ]
      },
      {
        id: `US-${sdId}-003`,
        title: 'Story Verification Tracking',
        description: 'As a QA engineer, I want to track verification status of user stories to ensure all acceptance criteria are met before release',
        priority: 'HIGH',
        acceptance_criteria: [
          'Track verification status per story',
          'Support multiple verification states',
          'Link verification to test results',
          'Generate verification reports',
          'Alert on unverified critical stories'
        ]
      },
      {
        id: `US-${sdId}-004`,
        title: 'Release Gate Calculations',
        description: 'As a release manager, I want automated release gate calculations based on story completion and verification to make informed go/no-go decisions',
        priority: 'HIGH',
        acceptance_criteria: [
          'Calculate completion percentage',
          'Track verification coverage',
          'Apply configurable gate thresholds',
          'Generate gate status reports',
          'Provide override capability with justification'
        ]
      },
      {
        id: `US-${sdId}-005`,
        title: 'Backlog Categorization and Tagging',
        description: 'As a product owner, I want to categorize and tag backlog items for better organization and filtering',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Support multiple category taxonomies',
          'Enable custom tag creation',
          'Bulk categorization tools',
          'Smart categorization suggestions',
          'Category-based filtering and views'
        ]
      },
      {
        id: `US-${sdId}-006`,
        title: 'Priority and Effort Estimation',
        description: 'As a scrum master, I want to assign priorities and effort estimates to backlog items for sprint planning',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Multiple priority schemes (MoSCoW, numeric, custom)',
          'Story point estimation',
          'T-shirt sizing support',
          'Historical velocity tracking',
          'Effort vs actual comparison'
        ]
      },
      {
        id: `US-${sdId}-007`,
        title: 'Backlog Analytics Dashboard',
        description: 'As an executive, I want analytics on backlog health and progress to understand development capacity and bottlenecks',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Backlog aging reports',
          'Velocity trends',
          'Category distribution charts',
          'Verification coverage metrics',
          'Release readiness indicators'
        ]
      },
      {
        id: `US-${sdId}-008`,
        title: 'Integration with Strategic Directives',
        description: 'As a program manager, I want to link backlog items to Strategic Directives to track alignment with business objectives',
        priority: 'LOW',
        acceptance_criteria: [
          'Link items to SDs',
          'Track SD coverage by backlog',
          'Generate alignment reports',
          'Identify orphaned items',
          'SD completion tracking'
        ]
      },
      {
        id: `US-${sdId}-009`,
        title: 'Backlog Export and Reporting',
        description: 'As a stakeholder, I want to export backlog data and generate reports for external sharing and analysis',
        priority: 'LOW',
        acceptance_criteria: [
          'Export to CSV, JSON, PDF formats',
          'Customizable report templates',
          'Scheduled report generation',
          'Email distribution',
          'API access for external tools'
        ]
      },
      {
        id: `US-${sdId}-010`,
        title: 'Backlog Version Control and History',
        description: 'As an auditor, I want to track changes to backlog items over time for compliance and accountability',
        priority: 'LOW',
        acceptance_criteria: [
          'Full change history tracking',
          'Version comparison tools',
          'Audit log with user attribution',
          'Rollback capability',
          'Change notification system'
        ]
      }
    ],
    metadata: {
      implementation_notes: [
        'This system is for EHG_Engineer application only',
        'Integrates with existing LEO Protocol workflows',
        'Uses Supabase for data persistence',
        'Leverages AI for story generation'
      ]
    }
  };

  // Insert the PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: `PRD-${sdId}-${Date.now()}`,
      directive_id: sdId,
      title: 'PRD: EHG Backlog Import System',
      content: prdContent,
      status: 'approved',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    sd_uuid: sdUuid, // FIX: Added for handoff validation
    })
    .select()
    .single();

  if (prdError) {
    console.error('Error creating PRD:', prdError);
  } else {
    console.log('✅ PRD created successfully!');
    console.log('   ID:', prd.id);
    console.log('   User Stories:', prdContent.user_stories.length);
    console.log('   Priority Distribution:', JSON.stringify(prdContent.priority_distribution));
  }
}

createPRD().catch(console.error);