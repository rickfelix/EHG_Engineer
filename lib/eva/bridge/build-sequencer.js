/**
 * Build sequencer — dependency DAG ordering + parallel waves
 * SD-LEO-INFRA-PRE-BUILD-SUB-001 — Unit 4 (FR-007)
 *
 * Turns a set of SD dependency nodes into a correct, acyclic build ORDER plus
 * parallel "waves" (sets of SDs whose deps are all satisfied by prior waves, so
 * they can build concurrently). This is the enforceable core that the existing
 * DEPENDENCY_ORDERED_EXECUTION consumer honors — the build-sequencing tech-lead
 * agent supplies the (intelligent) edges, this computes/validates the schedule.
 *
 * Why it matters: the live DataDistill tree had an INVERTED graph (landing-copy
 * "depending on" the engine; the engine depending on nothing). Given CORRECT
 * edges, this produces the correct order (foundational first); given a cycle it
 * fails loudly rather than mis-ordering.
 *
 * Terminal-tolerant: a dependency on a key NOT in the node set is ignored (the
 * dep is external/already-done), matching the consumer's parseDependencies.
 *
 * Pure logic — headlessly unit-testable.
 *
 * @module lib/eva/bridge/build-sequencer
 */

/**
 * @param {Array<{key:string, deps?:string[]}>} nodes
 * @returns {{order:string[], waves:string[][], hasCycle:boolean, cycleNodes:string[]}}
 */
export function computeBuildSequence(nodes = []) {
  const list = (Array.isArray(nodes) ? nodes : []).filter((n) => n && n.key != null);
  const keys = new Set(list.map((n) => n.key));

  const indeg = new Map();
  const dependents = new Map(); // dep -> [keys that depend on it]
  for (const n of list) { indeg.set(n.key, 0); dependents.set(n.key, []); }
  for (const n of list) {
    const deps = (n.deps || []).filter((d) => keys.has(d) && d !== n.key);
    indeg.set(n.key, deps.length);
    for (const d of deps) dependents.get(d).push(n.key);
  }

  const order = [];
  const waves = [];
  const seen = new Set();
  let ready = list.filter((n) => indeg.get(n.key) === 0).map((n) => n.key).sort();

  while (ready.length) {
    waves.push(ready.slice());
    const next = [];
    for (const k of ready) {
      order.push(k);
      seen.add(k);
      for (const dep of dependents.get(k)) {
        indeg.set(dep, indeg.get(dep) - 1);
        if (indeg.get(dep) === 0) next.push(dep);
      }
    }
    ready = next.sort(); // stable, deterministic ordering within a wave
  }

  const hasCycle = order.length < list.length;
  const cycleNodes = hasCycle ? list.map((n) => n.key).filter((k) => !seen.has(k)) : [];
  return { order, waves, hasCycle, cycleNodes };
}

/**
 * Convenience: true iff every node can be scheduled (no cycle).
 * @param {Array<{key:string, deps?:string[]}>} nodes
 * @returns {boolean}
 */
export function isSchedulable(nodes = []) {
  return !computeBuildSequence(nodes).hasCycle;
}
