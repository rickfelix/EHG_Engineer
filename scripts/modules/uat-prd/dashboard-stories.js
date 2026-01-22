/**
 * Dashboard UAT Stories
 * Stories covering dashboard functionality, widgets, and interactions
 *
 * @module dashboard-stories
 */

export const dashboardStories = [
  {
    module: 'Dashboard',
    title: 'Dashboard initial load',
    description: 'Dashboard loads with all widgets',
    acceptance_criteria: [
      'Page loads in under 3 seconds',
      'All widgets render correctly',
      'Data is current and accurate',
      'No console errors'
    ],
    test_types: ['functional', 'performance'],
    priority: 'CRITICAL'
  },
  {
    module: 'Dashboard',
    title: 'Widget interactions',
    description: 'All dashboard widgets are interactive',
    acceptance_criteria: [
      'Charts respond to hover',
      'Filters update data',
      'Drill-down navigation works',
      'Export functions work'
    ],
    test_types: ['functional', 'ui'],
    priority: 'HIGH'
  },
  {
    module: 'Dashboard',
    title: 'Real-time updates',
    description: 'Dashboard shows live data',
    acceptance_criteria: [
      'WebSocket connection established',
      'Updates appear within 2 seconds',
      'Connection recovery works',
      'Offline mode handles gracefully'
    ],
    test_types: ['functional', 'integration'],
    priority: 'HIGH'
  },
  {
    module: 'Dashboard',
    title: 'Responsive layout',
    description: 'Dashboard adapts to screen sizes',
    acceptance_criteria: [
      'Mobile layout at <768px',
      'Tablet layout at 768-1024px',
      'Desktop layout at >1024px',
      'Touch gestures work on mobile'
    ],
    test_types: ['ui', 'accessibility'],
    priority: 'HIGH'
  },
  {
    module: 'Dashboard',
    title: 'Dark mode support',
    description: 'Dashboard supports theme switching',
    acceptance_criteria: [
      'Toggle switches themes',
      'Charts adapt to theme',
      'Preference persists',
      'No contrast issues'
    ],
    test_types: ['ui', 'accessibility'],
    priority: 'MEDIUM'
  },
  {
    module: 'Dashboard',
    title: 'Widget customization',
    description: 'Users can customize dashboard layout',
    acceptance_criteria: [
      'Drag and drop works',
      'Resize handles function',
      'Layout saves properly',
      'Reset to default option'
    ],
    test_types: ['functional', 'ui'],
    priority: 'MEDIUM'
  },
  {
    module: 'Dashboard',
    title: 'Performance metrics',
    description: 'Dashboard shows performance KPIs',
    acceptance_criteria: [
      'Metrics calculate correctly',
      'Historical comparisons work',
      'Trends display properly',
      'Tooltips show details'
    ],
    test_types: ['functional', 'data'],
    priority: 'HIGH'
  },
  {
    module: 'Dashboard',
    title: 'Alert notifications',
    description: 'Dashboard displays system alerts',
    acceptance_criteria: [
      'Alerts appear in real-time',
      'Severity levels shown',
      'Dismissal works',
      'History accessible'
    ],
    test_types: ['functional', 'ui'],
    priority: 'HIGH'
  },
  {
    module: 'Dashboard',
    title: 'Data export',
    description: 'Export dashboard data',
    acceptance_criteria: [
      'CSV export works',
      'PDF export works',
      'Excel export works',
      'Data integrity maintained'
    ],
    test_types: ['functional', 'data'],
    priority: 'MEDIUM'
  },
  {
    module: 'Dashboard',
    title: 'Keyboard navigation',
    description: 'Dashboard fully keyboard accessible',
    acceptance_criteria: [
      'Tab order logical',
      'Focus indicators visible',
      'Shortcuts documented',
      'Screen reader compatible'
    ],
    test_types: ['accessibility'],
    priority: 'HIGH'
  }
];
