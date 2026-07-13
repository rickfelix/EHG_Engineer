/**
 * SD-FDBK-FIX-RETRO-ACTION-ITEM-001 / FR-1
 *
 * Pure predicates for deciding whether a retrospective action item is
 * concretely EXEC-actionable, extracted from scripts/promote-retro-action-items.mjs
 * so they are independently unit-testable.
 *
 * Four action-item shapes exist in the wild (see promote-retro-action-items.mjs's
 * own comment for the full history) -- actionText/actionOwner mirror that logic
 * exactly so both files stay in sync.
 *
 * IMPORTANT (verified against live retrospectives.action_items JSONB, not just the
 * rendered QF description text -- the description ALWAYS prints "success criteria:
 * n/a" for a field that is simply absent, which looks identical to a field
 * explicitly set to the string 'n/a'): only the `smart_format: true` shape from
 * lib/sub-agents/retro/action-items.js's generateSmartActionItems() ever carries a
 * success_criteria field at all. The other three shapes ({item,owner,priority},
 * {text,category,priority}, {title,description,owner_role,priority}) NEVER include
 * it -- its absence is normal for the large majority of items and must NEVER be
 * treated as a rejection signal on its own, or every non-smart_format item
 * (including entirely legitimate ones) would be rejected. The universal signal
 * across all 4 real 2026-07-13 flooding examples (QF-606/691/713/963) is the OWNER
 * field alone; success_criteria is checked only as a defense-in-depth signal when
 * the field is explicitly present and garbage.
 */

// Protocol-phase-level owner values observed live across the 2026-07-13 flooding
// incident (QF-20260713-606/691/713/963): 'unassigned', 'LEAD', 'PLAN', 'LEO-INFRA'.
// Exact match only (trimmed, lowercased) -- NOT a substring match, so a real,
// concrete owner like 'PLAN Phase Agent' (QF-20251223-800, legitimately
// EXEC-actionable) is never caught by this.
const NON_ACTIONABLE_OWNERS = new Set(['unassigned', 'lead', 'plan', 'leo-infra']);

export function actionText(item) {
  return item.item || item.action || item.title || item.text || '(no text)';
}

export function actionOwner(item) {
  return item.owner || item.owner_role || 'unassigned';
}

function isPlaceholderText(value) {
  const t = String(value).trim().toLowerCase();
  return t === '' || t === 'n/a' || t === 'na' || t === 'none';
}

/**
 * True only when success_criteria is EXPLICITLY present and a placeholder value.
 * A MISSING field returns false (not a signal) -- see the module-level note above
 * on why absence must never be conflated with an explicit placeholder.
 */
export function hasExplicitPlaceholderSuccessCriteria(item) {
  const raw = item.success_criteria;
  if (raw === undefined || raw === null) return false;
  return isPlaceholderText(raw);
}

/**
 * True when an item's owner is a protocol-phase name rather than a concrete actor.
 */
export function hasNonActionableOwner(item) {
  const owner = String(actionOwner(item)).trim().toLowerCase();
  return NON_ACTIONABLE_OWNERS.has(owner);
}

/**
 * An item is rejected when its owner is a protocol-phase placeholder, OR when it
 * explicitly carries a placeholder success_criteria value. A MISSING
 * success_criteria field is never, by itself, a rejection reason.
 */
export function isActionable(item) {
  return !hasNonActionableOwner(item) && !hasExplicitPlaceholderSuccessCriteria(item);
}
