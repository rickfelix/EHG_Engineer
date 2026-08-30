/**
 * precedes-band — SD-LEO-INFRA-GIVE-DISPATCH-RANKER-001.
 *
 * WHAT WAS MISSING: the criticalWalkBlocker band can express "A blocks the active mission" (a
 * MEMBERSHIP fact) but not "A must dispatch before B among band equals" (a SEQUENCE fact). Witnessed
 * 2026-08-30 when SD-LEO-INFRA-BYPASS-DETECTION-REQUIRED-001 and SD-LEO-INFRA-DIRECTION-BLIND-KILL-001
 * both truthfully qualified for the criticalWalkBlocker band (both metadata.blocks_active_mission=true)
 * with no mechanical lever to encode which should dispatch first, short of withholding a truthful
 * blocks_active_mission stamp from one of them — rejected by the two-lane ruling (5d3c55bb/d239e245):
 * a shared census field means MEMBERSHIP, never SEQUENCE. This module adds a SEPARATE representation
 * instead of bending that one.
 *
 * WHY A NEW FIELD AND NOT dependencies[].relation: lib/claim/gates/dependency-gate.cjs already
 * recognises a sequence_after_for_X / land_before_X / overlaps_X vocabulary on the top-level
 * `dependencies` array — but only the CLAIM path reads `relation`. The RANK path
 * (blockerKeysFor/parseSdDependencies, scripts/lib/claimable-leaves.mjs) ignores `relation` entirely
 * and drops any SD carrying a non-completed blocker key from `claimable` BEFORE the sort ever runs.
 * Reusing that shape here would HARD-BLOCK the sequenced SD out of the belt — the exact inversion of
 * intent. metadata.precedes_sd_key is therefore a deliberate SECOND, rank-only representation. Do not
 * unify it with dependencies[].relation — that would re-introduce the hard-block this SD exists to
 * avoid (VALIDATION evidence 9a4d9a74-4d04-4a76-bfd9-d9030c36706f).
 *
 * PLACEMENT IS THE WHOLE DESIGN — and it is the LAST tie-break in the chain, below everything
 * including priority, matching the SD's own title "among band equals" literally. An earlier draft
 * placed this right after unlockScore (above committingItemBand/productPivot/needle/priority) —
 * VALIDATION (evidence 9a4d9a74-4d04-4a76-bfd9-d9030c36706f, 2nd pass) proved that placement broken:
 * every band above that slot is a deterministic function of a SINGLE item, so once two items tie on
 * all of them the tie is transitive — but a precedes edge sitting ABOVE those bands can override an
 * ordering the lower bands would otherwise impose transitively across three-plus items (A precedes B;
 * B<C and C<A both fall out of priority/age alone — a single ACYCLIC edge is sufficient), making
 * Array.prototype.sort's output implementation-defined for the WHOLE belt, not just the named SDs.
 * Placed LAST instead: a precedes edge can only ever separate two items every earlier comparator
 * (including priority) already tied on, so within any such fully-tied set, ties are transitive all the
 * way down and detectPrecedesCycles()'s edge-local DFS becomes a SUFFICIENT transitivity guard rather
 * than merely a guard against operator-authored cycles.
 *
 * DIRECTION: metadata.precedes_sd_key is set on the EARLIER-dispatching SD's row, naming the later
 * SD's sd_key. A.metadata.precedes_sd_key = B.sd_key means "A must dispatch before B".
 *
 * SELF-EXPIRY IS STRUCTURAL: sequenceCompare only ever fires when BOTH named SDs are simultaneously
 * present in the `claimable` array being sorted. The moment either SD is claimed, completed, or
 * otherwise leaves the claimable set, the edge is inert by construction — no cleanup job needed.
 *
 * CYCLE SAFETY: a pairwise override at this position in the comparator chain can form a cycle across
 * three-plus SDs (A precedes B, B precedes C, C precedes A), which makes Array.prototype.sort's output
 * implementation-defined for the WHOLE array, not just the cyclic members. detectPrecedesCycles() must
 * be run ONCE per ranking pass, before sort(), to compute the set of edges to exclude — sequenceCompare
 * itself does not detect cycles (a pairwise function cannot see the whole graph).
 */

/** Read the raw precedes edge (sd_key of the SD this one must dispatch before), or null. */
export function precedesTarget(sd) {
  const key = (sd && sd.metadata && sd.metadata.precedes_sd_key) || null;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

/**
 * Build the directed precedes-edge list restricted to the given claimable set: only edges where
 * BOTH endpoints are present, and excluding any self-reference. Pure; no fixture-mutation.
 */
export function buildPrecedesEdges(claimable) {
  const bySdKey = new Map(claimable.map((sd) => [sd.sd_key, sd]));
  const edges = [];
  for (const sd of claimable) {
    const target = precedesTarget(sd);
    if (!target) continue;
    if (target === sd.sd_key) continue; // self-reference is never an edge
    if (!bySdKey.has(target)) continue; // dangling ref: target not currently claimable
    edges.push([sd.sd_key, target]);
  }
  return edges;
}

/**
 * Detect every edge that participates in a cycle within the given edge list (DFS-based). Returns a
 * Set of "A->B" strings to exclude from sequenceCompare for this pass. An acyclic edge list returns
 * an empty Set (the common case, zero cost to the comparator).
 */
export function detectPrecedesCycles(edges) {
  const adjacency = new Map();
  for (const [from, to] of edges) {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(to);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const cyclicNodes = new Set();

  function visit(node, stack) {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adjacency.get(node) || []) {
      const nextColor = color.get(next) || WHITE;
      if (nextColor === GRAY) {
        // Found a back-edge: everything from `next` to the top of the stack is in the cycle.
        const cycleStart = stack.indexOf(next);
        for (let i = cycleStart; i < stack.length; i += 1) cyclicNodes.add(stack[i]);
        cyclicNodes.add(next);
      } else if (nextColor === WHITE) {
        visit(next, stack);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const [from] of edges) {
    if ((color.get(from) || WHITE) === WHITE) visit(from, []);
  }

  const excluded = new Set();
  for (const [from, to] of edges) {
    if (cyclicNodes.has(from) && cyclicNodes.has(to)) excluded.add(`${from}->${to}`);
  }
  return excluded;
}

/**
 * Band comparator: ruled sequence first. `excludedEdges` is the Set returned by
 * detectPrecedesCycles(), computed ONCE per ranking pass and threaded through — sequenceCompare itself
 * never re-detects cycles (a pairwise function cannot see the whole graph). Returns 0 (fall through to
 * the next comparator) whenever no edge applies, the edge is excluded, or either endpoint is a
 * self/dangling reference.
 */
export function sequenceCompare(a, b, excludedEdges = new Set()) {
  const aKey = a && a.sd_key, bKey = b && b.sd_key;
  if (!aKey || !bKey || aKey === bKey) return 0;
  const aPrecedesB = precedesTarget(a) === bKey && !excludedEdges.has(`${aKey}->${bKey}`);
  if (aPrecedesB) return -1;
  const bPrecedesA = precedesTarget(b) === aKey && !excludedEdges.has(`${bKey}->${aKey}`);
  if (bPrecedesA) return 1;
  return 0;
}

export default { precedesTarget, buildPrecedesEdges, detectPrecedesCycles, sequenceCompare };
