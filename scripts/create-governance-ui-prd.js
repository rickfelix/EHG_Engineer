import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createGovernanceUIPRD() {
  console.log('Creating comprehensive PRD for SD-GOVERNANCE-UI-001: Governance UI Implementation...');

  const sdId = 'SD-GOVERNANCE-UI-001';

  // Create a comprehensive PRD for the Governance UI Implementation
  
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
    title: 'PRD: Governance UI Implementation System',
    is_consolidated: false,
    backlog_items: 0,
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
        title: 'Proposal Workflow Management',
        description: 'As a strategic lead, I want to manage strategic proposals through a structured workflow to ensure proper review and approval',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Create, edit, and submit strategic proposals',
          'Multi-stage approval workflow with voting',
          'Proposal status tracking and notifications',
          'Comment and discussion threads',
          'Rejection reason tracking and appeal process',
          'Integration with SD creation pipeline'
        ]
      },
      {
        id: `US-${sdId}-002`,
        title: 'Role-Based Access Control (RBAC)',
        description: 'As a system administrator, I want to manage user roles and permissions to ensure secure access to governance functions',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Create and manage user roles',
          'Assign permissions based on role hierarchy',
          'Permission matrix for all governance operations',
          'Audit trail for role and permission changes',
          'Risk assessment for high-privilege operations',
          'User assignment and removal from roles'
        ]
      },
      {
        id: `US-${sdId}-003`,
        title: 'Real-time Notification System',
        description: 'As a governance participant, I want real-time notifications for actions requiring my attention',
        priority: 'HIGH',
        acceptance_criteria: [
          'Real-time notifications for approval requests',
          'Customizable notification preferences',
          'Action-required vs informational notifications',
          'Email and in-app notification delivery',
          'Notification history and archive',
          'Bulk actions for notification management'
        ]
      },
      {
        id: `US-${sdId}-004`,
        title: 'Governance Dashboard',
        description: 'As an executive, I want a comprehensive dashboard showing governance metrics and status',
        priority: 'HIGH',
        acceptance_criteria: [
          'Executive summary of governance activities',
          'Real-time metrics and KPIs',
          'Pending actions and decisions dashboard',
          'Governance health indicators',
          'Trend analysis and historical views',
          'Customizable dashboard widgets'
        ]
      },
      {
        id: `US-${sdId}-005`,
        title: 'Strategic Directive Lifecycle Management',
        description: 'As a project manager, I want visual tools to track SD progress through all lifecycle phases',
        priority: 'HIGH',
        acceptance_criteria: [
          'Visual SD pipeline with phase indicators',
          'Drag-and-drop phase transitions',
          'Phase gate validation and blocking',
          'Progress tracking with completion metrics',
          'Milestone management and alerts',
          'Resource allocation tracking'
        ]
      },
      {
        id: `US-${sdId}-006`,
        title: 'PRD Management Interface',
        description: 'As a product owner, I want enhanced PRD creation and management tools with collaboration features',
        priority: 'HIGH',
        acceptance_criteria: [
          'Rich text PRD editor with templates',
          'Real-time collaborative editing',
          'Version control and change tracking',
          'Approval workflow for PRD changes',
          'User story generation and management',
          'PRD to SD linking and traceability'
        ]
      },
      {
        id: `US-${sdId}-007`,
        title: 'Audit and Compliance Reporting',
        description: 'As a compliance officer, I want comprehensive audit trails and reports for governance activities',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Complete audit log of all governance actions',
          'Compliance report generation',
          'Data retention and archival policies',
          'Export capabilities for external auditing',
          'Role-based access to audit information',
          'Automated compliance checking'
        ]
      },
      {
        id: `US-${sdId}-008`,
        title: 'Integration Management',
        description: 'As a technical architect, I want to manage integrations between governance tools and external systems',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'API management for external integrations',
          'Webhook configuration for event notifications',
          'Single sign-on (SSO) integration',
          'Data synchronization with external tools',
          'Integration health monitoring',
          'Configuration management interface'
        ]
      },
      {
        id: `US-${sdId}-009`,
        title: 'Advanced Analytics and Reporting',
        description: 'As a business analyst, I want advanced analytics on governance processes and outcomes',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Process efficiency metrics and analysis',
          'Bottleneck identification and resolution',
          'Predictive analytics for planning',
          'Custom report builder',
          'Data visualization and charting',
          'Benchmarking and comparison tools'
        ]
      },
      {
        id: `US-${sdId}-010`,
        title: 'Mobile and Responsive Access',
        description: 'As a mobile user, I want access to governance functions on mobile devices for on-the-go management',
        priority: 'LOW',
        acceptance_criteria: [
          'Responsive design for all screen sizes',
          'Mobile-optimized approval workflows',
          'Offline capability for critical functions',
          'Push notifications on mobile devices',
          'Touch-friendly interface design',
          'Progressive web app (PWA) features'
        ]
      }
    ],
    metadata: {
      implementation_notes: [
        'Extends SD-GOVERNANCE-001 with user-facing components',
        'Built for EHG_Engineer dashboard application',
        'Integrates with existing governance data model',
        'Uses React 18 + TypeScript + Tailwind CSS',
        'Requires Supabase client for data operations'
      ],
      technical_requirements: [
        'React 18 with TypeScript',
        'Tailwind CSS for styling',
        'Zustand for state management',
        'Supabase client integration',
        'Real-time subscriptions',
        'Role-based component rendering'
      ]
    }
  };

  // First, delete the existing PRD if it exists
  const { error: deleteError } = await supabase
    .from('product_requirements_v2')
    .delete()
    .eq('directive_id', sdId);

  if (deleteError) {
    console.log('Note: Could not delete existing PRD:', deleteError.message);
  }

  // Insert the new PRD
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

createGovernanceUIPRD().catch(console.error);