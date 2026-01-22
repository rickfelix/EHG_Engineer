/**
 * Quality UAT Stories
 * Stories covering performance, accessibility, and error handling
 *
 * @module quality-stories
 */

export const performanceStories = [
  {
    module: 'Performance',
    title: 'Page load times',
    description: 'Ensure fast page loads',
    acceptance_criteria: [
      'Homepage loads <2 seconds',
      'Dashboard loads <3 seconds',
      'Forms load <1 second',
      'Images optimized'
    ],
    test_types: ['performance'],
    priority: 'HIGH'
  },
  {
    module: 'Performance',
    title: 'API response times',
    description: 'Fast API responses',
    acceptance_criteria: [
      'GET requests <200ms',
      'POST requests <500ms',
      'Batch operations <2s',
      'Pagination efficient'
    ],
    test_types: ['performance', 'api'],
    priority: 'HIGH'
  },
  {
    module: 'Performance',
    title: 'Memory usage',
    description: 'Prevent memory leaks',
    acceptance_criteria: [
      'No memory leaks detected',
      'Memory <200MB normal use',
      'Garbage collection works',
      'Long sessions stable'
    ],
    test_types: ['performance'],
    priority: 'MEDIUM'
  },
  {
    module: 'Performance',
    title: 'Concurrent users',
    description: 'Handle multiple users',
    acceptance_criteria: [
      'Supports 100 concurrent',
      'No race conditions',
      'Database locks managed',
      'Load balancing works'
    ],
    test_types: ['performance', 'load'],
    priority: 'HIGH'
  },
  {
    module: 'Performance',
    title: 'Large data sets',
    description: 'Handle large amounts of data',
    acceptance_criteria: [
      '10k records paginate well',
      'Virtual scrolling works',
      'Exports handle large data',
      'Search remains fast'
    ],
    test_types: ['performance', 'data'],
    priority: 'MEDIUM'
  },
  {
    module: 'Performance',
    title: 'Network resilience',
    description: 'Handle poor network conditions',
    acceptance_criteria: [
      'Offline mode works',
      'Retry logic implemented',
      'Timeout handling correct',
      'Progressive loading used'
    ],
    test_types: ['performance', 'integration'],
    priority: 'MEDIUM'
  }
];

export const accessibilityStories = [
  {
    module: 'Accessibility',
    title: 'Screen reader support',
    description: 'Full screen reader compatibility',
    acceptance_criteria: [
      'All content readable',
      'ARIA labels present',
      'Landmarks defined',
      'Skip links work'
    ],
    test_types: ['accessibility'],
    priority: 'HIGH'
  },
  {
    module: 'Accessibility',
    title: 'Keyboard navigation',
    description: 'Complete keyboard control',
    acceptance_criteria: [
      'All interactive elements reachable',
      'Tab order logical',
      'Focus visible',
      'Shortcuts documented'
    ],
    test_types: ['accessibility'],
    priority: 'HIGH'
  },
  {
    module: 'Accessibility',
    title: 'Color contrast',
    description: 'WCAG AA compliance',
    acceptance_criteria: [
      'Text contrast 4.5:1',
      'Large text 3:1',
      'Focus indicators visible',
      'Error states clear'
    ],
    test_types: ['accessibility', 'ui'],
    priority: 'HIGH'
  },
  {
    module: 'Accessibility',
    title: 'Responsive text',
    description: 'Text scales properly',
    acceptance_criteria: [
      'Zoom to 200% works',
      'No horizontal scroll',
      'Text remains readable',
      'Layout maintains'
    ],
    test_types: ['accessibility', 'ui'],
    priority: 'MEDIUM'
  },
  {
    module: 'Accessibility',
    title: 'Form accessibility',
    description: 'Accessible form controls',
    acceptance_criteria: [
      'Labels associated',
      'Error messages linked',
      'Instructions clear',
      'Fieldsets used'
    ],
    test_types: ['accessibility'],
    priority: 'HIGH'
  },
  {
    module: 'Accessibility',
    title: 'Media accessibility',
    description: 'Accessible media content',
    acceptance_criteria: [
      'Alt text present',
      'Captions available',
      'Transcripts provided',
      'Audio descriptions'
    ],
    test_types: ['accessibility'],
    priority: 'MEDIUM'
  }
];

export const errorStories = [
  {
    module: 'ErrorHandling',
    title: '404 page handling',
    description: 'Handle missing pages',
    acceptance_criteria: [
      'Custom 404 page shown',
      'Navigation available',
      'Search suggested',
      'Analytics tracked'
    ],
    test_types: ['functional', 'ui'],
    priority: 'HIGH'
  },
  {
    module: 'ErrorHandling',
    title: 'Network error handling',
    description: 'Handle network failures',
    acceptance_criteria: [
      'Error message shown',
      'Retry option available',
      'Offline mode activated',
      'Data not lost'
    ],
    test_types: ['functional', 'integration'],
    priority: 'HIGH'
  },
  {
    module: 'ErrorHandling',
    title: 'Validation error display',
    description: 'Show validation errors clearly',
    acceptance_criteria: [
      'Inline errors shown',
      'Summary available',
      'Focus on first error',
      'Clear instructions'
    ],
    test_types: ['functional', 'ui'],
    priority: 'HIGH'
  },
  {
    module: 'ErrorHandling',
    title: 'Server error handling',
    description: 'Handle 500 errors gracefully',
    acceptance_criteria: [
      'Friendly error page',
      'Error ID shown',
      'Support contact info',
      'Auto-recovery attempted'
    ],
    test_types: ['functional', 'integration'],
    priority: 'HIGH'
  }
];
