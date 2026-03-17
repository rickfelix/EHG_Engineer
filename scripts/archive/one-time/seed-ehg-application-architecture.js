/**
 * Seed EHG Application Architecture Data
 * Populates tables with current EHG application structure
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;
const projectId = 'dedlbzhpgkmetvhbkyzq';
const password = process.env.SUPABASE_DB_PASSWORD;
if (!password) throw new Error('SUPABASE_DB_PASSWORD required');

const client = new Client({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: `postgres.${projectId}`,
  password: password,
  ssl: { rejectUnauthorized: false }
});

// Feature areas based on component directories
const featureAreas = [
  {
    code: 'CHAIRMAN',
    name: 'Chairman Dashboard',
    description: 'Executive dashboard for venture oversight, decisions, and reporting',
    navigation_path: '/chairman',
    primary_user_role: 'Chairman',
    metadata: { priority: 'high', components_count: 10 }
  },
  {
    code: 'VENTURES',
    name: 'Venture Management',
    description: 'Create, manage, and track venture portfolios',
    navigation_path: '/ventures',
    primary_user_role: 'All',
    metadata: { priority: 'high', components_count: 15 }
  },
  {
    code: 'ANALYTICS',
    name: 'Analytics & Insights',
    description: 'Data analytics, reporting, and business intelligence',
    navigation_path: '/analytics',
    primary_user_role: 'Analyst',
    metadata: { priority: 'high', components_count: 12 }
  },
  {
    code: 'EVA',
    name: 'EVA Assistant',
    description: 'AI-powered virtual assistant for user support and automation',
    navigation_path: '/eva',
    primary_user_role: 'All',
    metadata: { priority: 'high', components_count: 8 }
  },
  {
    code: 'AGENTS',
    name: 'AI Agents',
    description: 'AI agent management, coordination, and monitoring',
    navigation_path: '/agents',
    primary_user_role: 'Admin',
    metadata: { priority: 'medium', components_count: 10 }
  },
  {
    code: 'GOVERNANCE',
    name: 'Governance & Compliance',
    description: 'Policy management, compliance tracking, and governance frameworks',
    navigation_path: '/governance',
    primary_user_role: 'Admin',
    metadata: { priority: 'medium', components_count: 5 }
  },
  {
    code: 'AUTOMATION',
    name: 'Automation Engine',
    description: 'Workflow automation and task orchestration',
    navigation_path: '/automation',
    primary_user_role: 'All',
    metadata: { priority: 'medium', components_count: 6 }
  },
  {
    code: 'GTM',
    name: 'Go-to-Market Intelligence',
    description: 'GTM strategy, timing, and market intelligence',
    navigation_path: '/gtm',
    primary_user_role: 'Strategist',
    metadata: { priority: 'medium', components_count: 4 }
  },
  {
    code: 'REPORTS',
    name: 'Report Builder',
    description: 'Custom report creation and history',
    navigation_path: '/reports',
    primary_user_role: 'All',
    metadata: { priority: 'medium', components_count: 5 }
  },
  {
    code: 'SETTINGS',
    name: 'Settings & Configuration',
    description: 'User preferences, company settings, and system configuration',
    navigation_path: '/settings',
    primary_user_role: 'All',
    metadata: { priority: 'low', components_count: 8 }
  }
];

// Key page routes
const pageRoutes = [
  {
    route_path: '/chairman',
    page_name: 'ChairmanDashboard',
    feature_area_code: 'CHAIRMAN',
    purpose: 'Executive overview of all ventures with key metrics and decisions',
    user_workflow: 'Executive Monitoring',
    component_file_path: 'src/components/ventures/ChairmanDashboard.tsx',
    layout_type: 'authenticated',
    access_level: 'chairman',
    related_routes: ['/chairman/decisions', '/chairman/reports']
  },
  {
    route_path: '/chairman/settings',
    page_name: 'ChairmanSettingsPage',
    feature_area_code: 'CHAIRMAN',
    purpose: 'Configure chairman dashboard preferences and settings',
    user_workflow: 'Settings Management',
    component_file_path: 'src/pages/ChairmanSettingsPage.tsx',
    layout_type: 'authenticated',
    access_level: 'chairman',
    related_routes: ['/chairman']
  },
  {
    route_path: '/ventures',
    page_name: 'VenturesPage',
    feature_area_code: 'VENTURES',
    purpose: 'List all ventures with search, filter, and create capabilities',
    user_workflow: 'Venture Discovery',
    component_file_path: 'src/pages/VenturesPage.tsx',
    layout_type: 'authenticated',
    access_level: 'authenticated',
    related_routes: ['/ventures/:id', '/portfolios']
  },
  {
    route_path: '/ventures/:id',
    page_name: 'VentureDetailEnhanced',
    feature_area_code: 'VENTURES',
    purpose: 'Detailed venture information with teams, metrics, and progress tracking',
    user_workflow: 'Venture Management',
    component_file_path: 'src/pages/VentureDetailEnhanced.tsx',
    layout_type: 'authenticated',
    access_level: 'authenticated',
    related_routes: ['/ventures']
  },
  {
    route_path: '/analytics',
    page_name: 'AnalyticsDashboard',
    feature_area_code: 'ANALYTICS',
    purpose: 'Business intelligence dashboard with charts and insights',
    user_workflow: 'Data Analysis',
    component_file_path: 'src/pages/AnalyticsDashboard.tsx',
    layout_type: 'authenticated',
    access_level: 'authenticated',
    related_routes: ['/reports']
  },
  {
    route_path: '/reports/builder',
    page_name: 'ReportBuilderPage',
    feature_area_code: 'REPORTS',
    purpose: 'Create custom reports with flexible data sources',
    user_workflow: 'Report Creation',
    component_file_path: 'src/pages/ReportBuilderPage.tsx',
    layout_type: 'authenticated',
    access_level: 'authenticated',
    related_routes: ['/reports/history']
  },
  {
    route_path: '/automation',
    page_name: 'AutomationDashboardPage',
    feature_area_code: 'AUTOMATION',
    purpose: 'Workflow automation status and configuration',
    user_workflow: 'Automation Management',
    component_file_path: 'src/pages/AutomationDashboardPage.tsx',
    layout_type: 'authenticated',
    access_level: 'authenticated',
    related_routes: ['/workflows']
  },
  {
    route_path: '/eva',
    page_name: 'EVAAssistantPage',
    feature_area_code: 'EVA',
    purpose: 'AI assistant chat interface and orchestration',
    user_workflow: 'AI Assistance',
    component_file_path: 'src/pages/EVAAssistantPage.tsx',
    layout_type: 'authenticated',
    access_level: 'authenticated',
    related_routes: ['/eva/orchestration']
  }
];

// Component patterns
const componentPatterns = [
  {
    pattern_name: 'Dashboard Card',
    pattern_type: 'layout',
    component_path: 'src/components/ui/card.tsx',
    description: 'Standard card component for dashboard layouts with header, content, and optional footer',
    example_usage: ['src/pages/ChairmanDashboard.tsx', 'src/pages/AnalyticsDashboard.tsx'],
    design_system_compliance: true,
    accessibility_notes: 'Use semantic HTML, ensure proper heading hierarchy',
    best_practices: ['Keep cards focused on single metric/feature', 'Use consistent padding', 'Include loading states']
  },
  {
    pattern_name: 'Data Table',
    pattern_type: 'data-display',
    component_path: 'src/components/ui/table.tsx',
    description: 'Accessible data table with sorting, filtering, and pagination',
    example_usage: ['src/pages/VenturesPage.tsx', 'src/pages/ReportHistoryPage.tsx'],
    design_system_compliance: true,
    accessibility_notes: 'Include ARIA labels, keyboard navigation, screen reader support',
    best_practices: ['Paginate large datasets', 'Show loading skeletons', 'Allow column customization']
  },
  {
    pattern_name: 'Modal Dialog',
    pattern_type: 'navigation',
    component_path: 'src/components/ui/dialog.tsx',
    description: 'Modal dialog for forms, confirmations, and detail views',
    example_usage: ['src/components/ventures/VentureForm.tsx'],
    design_system_compliance: true,
    accessibility_notes: 'Trap focus, allow ESC to close, return focus on close',
    best_practices: ['Use for temporary tasks', 'Keep content focused', 'Provide clear exit paths']
  },
  {
    pattern_name: 'Tab Navigation',
    pattern_type: 'navigation',
    component_path: 'src/components/ui/tabs.tsx',
    description: 'Tab component for organizing related content',
    example_usage: ['src/pages/VentureDetailEnhanced.tsx', 'src/pages/settings.tsx'],
    design_system_compliance: true,
    accessibility_notes: 'Use ARIA tabs pattern, keyboard arrow navigation',
    best_practices: ['Group related content', 'Lazy load tab content', 'Show active state clearly']
  }
];

// User workflows
const userWorkflows = [
  {
    workflow_name: 'Create New Venture',
    workflow_code: 'VENTURE_CREATE',
    description: 'User creates a new venture from scratch',
    user_persona: 'All',
    entry_points: ['/ventures', '/chairman'],
    workflow_steps: {
      steps: [
        { order: 1, action: 'Click "Create Venture" button', page: '/ventures' },
        { order: 2, action: 'Fill venture details form', component: 'VentureForm' },
        { order: 3, action: 'Add team members (optional)', component: 'TeamSelector' },
        { order: 4, action: 'Set initial metrics', component: 'MetricsForm' },
        { order: 5, action: 'Submit and navigate to venture detail', page: '/ventures/:id' }
      ]
    },
    exit_points: ['/ventures/:id'],
    related_features: ['VENTURES'],
    ui_components_involved: ['Button', 'Dialog', 'Form', 'Input', 'Select']
  },
  {
    workflow_name: 'Review Executive Dashboard',
    workflow_code: 'CHAIRMAN_REVIEW',
    description: 'Chairman reviews venture portfolio and makes decisions',
    user_persona: 'Chairman',
    entry_points: ['/chairman'],
    workflow_steps: {
      steps: [
        { order: 1, action: 'View dashboard overview', page: '/chairman' },
        { order: 2, action: 'Review key metrics cards', component: 'MetricCard' },
        { order: 3, action: 'Check pending decisions', component: 'DecisionsInbox' },
        { order: 4, action: 'Drill into specific venture', page: '/ventures/:id' },
        { order: 5, action: 'Generate report (optional)', page: '/reports/builder' }
      ]
    },
    exit_points: ['/chairman', '/reports/builder'],
    related_features: ['CHAIRMAN', 'VENTURES', 'REPORTS'],
    ui_components_involved: ['Card', 'Chart', 'Table', 'Button']
  },
  {
    workflow_name: 'Build Custom Report',
    workflow_code: 'REPORT_BUILD',
    description: 'User creates and saves a custom report',
    user_persona: 'All',
    entry_points: ['/reports/builder', '/analytics'],
    workflow_steps: {
      steps: [
        { order: 1, action: 'Navigate to report builder', page: '/reports/builder' },
        { order: 2, action: 'Select data sources', component: 'DataSourceSelector' },
        { order: 3, action: 'Configure visualizations', component: 'ChartBuilder' },
        { order: 4, action: 'Preview report', component: 'ReportPreview' },
        { order: 5, action: 'Save report', page: '/reports/history' }
      ]
    },
    exit_points: ['/reports/history'],
    related_features: ['REPORTS', 'ANALYTICS'],
    ui_components_involved: ['Form', 'Select', 'Chart', 'Button', 'Dialog']
  }
];

async function seed() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    await client.query('BEGIN');

    // Seed feature areas
    console.log('Seeding feature areas...');
    const featureAreaIds = {};
    for (const area of featureAreas) {
      const result = await client.query(`
        INSERT INTO ehg_feature_areas (code, name, description, navigation_path, primary_user_role, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          navigation_path = EXCLUDED.navigation_path,
          primary_user_role = EXCLUDED.primary_user_role,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id
      `, [area.code, area.name, area.description, area.navigation_path, area.primary_user_role, area.metadata]);

      featureAreaIds[area.code] = result.rows[0].id;
      console.log(`  ✓ ${area.code}: ${area.name}`);
    }

    // Seed page routes
    console.log('\nSeeding page routes...');
    for (const route of pageRoutes) {
      const featureAreaId = featureAreaIds[route.feature_area_code];
      await client.query(`
        INSERT INTO ehg_page_routes (
          route_path, page_name, feature_area_id, purpose, user_workflow,
          component_file_path, layout_type, access_level, related_routes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (route_path) DO UPDATE SET
          page_name = EXCLUDED.page_name,
          feature_area_id = EXCLUDED.feature_area_id,
          purpose = EXCLUDED.purpose,
          user_workflow = EXCLUDED.user_workflow,
          component_file_path = EXCLUDED.component_file_path,
          layout_type = EXCLUDED.layout_type,
          access_level = EXCLUDED.access_level,
          related_routes = EXCLUDED.related_routes,
          updated_at = NOW()
      `, [
        route.route_path, route.page_name, featureAreaId, route.purpose,
        route.user_workflow, route.component_file_path, route.layout_type,
        route.access_level, route.related_routes
      ]);
      console.log(`  ✓ ${route.route_path}`);
    }

    // Seed component patterns
    console.log('\nSeeding component patterns...');
    for (const pattern of componentPatterns) {
      await client.query(`
        INSERT INTO ehg_component_patterns (
          pattern_name, pattern_type, component_path, description,
          example_usage, design_system_compliance, accessibility_notes, best_practices
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (pattern_name) DO UPDATE SET
          pattern_type = EXCLUDED.pattern_type,
          component_path = EXCLUDED.component_path,
          description = EXCLUDED.description,
          example_usage = EXCLUDED.example_usage,
          design_system_compliance = EXCLUDED.design_system_compliance,
          accessibility_notes = EXCLUDED.accessibility_notes,
          best_practices = EXCLUDED.best_practices,
          updated_at = NOW()
      `, [
        pattern.pattern_name, pattern.pattern_type, pattern.component_path,
        pattern.description, pattern.example_usage, pattern.design_system_compliance,
        pattern.accessibility_notes, pattern.best_practices
      ]);
      console.log(`  ✓ ${pattern.pattern_name}`);
    }

    // Seed user workflows
    console.log('\nSeeding user workflows...');
    for (const workflow of userWorkflows) {
      await client.query(`
        INSERT INTO ehg_user_workflows (
          workflow_name, workflow_code, description, user_persona,
          entry_points, workflow_steps, exit_points, related_features, ui_components_involved
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (workflow_code) DO UPDATE SET
          workflow_name = EXCLUDED.workflow_name,
          description = EXCLUDED.description,
          user_persona = EXCLUDED.user_persona,
          entry_points = EXCLUDED.entry_points,
          workflow_steps = EXCLUDED.workflow_steps,
          exit_points = EXCLUDED.exit_points,
          related_features = EXCLUDED.related_features,
          ui_components_involved = EXCLUDED.ui_components_involved,
          updated_at = NOW()
      `, [
        workflow.workflow_name, workflow.workflow_code, workflow.description,
        workflow.user_persona, workflow.entry_points, workflow.workflow_steps,
        workflow.exit_points, workflow.related_features, workflow.ui_components_involved
      ]);
      console.log(`  ✓ ${workflow.workflow_code}: ${workflow.workflow_name}`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Seeding completed successfully');

    // Summary
    console.log('\n📊 Summary:');
    const stats = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM ehg_feature_areas) as feature_areas,
        (SELECT COUNT(*) FROM ehg_page_routes) as page_routes,
        (SELECT COUNT(*) FROM ehg_component_patterns) as component_patterns,
        (SELECT COUNT(*) FROM ehg_user_workflows) as user_workflows
    `);
    console.log(`  Feature Areas: ${stats.rows[0].feature_areas}`);
    console.log(`  Page Routes: ${stats.rows[0].page_routes}`);
    console.log(`  Component Patterns: ${stats.rows[0].component_patterns}`);
    console.log(`  User Workflows: ${stats.rows[0].user_workflows}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
