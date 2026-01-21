/**
 * Form Validation UAT Stories
 * Stories covering form inputs, validation, and submission
 *
 * @module form-stories
 */

export const formStories = [
  {
    module: 'Forms',
    title: 'Required field validation',
    description: 'Enforce required fields in all forms',
    acceptance_criteria: [
      'Empty required fields show error',
      'Error messages clear',
      'Submit blocked until valid',
      'Asterisk marks required'
    ],
    test_types: ['functional', 'ui'],
    priority: 'CRITICAL'
  },
  {
    module: 'Forms',
    title: 'Email validation',
    description: 'Validate email format',
    acceptance_criteria: [
      'Invalid emails rejected',
      'Valid formats accepted',
      'Real-time validation',
      'Clear error messages'
    ],
    test_types: ['functional', 'data'],
    priority: 'HIGH'
  },
  {
    module: 'Forms',
    title: 'Number field validation',
    description: 'Validate numeric inputs',
    acceptance_criteria: [
      'Only numbers accepted',
      'Min/max values enforced',
      'Decimal places limited',
      'Format masks work'
    ],
    test_types: ['functional', 'data'],
    priority: 'HIGH'
  },
  {
    module: 'Forms',
    title: 'Date field validation',
    description: 'Validate date inputs',
    acceptance_criteria: [
      'Date picker works',
      'Format validated',
      'Range restrictions work',
      'Timezone handling correct'
    ],
    test_types: ['functional', 'data'],
    priority: 'MEDIUM'
  },
  {
    module: 'Forms',
    title: 'File upload validation',
    description: 'Validate file uploads',
    acceptance_criteria: [
      'File type restrictions work',
      'Size limits enforced',
      'Multiple files handled',
      'Progress indicator shown'
    ],
    test_types: ['functional', 'ui'],
    priority: 'HIGH'
  },
  {
    module: 'Forms',
    title: 'Cross-field validation',
    description: 'Validate related fields',
    acceptance_criteria: [
      'Conditional fields work',
      'Dependencies checked',
      'Date ranges validated',
      'Sum totals verified'
    ],
    test_types: ['functional', 'data'],
    priority: 'MEDIUM'
  },
  {
    module: 'Forms',
    title: 'Async validation',
    description: 'Server-side validation',
    acceptance_criteria: [
      'Uniqueness checks work',
      'Loading state shown',
      'Debouncing implemented',
      'Error handling works'
    ],
    test_types: ['functional', 'integration'],
    priority: 'HIGH'
  },
  {
    module: 'Forms',
    title: 'Form submission',
    description: 'Handle form submission',
    acceptance_criteria: [
      'Success message shown',
      'Error handling works',
      'Duplicate submission prevented',
      'Data persisted correctly'
    ],
    test_types: ['functional', 'data'],
    priority: 'CRITICAL'
  }
];
