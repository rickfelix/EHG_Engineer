/**
 * USER STORY DEPENDENCY VALIDATION (US-003)
 *
 * LEO Protocol v4.3.4 Enhancement - Addresses Genesis PRD Review feedback:
 * "Story dependencies are rarely validated for feasibility"
 *
 * Validates that user story dependencies form valid DAGs (no circular dependencies)
 * and that all referenced dependencies exist.
 *
 * @module user-story-dependency-validation
 * @version 1.0.0
 * @see SD-LEO-PROTOCOL-V434-001
 */

/**
 * Build a directed dependency graph from stories
 * @param {Array} stories - Array of user story objects
 * @returns {Object} { nodes: Map, edges: Map, orphans: Set }
 */
export function buildDependencyGraph(stories) {
  const nodes = new Map(); // story_id -> story
  const edges = new Map(); // story_id -> Set of dependency story_ids
  const orphans = new Set(); // story_ids that don't exist

  // First pass: collect all story IDs
  for (const story of stories) {
    const storyId = story.story_key || story.id;
    nodes.set(storyId, story);
    edges.set(storyId, new Set());
  }

  // Second pass: build edges from dependencies
  for (const story of stories) {
    const storyId = story.story_key || story.id;
    const dependencies = extractDependencies(story);

    for (const depId of dependencies) {
      if (nodes.has(depId)) {
        // Valid dependency - add edge
        edges.get(storyId).add(depId);
      } else {
        // Orphan dependency - doesn't exist in this story set
        orphans.add(depId);
      }
    }
  }

  return { nodes, edges, orphans };
}

/**
 * Extract dependency IDs from a story
 * Checks multiple fields: dependencies, blocked_by, depends_on
 * @param {Object} story - User story object
 * @returns {string[]} Array of dependency story IDs
 */
export function extractDependencies(story) {
  const dependencies = new Set();

  // Check direct dependencies array
  if (Array.isArray(story.dependencies)) {
    for (const dep of story.dependencies) {
      if (typeof dep === 'string') {
        dependencies.add(dep);
      } else if (dep?.story_id || dep?.id) {
        dependencies.add(dep.story_id || dep.id);
      }
    }
  }

  // Check blocked_by field
  if (Array.isArray(story.blocked_by)) {
    for (const dep of story.blocked_by) {
      if (typeof dep === 'string') {
        dependencies.add(dep);
      } else if (dep?.story_id || dep?.id) {
        dependencies.add(dep.story_id || dep.id);
      }
    }
  }

  // Check depends_on field
  if (Array.isArray(story.depends_on)) {
    for (const dep of story.depends_on) {
      if (typeof dep === 'string') {
        dependencies.add(dep);
      } else if (dep?.story_id || dep?.id) {
        dependencies.add(dep.story_id || dep.id);
      }
    }
  }

  // Check implementation_context for mentions
  if (story.implementation_context) {
    const contextText = typeof story.implementation_context === 'string'
      ? story.implementation_context
      : JSON.stringify(story.implementation_context);

    // Pattern: "depends on US-XXX" or "after US-XXX" or "requires US-XXX"
    const patterns = [
      /(?:depends?\s+on|after|requires?|blocked\s+by)\s+(US-[A-Z0-9-]+)/gi,
      /\b(US-[A-Z0-9]+-\d+)\b/g  // Match story key format
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(contextText)) !== null) {
        const depId = match[1];
        // Don't add self-references
        const storyId = story.story_key || story.id;
        if (depId !== storyId) {
          dependencies.add(depId);
        }
      }
    }
  }

  return Array.from(dependencies);
}

/**
 * Detect circular dependencies using DFS
 * @param {Object} graph - Graph from buildDependencyGraph
 * @returns {Object} { hasCycles: boolean, cycles: Array<string[]> }
 */
export function detectCircularDependencies(graph) {
  const { edges } = graph;
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();
  const pathStack = [];

  function dfs(nodeId, path) {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const neighbors = edges.get(nodeId) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        const cycle = dfs(neighbor, [...path]);
        if (cycle) return cycle;
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle - extract cycle path
        const cycleStart = path.indexOf(neighbor);
        const cyclePath = path.slice(cycleStart);
        cyclePath.push(neighbor); // Complete the cycle
        cycles.push(cyclePath);
      }
    }

    recursionStack.delete(nodeId);
    return null;
  }

  // Run DFS from each node
  for (const nodeId of edges.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId, []);
    }
  }

  return {
    hasCycles: cycles.length > 0,
    cycles
  };
}

/**
 * Compute topological order (execution sequence)
 * @param {Object} graph - Graph from buildDependencyGraph
 * @returns {string[]|null} Topological order or null if cycles exist
 */
export function getTopologicalOrder(graph) {
  const { edges, nodes } = graph;
  const inDegree = new Map();
  const result = [];

  // Initialize in-degrees
  for (const nodeId of nodes.keys()) {
    inDegree.set(nodeId, 0);
  }

  // Calculate in-degrees
  for (const [nodeId, deps] of edges) {
    for (const dep of deps) {
      if (inDegree.has(dep)) {
        // This node depends on dep, so dep must come first
        // Actually, edges point TO dependencies, so we need reverse
      }
    }
  }

  // Reverse the perspective: count incoming edges
  for (const [nodeId, deps] of edges) {
    for (const dep of deps) {
      if (nodes.has(dep)) {
        inDegree.set(nodeId, (inDegree.get(nodeId) || 0) + 1);
      }
    }
  }

  // Start with nodes that have no dependencies
  const queue = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  // Process queue (Kahn's algorithm)
  while (queue.length > 0) {
    const current = queue.shift();
    result.push(current);

    // Find nodes that depend on current
    for (const [nodeId, deps] of edges) {
      if (deps.has(current)) {
        inDegree.set(nodeId, inDegree.get(nodeId) - 1);
        if (inDegree.get(nodeId) === 0) {
          queue.push(nodeId);
        }
      }
    }
  }

  // Check if all nodes were processed
  if (result.length !== nodes.size) {
    return null; // Cycle exists
  }

  return result;
}

/**
 * Validate story dependencies
 * @param {Array} stories - Array of user story objects
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateStoryDependencies(stories, options = {}) {
  const result = {
    valid: true,
    passed: true,
    score: 100,
    issues: [],
    warnings: [],
    details: {
      total_stories: stories.length,
      stories_with_dependencies: 0,
      total_dependencies: 0,
      orphan_dependencies: [],
      circular_dependencies: [],
      execution_order: null
    }
  };

  if (!stories || stories.length === 0) {
    result.warnings.push('No user stories to validate');
    return result;
  }

  // Build dependency graph
  const graph = buildDependencyGraph(stories);

  // Count stories with dependencies
  for (const [storyId, deps] of graph.edges) {
    if (deps.size > 0) {
      result.details.stories_with_dependencies++;
      result.details.total_dependencies += deps.size;
    }
  }

  // Check for orphan dependencies (references to non-existent stories)
  if (graph.orphans.size > 0) {
    result.details.orphan_dependencies = Array.from(graph.orphans);
    result.issues.push(
      `Found ${graph.orphans.size} orphan dependencies (stories not in this SD): ${Array.from(graph.orphans).join(', ')}`
    );
    result.score -= 10 * graph.orphans.size;
  }

  // Check for circular dependencies
  const cycleCheck = detectCircularDependencies(graph);
  if (cycleCheck.hasCycles) {
    result.details.circular_dependencies = cycleCheck.cycles;
    for (const cycle of cycleCheck.cycles) {
      result.issues.push(`Circular dependency detected: ${cycle.join(' → ')}`);
    }
    result.score -= 30 * cycleCheck.cycles.length;
    result.valid = false;
    result.passed = false;
  }

  // Generate execution order if no cycles
  if (!cycleCheck.hasCycles) {
    result.details.execution_order = getTopologicalOrder(graph);
  }

  // Check for deep dependency chains (warning if > 5 levels)
  const maxDepth = computeMaxDependencyDepth(graph);
  if (maxDepth > 5) {
    result.warnings.push(
      `Deep dependency chain detected (${maxDepth} levels). Consider parallelizing independent stories.`
    );
    result.score -= 5;
  }

  // Ensure score bounds
  result.score = Math.max(0, Math.min(100, result.score));

  // Determine pass/fail (60% threshold for dependencies)
  if (result.score < 60) {
    result.valid = false;
    result.passed = false;
  }

  return result;
}

/**
 * Compute maximum dependency depth in the graph
 * @param {Object} graph - Graph from buildDependencyGraph
 * @returns {number} Maximum depth
 */
function computeMaxDependencyDepth(graph) {
  const { edges, nodes } = graph;
  const depths = new Map();

  function getDepth(nodeId, visited = new Set()) {
    if (depths.has(nodeId)) {
      return depths.get(nodeId);
    }

    if (visited.has(nodeId)) {
      return 0; // Cycle detected, avoid infinite recursion
    }

    visited.add(nodeId);
    const deps = edges.get(nodeId) || new Set();

    if (deps.size === 0) {
      depths.set(nodeId, 0);
      return 0;
    }

    let maxChildDepth = 0;
    for (const dep of deps) {
      if (nodes.has(dep)) {
        const childDepth = getDepth(dep, new Set(visited));
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      }
    }

    const depth = maxChildDepth + 1;
    depths.set(nodeId, depth);
    return depth;
  }

  let maxDepth = 0;
  for (const nodeId of nodes.keys()) {
    const depth = getDepth(nodeId);
    maxDepth = Math.max(maxDepth, depth);
  }

  return maxDepth;
}

/**
 * Get improvement guidance for dependency issues
 * @param {Object} validationResult - Result from validateStoryDependencies
 * @returns {Object} Improvement guidance
 */
export function getDependencyImprovementGuidance(validationResult) {
  const guidance = {
    required: [],
    recommended: [],
    timeEstimate: '15-30 minutes',
    instructions: ''
  };

  if (validationResult.details.circular_dependencies?.length > 0) {
    guidance.required.push('Break circular dependencies by restructuring story dependencies');
    for (const cycle of validationResult.details.circular_dependencies) {
      guidance.required.push(`  Fix cycle: ${cycle.join(' → ')}`);
    }
  }

  if (validationResult.details.orphan_dependencies?.length > 0) {
    guidance.required.push('Resolve orphan dependencies - either add missing stories or remove invalid references');
    for (const orphan of validationResult.details.orphan_dependencies) {
      guidance.required.push(`  Missing: ${orphan}`);
    }
  }

  if (validationResult.warnings?.some(w => w.includes('Deep dependency'))) {
    guidance.recommended.push('Consider parallelizing independent stories to reduce dependency chain depth');
  }

  guidance.instructions =
    `Dependency validation score: ${validationResult.score}%. ` +
    `Found ${validationResult.details.total_dependencies} total dependencies across ` +
    `${validationResult.details.stories_with_dependencies} stories. ` +
    'Ensure all dependencies form a valid DAG (directed acyclic graph).';

  return guidance;
}

export default {
  buildDependencyGraph,
  extractDependencies,
  detectCircularDependencies,
  getTopologicalOrder,
  validateStoryDependencies,
  getDependencyImprovementGuidance
};
