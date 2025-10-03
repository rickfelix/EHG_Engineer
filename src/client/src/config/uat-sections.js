/**
 * UAT Section Configuration for EHG Application
 * Centralized configuration for test case sections
 * For testing the EHG business application (port 8080)
 * Matches the exact sidebar navigation from the actual EHG Platform
 * Last updated: 2025-09-29 based on screenshot
 */

export const UAT_SECTIONS = {
  // Main Navigation
  'Main': [
    { value: 'chairman-console', label: 'Chairman Console', route: '/chairman' },
    { value: 'eva-assistant', label: 'EVA Assistant', route: '/eva' },
    { value: 'ventures', label: 'Ventures', route: '/ventures' },
    { value: 'portfolios', label: 'Portfolios', route: '/portfolios' }
  ],

  // AI Orchestration
  'AI Orchestration': [
    { value: 'eva-dashboard', label: 'EVA Dashboard', route: '/eva-dashboard' },
    { value: 'workflows', label: 'Workflows', route: '/workflows' },
    { value: 'ai-agents', label: 'AI Agents', route: '/ai-agents' },
    { value: 'eva-knowledge-base', label: 'EVA Knowledge Base', route: '/knowledge-base' }
  ],

  // Analytics & Reports
  'Analytics & Reports': [
    { value: 'analytics', label: 'Analytics', route: '/analytics' },
    { value: 'reports', label: 'Reports', route: '/reports' },
    { value: 'insights', label: 'Insights', route: '/insights' },
    { value: 'risk-forecasting', label: 'Risk Forecasting', route: '/risk-forecasting' },
    { value: 'advanced-analytics', label: 'Advanced Analytics', route: '/advanced-analytics' },
    { value: 'mobile-companion', label: 'Mobile Companion', route: '/mobile' }
  ],

  // Administration
  'Administration': [
    { value: 'governance', label: 'Governance', route: '/governance' },
    { value: 'integration-hub', label: 'Integration Hub', route: '/integrations' },
    { value: 'enhanced-security', label: 'Enhanced Security', route: '/security' },
    { value: 'settings', label: 'Settings', route: '/settings' }
  ],

  // System & Authentication
  'System & Authentication': [
    { value: 'authentication', label: 'Authentication & Login', route: '/login' },
    { value: 'landing', label: 'Landing Page', route: '/' }
  ],

  // Cross-Cutting Concerns
  'Cross-Cutting': [
    { value: 'navigation', label: 'Navigation & Routing' },
    { value: 'ui-components', label: 'UI Components' },
    { value: 'forms', label: 'Forms & Validation' },
    { value: 'notifications', label: 'Notifications' },
    { value: 'dark-mode', label: 'Dark Mode / Theming' },
    { value: 'responsive', label: 'Responsive Design' },
    { value: 'accessibility', label: 'Accessibility' },
    { value: 'performance-general', label: 'Performance & Loading' }
  ],

  // Other
  'Other': [
    { value: 'edge-cases', label: 'Edge Cases' },
    { value: 'regression', label: 'Regression Tests' },
    { value: 'exploratory', label: 'Exploratory Testing' },
    { value: 'other', label: 'Other/Miscellaneous' }
  ]
};

// Helper function to get all sections as a flat array
export function getAllSections() {
  const sections = [];
  Object.values(UAT_SECTIONS).forEach(category => {
    sections.push(...category);
  });
  return sections;
}

// Helper function to get section label by value
export function getSectionLabel(value) {
  const allSections = getAllSections();
  const section = allSections.find(s => s.value === value);
  return section ? section.label : value;
}

// Helper function to get section category
export function getSectionCategory(value) {
  for (const [category, sections] of Object.entries(UAT_SECTIONS)) {
    if (sections.some(s => s.value === value)) {
      return category;
    }
  }
  return 'Other';
}