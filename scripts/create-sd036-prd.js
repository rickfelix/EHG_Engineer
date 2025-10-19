import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createSD036PRD() {
  console.log('Creating comprehensive PRD for SD-036: Stage 11 - Strategic Naming Consolidated...');

  const sdId = 'SD-036';

  // Create a comprehensive PRD for Strategic Naming System
  
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
    title: 'PRD: Stage 11 - Strategic Naming Consolidated System',
    is_consolidated: true,
    backlog_items: 1,
    priority_distribution: {
      'CRITICAL': 2,
      'HIGH': 4,
      'MEDIUM': 3,
      'LOW': 1
    },
    // FIX: user_stories moved to separate table
    // user_stories: [
      {
        id: `US-${sdId}-001`,
        title: 'Naming Convention Standards Framework',
        description: 'As a development team, I want standardized naming conventions for all code entities to ensure consistency and maintainability',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Define naming standards for variables, functions, classes, and files',
          'Create enforced naming patterns for different programming languages',
          'Establish component and module naming hierarchies',
          'Document naming exceptions and special cases',
          'Provide automated linting rules for naming validation',
          'Create migration guidelines for existing code'
        ]
      },
      {
        id: `US-${sdId}-002`,
        title: 'Strategic Entity Naming System',
        description: 'As a product manager, I want consistent naming for business entities and strategic concepts across all systems',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Define canonical names for all business entities',
          'Create glossary of strategic terms and definitions',
          'Establish naming patterns for Strategic Directives (SD-XXX)',
          'Define PRD naming conventions and versioning',
          'Create entity relationship naming standards',
          'Implement cross-system naming consistency checks'
        ]
      },
      {
        id: `US-${sdId}-003`,
        title: 'Database Schema Naming Standards',
        description: 'As a database administrator, I want consistent naming conventions for all database objects',
        priority: 'HIGH',
        acceptance_criteria: [
          'Define table naming conventions (singular/plural rules)',
          'Establish column naming patterns and types',
          'Create index and constraint naming standards',
          'Define foreign key naming conventions',
          'Establish migration file naming patterns',
          'Document reserved words and naming conflicts'
        ]
      },
      {
        id: `US-${sdId}-004`,
        title: 'API and Service Naming Standards',
        description: 'As an API developer, I want consistent naming for endpoints, services, and API resources',
        priority: 'HIGH',
        acceptance_criteria: [
          'Define RESTful endpoint naming conventions',
          'Establish service and microservice naming patterns',
          'Create API versioning naming standards',
          'Define parameter and response object naming',
          'Establish webhook and event naming conventions',
          'Document API documentation naming standards'
        ]
      },
      {
        id: `US-${sdId}-005`,
        title: 'UI Component Naming System',
        description: 'As a frontend developer, I want consistent naming for all UI components and design system elements',
        priority: 'HIGH',
        acceptance_criteria: [
          'Define React component naming conventions',
          'Establish CSS class naming patterns (BEM methodology)',
          'Create design token naming standards',
          'Define prop and state naming conventions',
          'Establish styling utility naming patterns',
          'Document component composition naming rules'
        ]
      },
      {
        id: `US-${sdId}-006`,
        title: 'Documentation and Content Naming',
        description: 'As a technical writer, I want consistent naming for all documentation and content assets',
        priority: 'HIGH',
        acceptance_criteria: [
          'Define documentation file naming patterns',
          'Establish section and heading naming standards',
          'Create URL slug naming conventions',
          'Define image and asset naming patterns',
          'Establish version control naming for docs',
          'Document content categorization naming'
        ]
      },
      {
        id: `US-${sdId}-007`,
        title: 'Environment and Deployment Naming',
        description: 'As a DevOps engineer, I want consistent naming for environments, deployments, and infrastructure',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Define environment naming conventions (dev/staging/prod)',
          'Establish deployment artifact naming patterns',
          'Create infrastructure resource naming standards',
          'Define CI/CD pipeline naming conventions',
          'Establish branch and tag naming patterns',
          'Document cloud resource naming standards'
        ]
      },
      {
        id: `US-${sdId}-008`,
        title: 'Error and Log Message Naming',
        description: 'As a system administrator, I want consistent naming and formatting for all error messages and logs',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Define error code naming conventions',
          'Establish log message formatting standards',
          'Create exception naming patterns',
          'Define alert and notification naming',
          'Establish metric and monitoring naming',
          'Document troubleshooting naming conventions'
        ]
      },
      {
        id: `US-${sdId}-009`,
        title: 'Testing and Quality Naming Standards',
        description: 'As a QA engineer, I want consistent naming for all testing artifacts and quality measures',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Define test file and function naming conventions',
          'Establish test data naming patterns',
          'Create test environment naming standards',
          'Define quality metric naming conventions',
          'Establish test report naming patterns',
          'Document test automation naming rules'
        ]
      },
      {
        id: `US-${sdId}-010`,
        title: 'Naming Convention Governance and Tools',
        description: 'As a development lead, I want tools and processes to enforce and maintain naming conventions',
        priority: 'LOW',
        acceptance_criteria: [
          'Create automated naming validation tools',
          'Establish naming convention review processes',
          'Build naming convention enforcement in CI/CD',
          'Create naming suggestion and autocomplete tools',
          'Establish naming convention violation reporting',
          'Document naming convention evolution process'
        ]
      }
    ],
    metadata: {
      implementation_notes: [
        'Foundation for all development naming standards',
        'Supports both EHG and EHG_Engineer applications',
        'Integrates with existing linting and CI/CD systems',
        'Provides automation and enforcement tools',
        'Establishes governance for naming evolution'
      ],
      backlog_evidence: [
        'Strategic naming requirements from EHG backlog',
        'Development team consistency needs identified'
      ]
    }
  };

  // Insert the PRD
  const { data: prd, error: prdError } = await supabase
    .from('product_requirements_v2')
    .insert({
      id: `PRD-${sdId}-${Date.now()}`,
      directive_id: sdId,
      title: prdContent.title,
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
    console.log('   Title:', prdContent.title);
    console.log('   User Stories:', prdContent.user_stories.length);
    console.log('   Priority Distribution:', JSON.stringify(prdContent.priority_distribution));
  }
}

createSD036PRD().catch(console.error);