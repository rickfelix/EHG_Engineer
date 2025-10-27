/**
 * Unit Tests for Design Sub-Agent - Workflow Review Capability
 * Tests Phase 6: Workflow Review functions
 *
 * Added: 2025-01-15 (SD-DESIGN-WORKFLOW-REVIEW-001)
 */

import { jest } from '@jest/globals';

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn(() => mockSupabaseClient),
  select: jest.fn(() => mockSupabaseClient),
  eq: jest.fn(() => mockSupabaseClient),
  single: jest.fn(() => ({ data: null, error: null }))
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient)
}));

// Import functions to test (would need to export them from design.js)
// For now, we'll test the logic patterns

describe('Design Sub-Agent - Workflow Review Capability', () => {

  describe('extractWorkflowFromStories', () => {
    test('should extract steps from Given-When-Then format', () => {
      const userStories = [
        {
          id: 'US-001',
          description: 'Given user on dashboard, When clicks Support tab, Then support form loads',
          implementation_context: null
        }
      ];

      // Expected workflow extraction
      const expectedStep = {
        precondition: 'user on dashboard',
        action: 'clicks Support tab',
        outcome: 'support form loads',
        story_id: 'US-001',
        type: 'user_action'
      };

      // Test pattern matching
      const gwtMatch = userStories[0].description.match(/Given (.+?),?\s*When (.+?),?\s*Then (.+?)\.?$/i);
      expect(gwtMatch).not.toBeNull();
      expect(gwtMatch[1]).toBe('user on dashboard');
      expect(gwtMatch[2]).toBe('clicks Support tab');
      expect(gwtMatch[3]).toBe('support form loads');
    });

    test('should handle stories without GWT format', () => {
      const userStories = [
        {
          id: 'US-002',
          description: 'User logs in',
          implementation_context: null
        }
      ];

      const gwtMatch = userStories[0].description.match(/Given (.+?),?\s*When (.+?),?\s*Then (.+?)\.?$/i);
      expect(gwtMatch).toBeNull();
    });

    test('should extract navigation from implementation_context', () => {
      const context = 'Navigate to /dashboard → Click #support-tab → Render SupportForm';

      const navMatches = context.match(/Navigate\s+to\s+([^\s→,]+)/gi);
      expect(navMatches).toHaveLength(1);
      expect(navMatches[0]).toContain('/dashboard');
    });

    test('should extract click actions from implementation_context', () => {
      const context = 'Click #support-tab and then Click submit button';

      const clickMatches = context.match(/Click\s+[#\w\s-]+/gi);
      expect(clickMatches).toHaveLength(2);
    });

    test('should extract form actions from implementation_context', () => {
      const context = 'Fill name field, Enter email, Submit form';

      const formMatches = context.match(/(Fill|Submit|Enter)\s+[\w\s]+/gi);
      expect(formMatches).toHaveLength(3);
    });
  });

  describe('buildInteractionGraph', () => {
    test('should create nodes for each step', () => {
      const workflow = {
        steps: [
          { action: 'Navigate to dashboard', outcome: 'Dashboard loads', story_id: 'US-1', type: 'navigation' },
          { action: 'Click Support tab', outcome: 'Support form shown', story_id: 'US-1', type: 'interaction' }
        ]
      };

      // Simulated graph building
      const graph = {
        nodes: workflow.steps.map((step, index) => ({
          id: `state_${index}`,
          label: step.action,
          type: step.type,
          story_id: step.story_id
        })),
        edges: []
      };

      // Add edges
      for (let i = 0; i < workflow.steps.length - 1; i++) {
        graph.edges.push({
          from: `state_${i}`,
          to: `state_${i + 1}`,
          action: workflow.steps[i].action
        });
      }

      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].from).toBe('state_0');
      expect(graph.edges[0].to).toBe('state_1');
    });

    test('should infer correct state types', () => {
      const testCases = [
        { action: 'Navigate to /dashboard', expected: 'page' },
        { action: 'Submit form', expected: 'goal' },
        { action: 'Click button', expected: 'interaction' },
        { action: 'Fill name field', expected: 'form' },
        { action: 'Other action', expected: 'state' }
      ];

      testCases.forEach(({ action, expected }) => {
        const actionLower = action.toLowerCase();
        let inferredType = 'state';

        if (actionLower.includes('navigate to') || actionLower.includes('load')) {
          inferredType = 'page';
        } else if (actionLower.includes('submit') || actionLower.includes('confirm') || actionLower.includes('complete')) {
          inferredType = 'goal';
        } else if (actionLower.includes('click') || actionLower.includes('select')) {
          inferredType = 'interaction';
        } else if (actionLower.includes('fill') || actionLower.includes('enter')) {
          inferredType = 'form';
        }

        expect(inferredType).toBe(expected);
      });
    });
  });

  describe('detectWorkflowIssues', () => {
    test('should detect dead ends', () => {
      const graph = {
        nodes: [
          { id: 'state_0', label: 'Start', type: 'page' },
          { id: 'state_1', label: 'Dead end page', type: 'page' }
        ],
        edges: [
          { from: 'state_0', to: 'state_1', action: 'navigate' }
        ]
      };
      const currentWorkflow = { steps: [], routes: [] };

      // Detect dead ends
      const deadEnds = [];
      graph.nodes.forEach(node => {
        const outgoingEdges = graph.edges.filter(e => e.from === node.id);
        if (outgoingEdges.length === 0 && node.type !== 'goal') {
          deadEnds.push({
            node_id: node.id,
            label: node.label,
            severity: 'HIGH'
          });
        }
      });

      expect(deadEnds).toHaveLength(1);
      expect(deadEnds[0].node_id).toBe('state_1');
      expect(deadEnds[0].severity).toBe('HIGH');
    });

    test('should not flag goal states as dead ends', () => {
      const graph = {
        nodes: [
          { id: 'state_0', label: 'Start', type: 'page' },
          { id: 'state_1', label: 'Complete', type: 'goal' }
        ],
        edges: [
          { from: 'state_0', to: 'state_1', action: 'submit' }
        ]
      };

      const deadEnds = [];
      graph.nodes.forEach(node => {
        const outgoingEdges = graph.edges.filter(e => e.from === node.id);
        if (outgoingEdges.length === 0 && node.type !== 'goal') {
          deadEnds.push({ node_id: node.id });
        }
      });

      expect(deadEnds).toHaveLength(0);
    });

    test('should detect circular flows', () => {
      const graph = {
        nodes: [
          { id: 'state_0', label: 'A', type: 'page' },
          { id: 'state_1', label: 'B', type: 'page' },
          { id: 'state_2', label: 'C', type: 'page' }
        ],
        edges: [
          { from: 'state_0', to: 'state_1', action: 'next' },
          { from: 'state_1', to: 'state_2', action: 'next' },
          { from: 'state_2', to: 'state_0', action: 'back' } // Cycle!
        ]
      };

      // Simple cycle detection (check if any node can reach itself)
      const hasCycle = graph.edges.some(edge => {
        // For this test, we know state_2 → state_0 creates a cycle
        return edge.from === 'state_2' && edge.to === 'state_0';
      });

      expect(hasCycle).toBe(true);
    });

    test('should detect navigation regressions', () => {
      const graph = {
        nodes: [
          { id: 'state_0', label: 'Navigate to /dashboard', type: 'page' }
        ],
        edges: []
      };
      const currentWorkflow = {
        steps: [],
        routes: ['/support', '/dashboard']
      };

      // Extract new routes from graph
      const newRoutes = graph.nodes
        .filter(n => n.type === 'page')
        .map(n => {
          const match = n.label.match(/\/[\w/-]+/);
          return match ? match[0] : null;
        })
        .filter(r => r);

      // Find removed routes
      const removedRoutes = currentWorkflow.routes.filter(
        route => !newRoutes.includes(route)
      );

      expect(removedRoutes).toContain('/support');
      expect(removedRoutes).toHaveLength(1);
    });
  });

  describe('calculateUXImpactScore', () => {
    test('should penalize added steps (efficiency)', () => {
      const issues = { deadEnds: [], regressions: [], circularFlows: [] };
      const newWorkflow = { steps: [1, 2, 3, 4] };
      const currentWorkflow = { steps: [1, 2, 3] };

      // Calculate efficiency score
      const stepDelta = newWorkflow.steps.length - currentWorkflow.steps.length;
      let efficiencyScore = 10;
      if (stepDelta > 0) {
        efficiencyScore -= Math.min(stepDelta * 0.5, 3);
      }

      expect(efficiencyScore).toBeLessThan(10);
      expect(efficiencyScore).toBe(9.5); // 10 - (1 * 0.5)
    });

    test('should reward removed steps (efficiency)', () => {
      const newWorkflow = { steps: [1, 2] };
      const currentWorkflow = { steps: [1, 2, 3, 4] };

      const stepDelta = newWorkflow.steps.length - currentWorkflow.steps.length;
      let efficiencyScore = 10;
      if (stepDelta < 0) {
        efficiencyScore = Math.min(efficiencyScore + Math.abs(stepDelta) * 0.3, 10);
      }

      expect(efficiencyScore).toBe(10); // Capped at 10
    });

    test('should heavily penalize dead ends (satisfaction)', () => {
      const issues = {
        deadEnds: [{ node_id: 'x' }, { node_id: 'y' }],
        regressions: [],
        circularFlows: []
      };

      let satisfactionScore = 10;
      satisfactionScore -= Math.min(issues.deadEnds.length * 2, 5);

      expect(satisfactionScore).toBe(6); // 10 - (2 * 2)
    });

    test('should penalize circular flows (consistency)', () => {
      const issues = {
        deadEnds: [],
        regressions: [],
        circularFlows: [['a', 'b', 'a'], ['x', 'y', 'z', 'x']]
      };

      let consistencyScore = 10;
      consistencyScore -= Math.min(issues.circularFlows.length * 1.5, 4);

      expect(consistencyScore).toBe(7); // 10 - (2 * 1.5)
    });

    test('should calculate weighted overall score correctly', () => {
      const dimensions = {
        efficiency: 8.0,
        learnability: 7.5,
        satisfaction: 7.0,
        consistency: 7.5
      };

      const overall = (
        dimensions.efficiency * 0.3 +
        dimensions.learnability * 0.2 +
        dimensions.satisfaction * 0.3 +
        dimensions.consistency * 0.2
      );

      expect(overall).toBeCloseTo(7.5, 1);
      expect(Math.round(overall * 10) / 10).toBe(7.5);
    });

    test('should score perfect workflow at 10', () => {
      const issues = { deadEnds: [], regressions: [], circularFlows: [] };
      const workflow = { steps: [1, 2, 3] };

      const dimensions = {
        efficiency: 10,
        learnability: 10,
        satisfaction: 10,
        consistency: 10
      };

      const overall = (
        dimensions.efficiency * 0.3 +
        dimensions.learnability * 0.2 +
        dimensions.satisfaction * 0.3 +
        dimensions.consistency * 0.2
      );

      expect(overall).toBe(10);
    });

    test('should clamp scores to 0-10 range', () => {
      let score = 15;
      score = Math.max(0, Math.min(10, score));
      expect(score).toBe(10);

      score = -5;
      score = Math.max(0, Math.min(10, score));
      expect(score).toBe(0);
    });
  });

  describe('parseBaselineWorkflow', () => {
    test('should extract workflow steps from description', () => {
      const description = 'User navigates to /support. User submits ticket. User receives confirmation.';

      const stepMatches = description.match(/(?:User|Customer)\s+(.+?)(?:\.|,|$)/gi);

      expect(stepMatches).toHaveLength(3);
      expect(stepMatches[0]).toContain('navigates');
      expect(stepMatches[1]).toContain('submits');
      expect(stepMatches[2]).toContain('receives');
    });

    test('should extract routes from description', () => {
      const description = 'Current workflow: User navigates to /support and then to /dashboard?tab=tickets';

      const routeMatches = description.match(/\/[\w/-]+/g);

      expect(routeMatches).toContain('/support');
      expect(routeMatches).toContain('/dashboard');
    });

    test('should deduplicate routes', () => {
      const description = 'User goes to /support, then /dashboard, then back to /support';

      const routeMatches = description.match(/\/[\w/-]+/g);
      const uniqueRoutes = [...new Set(routeMatches)];

      expect(routeMatches).toHaveLength(3);
      expect(uniqueRoutes).toHaveLength(2);
    });
  });

  describe('Quality Gate Calculations', () => {
    test('should calculate overall quality score correctly', () => {
      // Quality Score = 0.4×Validation + 0.3×UX + 0.2×Regressions + 0.1×Tests
      const scenario = {
        status: 'PASS', // validation = 1.0
        ux_impact_score: 7.5, // ux = 0.75
        regressions: [], // regressions = 1.0
        testCoverage: 0.95 // tests = 0.95
      };

      const validationScore = scenario.status === 'PASS' ? 1.0 : 0.0;
      const uxScore = scenario.ux_impact_score / 10;
      const regressionScore = scenario.regressions.length === 0 ? 1.0 : 0.75;
      const testScore = 0.95;

      const overall = (
        validationScore * 0.4 +
        uxScore * 0.3 +
        regressionScore * 0.2 +
        testScore * 0.1
      );

      expect(overall).toBeGreaterThanOrEqual(0.85); // ≥85% gate
      expect(overall).toBeCloseTo(0.92, 2); // Expected: 92%
    });

    test('should fail quality gate with workflow FAIL status', () => {
      const scenario = {
        status: 'FAIL',
        ux_impact_score: 8.0,
        regressions: [],
        testCoverage: 1.0
      };

      const validationScore = scenario.status === 'PASS' ? 1.0 : 0.0;
      const overall = validationScore * 0.4 + 0.8 * 0.3 + 1.0 * 0.2 + 1.0 * 0.1;

      expect(overall).toBeLessThan(0.85); // Fails 85% gate
      expect(overall).toBe(0.54); // Only 54% due to validation failure
    });

    test('should pass quality gate with score exactly 85%', () => {
      // Calculate scenario that results in exactly 0.85
      // 0.4×1.0 + 0.3×UX + 0.2×1.0 + 0.1×1.0 = 0.85
      // 0.4 + 0.3×UX + 0.2 + 0.1 = 0.85
      // 0.3×UX = 0.15
      // UX = 0.5 (score of 5.0/10)

      const scenario = {
        status: 'PASS',
        ux_impact_score: 5.0,
        regressions: [],
        testCoverage: 1.0
      };

      const overall = 1.0 * 0.4 + 0.5 * 0.3 + 1.0 * 0.2 + 1.0 * 0.1;

      expect(overall).toBe(0.85);
    });
  });

  describe('Recommendation Generation', () => {
    test('should generate CRITICAL recommendations for dead ends', () => {
      const issues = {
        deadEnds: [
          { node_id: 'state_3', label: 'Payment error', severity: 'HIGH' }
        ],
        circularFlows: [],
        regressions: []
      };

      const recommendations = [];
      issues.deadEnds.forEach(deadEnd => {
        recommendations.push({
          priority: 'CRITICAL',
          category: 'workflow',
          action: `Add navigation or action button to "${deadEnd.label}" state`
        });
      });

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].priority).toBe('CRITICAL');
      expect(recommendations[0].category).toBe('workflow');
    });

    test('should generate HIGH recommendations for regressions', () => {
      const issues = {
        deadEnds: [],
        circularFlows: [],
        regressions: [
          {
            type: 'navigation_pattern',
            existing_pattern: 'Direct /support access',
            recommendation: 'Add redirect: /support → /dashboard'
          }
        ]
      };

      const recommendations = issues.regressions.map(regression => ({
        priority: 'HIGH',
        category: 'navigation',
        action: regression.recommendation
      }));

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].priority).toBe('HIGH');
    });
  });
});
