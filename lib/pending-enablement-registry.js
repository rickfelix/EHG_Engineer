/**
 * Pending-Enablement Registry — SD-LEO-INFRA-POLICY-GATED-AUTO-001A (child of the
 * policy-gated auto-execution engine).
 *
 * Every default-OFF rollout must self-register so it cannot silently linger
 * (the deploy-gap that hid the inert claim-sweep fixes). The registry EXTENDS
 * the existing leo_feature_flags table with five additive columns
 * (gates_what, enablement_criteria, rolled_out_at, last_reviewed_at, target);
 * no parallel table exists.
 *
 * lifecycle_state is the enum feature_flag_lifecycle_state
 * {draft, enabled, disabled, expired, archived} — there is no `pending`/`retired`
 * label, so "pending enablement" is DERIVED, not stored:
 *   pending := is_enabled = false AND rolled_out_at IS NOT NULL
 *              AND lifecycle_state IN ('draft','disabled')
 *   retired := lifecycle_state IN ('expired','archived')   // excluded from surfacer
 * Staleness anchor for "aged" := COALESCE(last_reviewed_at, rolled_out_at).
 *
 * The pure predicates/renderers are unit-tested with no DB; the two async DB
 * helpers are exercised by the db-project integration test and fail open so a
 * registry hiccup can never break the 15-min executive email.
 */

export const PENDING_AGE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING_STATES = ['draft', 'disabled'];

/** A flag is a pending-enablement registry item: a registered default-OFF rollout. */
export function isPendingRegistryFlag(flag) {
  if (!flag || typeof flag !== 'object') return false;
  return flag.is_enabled === false
    && flag.rolled_out_at != null
    && PENDING_STATES.includes(flag.lifecycle_state);
}

/** Staleness anchor: last review if any, else the rollout date. Returns ms epoch or null. */
export function pendingSinceMs(flag) {
  const anchor = flag?.last_reviewed_at || flag?.rolled_out_at;
  if (!anchor) return null;
  const ms = new Date(anchor).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Whole days a flag has been pending (since the staleness anchor). */
export function pendingAgeDays(flag, now = Date.now()) {
  const since = pendingSinceMs(flag);
  if (since == null) return null;
  return Math.floor((now - since) / DAY_MS);
}

/** A pending item that has aged past the threshold (the operator should decide). */
export function isAgedPending(flag, { now = Date.now(), ageDays = PENDING_AGE_DAYS } = {}) {
  if (!isPendingRegistryFlag(flag)) return false;
  const age = pendingAgeDays(flag, now);
  return age != null && age > ageDays;
}

/** Pure: select + sort (oldest first) the aged-pending items from a flag list. */
export function selectAgedPending(flags, opts = {}) {
  return (Array.isArray(flags) ? flags : [])
    .filter((f) => isAgedPending(f, opts))
    .sort((a, b) => (pendingSinceMs(a) ?? 0) - (pendingSinceMs(b) ?? 0));
}

const escHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Plain-text "Pending your decision" block. Empty string when nothing is aged. */
export function renderAgedPendingText(items, { now = Date.now() } = {}) {
  if (!items || items.length === 0) return '';
  const lines = items.map((f) => {
    const age = pendingAgeDays(f, now);
    const gates = f.gates_what ? ` — ${f.gates_what}` : '';
    const crit = f.enablement_criteria ? ` [enable when: ${f.enablement_criteria}]` : '';
    const tgt = f.target ? ` (${f.target})` : '';
    return `  • ${f.flag_key}${tgt}${gates} — pending ${age}d${crit} → enable / defer / retire`;
  });
  return `⏳ ${items.length} default-OFF rollout${items.length > 1 ? 's' : ''} pending your decision (>${PENDING_AGE_DAYS}d):\n${lines.join('\n')}\n\n`;
}

/** HTML "Pending your decision" block. Empty string when nothing is aged. */
export function renderAgedPendingHtml(items, { now = Date.now() } = {}) {
  if (!items || items.length === 0) return '';
  const rows = items.map((f) => {
    const age = pendingAgeDays(f, now);
    const gates = f.gates_what ? ` — ${escHtml(f.gates_what)}` : '';
    const crit = f.enablement_criteria
      ? ` <span style="color:#999;font-size:13px">[enable when: ${escHtml(f.enablement_criteria)}]</span>` : '';
    const tgt = f.target ? ` <span style="color:#777">(${escHtml(f.target)})</span>` : '';
    return `• <b>${escHtml(f.flag_key)}</b>${tgt}${gates} — pending ${age}d${crit} <span style="color:#777;font-size:13px">→ enable / defer / retire</span>`;
  });
  return `<p style="font-size:15px;margin:0 0 10px;padding:10px 12px;background:#eef5ff;border-left:4px solid #3b82f6;border-radius:3px"><b>⏳ ${items.length} default-OFF rollout${items.length > 1 ? 's' : ''} pending your decision (&gt;${PENDING_AGE_DAYS}d)</b><br>${rows.join('<br>')}</p>`;
}

/**
 * DB: fetch aged-pending registry items. Fail-open — returns [] on any error so
 * the executive email never breaks because of the registry.
 */
export async function fetchAgedPendingFlags(db, opts = {}) {
  try {
    const { data, error } = await db
      .from('leo_feature_flags')
      .select('flag_key, display_name, is_enabled, lifecycle_state, gates_what, enablement_criteria, rolled_out_at, last_reviewed_at, target')
      .eq('is_enabled', false)
      .in('lifecycle_state', PENDING_STATES)
      .not('rolled_out_at', 'is', null);
    if (error) return [];
    return selectAgedPending(data, opts);
  } catch {
    return [];
  }
}

/**
 * DB: register (or refresh) a default-OFF rollout in the registry. Idempotent —
 * an existing row keeps its is_enabled/lifecycle_state and only has NULL registry
 * fields filled (never overwrites a human edit). A new row is inserted default-OFF.
 * Returns { row, created }.
 */
export async function registerPendingFlag(db, entry) {
  if (!entry || !entry.flag_key) throw new Error('registerPendingFlag: flag_key is required');
  const { data: existing } = await db
    .from('leo_feature_flags').select('*').eq('flag_key', entry.flag_key).maybeSingle();

  const registryFields = {
    gates_what: entry.gates_what ?? null,
    enablement_criteria: entry.enablement_criteria ?? null,
    rolled_out_at: entry.rolled_out_at ?? null,
    target: entry.target ?? null,
  };

  if (existing) {
    // Only fill registry columns that are still NULL — never clobber human edits.
    const patch = {};
    for (const [k, v] of Object.entries(registryFields)) {
      if (existing[k] == null && v != null) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) return { row: existing, created: false };
    const { data, error } = await db
      .from('leo_feature_flags').update(patch).eq('flag_key', entry.flag_key).select().maybeSingle();
    if (error) throw error;
    return { row: data, created: false };
  }

  const insert = {
    flag_key: entry.flag_key,
    display_name: entry.display_name || entry.flag_key,
    description: entry.description ?? null,
    is_enabled: false,
    lifecycle_state: 'disabled',
    risk_tier: entry.risk_tier || 'low',
    is_temporary: false,
    ...registryFields,
  };
  const { data, error } = await db
    .from('leo_feature_flags').insert(insert).select().maybeSingle();
  if (error) throw error;
  return { row: data, created: true };
}
