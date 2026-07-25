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

/**
 * Reachability WITH the chain that reached each target.
 * SD-LEO-INFRA-OUTBOUND-SINK-CONFORMANCE-001 FR-2 — the PRIMARY extension.
 *
 * checkReachability() above answers only "is this target reachable"; it keeps no
 * predecessor information, so a conformance census cannot report WHICH import
 * chain reaches an outbound sink. This is a SEPARATE export rather than a new
 * parameter so checkReachability() stays byte-identical (and its arity stays 3)
 * for the two live merge-blocking gates that call it positionally.
 *
 * @param {Map<string, Set<string>>} graph - Dependency graph (file -> Set<dependencies>)
 * @param {string[]} entryPoints - Absolute paths of entry point files (forward slashes)
 * @param {string[]} targetFiles - Absolute paths of files to check reachability for
 * @returns {{ reachable: Set<string>, unreachable: Set<string>, chains: Map<string, string[]> }}
 *   chains maps each REACHABLE target to the entry-point-first path that reached it.
 */
export function checkReachabilityWithChains(graph, entryPoints, targetFiles) {
  const norm = (p) => p.replace(/\\/g, '/');
  const predecessor = new Map();
  const visited = new Set();
  const queue = [];

  for (const entry of entryPoints) {
    const n = norm(entry);
    if (!visited.has(n)) {
      visited.add(n);
      predecessor.set(n, null); // null marks an entry point (chain terminus)
      queue.push(n);
    }
  }

  // BFS. `visited` also terminates cycles, so a cyclic graph cannot loop forever.
  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = graph.get(current);
    if (!neighbors) continue;
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        predecessor.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  const reachable = new Set();
  const unreachable = new Set();
  const chains = new Map();

  for (const target of targetFiles) {
    const n = norm(target);
    if (!visited.has(n)) {
      unreachable.add(n);
      continue;
    }
    reachable.add(n);
    // Walk predecessors back to the entry point, then reverse to entry-point-first.
    const chain = [];
    for (let hop = n; hop !== null && hop !== undefined; hop = predecessor.get(hop)) {
      chain.push(hop);
      if (predecessor.get(hop) === null) break;
    }
    chains.set(n, chain.reverse());
  }

  return { reachable, unreachable, chains };
}
