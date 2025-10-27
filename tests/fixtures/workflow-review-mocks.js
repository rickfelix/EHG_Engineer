/**
 * Mock Data Fixtures for Workflow Review Testing
 *
 * Provides sample user stories, workflows, and expected outputs
 * for testing the Design Sub-Agent workflow review capability
 *
 * Added: 2025-01-15 (SD-DESIGN-WORKFLOW-REVIEW-001)
 */

export const mockUserStoriesSimple = [
  {
    id: 'US-001',
    title: 'User accesses support',
    description: 'Given user on dashboard, When clicks Support tab, Then support form loads',
    implementation_context: 'Navigate to /dashboard → Click #support-tab → Render <SupportForm />',
    acceptance_criteria: ['Support tab visible', 'Form loads < 2s'],
    story_id: 'US-001',
    sd_id: 'SD-TEST-001'
  }
];

export const mockUserStoriesComplex = [
  {
    id: 'US-002',
    title: 'User submits ticket',
    description: 'Given user on support form, When fills fields and clicks Submit, Then ticket created',
    implementation_context: 'Fill name field → Fill email field → Fill description → Click submit → POST /api/tickets → Show confirmation toast',
    acceptance_criteria: ['All fields validated', 'Ticket ID returned', 'Success message shown'],
    story_id: 'US-002',
    sd_id: 'SD-TEST-001'
  },
  {
    id: 'US-003',
    title: 'User views ticket history',
    description: 'Given user has submitted tickets, When navigates to history, Then previous tickets displayed',
    implementation_context: 'Navigate to /dashboard?tab=history → Fetch /api/tickets → Render TicketList',
    acceptance_criteria: ['History tab visible', 'Tickets load within 3s', 'Pagination works'],
    story_id: 'US-003',
    sd_id: 'SD-TEST-001'
  }
];

export const mockWorkflowWithDeadEnd = {
  steps: [
    {
      action: 'User navigates to /settings',
      outcome: 'Settings page loads',
      type: 'navigation',
      story_id: 'US-004'
    },
    {
      action: 'User clicks Delete Account',
      outcome: 'Modal opens',
      type: 'interaction',
      story_id: 'US-004'
    },
    {
      action: 'User confirms deletion',
      outcome: 'Account deleted',
      type: 'goal',
      story_id: 'US-004'
    }
    // Dead end: no "what happens after deletion" step (redirect, logout, etc.)
  ]
};

export const mockWorkflowWithCircularFlow = {
  steps: [
    {
      action: 'User fills form',
      outcome: 'Form valid',
      type: 'form',
      story_id: 'US-005'
    },
    {
      action: 'User clicks Submit',
      outcome: 'Validation error',
      type: 'interaction',
      story_id: 'US-005'
    },
    {
      action: 'User edits form',
      outcome: 'Returns to step 1',
      type: 'form',
      story_id: 'US-005'
    }
    // Circular: step 3 → step 1 → step 2 → step 3 (infinite loop possible)
  ]
};

export const mockWorkflowWithRegression = {
  current: {
    steps: [
      'User navigates to /support',
      'User submits ticket form',
      'User receives confirmation'
    ],
    routes: ['/support', '/dashboard']
  },
  new: {
    steps: [
      {
        action: 'Navigate to /dashboard',
        type: 'navigation'
      },
      {
        action: 'Click Support tab',
        type: 'interaction'
      },
      {
        action: 'Submit ticket form',
        type: 'form'
      },
      {
        action: 'Receive confirmation',
        type: 'goal'
      }
    ]
  },
  expectedRegressions: [
    {
      type: 'navigation_pattern',
      severity: 'MEDIUM',
      existing_pattern: 'Direct /support access',
      new_pattern: 'Tab-based access via /dashboard',
      affected_users: 'Users with /support bookmarks'
    }
  ]
};

export const mockPRDData = {
  sd_uuid: 'SD-TEST-001',
  functional_requirements: `
    ## Customer Support Dashboard Redesign

    ### Current Workflow
    - User navigates directly to /support
    - User submits ticket through dedicated support page
    - User receives email confirmation

    ### New Workflow
    - User navigates to unified /dashboard
    - User selects Support tab from dashboard navigation
    - User submits ticket through embedded support form
    - User receives in-app toast confirmation + email

    ### Changes
    - Consolidate /support into /dashboard?tab=support
    - Add tab-based navigation (Orders, Support, Profile)
    - Embed support form into dashboard layout
  `,
  acceptance_criteria: [
    'Dashboard loads in <2s',
    'Support tab accessible via keyboard navigation',
    'Form validation works identically to old /support page',
    'Email confirmation still sent',
    'Old /support route redirects to /dashboard?tab=support'
  ]
};

export const mockCurrentWorkflow = {
  steps: [
    'User navigates to /support',
    'User fills support form',
    'User submits ticket',
    'User receives email confirmation'
  ],
  routes: ['/support', '/dashboard', '/profile']
};

export const mockExpectedAnalysisPass = {
  version: '1.0.0',
  status: 'PASS',
  ux_impact_score: 7.5,
  ux_score_breakdown: {
    efficiency: 8.0,
    learnability: 7.5,
    satisfaction: 7.0,
    consistency: 7.5
  },
  workflow_delta: {
    current_flow: [
      'User navigates to /support',
      'User fills support form',
      'User submits ticket',
      'User receives email confirmation'
    ],
    new_flow: [
      'Navigate to /dashboard',
      'Click Support tab',
      'Submit ticket form',
      'Receive confirmation'
    ],
    added_steps: ['Click Support tab'],
    removed_steps: [],
    modified_steps: [],
    step_count_delta: 0
  },
  interaction_impact: {
    affected_touchpoints: [
      {
        component: 'MainNavigation',
        action: 'route_removal',
        change_type: 'removed',
        impact_level: 'HIGH',
        details: '/support route removed'
      },
      {
        component: 'DashboardTabs',
        action: 'tab_click',
        change_type: 'added',
        impact_level: 'MEDIUM',
        details: 'New Support tab added'
      }
    ],
    navigation_impact: {
      added_routes: [],
      removed_routes: ['/support'],
      modified_routes: [],
      requires_redirects: true
    },
    regressions_detected: [
      {
        type: 'navigation_pattern',
        severity: 'MEDIUM',
        existing_pattern: 'Direct /support access',
        new_pattern: 'Tab-based access',
        affected_users: 'Users with /support bookmarks',
        recommendation: 'Add redirect: /support → /dashboard?tab=support'
      }
    ]
  },
  validation_results: {
    dead_ends: [],
    circular_flows: [],
    unreachable_states: [],
    graph_metrics: {
      total_nodes: 4,
      total_edges: 3,
      average_path_length: 0.75,
      max_path_depth: 4,
      goal_nodes: 1
    }
  },
  recommendations: [
    {
      priority: 'HIGH',
      category: 'navigation',
      action: 'Add redirect: /support → /dashboard?tab=support',
      rationale: 'Preserve user bookmarks and muscle memory'
    }
  ],
  quality_gate_status: {
    workflow_validation: 'PASS',
    ux_score_threshold: 'PASS',
    regression_mitigation: 'CONDITIONAL',
    test_coverage: 'PENDING',
    overall: 'CONDITIONAL_PASS',
    overall_score: 0.87
  }
};

export const mockExpectedAnalysisFail = {
  version: '1.0.0',
  status: 'FAIL',
  ux_impact_score: 4.2,
  ux_score_breakdown: {
    efficiency: 5.0,
    learnability: 4.0,
    satisfaction: 3.0,
    consistency: 5.0
  },
  workflow_delta: {
    current_flow: [
      'User adds items to cart',
      'User clicks Checkout',
      'User enters payment info',
      'User confirms order'
    ],
    new_flow: [
      'Add items to cart',
      'Click Checkout',
      'Select shipping method',
      'Enter payment info',
      'Review order',
      'Confirm order'
    ],
    added_steps: ['Select shipping method', 'Review order'],
    removed_steps: [],
    modified_steps: [],
    step_count_delta: 2
  },
  validation_results: {
    dead_ends: [
      {
        node_id: 'state_payment_error',
        label: 'Payment error state',
        severity: 'HIGH',
        description: 'User reaches payment error but has no way to retry or return to cart'
      },
      {
        node_id: 'state_shipping_unavailable',
        label: 'Shipping unavailable state',
        severity: 'MEDIUM',
        description: 'User sees shipping unavailable message but cannot proceed or go back'
      }
    ],
    circular_flows: [
      {
        path: ['state_review', 'state_payment', 'state_review'],
        severity: 'MEDIUM',
        description: 'User can loop between review and payment indefinitely'
      }
    ],
    unreachable_states: [],
    graph_metrics: {
      total_nodes: 12,
      total_edges: 15,
      average_path_length: 1.25,
      max_path_depth: 12,
      goal_nodes: 1
    }
  },
  recommendations: [
    {
      priority: 'CRITICAL',
      category: 'workflow',
      action: 'Add Retry Payment button to payment error state',
      rationale: 'Prevents dead end that blocks users from completing checkout',
      implementation: 'Add <Button onClick={retryPayment}> in PaymentErrorState component'
    },
    {
      priority: 'CRITICAL',
      category: 'workflow',
      action: 'Add Change Shipping link in shipping unavailable state',
      rationale: 'Provides escape path when preferred shipping method unavailable',
      implementation: 'Add navigation to /checkout/shipping with alternative options'
    },
    {
      priority: 'HIGH',
      category: 'workflow',
      action: 'Break review→payment circular flow with confirmation step',
      rationale: 'Prevents infinite loop; adds final confirmation',
      implementation: 'Add Confirm Order button in review step that disables further edits'
    }
  ],
  quality_gate_status: {
    workflow_validation: 'FAIL',
    ux_score_threshold: 'FAIL',
    regression_mitigation: 'N/A',
    test_coverage: 'BLOCKED',
    overall: 'BLOCKED',
    overall_score: 0.42
  }
};

export const mockInteractionGraph = {
  nodes: [
    { id: 'state_0', label: 'Navigate to /dashboard', type: 'page', story_id: 'US-001' },
    { id: 'state_1', label: 'Click Support tab', type: 'interaction', story_id: 'US-001' },
    { id: 'state_2', label: 'Fill form fields', type: 'form', story_id: 'US-002' },
    { id: 'state_3', label: 'Submit ticket', type: 'goal', story_id: 'US-002' }
  ],
  edges: [
    { from: 'state_0', to: 'state_1', action: 'Navigate to /dashboard' },
    { from: 'state_1', to: 'state_2', action: 'Click Support tab' },
    { from: 'state_2', to: 'state_3', action: 'Fill form fields' }
  ]
};

// Helper function to create test scenarios
export function createTestScenario(type = 'simple') {
  const scenarios = {
    simple: {
      userStories: mockUserStoriesSimple,
      currentWorkflow: {
        steps: ['User goes to dashboard'],
        routes: ['/dashboard']
      },
      expectedStatus: 'PASS',
      expectedScore: { min: 8.0, max: 10.0 }
    },
    complex: {
      userStories: mockUserStoriesComplex,
      currentWorkflow: mockCurrentWorkflow,
      expectedStatus: 'PASS',
      expectedScore: { min: 7.0, max: 9.0 }
    },
    deadEnd: {
      userStories: [
        {
          id: 'US-DEAD',
          description: 'Given user on settings, When clicks delete, Then account deleted',
          implementation_context: 'Navigate to /settings → Click delete → Confirm'
        }
      ],
      currentWorkflow: { steps: [], routes: [] },
      expectedStatus: 'FAIL',
      expectedDeadEnds: 1
    },
    circular: {
      userStories: [
        {
          id: 'US-CIRC',
          description: 'Given user on form, When submits with error, Then returns to form',
          implementation_context: 'Fill form → Submit → Error → Edit form'
        }
      ],
      currentWorkflow: { steps: [], routes: [] },
      expectedStatus: 'FAIL',
      expectedCircularFlows: 1
    },
    regression: {
      userStories: mockUserStoriesSimple,
      currentWorkflow: mockWorkflowWithRegression.current,
      expectedStatus: 'PASS',
      expectedRegressions: 1
    }
  };

  return scenarios[type] || scenarios.simple;
}
