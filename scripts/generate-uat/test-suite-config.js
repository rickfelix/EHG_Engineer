/**
 * Test Suite Configuration Domain
 * Defines all UAT test suites and their test cases
 *
 * @module generate-uat/test-suite-config
 */

export const BASE_URL = 'http://localhost:8080';

/**
 * Core User Journey Test Suites
 */
export const TEST_SUITES = {
  ventures: {
    name: 'Venture Management',
    route: '/ventures',
    tests: [
      'List all ventures with pagination',
      'Create new venture - basic flow',
      'Create new venture - with all optional fields',
      'Edit venture details - name and description',
      'Edit venture details - financial data',
      'Edit venture details - team members',
      'Delete venture with confirmation',
      'Cancel delete operation',
      'Search ventures by name',
      'Search ventures by status',
      'Filter ventures by category',
      'Filter ventures by date range',
      'Sort ventures by name',
      'Sort ventures by value',
      'Sort ventures by created date',
      'Bulk select ventures',
      'Bulk delete ventures',
      'Bulk export ventures',
      'View venture details',
      'Navigate between ventures',
      'Add venture to portfolio',
      'Remove venture from portfolio',
      'Share venture report',
      'Print venture summary',
      'Venture quick actions menu',
      'Venture status transitions',
      'Venture permission checks',
      'Venture data validation',
      'Venture audit trail',
      'Venture performance metrics'
    ]
  },

  dashboard: {
    name: 'Executive Dashboard',
    route: '/chairman',
    tests: [
      'Dashboard initial load performance',
      'All widgets render correctly',
      'Real-time metrics update',
      'Interactive chart hover states',
      'Chart drill-down functionality',
      'Widget refresh buttons',
      'Dashboard layout customization',
      'Save dashboard preferences',
      'Export dashboard as PDF',
      'Export dashboard data as CSV',
      'Quick action buttons work',
      'Notification panel displays',
      'Notification mark as read',
      'Clear all notifications',
      'KPI cards show correct data',
      'Performance indicators update',
      'Date range selector works',
      'Dashboard search functionality',
      'Recent activity feed',
      'Upcoming events calendar',
      'Task list management',
      'Dashboard responsive layout',
      'Dark mode toggle',
      'Accessibility keyboard navigation',
      'Dashboard help tooltips'
    ]
  },

  analytics: {
    name: 'Analytics & Reporting',
    route: '/analytics',
    tests: [
      'Analytics dashboard loads',
      'Report templates available',
      'Generate standard report',
      'Generate custom report',
      'Report preview functionality',
      'Export report as PDF',
      'Export report as Excel',
      'Email report to recipients',
      'Schedule recurring reports',
      'Data visualization options',
      'Chart type switching',
      'Apply data filters',
      'Date range selection',
      'Comparison periods',
      'Trend analysis tools',
      'Predictive analytics',
      'Custom metrics builder',
      'Save report template',
      'Report sharing permissions',
      'Analytics performance benchmarks'
    ]
  },

  aiAgents: {
    name: 'AI Agent Management',
    route: '/ai-agents',
    tests: [
      'AI agents list page loads',
      'CEO Agent activation',
      'CEO Agent task delegation',
      'CEO Agent response handling',
      'GTM Strategist activation',
      'GTM strategy generation',
      'GTM plan approval flow',
      'Competitive Intelligence agent',
      'Competitor analysis report',
      'Market insights generation',
      'Creative Media agent activation',
      'Content generation workflow',
      'Content approval process',
      'Agent coordination dashboard',
      'Multi-agent collaboration',
      'Agent task history',
      'Agent performance metrics',
      'Agent configuration settings',
      'Agent permission management',
      'Agent error handling',
      'Agent fallback scenarios',
      'Agent learning feedback',
      'Agent API integration',
      'Agent webhook handling',
      'Agent notification system'
    ]
  },

  eva: {
    name: 'EVA Assistant',
    route: '/eva-orchestration',
    tests: [
      'EVA chat interface loads',
      'Send text message to EVA',
      'Receive EVA response',
      'EVA command execution',
      'EVA context awareness',
      'EVA multi-turn conversation',
      'EVA suggestion chips',
      'EVA quick actions',
      'EVA history retrieval',
      'Clear conversation history',
      'EVA file upload handling',
      'EVA data analysis',
      'EVA report generation',
      'EVA task automation',
      'EVA integration commands',
      'EVA help system',
      'EVA error recovery',
      'EVA session persistence',
      'EVA voice input',
      'EVA export conversation'
    ]
  },

  workflows: {
    name: 'Workflow Management',
    route: '/workflows',
    tests: [
      'Workflows list page loads',
      'Create new workflow',
      'Edit workflow steps',
      'Delete workflow',
      'Workflow templates',
      'Workflow execution start',
      'Workflow progress tracking',
      'Workflow pause/resume',
      'Workflow cancellation',
      'Workflow completion',
      'Workflow error handling',
      'Workflow notifications',
      'Workflow approval chains',
      'Workflow automation rules',
      'Workflow performance metrics'
    ]
  },

  portfolios: {
    name: 'Portfolio Management',
    route: '/portfolios',
    tests: [
      'Portfolio overview loads',
      'Create new portfolio',
      'Add assets to portfolio',
      'Remove assets from portfolio',
      'Portfolio performance charts',
      'Portfolio allocation view',
      'Portfolio risk assessment',
      'Portfolio rebalancing tool',
      'Portfolio comparison',
      'Portfolio reports',
      'Portfolio sharing',
      'Portfolio notifications',
      'Portfolio settings',
      'Portfolio archival',
      'Portfolio restoration'
    ]
  },

  governance: {
    name: 'Governance & Compliance',
    route: '/governance',
    tests: [
      'Governance dashboard loads',
      'Policy list displays',
      'Create new policy',
      'Edit existing policy',
      'Policy approval workflow',
      'Compliance check execution',
      'Audit trail viewing',
      'Generate compliance report',
      'Risk assessment tools',
      'Governance notifications'
    ]
  },

  integrations: {
    name: 'External Integrations',
    route: '/integrations',
    tests: [
      'Integration hub loads',
      'View available integrations',
      'Configure new integration',
      'Test integration connection',
      'Integration data sync',
      'Webhook configuration',
      'API key management',
      'Integration logs viewing',
      'Integration error handling',
      'Disable integration'
    ]
  },

  team: {
    name: 'Team & Collaboration',
    route: '/team',
    tests: [
      'Team page loads',
      'View team members',
      'Invite new member',
      'Edit member permissions',
      'Remove team member',
      'Team activity feed',
      'Team performance metrics',
      'Team communication tools',
      'Team task assignment',
      'Team calendar view'
    ]
  }
};

export default {
  BASE_URL,
  TEST_SUITES
};
