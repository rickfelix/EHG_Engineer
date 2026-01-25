#!/usr/bin/env node
/**
 * Dependency Graph Library
 *
 * Provides topological sorting and cycle detection for Strategic Directives.
 * Used by the intelligent baseline generator to ensure valid execution ordering.
 *
 * Features:
 * - Build directed acyclic graph (DAG) from SD dependencies
 * - Topological sort using Kahn's algorithm
 * - Cycle detection with path reporting
 * - Priority-aware ordering within topological constraints
 *
 * Usage:
 *   import { buildGraph, topologicalSort, detectCycles } from './dependency-graph.js';
 *
 *   const graph = buildGraph(sds);
 *   const cycles = detectCycles(graph);
 *   const ordering = topologicalSortByPriority(graph, priorityScores);
 */

/**
 * Parse dependencies from various formats
 * @param {any} dependencies - Raw dependencies field
 * @returns {string[]} Array of SD IDs
 */
export function parseDependencies(dependencies) {
  if (!dependencies) return [];

  let deps = [];

  if (typeof dependencies === 'string') {
    try {
      deps = JSON.parse(dependencies);
    } catch {
      // Try comma-separated format
      deps = dependencies.split(',').map(d => d.trim()).filter(Boolean);
    }
  } else if (Array.isArray(dependencies)) {
    deps = dependencies;
  }

  // Extract SD IDs from various formats
  return deps
    .map(dep => {
      if (typeof dep === 'string') {
        // Match "SD-XXX" or "SD-XXX (description)"
        const match = dep.match(/^(SD-[A-Z0-9-]+)/);
        return match ? match[1] : null;
      }
      if (dep && typeof dep === 'object') {
        // Object format: { sd_id: "SD-XXX" } or { sd_key: "SD-XXX" } or { id: "SD-XXX" }
        const id = dep.sd_id || dep.sd_key || dep.id;
        if (id && id.match(/^SD-[A-Z0-9-]+/)) {
          return id;
        }
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Build a directed graph from Strategic Directives
 * @param {Array} sds - Array of SD objects with sd_key and dependencies
 * @returns {Object} Graph with adjacency list and metadata
 */
export function buildGraph(sds) {
  const graph = {
    nodes: new Map(),      // SD ID -> { sd, inDegree, outEdges }
    edges: [],             // Array of { from, to }
    sdMap: new Map(),      // Quick lookup by sd_key
  };

  // Initialize nodes
  for (const sd of sds) {
    const id = sd.sd_key || sd.id;
    graph.nodes.set(id, {
      sd,
      inDegree: 0,
      outEdges: [],
      inEdges: [],
    });
    graph.sdMap.set(id, sd);
  }

  // Build edges from dependencies
  for (const sd of sds) {
    const toId = sd.sd_key || sd.id;
    const deps = parseDependencies(sd.dependencies);

    for (const fromId of deps) {
      // Only add edge if the dependency exists in our graph
      if (graph.nodes.has(fromId)) {
        graph.edges.push({ from: fromId, to: toId });

        // Update node metadata
        const fromNode = graph.nodes.get(fromId);
        const toNode = graph.nodes.get(toId);

        fromNode.outEdges.push(toId);
        toNode.inEdges.push(fromId);
        toNode.inDegree++;
      }
    }
  }

  return graph;
}

/**
 * Detect cycles in the dependency graph using DFS
 * @param {Object} graph - Graph from buildGraph()
 * @returns {Array} Array of cycle paths (each path is array of SD IDs)
 */
export function detectCycles(graph) {
  const cycles = [];
  const visited = new Set();
  const recursionStack = new Set();
  const path = [];

  function dfs(nodeId) {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const node = graph.nodes.get(nodeId);
    if (node) {
      for (const neighbor of node.outEdges) {
        if (!visited.has(neighbor)) {
          const cycle = dfs(neighbor);
          if (cycle) return cycle;
        } else if (recursionStack.has(neighbor)) {
          // Found a cycle - extract the cycle path
          const cycleStart = path.indexOf(neighbor);
          const cyclePath = [...path.slice(cycleStart), neighbor];
          cycles.push(cyclePath);
          return cyclePath;
        }
      }
    }

    path.pop();
    recursionStack.delete(nodeId);
    return null;
  }

  for (const nodeId of graph.nodes.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  return cycles;
}

/**
 * Topological sort using Kahn's algorithm
 * Returns nodes in dependency order (dependencies come first)
 * @param {Object} graph - Graph from buildGraph()
 * @returns {string[]} Array of SD IDs in topological order
 */
export function topologicalSort(graph) {
  // Create working copy of inDegree counts
  const inDegree = new Map();
  for (const [id, node] of graph.nodes) {
    inDegree.set(id, node.inDegree);
  }

  // Initialize queue with nodes that have no dependencies
  const queue = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  const result = [];

  while (queue.length > 0) {
    const current = queue.shift();
    result.push(current);

    const node = graph.nodes.get(current);
    if (node) {
      for (const neighbor of node.outEdges) {
        const newDegree = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }
  }

  // Check if all nodes were processed (no cycles)
  if (result.length !== graph.nodes.size) {
    console.warn('Warning: Graph contains cycles - not all nodes processed');
  }

  return result;
}

/**
 * Topological sort with priority-aware ordering
 * When multiple nodes have no pending dependencies, choose by priority score
 * @param {Object} graph - Graph from buildGraph()
 * @param {Object} priorityScores - Map of SD ID -> priority score
 * @returns {string[]} Array of SD IDs in priority-aware topological order
 */
export function topologicalSortByPriority(graph, priorityScores) {
  // Create working copy of inDegree counts
  const inDegree = new Map();
  for (const [id, node] of graph.nodes) {
    inDegree.set(id, node.inDegree);
  }

  // Initialize with nodes that have no dependencies, sorted by priority
  const getScore = (id) => priorityScores[id] || 0;

  const available = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      available.push(id);
    }
  }
  // Sort by priority (highest first)
  available.sort((a, b) => getScore(b) - getScore(a));

  const result = [];

  while (available.length > 0) {
    // Take highest priority available node
    const current = available.shift();
    result.push(current);

    const node = graph.nodes.get(current);
    if (node) {
      const newlyAvailable = [];

      for (const neighbor of node.outEdges) {
        const newDegree = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          newlyAvailable.push(neighbor);
        }
      }

      // Add newly available nodes and re-sort by priority
      if (newlyAvailable.length > 0) {
        available.push(...newlyAvailable);
        available.sort((a, b) => getScore(b) - getScore(a));
      }
    }
  }

  return result;
}

/**
 * Get the dependency depth for each node (longest path to a root)
 * Useful for understanding SD hierarchy levels
 * @param {Object} graph - Graph from buildGraph()
 * @returns {Map} Map of SD ID -> depth (0 = no dependencies)
 */
export function getDependencyDepths(graph) {
  const depths = new Map();

  // Initialize all depths to 0
  for (const id of graph.nodes.keys()) {
    depths.set(id, 0);
  }

  // Process in topological order
  const order = topologicalSort(graph);

  for (const id of order) {
    const node = graph.nodes.get(id);
    if (node) {
      // My depth is max of my dependencies' depths + 1
      let maxParentDepth = -1;
      for (const parentId of node.inEdges) {
        const parentDepth = depths.get(parentId) || 0;
        maxParentDepth = Math.max(maxParentDepth, parentDepth);
      }
      depths.set(id, maxParentDepth + 1);
    }
  }

  return depths;
}

/**
 * Get all transitive dependencies for an SD
 * @param {Object} graph - Graph from buildGraph()
 * @param {string} sdId - SD ID to get dependencies for
 * @returns {Set} Set of all dependency SD IDs
 */
export function getTransitiveDependencies(graph, sdId) {
  const result = new Set();
  const visited = new Set();

  function dfs(nodeId) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = graph.nodes.get(nodeId);
    if (node) {
      for (const depId of node.inEdges) {
        result.add(depId);
        dfs(depId);
      }
    }
  }

  dfs(sdId);
  return result;
}

/**
 * Get all SDs that depend on this SD (directly or transitively)
 * @param {Object} graph - Graph from buildGraph()
 * @param {string} sdId - SD ID to get dependents for
 * @returns {Set} Set of all dependent SD IDs
 */
export function getTransitiveDependents(graph, sdId) {
  const result = new Set();
  const visited = new Set();

  function dfs(nodeId) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = graph.nodes.get(nodeId);
    if (node) {
      for (const depId of node.outEdges) {
        result.add(depId);
        dfs(depId);
      }
    }
  }

  dfs(sdId);
  return result;
}

/**
 * Print graph summary for debugging
 * @param {Object} graph - Graph from buildGraph()
 */
export function printGraphSummary(graph) {
  console.log('\nDependency Graph Summary:');
  console.log('═'.repeat(50));
  console.log(`  Nodes: ${graph.nodes.size}`);
  console.log(`  Edges: ${graph.edges.length}`);

  const depths = getDependencyDepths(graph);
  const maxDepth = Math.max(...depths.values());
  console.log(`  Max Depth: ${maxDepth}`);

  console.log('\n  By Depth:');
  for (let d = 0; d <= maxDepth; d++) {
    const nodesAtDepth = [...depths.entries()].filter(([_, depth]) => depth === d);
    console.log(`    Depth ${d}: ${nodesAtDepth.map(([id]) => id).join(', ')}`);
  }

  console.log('\n  Dependencies:');
  for (const [id, node] of graph.nodes) {
    const deps = node.inEdges.length > 0 ? node.inEdges.join(', ') : '(none)';
    console.log(`    ${id} ← ${deps}`);
  }
}

// CLI support
if (process.argv[1].endsWith('dependency-graph.js')) {
  console.log('Dependency Graph Library');
  console.log('Usage: Import and use in other scripts');
  console.log('');
  console.log('Functions:');
  console.log('  buildGraph(sds) - Build DAG from SDs');
  console.log('  detectCycles(graph) - Find circular dependencies');
  console.log('  topologicalSort(graph) - Basic topological order');
  console.log('  topologicalSortByPriority(graph, scores) - Priority-aware order');
  console.log('  getDependencyDepths(graph) - Calculate depth levels');
  console.log('  getTransitiveDependencies(graph, sdId) - All deps of an SD');
  console.log('  getTransitiveDependents(graph, sdId) - All SDs depending on one');
}

export default {
  parseDependencies,
  buildGraph,
  detectCycles,
  topologicalSort,
  topologicalSortByPriority,
  getDependencyDepths,
  getTransitiveDependencies,
  getTransitiveDependents,
  printGraphSummary,
};
