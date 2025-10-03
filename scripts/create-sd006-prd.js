import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createPRD() {
  console.log('Creating comprehensive PRD for SD-006: Settings Consolidated System...');

  const sdId = 'SD-006';

  // Create a comprehensive PRD for the Settings System
  const prdContent = {
    id: `PRD-${sdId}`,
    title: 'PRD: Settings Consolidated System',
    is_consolidated: true,
    backlog_items: 1,
    priority_distribution: {
      'CRITICAL': 2,
      'HIGH': 4,
      'MEDIUM': 3,
      'LOW': 1
    },
    user_stories: [
      {
        id: `US-${sdId}-001`,
        title: 'User Profile and Account Settings',
        description: 'As a user, I want to manage my profile information, preferences, and account settings to personalize my experience',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Edit personal information (name, email, avatar)',
          'Change password and security settings',
          'Set notification preferences',
          'Configure display preferences (theme, timezone)',
          'Manage session and privacy settings',
          'Export/delete account data'
        ]
      },
      {
        id: `US-${sdId}-002`,
        title: 'System Configuration Management',
        description: 'As a system administrator, I want to configure global system settings that affect all users and operations',
        priority: 'CRITICAL',
        acceptance_criteria: [
          'Configure application-wide settings',
          'Set default values for new users',
          'Manage feature flags and toggles',
          'Configure integration endpoints',
          'Set system-wide security policies',
          'Backup and restore configuration'
        ]
      },
      {
        id: `US-${sdId}-003`,
        title: 'LEO Protocol Configuration',
        description: 'As a LEO administrator, I want to configure LEO Protocol settings and agent behaviors',
        priority: 'HIGH',
        acceptance_criteria: [
          'Configure agent execution parameters',
          'Set handoff timeout and retry policies',
          'Manage sub-agent activation rules',
          'Configure quality gate thresholds',
          'Set notification and alert preferences',
          'Customize phase validation criteria'
        ]
      },
      {
        id: `US-${sdId}-004`,
        title: 'Integration Settings',
        description: 'As a technical administrator, I want to configure external integrations and API connections',
        priority: 'HIGH',
        acceptance_criteria: [
          'Configure Supabase connection settings',
          'Manage GitHub integration credentials',
          'Set up CI/CD pipeline connections',
          'Configure notification webhooks',
          'Manage API rate limits and quotas',
          'Test connection health and status'
        ]
      },
      {
        id: `US-${sdId}-005`,
        title: 'Notification and Alert Settings',
        description: 'As a user, I want to customize how and when I receive notifications and alerts',
        priority: 'HIGH',
        acceptance_criteria: [
          'Configure email notification preferences',
          'Set in-app notification settings',
          'Customize alert thresholds and triggers',
          'Manage notification channels (email, slack, etc)',
          'Set quiet hours and do-not-disturb',
          'Configure escalation rules'
        ]
      },
      {
        id: `US-${sdId}-006`,
        title: 'Dashboard and UI Customization',
        description: 'As a user, I want to customize the dashboard layout and UI elements to match my workflow',
        priority: 'HIGH',
        acceptance_criteria: [
          'Customize dashboard widget layout',
          'Set default views and filters',
          'Configure sidebar and navigation',
          'Personalize color themes and branding',
          'Set data refresh intervals',
          'Save and share custom layouts'
        ]
      },
      {
        id: `US-${sdId}-007`,
        title: 'Role and Permission Settings',
        description: 'As an administrator, I want to configure role-based permissions and access controls',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Define custom roles and permissions',
          'Assign users to roles and groups',
          'Configure resource-level access controls',
          'Set up approval workflows and gates',
          'Manage API access permissions',
          'Audit permission changes and usage'
        ]
      },
      {
        id: `US-${sdId}-008`,
        title: 'Data and Storage Settings',
        description: 'As a data administrator, I want to configure data retention, backup, and storage policies',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Set data retention policies by type',
          'Configure automated backup schedules',
          'Manage storage quotas and limits',
          'Set up data archival rules',
          'Configure data export formats',
          'Monitor storage usage and costs'
        ]
      },
      {
        id: `US-${sdId}-009`,
        title: 'Performance and Monitoring Settings',
        description: 'As a system administrator, I want to configure performance monitoring and alerting thresholds',
        priority: 'MEDIUM',
        acceptance_criteria: [
          'Set performance monitoring thresholds',
          'Configure system health check intervals',
          'Manage log levels and retention',
          'Set up performance alerting rules',
          'Configure resource usage monitoring',
          'Customize performance dashboards'
        ]
      },
      {
        id: `US-${sdId}-010`,
        title: 'Import/Export and Migration Tools',
        description: 'As an administrator, I want tools to backup, restore, and migrate settings between environments',
        priority: 'LOW',
        acceptance_criteria: [
          'Export settings to JSON/YAML formats',
          'Import settings with validation',
          'Migrate settings between environments',
          'Bulk update configuration values',
          'Version control for configuration changes',
          'Rollback to previous configurations'
        ]
      }
    ],
    metadata: {
      implementation_notes: [
        'Core configuration system for EHG applications',
        'Supports both EHG and EHG_Engineer apps',
        'Hierarchical settings with user/system levels',
        'Real-time settings sync across sessions',
        'Integration with existing auth and RBAC'
      ],
      backlog_evidence: [
        'Settings page requirements from EHG backlog',
        'User configuration needs identified'
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

createPRD().catch(console.error);