/**
 * Dependency DAG Resolver
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-B (FR-2)
 *
 * Constructs a directed acyclic graph from child SD dependency metadata,
 * validates references, detects cycles, and computes the runnable set
 * at each scheduling step.
 *
 * Terminology:
 *   - "blocked_by" edge: child.metadata.blocked_by = [blockerChildId, ...]
 *     means blockerChildId must complete before child can run.
 *   - "runnable" node: all blockers are in completedIds set.
 *   - "terminal" node: succeeded, failed, canceled, or skipped.
 */

/**
 * @typedef {Object} DAGNode
 * @property {string} id - Child SD id (UUID)
 * @property {string} sdKey - Child SD key (human-readable)
 * @property {string[]} blockedBy - IDs this node depends on
 * @property {string[]} blocks - IDs this node blocks (computed)
 */

/**
 * @typedef {Object} DAG
 * @property {Map<string, DAGNode>} nodes - Map of id -> DAGNode
 * @property {string[]} rootIds - Nodes with no blockers (immediately runnable)
 */

/**
 * Build a dependency DAG from child SDs.
 *
 * Each child's metadata.blocked_by is an array of sibling child IDs (UUIDs)
 * that must complete before this child can start.
 *
 * @param {Array<{id: string, sd_key: string, metadata: object}>} children - Child SD records
 * @returns {{ dag: DAG, errors: string[] }}
 */
export function buildDependencyDAG(children) {
  const errors = [];
  const nodes = new Map();
  const knownIds = new Set(children.map(c => c.id));

  // Build nodes
  for (const child of children) {
    const blockedBy = Array.isArray(child.metadata?.blocked_by)
      ? child.metadata.blocked_by.filter(id => typeof id === 'string')
      : [];

    nodes.set(child.id, {
      id: child.id,
      sdKey: child.sd_key || child.id,
      blockedBy: [...blockedBy],
      blocks: []
    });
  }

  // Validate references and build reverse edges
  for (const [id, node] of nodes) {
    for (const blockerId of node.blockedBy) {
      if (!knownIds.has(blockerId)) {
        errors.push(
          `Child ${node.sdKey} (${id}) references unknown blocker ID: ${blockerId}`
        );
        continue;
      }
      const blockerNode = nodes.get(blockerId);
      if (blockerNode) {
        blockerNode.blocks.push(id);
      }
    }
  }

  // Find root nodes (no blockers)
  const rootIds = [];
  for (const [id, node] of nodes) {
    if (node.blockedBy.length === 0) {
      rootIds.push(id);
    }
  }

  return { dag: { nodes, rootIds }, errors };
}

// DFS coloring constants for cycle detection
const WHITE = 0; // unvisited
const GRAY = 1;  // in current DFS path
const BLACK = 2; // fully processed

/**
 * Detect cycles in the DAG using DFS with coloring.
 *
 * @param {DAG} dag - The dependency DAG
 * @returns {{ hasCycles: boolean, cyclePath: string[] }}
 */
export function detectCycles(dag) {
  const color = new Map();
  const parent = new Map();

  for (const id of dag.nodes.keys()) {
    color.set(id, WHITE);
  }

  for (const id of dag.nodes.keys()) {
    if (color.get(id) === WHITE) {
      const cyclePath = dfsVisit(id, dag, color, parent);
      if (cyclePath) {
        return { hasCycles: true, cyclePath };
      }
    }
  }

  return { hasCycles: false, cyclePath: [] };
}

function dfsVisit(id, dag, color, parent) {
  color.set(id, GRAY);
  const node = dag.nodes.get(id);

  // Follow "blocks" edges (id blocks dependent -> id must finish before dependent)
  // For cycle detection, we follow blockedBy edges in reverse:
  // If A.blockedBy = [B], edge is B -> A. We traverse A -> B (upstream).
  for (const blockerId of node.blockedBy) {
    const blockerColor = color.get(blockerId);

    if (blockerColor === GRAY) {
      // Found a cycle - reconstruct path
      const cyclePath = [blockerId];
      let current = id;
      while (current !== blockerId) {
        cyclePath.push(current);
        current = parent.get(current);
        if (!current) break;
      }
      cyclePath.push(blockerId);
      return cyclePath.reverse();
    }

    if (blockerColor === WHITE) {
      parent.set(blockerId, id);
      const result = dfsVisit(blockerId, dag, color, parent);
      if (result) return result;
    }
  }

  color.set(id, BLACK);
  return null;
}

/**
 * Compute the set of runnable nodes given current completion state.
 *
 * A node is runnable if:
 * - It is not in completedIds, failedIds, or runningIds
 * - All of its blockedBy entries are in completedIds
 *
 * @param {DAG} dag - The dependency DAG
 * @param {Set<string>} completedIds - IDs of successfully completed children
 * @param {Set<string>} failedIds - IDs of failed children
 * @param {Set<string>} [runningIds] - IDs of currently running children
 * @returns {{ runnable: string[], blocked: string[], terminal: {id: string, reason: string}[] }}
 */
export function computeRunnableSet(dag, completedIds, failedIds, runningIds = new Set()) {
  const runnable = [];
  const blocked = [];
  const terminal = [];

  for (const [id, node] of dag.nodes) {
    // Skip already completed, failed, or running
    if (completedIds.has(id)) continue;
    if (failedIds.has(id)) continue;
    if (runningIds.has(id)) continue;

    // Check if any blocker has failed -> this node is terminal (skipped)
    const failedBlocker = node.blockedBy.find(bid => failedIds.has(bid));
    if (failedBlocker) {
      const blockerNode = dag.nodes.get(failedBlocker);
      terminal.push({
        id,
        reason: `blocker_failed:${blockerNode?.sdKey || failedBlocker}`
      });
      continue;
    }

    // Check if all blockers are completed
    const allBlockersComplete = node.blockedBy.every(bid => completedIds.has(bid));

    if (allBlockersComplete) {
      runnable.push(id);
    } else {
      blocked.push(id);
    }
  }

  return { runnable, blocked, terminal };
}

/**
 * Validate dependencies in the DAG.
 * Checks for: missing references, cycles, and self-references.
 *
 * @param {Array<{id: string, sd_key: string, metadata: object}>} children - Child SD records
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDependencies(children) {
  const { dag, errors } = buildDependencyDAG(children);

  // Check for self-references
  for (const [id, node] of dag.nodes) {
    if (node.blockedBy.includes(id)) {
      errors.push(`Child ${node.sdKey} (${id}) has a self-reference in blocked_by`);
    }
  }

  // Check for cycles
  const { hasCycles, cyclePath } = detectCycles(dag);
  if (hasCycles) {
    const pathStr = cyclePath
      .map(id => dag.nodes.get(id)?.sdKey || id)
      .join(' -> ');
    errors.push(`Dependency cycle detected: ${pathStr}`);
  }

  return { valid: errors.length === 0, errors };
}

export default {
  buildDependencyDAG,
  detectCycles,
  computeRunnableSet,
  validateDependencies
};
