/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: source-adapter registry.
 *
 * Maps a source name to its adapter module. Every adapter exposes:
 *   - async toDraft(input, deps)  — uniform registry surface
 *   - the lane's original createFromX / createChild function (verbatim move from
 *     scripts/leo-create-sd.js), which the CLI dispatch still calls by name.
 *
 * The --from-proposal / --proposal-b64 / --proposal-stdin lanes are NOT in this
 * registry: their exported functions (validateProposalShape, createFromProposal, …)
 * have unit tests that behaviorally pin a hard exit(1) on invalid input, so they
 * stay under scripts/ (scripts/modules/leo-create-sd/proposal-lanes.js) where the
 * lib/sd-creation no-hard-exit invariant does not apply.
 */
import * as uat from './uat.js';
import * as learn from './learn.js';
import * as feedback from './feedback.js';
import * as roadmapItem from './roadmap-item.js';
import * as qf from './qf.js';
import * as child from './child.js';
import * as plan from './plan.js';

export const adapters = Object.freeze({
  uat,
  learn,
  feedback,
  'roadmap-item': roadmapItem,
  qf,
  child,
  plan,
});

/** Resolve an adapter by source name (null when unknown). */
export function getAdapter(source) {
  return adapters[source] ?? null;
}

// Named lane functions for the CLI dispatch + the scripts/leo-create-sd.js re-export shim.
export { createFromUAT } from './uat.js';
export { createFromLearn } from './learn.js';
export { createFromFeedback } from './feedback.js';
export { createFromRoadmapItem, buildPromotionRepoOverrides } from './roadmap-item.js';
export { createFromQF } from './qf.js';
export { createChild } from './child.js';
export { createFromPlan, computePlanContentHash, findRecentSDByPlanHash } from './plan.js';
