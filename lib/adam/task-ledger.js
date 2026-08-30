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

// QF-20260830-690: manual child items only move by hand (no live object to rehydrate from),
// so the chairman found ten stale (6-12 days untouched) before the seat did. adam_task_ledger
// has no dedicated owner/review_by columns (schema-light per this QF's own scope), so both are
// encoded into the existing `risk` text field for tier='child' + source_kind='manual' rows only
// — `risk` carries no rendered meaning for children today (only parent-tier rows render it).
export const MANUAL_CHILD_REVIEW_WINDOW_DAYS = 14;
export const MANUAL_CHILD_STALE_DAYS = 7;

// A distinct, unambiguous marker line — `risk` legitimately carries free-text narrative on
// some existing rows (e.g. a chairman-decision risk writeup), so the tag is APPENDED rather
// than overwriting, and is anchored to its own marker so a narrative that happens to contain
// the substring "owner=" can never be mistaken for it.
const META_MARKER = '[QF-690-META]';

export function encodeManualChildMeta(owner, reviewByIso) {
  return `${META_MARKER} owner=${owner} review_by=${reviewByIso}`;
}

/** Append the owner/review_by tag onto existing risk text (never clobbers a narrative). */
export function appendManualChildMeta(existingRisk, owner, reviewByIso) {
  const tag = encodeManualChildMeta(owner, reviewByIso);
  return existingRisk ? `${existingRisk} ${tag}` : tag;
}

/** Parse the owner/review_by encoded by encodeManualChildMeta(); null if absent/unparseable. */
export function parseManualChildMeta(risk) {
  if (!risk) return null;
  const m = new RegExp(`\\[QF-690-META\\] owner=([^\\s]+) review_by=(\\S+)`).exec(risk);
  if (!m) return null;
  return { owner: m[1].trim(), review_by: m[2].trim() };
}

/**
 * A manual child item is stale once it has sat untouched past the 7-day window OR its
 * review_by date has passed — whichever fires first. PURE (no I/O) so it is unit-testable.
 * Terminal statuses and non-manual-child rows never qualify.
 */
export function isManualChildStale(row, now = Date.now()) {
  if (!row || row.tier !== 'child' || row.source_kind !== 'manual') return false;
  if (row.status === 'done' || row.status === 'cancelled') return false;
  const meta = parseManualChildMeta(row.risk);
  const updatedAgeDays = (now - new Date(row.updated_at).getTime()) / (24 * 60 * 60 * 1000);
  const reviewOverdue = !!(meta && meta.review_by && new Date(meta.review_by).getTime() < now);
  return updatedAgeDays > MANUAL_CHILD_STALE_DAYS || reviewOverdue;
}

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
  // QF-20260830-690: every manual child MUST carry an owner + review_by at creation — the
  // board-hygiene defect was silence, not a missing feature, so the writer enforces it rather
  // than trusting callers. review_by defaults to a 14-day window when the caller omits it.
  if (node.tier === 'child' && node.source_kind === 'manual') {
    if (!node.owner) throw new Error('createOrUpsertNode: manual child items require an owner');
    const reviewBy = node.review_by || new Date(Date.now() + MANUAL_CHILD_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    node = { ...node, risk: appendManualChildMeta(node.risk, node.owner, reviewBy) };
  }
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
 * QF-20260711-503: persist each parent's rolled-up status onto its OWN row. rollupParentStatus()
 * was previously used ONLY for the board VIEW (adam-pm-board.mjs buildBoardView) — nothing wrote
 * its result back onto the parent's persisted status column, so a parent could sit at a STALE
 * status (e.g. 'blocked' from an earlier tick) even once its remaining child was unblocked and
 * simply claimable on the belt. readCriticalPathParents() (adam-quiet-tick.mjs) derives
 * inFlightNextStep from that stored column, so the stall-alert escalated a non-stall (live
 * specimen: node with 6/7 children done, 7th open/claimable, parent still stored 'blocked').
 * Fail-soft per parent — one row's read/write error must never abort the sync for the rest or
 * the caller's tick.
 * @param {object} supabase
 * @returns {Promise<{checked: number, updated: number, errors: string[]}>}
 */
export async function syncParentRollupStatus(supabase) {
  const result = { checked: 0, updated: 0, errors: [] };
  try {
    const { data: parents, error: pErr } = await supabase
      .from(TABLE)
      .select('id, status')
      .eq('tier', 'parent')
      .in('status', ['open', 'in_progress', 'blocked']);
    if (pErr) throw pErr;
    const parentIds = (parents || []).map((p) => p.id);
    if (!parentIds.length) return result;

    const { data: children, error: cErr } = await supabase
      .from(TABLE)
      .select('id, parent_id, status')
      .eq('tier', 'child')
      .in('parent_id', parentIds);
    if (cErr) throw cErr;

    const childrenByParent = new Map();
    for (const c of children || []) {
      if (!c.parent_id) continue;
      if (!childrenByParent.has(c.parent_id)) childrenByParent.set(c.parent_id, []);
      childrenByParent.get(c.parent_id).push(c);
    }

    for (const parent of parents) {
      result.checked++;
      const kids = childrenByParent.get(parent.id) || [];
      if (!kids.length) continue; // no children yet -> nothing to roll up, leave status as-is
      const computed = rollupParentStatus(kids);
      if (computed !== parent.status) {
        try {
          await setStatus(supabase, parent.id, computed);
          result.updated++;
        } catch (e) {
          result.errors.push(`parent ${parent.id}: ${e && e.message}`);
        }
      }
    }
  } catch (e) {
    result.errors.push(`sync failed: ${e && e.message}`);
  }
  return result;
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
  MANUAL_CHILD_REVIEW_WINDOW_DAYS, MANUAL_CHILD_STALE_DAYS,
  encodeManualChildMeta, appendManualChildMeta, parseManualChildMeta, isManualChildStale,
  createOrUpsertNode, setStatus, setBlocker,
  rollupParentStatus, bubbleBlockers, sumTokenCost, syncParentRollupStatus,
};
