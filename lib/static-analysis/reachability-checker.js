/**
 * Reachability Checker — Static Analysis
 * SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-C
 *
 * BFS from entry points through the call graph to determine
 * which target files are reachable.
 */

/**
 * Check which target files are reachable from the given entry points.
 *
 * @param {Map<string, Set<string>>} graph - Dependency graph (file -> Set<dependencies>)
 * @param {string[]} entryPoints - Absolute paths of entry point files (forward slashes)
 * @param {string[]} targetFiles - Absolute paths of files to check reachability for
 * @returns {{ reachable: Set<string>, unreachable: Set<string> }}
 */
export function checkReachability(graph, entryPoints, targetFiles) {
  const visited = new Set();
  const queue = [];

  // Seed BFS with entry points that exist in the graph
  for (const entry of entryPoints) {
    const normalized = entry.replace(/\\/g, '/');
    if (!visited.has(normalized)) {
      visited.add(normalized);
      queue.push(normalized);
    }
  }

  // BFS traversal
  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = graph.get(current);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // Classify target files
  const reachable = new Set();
  const unreachable = new Set();

  for (const target of targetFiles) {
    const normalized = target.replace(/\\/g, '/');
    if (visited.has(normalized)) {
      reachable.add(normalized);
    } else {
      unreachable.add(normalized);
    }
  }

  return { reachable, unreachable };
}
