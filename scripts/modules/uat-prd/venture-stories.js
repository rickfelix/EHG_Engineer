/**
 * Ventures Module UAT Stories
 * Stories covering venture CRUD, workflows, and management
 *
 * @module venture-stories
 */

export const ventureStories = [
  {
    module: 'Ventures',
    title: 'Venture list view',
    description: 'Display all ventures in list format',
    acceptance_criteria: [
      'Pagination works correctly',
      'Sorting by all columns',
      'Search filters data',
      'Bulk actions available'
    ],
    test_types: ['functional', 'ui'],
    priority: 'CRITICAL'
  },
  {
    module: 'Ventures',
    title: 'Create new venture',
    description: 'Add new venture to system',
    acceptance_criteria: [
      'Form validation works',
      'Required fields enforced',
      'Success message shown',
      'Venture appears in list'
    ],
    test_types: ['functional', 'data'],
    priority: 'CRITICAL'
  },
  {
    module: 'Ventures',
    title: 'Edit venture details',
    description: 'Modify existing venture information',
    acceptance_criteria: [
      'All fields editable',
      'Changes save properly',
      'Audit trail updated',
      'Optimistic UI updates'
    ],
    test_types: ['functional', 'data'],
    priority: 'HIGH'
  },
  {
    module: 'Ventures',
    title: 'Delete venture',
    description: 'Remove venture from system',
    acceptance_criteria: [
      'Confirmation dialog appears',
      'Soft delete implemented',
      'Related data handled',
      'Undo option available'
    ],
    test_types: ['functional', 'data'],
    priority: 'HIGH'
  },
  {
    module: 'Ventures',
    title: 'Venture status workflow',
    description: 'Manage venture lifecycle states',
    acceptance_criteria: [
      'Status transitions validated',
      'Permissions checked',
      'History tracked',
      'Notifications sent'
    ],
    test_types: ['functional', 'workflow'],
    priority: 'HIGH'
  },
  {
    module: 'Ventures',
    title: 'Venture documents',
    description: 'Manage venture documentation',
    acceptance_criteria: [
      'File upload works',
      'Preview available',
      'Download functions',
      'Version control active'
    ],
    test_types: ['functional', 'integration'],
    priority: 'MEDIUM'
  },
  {
    module: 'Ventures',
    title: 'Venture team management',
    description: 'Assign team members to ventures',
    acceptance_criteria: [
      'User search works',
      'Role assignment correct',
      'Permissions applied',
      'Notifications sent'
    ],
    test_types: ['functional', 'security'],
    priority: 'HIGH'
  },
  {
    module: 'Ventures',
    title: 'Venture analytics',
    description: 'View venture performance metrics',
    acceptance_criteria: [
      'Metrics calculate correctly',
      'Charts render properly',
      'Drill-down works',
      'Export available'
    ],
    test_types: ['functional', 'data'],
    priority: 'MEDIUM'
  },
  {
    module: 'Ventures',
    title: 'Venture timeline',
    description: 'Display venture activity timeline',
    acceptance_criteria: [
      'Events chronological',
      'Filtering works',
      'Details expandable',
      'Infinite scroll works'
    ],
    test_types: ['functional', 'ui'],
    priority: 'LOW'
  },
  {
    module: 'Ventures',
    title: 'Venture collaboration',
    description: 'Enable team collaboration features',
    acceptance_criteria: [
      'Comments system works',
      'Mentions notify users',
      'Real-time updates',
      'Markdown supported'
    ],
    test_types: ['functional', 'integration'],
    priority: 'MEDIUM'
  },
  {
    module: 'Ventures',
    title: 'Venture templates',
    description: 'Use templates for new ventures',
    acceptance_criteria: [
      'Template library accessible',
      'Preview available',
      'Customization works',
      'Save as template option'
    ],
    test_types: ['functional', 'ui'],
    priority: 'LOW'
  },
  {
    module: 'Ventures',
    title: 'Venture search',
    description: 'Advanced search capabilities',
    acceptance_criteria: [
      'Full-text search works',
      'Filters combinable',
      'Search history saved',
      'Results relevant'
    ],
    test_types: ['functional', 'performance'],
    priority: 'HIGH'
  }
];
