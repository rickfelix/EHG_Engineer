/**
 * DESIGN Sub-Agent Workflow Detection
 * Issue detection, graph building, and workflow extraction
 *
 * Extracted from design.js for modularity
 * SD-LEO-REFACTOR-DESIGN-SUB-001
 */

import { getStepCount } from './utils.js';

/**
 * Extract workflow steps from user stories
 * Parses Given-When-Then format and implementation context
 */
export async function extractWorkflowFromStories(userStories) {
  const steps = [];

  for (const story of userStories) {
    // Parse Given-When-Then structure from description (if available)
    const gwtMatch = story.description?.match(/Given (.+?),?\s*When (.+?),?\s*Then (.+?)\.?$/i);
    if (gwtMatch) {
      const [_, given, when, then] = gwtMatch;
      steps.push({
        precondition: given.trim(),
        action: when.trim(),
        outcome: then.trim(),
        story_id: story.id,
        type: 'user_action'
      });
    } else if (story.user_role && story.user_want && story.user_benefit) {
      // Construct workflow step from standard user story format
      steps.push({
        precondition: `${story.user_role} on page`,
        action: story.user_want,
        outcome: story.user_benefit,
        story_id: story.id,
        type: 'user_action'
      });
    }

    // Parse implementation_context for UI interactions
    if (story.implementation_context) {
      const contextSteps = extractInteractionsFromContext(story.implementation_context);
      steps.push(...contextSteps.map(s => ({ ...s, story_id: story.id })));
    }
  }

  return { steps, total_steps: steps.length };
}

/**
 * Extract interaction steps from implementation context
 */
export function extractInteractionsFromContext(context) {
  const steps = [];

  // Look for navigation patterns: "Navigate to X"
  const navMatches = context.match(/Navigate\s+to\s+([^\s→,]+)/gi);
  if (navMatches) {
    navMatches.forEach(match => {
      const route = match.replace(/Navigate\s+to\s+/i, '').trim();
      steps.push({
        action: `Navigate to ${route}`,
        type: 'navigation'
      });
    });
  }

  // Look for click patterns: "Click X" or "click #id"
  const clickMatches = context.match(/Click\s+[#\w\s-]+/gi);
  if (clickMatches) {
    clickMatches.forEach(match => {
      steps.push({
        action: match.trim(),
        type: 'interaction'
      });
    });
  }

  // Look for form patterns: "Fill X" or "Submit Y"
  const formMatches = context.match(/(Fill|Submit|Enter)\s+[\w\s]+/gi);
  if (formMatches) {
    formMatches.forEach(match => {
      steps.push({
        action: match.trim(),
        type: 'form_interaction'
      });
    });
  }

  return steps;
}

/**
 * Build directed graph of user interactions
 */
export function buildInteractionGraph(workflow) {
  const graph = {
    nodes: [],
    edges: []
  };

  workflow.steps.forEach((step, index) => {
    const nodeId = `state_${index}`;
    const nodeType = inferStateType(step);

    graph.nodes.push({
      id: nodeId,
      label: step.action,
      type: nodeType,
      story_id: step.story_id
    });

    // Add edge to next state
    if (index < workflow.steps.length - 1) {
      graph.edges.push({
        from: nodeId,
        to: `state_${index + 1}`,
        action: step.action
      });
    }
  });

  return graph;
}

/**
 * Infer state type from step action
 */
export function inferStateType(step) {
  const action = step.action.toLowerCase();

  if (action.includes('navigate to') || action.includes('load')) {
    return 'page';
  }
  if (action.includes('submit') || action.includes('confirm') || action.includes('complete')) {
    return 'goal';
  }
  if (action.includes('click') || action.includes('select')) {
    return 'interaction';
  }
  if (action.includes('fill') || action.includes('enter')) {
    return 'form';
  }

  return 'state';
}

/**
 * Detect workflow issues (dead ends, circular flows, regressions, error recovery, etc.)
 *
 * Adaptive analysis based on depth: LIGHT (4 dimensions), STANDARD (8 dimensions), DEEP (12 dimensions)
 *
 * @param {Object} interactionGraph - Graph representation of workflow
 * @param {Object} currentWorkflow - Baseline workflow from SD
 * @param {Array<Object>} analysisDepths - Per-story depth analysis results
 * @param {Array<Object>} userStories - User stories being analyzed
 * @returns {Object} Detected issues across all dimensions
 */
export function detectWorkflowIssues(interactionGraph, currentWorkflow, analysisDepths = [], userStories = []) {
  // Determine max depth from all stories
  const maxDepth = analysisDepths.length > 0
    ? analysisDepths.reduce((max, d) => {
        const depthOrder = { 'LIGHT': 1, 'STANDARD': 2, 'DEEP': 3 };
        return depthOrder[d.depth] > depthOrder[max] ? d.depth : max;
      }, 'LIGHT')
    : 'STANDARD';

  const issues = {
    // Core dimensions (ALL depths)
    deadEnds: [],
    circularFlows: [],
    unreachableStates: [],
    regressions: [],

    // STANDARD + DEEP dimensions
    error_recovery: [],
    loading_states: [],
    confirmations: [],

    // DEEP only dimensions
    form_validation: [],
    state_management: [],
    permission_gates: [],
    accessibility: [],
    browser_controls: [],

    // Metadata
    navigation: {
      added_routes: [],
      removed_routes: [],
      modified_routes: [],
      requires_redirects: false
    },
    touchpoints: [],
    analysis_depth: maxDepth
  };

  // Detect dead ends (nodes with no outgoing edges except goal states)
  interactionGraph.nodes.forEach(node => {
    const outgoingEdges = interactionGraph.edges.filter(e => e.from === node.id);
    if (outgoingEdges.length === 0 && node.type !== 'goal') {
      const label = node.label.toLowerCase();
      // Don't flag common landing page patterns as dead ends
      const isLandingPage = /dashboard|home|overview|landing|main view|briefing|index|welcome/i.test(label);
      const isAppPage = /\/[\w/-]+/.test(label);

      if (!isLandingPage && !isAppPage) {
        issues.deadEnds.push({
          node_id: node.id,
          label: node.label,
          severity: 'HIGH',
          description: `User reaches "${node.label}" but has no way to proceed or return`
        });
      }
    }
  });

  // Detect circular flows (cycles in graph)
  const cycles = detectCycles(interactionGraph);
  issues.circularFlows = cycles.map(cycle => ({
    path: cycle,
    severity: cycle.length > 3 ? 'HIGH' : 'MEDIUM',
    description: `User can loop through ${cycle.length} states: ${cycle.join(' → ')}`
  }));

  // Detect navigation regressions
  if (currentWorkflow.routes && currentWorkflow.routes.length > 0) {
    const newRoutes = interactionGraph.nodes
      .filter(n => n.type === 'page')
      .map(n => {
        const match = n.label.match(/\/[\w/-]+/);
        return match ? match[0] : null;
      })
      .filter(r => r);

    const targetRoutes = userStories.flatMap(story => {
      const text = [
        story.title,
        story.user_want,
        story.user_benefit,
        story.implementation_context,
        ...(story.acceptance_criteria || [])
      ].join(' ');
      const matches = text.match(/\/[\w/-]+/g) || [];
      return matches;
    });

    const allTargetRoutes = [...targetRoutes, ...currentWorkflow.routes];
    const targetRouteSet = new Set(allTargetRoutes);

    const removedRoutes = currentWorkflow.routes.filter(
      route => !newRoutes.includes(route) && !targetRouteSet.has(route)
    );

    if (removedRoutes.length > 0) {
      issues.navigation.removed_routes = removedRoutes;
      issues.navigation.requires_redirects = true;

      removedRoutes.forEach(route => {
        issues.regressions.push({
          type: 'navigation_pattern',
          severity: 'MEDIUM',
          existing_pattern: `Direct ${route} access`,
          new_pattern: 'Route removed or relocated',
          affected_users: `Users with ${route} bookmarks or direct links`,
          recommendation: `Add redirect: ${route} → [new location] or restore route`
        });
      });
    }
  }

  // STANDARD + DEEP: Error Recovery Analysis
  if (maxDepth === 'STANDARD' || maxDepth === 'DEEP') {
    interactionGraph.nodes.forEach(node => {
      if (node.type === 'form' || node.type === 'interaction') {
        const hasAction = /submit|save|update|delete|create/i.test(node.label);
        if (hasAction) {
          const outgoing = interactionGraph.edges.filter(e => e.from === node.id);
          const hasErrorPath = outgoing.some(e => /error|fail|retry|cancel/i.test(e.action));

          if (!hasErrorPath) {
            issues.error_recovery.push({
              node_id: node.id,
              label: node.label,
              severity: 'HIGH',
              description: `Action "${node.label}" has no error recovery path (retry/cancel)`,
              story_id: node.story_id
            });
          }
        }
      }
    });
  }

  // STANDARD + DEEP: Loading State Analysis
  if (maxDepth === 'STANDARD' || maxDepth === 'DEEP') {
    userStories.forEach(story => {
      const storyText = [
        story.title,
        story.implementation_context,
        (story.acceptance_criteria || []).join(' ')
      ].join(' ').toLowerCase();

      const hasAsync = /fetch|api|load|query|async|await/i.test(storyText);
      const hasLoadingState = /loading|spinner|skeleton|indicator/i.test(storyText);

      if (hasAsync && !hasLoadingState) {
        issues.loading_states.push({
          story_id: story.id || story.story_key,
          severity: 'MEDIUM',
          description: 'Async operation detected but no loading state specified',
          recommendation: 'Add loading indicator to acceptance criteria'
        });
      }
    });
  }

  // STANDARD + DEEP: Confirmation Pattern Analysis
  if (maxDepth === 'STANDARD' || maxDepth === 'DEEP') {
    userStories.forEach(story => {
      const storyText = [
        story.title,
        story.user_want,
        story.implementation_context
      ].join(' ').toLowerCase();

      const isDestructive = /delete|remove|cancel.*subscription|deactivate|purge|destroy/i.test(storyText);
      const hasConfirmation = /confirm|confirmation|are you sure|modal|dialog/i.test(storyText) ||
        (story.acceptance_criteria || []).some(c => /confirm/i.test(c));

      if (isDestructive && !hasConfirmation) {
        issues.confirmations.push({
          story_id: story.id || story.story_key,
          severity: 'HIGH',
          description: `Destructive action "${story.title}" missing confirmation step`,
          recommendation: 'Add confirmation dialog to acceptance criteria'
        });
      }
    });
  }

  // DEEP ONLY: Form Validation Analysis
  if (maxDepth === 'DEEP') {
    userStories.forEach(story => {
      const storyText = [
        story.title,
        story.implementation_context,
        (story.acceptance_criteria || []).join(' ')
      ].join(' ').toLowerCase();

      const hasForm = /form|input|field|submit|validation/i.test(storyText);
      const hasValidationTiming = /inline|on-blur|on-submit|real-time|instant/i.test(storyText);

      if (hasForm && !hasValidationTiming) {
        const fieldCount = (storyText.match(/field|input/gi) || []).length;
        if (fieldCount >= 3) {
          issues.form_validation.push({
            story_id: story.id || story.story_key,
            severity: 'MEDIUM',
            description: `Form validation timing not specified (${fieldCount} fields detected)`,
            recommendation: 'Specify when validation occurs: inline, on-blur, or on-submit'
          });
        }
      }
    });
  }

  // DEEP ONLY: State Management Analysis
  if (maxDepth === 'DEEP') {
    const multiStepStories = userStories.filter(story => {
      const stepCount = getStepCount(story);
      return stepCount > 3;
    });

    multiStepStories.forEach(story => {
      const storyText = [
        story.implementation_context,
        (story.acceptance_criteria || []).join(' ')
      ].join(' ').toLowerCase();

      const hasRefreshHandling = /refresh|reload|persist|session|draft/i.test(storyText);
      const hasBackHandling = /back button|browser back|navigation/i.test(storyText);

      if (!hasRefreshHandling) {
        issues.state_management.push({
          story_id: story.id || story.story_key,
          severity: 'MEDIUM',
          type: 'refresh_behavior',
          description: 'Multi-step flow: page refresh behavior not specified',
          recommendation: 'Define what happens if user refreshes during flow'
        });
      }

      if (!hasBackHandling) {
        issues.state_management.push({
          story_id: story.id || story.story_key,
          severity: 'LOW',
          type: 'back_button',
          description: 'Multi-step flow: browser back button behavior not specified',
          recommendation: 'Define browser back/forward button behavior'
        });
      }
    });
  }

  // DEEP ONLY: Accessibility Analysis
  if (maxDepth === 'DEEP') {
    userStories.forEach(story => {
      const storyText = [
        story.title,
        story.implementation_context,
        (story.acceptance_criteria || []).join(' ')
      ].join(' ').toLowerCase();

      const hasInteraction = /click|select|choose|navigate|toggle/i.test(storyText);
      const hasA11y = /keyboard|tab|aria|screen reader|accessibility|a11y/i.test(storyText);

      if (hasInteraction && !hasA11y) {
        const priority = story.priority;
        if (priority === 'high' || priority === 'critical') {
          issues.accessibility.push({
            story_id: story.id || story.story_key,
            severity: 'MEDIUM',
            description: 'Interactive element: keyboard navigation not specified',
            recommendation: 'Add keyboard navigation to acceptance criteria'
          });
        }
      }
    });
  }

  return issues;
}

/**
 * Detect cycles in interaction graph using DFS
 */
export function detectCycles(graph) {
  const visited = new Set();
  const recursionStack = new Set();
  const cycles = [];

  function dfs(nodeId, path) {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const outgoingEdges = graph.edges.filter(e => e.from === nodeId);
    for (const edge of outgoingEdges) {
      if (!visited.has(edge.to)) {
        dfs(edge.to, [...path]);
      } else if (recursionStack.has(edge.to)) {
        const cycleStart = path.indexOf(edge.to);
        if (cycleStart >= 0) {
          cycles.push(path.slice(cycleStart));
        }
      }
    }

    recursionStack.delete(nodeId);
  }

  graph.nodes.forEach(node => {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  });

  return cycles;
}
