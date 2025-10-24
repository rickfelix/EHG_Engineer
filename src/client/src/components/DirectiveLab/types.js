/**
 * Shared types, constants, and utilities for DirectiveLab components
 */

// Step definitions for different modes
export const getSteps = (mode) => {
  if (mode === 'quick') {
    return [
      { id: 1, title: 'Input', icon: 'MessageSquare', description: 'Enter your directive idea', timeEstimate: 2 },
      { id: 3, title: 'Classification', icon: 'Target', description: 'Strategic or Tactical', timeEstimate: 1 },
      { id: 7, title: 'Confirmation', icon: 'CheckCircle', description: 'Review and submit', timeEstimate: 1 }
    ];
  }
  return [
    { id: 1, title: 'Input & Screenshot', icon: 'Camera', description: 'Provide feedback and optional screenshot', timeEstimate: 3 },
    { id: 2, title: 'Intent Confirmation', icon: 'Target', description: 'Review and confirm the extracted intent', timeEstimate: 2 },
    { id: 3, title: 'Classification', icon: 'Layers', description: 'Review strategic vs tactical breakdown', timeEstimate: 2 },
    { id: 4, title: 'Impact Analysis', icon: 'AlertTriangle', description: 'Review application impact and consistency validation', timeEstimate: 4 },
    { id: 5, title: 'Synthesis Review', icon: 'FileText', description: 'Review aligned, required, and recommended items', timeEstimate: 5 },
    { id: 6, title: 'Questions', icon: 'MessageSquare', description: 'Answer questions to refine the directive', timeEstimate: 3 },
    { id: 7, title: 'Confirmation', icon: 'CheckCircle', description: 'Review and confirm the final summary', timeEstimate: 2 }
  ];
};

// Helper function to get next step in quick mode
export const getNextStep = (currentStep, mode) => {
  if (mode === 'quick') {
    // In quick mode: 1 -> 3 -> 7
    if (currentStep === 1) return 3;
    if (currentStep === 3) return 7;
    return currentStep;
  }
  // In comprehensive mode: normal progression
  return currentStep < 7 ? currentStep + 1 : currentStep;
};

// Helper function to get previous step in quick mode
export const getPreviousStep = (currentStep, mode) => {
  if (mode === 'quick') {
    // In quick mode: 7 -> 3 -> 1
    if (currentStep === 7) return 3;
    if (currentStep === 3) return 1;
    return currentStep;
  }
  // In comprehensive mode: normal regression
  return currentStep > 1 ? currentStep - 1 : currentStep;
};

// Edit invalidation dependency map
export const DEPENDENCY_MAP = {
  1: [2, 3, 4, 5, 6, 7], // Input affects all downstream
  2: [3, 4, 5, 6, 7],    // Intent affects classification and beyond
  3: [4, 5, 6, 7],       // Classification affects impact and beyond
  4: [5, 6, 7],          // Impact affects synthesis and beyond
  5: [6, 7],             // Synthesis affects questions and beyond
  6: [7]                 // Questions affect final summary
};

// Step names for edit warnings
export const STEP_NAMES = {
  2: 'Intent Summary',
  3: 'Classification',
  4: 'Impact Analysis',
  5: 'Synthesis',
  6: 'Clarifying Questions',
  7: 'Final Summary'
};

// Check which steps have data
export const getStepsWithData = (submission, affectedSteps) => {
  return affectedSteps.filter(step => {
    switch(step) {
      case 2: return submission.intent_summary;
      case 3: return submission.strat_tac;
      case 4: return submission.impact_analysis;
      case 5: return submission.synthesis;
      case 6: return submission.questions;
      case 7: return submission.final_summary;
      default: return false;
    }
  });
};

// Validation functions
export const validateChairmanInput = (value) => {
  if (!value.trim()) {
    return { valid: false, error: 'Feedback is required' };
  }
  if (value.length < 20) {
    return { valid: false, error: 'Please provide more detailed feedback (min 20 characters)' };
  }
  return { valid: true, error: null };
};

export const validateUrl = (value) => {
  if (!value) return { valid: true, error: null }; // Optional field

  try {
    new URL(value);
    return { valid: true, error: null };
  } catch {
    return { valid: false, error: 'Please enter a valid URL' };
  }
};

// Classification keywords and scoring
export const STRATEGIC_KEYWORDS = [
  'vision', 'strategy', 'long-term', 'transform', 'innovation',
  'competitive advantage', 'market position', 'growth', 'expansion', 'culture'
];

export const TACTICAL_KEYWORDS = [
  'fix', 'bug', 'update', 'modify', 'adjust', 'correct',
  'improve', 'enhance', 'optimize', 'refactor'
];

// Component keywords for impact analysis
export const COMPONENT_KEYWORDS = {
  'dashboard': [
    { name: 'Dashboard', risk_level: 'medium', confidence: 0.8, dependencies: ['MetricsCard', 'ChartComponent'] },
    { name: 'DashboardCard', risk_level: 'low', confidence: 0.7, dependencies: ['UI Components'] },
    { name: 'MetricsCard', risk_level: 'low', confidence: 0.6, dependencies: ['Data Fetcher'] }
  ],
  'form': [
    { name: 'Form', risk_level: 'medium', confidence: 0.9, dependencies: ['Input', 'Button', 'Validation'] },
    { name: 'Input', risk_level: 'low', confidence: 0.8, dependencies: ['Event Handlers'] },
    { name: 'Button', risk_level: 'low', confidence: 0.9, dependencies: ['UI Components'] },
    { name: 'Validation', risk_level: 'medium', confidence: 0.7, dependencies: ['Form State'] }
  ],
  'navigation': [
    { name: 'Navigation', risk_level: 'medium', confidence: 0.8, dependencies: ['Router', 'Auth Context'] },
    { name: 'Sidebar', risk_level: 'low', confidence: 0.7, dependencies: ['Navigation'] },
    { name: 'Menu', risk_level: 'low', confidence: 0.6, dependencies: ['Navigation'] }
  ],
  'table': [
    { name: 'Table', risk_level: 'medium', confidence: 0.8, dependencies: ['Data Fetcher', 'Pagination'] },
    { name: 'DataGrid', risk_level: 'high', confidence: 0.9, dependencies: ['Table', 'Virtual Scroller'] }
  ],
  'modal': [
    { name: 'Modal', risk_level: 'medium', confidence: 0.8, dependencies: ['Portal', 'Focus Trap'] },
    { name: 'Dialog', risk_level: 'medium', confidence: 0.7, dependencies: ['Modal'] },
    { name: 'Overlay', risk_level: 'low', confidence: 0.6, dependencies: ['Portal'] }
  ],
  'auth': [
    { name: 'Auth', risk_level: 'high', confidence: 0.9, dependencies: ['UserContext', 'Token Manager'] },
    { name: 'Login', risk_level: 'high', confidence: 0.8, dependencies: ['Auth', 'Form'] },
    { name: 'UserContext', risk_level: 'high', confidence: 0.9, dependencies: ['State Management'] }
  ],
  'theme': [
    { name: 'ThemeProvider', risk_level: 'medium', confidence: 0.8, dependencies: ['CSS Variables', 'Context API'] },
    { name: 'Dark Mode', risk_level: 'medium', confidence: 0.7, dependencies: ['ThemeProvider'] }
  ],
  'api': [
    { name: 'API Client', risk_level: 'high', confidence: 0.9, dependencies: ['HTTP Service', 'Error Handler'] },
    { name: 'Data Fetcher', risk_level: 'medium', confidence: 0.8, dependencies: ['API Client'] },
    { name: 'WebSocket', risk_level: 'high', confidence: 0.7, dependencies: ['Connection Manager'] }
  ]
};

// Risk level keywords
export const HIGH_RISK_KEYWORDS = [
  'database', 'auth', 'security', 'payment', 'migration', 'breaking', 'major'
];

export const MEDIUM_RISK_KEYWORDS = [
  'api', 'integration', 'workflow', 'validation', 'performance'
];

export const LOW_RISK_KEYWORDS = [
  'ui', 'style', 'text', 'color', 'layout', 'visual'
];

// Effort factors for timeline estimation
export const EFFORT_FACTORS = {
  'database': 3,
  'migration': 4,
  'api': 2,
  'auth': 3,
  'integration': 2,
  'ui': 1,
  'style': 0.5,
  'text': 0.5
};

// Auto-save configuration
export const AUTO_SAVE_DELAY = 2000; // milliseconds
export const DRAFT_STORAGE_KEY = 'directiveLab_draft';

// Toast message duration
export const TOAST_DURATION = 3000;
export const TOAST_DURATION_LONG = 8000;
