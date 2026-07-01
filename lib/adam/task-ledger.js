/**
 * Adam task-ledger CRUD + PURE status/blocker rollup helpers.
 * SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-A (Child A / FR-2).
 *
 * The durable backing for Adam's hierarchical task board (adam_task_ledger). The board is a single
 * task TREE — chairman-visible PARENT nodes and Adam-operational CHILD subtasks, related by
 * parent_id — that survives compaction + role-handoff (the harness TaskCreate list is ephemeral).
 *
 * Two layers, kept deliberately separate so the derivations are unit-testable WITHOUT a DB:
 *   - IO helpers (take a supabase client): createOrUpsertNode / setStatus / setBlocker.
 *   - PURE derivations (take plain arrays of children): rollupParentStatus / bubbleBlockers /
 *     sumTokenCost. These are a single-tree derivation (NOT a promotion-copy between two lists).
 */

export const TABLE = 'adam_task_ledger';

export const STATUSES = Object.freeze(['open', 'in_progress', 'blocked', 'done', 'cancelled']);
export const TIERS = Object.freeze(['parent', 'child']);
export const SOURCE_KINDS = Object.freeze(['advisory_thread', 'sourced_sd', 'awaited_reply', 'manual']);

/** Build the persisted row from node input, dropping undefined so the upsert stays sparse. */
function buildRow({ source_kind, source_ref, tier, title, parent_id, blocker, benefit, risk, token_cost, status } = {}) {
  const row = { source_kind, source_ref, tier, title };
  if (parent_id !== undefined) row.parent_id = parent_id;
  if (blocker !== undefined) row.blocker = blocker;
  if (benefit !== undefined) row.benefit = benefit;
  if (risk !== undefined) row.risk = risk;
  if (token_cost !== undefined) row.token_cost = token_cost;
  if (status !== undefined) row.status = status;
  return row;
}

/**
 * Idempotent UPSERT of a board node on the natural key (source_kind, source_ref). Re-running with
 * the same key updates the existing row instead of duplicating it (the rehydrate safety net).
 * @param {object} supabase - a supabase client
 * @param {object} node - { source_kind, source_ref, tier, title, parent_id?, blocker?, benefit?, risk?, token_cost?, status? }
 * @returns {Promise<object>} the upserted row
 */
export async function createOrUpsertNode(supabase, node) {
  if (!node || !node.source_kind || !node.source_ref) {
    throw new Error('createOrUpsertNode: source_kind + source_ref are required (the idempotency key)');
  }
  if (!node.tier || !TIERS.includes(node.tier)) {
    throw new Error(`createOrUpsertNode: tier must be one of ${TIERS.join('|')} (got ${node.tier})`);
  }
  if (!node.title) throw new Error('createOrUpsertNode: title is required');
  const row = buildRow(node);
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: 'source_kind,source_ref' })
    .select()
    .single();
  if (error) throw new Error(`createOrUpsertNode upsert failed: ${error.message}`);
  return data;
}

/**
 * Set a node's status (validated against the CHECK enum).
 * @param {object} supabase @param {string} id @param {string} status
 */
export async function setStatus(supabase, id, status) {
  if (!STATUSES.includes(status)) {
    throw new Error(`setStatus: status must be one of ${STATUSES.join('|')} (got ${status})`);
  }
  const { data, error } = await supabase.from(TABLE).update({ status }).eq('id', id).select().maybeSingle();
  if (error) throw new Error(`setStatus failed: ${error.message}`);
  return data;
}

/**
 * Set (or clear, with null) a node's materialized blocker text.
 * @param {object} supabase @param {string} id @param {string|null} blocker
 */
export async function setBlocker(supabase, id, blocker) {
  const { data, error } = await supabase.from(TABLE).update({ blocker: blocker ?? null }).eq('id', id).select().maybeSingle();
  if (error) throw new Error(`setBlocker failed: ${error.message}`);
  return data;
}

// ── PURE derivations (take plain arrays — no client, no IO — so they unit-test without a DB) ──

/** Coerce a children argument into a safe array of node-ish objects. */
function asChildren(children) {
  return Array.isArray(children) ? children.filter((c) => c && typeof c === 'object') : [];
}

/**
 * Derive a parent's rolled-up status from its children. Single-tree derivation:
 *   - cancelled children are IGNORED (they don't count toward the rollup);
 *   - if any (non-cancelled) child is 'blocked'  -> 'blocked';
 *   - if there are non-cancelled children and they are ALL 'done' -> 'done';
 *   - if there are no non-cancelled children -> 'open';
 *   - otherwise -> 'in_progress'.
 * @param {Array<{status?:string}>} children
 * @returns {'open'|'in_progress'|'blocked'|'done'}
 */
export function rollupParentStatus(children) {
  const effective = asChildren(children).filter((c) => c.status !== 'cancelled');
  if (effective.length === 0) return 'open';
  if (effective.some((c) => c.status === 'blocked')) return 'blocked';
  if (effective.every((c) => c.status === 'done')) return 'done';
  return 'in_progress';
}

/**
 * Surface child blockers onto the parent for the chairman-curated view. Returns the ACTIVE child
 * blockers (a truthy blocker on a child that is not done/cancelled). PURE.
 * @param {Array<{id?:string,title?:string,status?:string,blocker?:string}>} children
 * @returns {Array<{id:string|null,title:string|null,blocker:string}>}
 */
export function bubbleBlockers(children) {
  return asChildren(children)
    .filter((c) => c.blocker && String(c.blocker).trim() && c.status !== 'done' && c.status !== 'cancelled')
    .map((c) => ({ id: c.id ?? null, title: c.title ?? null, blocker: String(c.blocker) }));
}

/**
 * Coarse per-parent token rollup — a simple sum of children's numeric token_cost (cancelled ignored,
 * null/undefined/non-numeric skipped). Light; NOT per-subtask accounting.
 * @param {Array<{status?:string,token_cost?:number}>} children
 * @returns {number}
 */
export function sumTokenCost(children) {
  return asChildren(children)
    .filter((c) => c.status !== 'cancelled')
    .reduce((sum, c) => {
      const n = Number(c.token_cost);
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
}

export default {
  TABLE, STATUSES, TIERS, SOURCE_KINDS,
  createOrUpsertNode, setStatus, setBlocker,
  rollupParentStatus, bubbleBlockers, sumTokenCost,
};
