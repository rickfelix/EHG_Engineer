/**
 * lib/fleet/window-reconcile.js — SD-LEO-INFRA-SESSIONS-PAGE-TRUE-001-A FR-6.
 *
 * Compares RECORDED visibility (claude_sessions.metadata.window_visible, an intention) against
 * OBSERVED visibility (what the OS actually reports), in BOTH directions.
 *
 * *** THE SD ORIGINALLY SAID ONE OF THESE DIRECTIONS WAS IMPOSSIBLE. IT WAS MEASURED FALSE. ***
 * The spine asserted "reconciliation is one-directional by construction", resting on this premise:
 * FALSE — "a hidden window cannot be re-enumerated". Believing it meant recorded-visible-but-
 * actually-hidden could never be detected, so the builder was told to skip that whole direction.
 * Measured on this host, which is what settled it: 348 top-level windows, 36 visible,
 * 312 HIDDEN AND ENUMERABLE. Hidden windows are excluded from this repo's normal enumeration by
 * exactly ONE predicate, `if (IsWindowVisible(h))` inside WINDOW_ENUM_COMMAND — an APPLICATION
 * CHOICE, not an OS limit. Drop that predicate and both directions are observable.
 *
 * So this module is deliberately symmetric, and nothing in it claims the converse is undetectable.
 * A one-directional reconciler here would have been a permanent blind spot justified by a false
 * premise — the operator would be told "everything matches" while every wrongly-hidden seat sat
 * unreported, which is precisely the operator-truth failure this SD exists to end.
 *
 * PURE. No DB, no PowerShell. Callers supply recorded rows and observed windows, which is what makes
 * both drift directions testable without hiding a real window.
 */

/** Drift direction names. Exported so callers and tests share one spelling. */
export const DRIFT_RECORDED_HIDDEN_BUT_VISIBLE = 'recorded_hidden_but_visible';
export const DRIFT_RECORDED_VISIBLE_BUT_HIDDEN = 'recorded_visible_but_hidden';

/**
 * Build a handle -> visible map from UNFILTERED enumeration rows.
 *
 * Rows must come from an enumeration that does NOT apply the IsWindowVisible gate — otherwise every
 * hidden window is simply absent, and absent is indistinguishable from "window closed". That
 * conflation is what made the original one-directional claim look true.
 */
export function buildObservedMap(rows) {
  const map = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const h = Number(r?.handle);
    if (!Number.isFinite(h) || h === 0) continue;
    map.set(h, Boolean(r?.visible));
  }
  return map;
}

/**
 * Reconcile recorded intention against observed reality.
 *
 * @param {Array<{session_id: string, metadata: object}>} sessions
 * @param {Map<number, boolean>} observed  handle -> isVisible, from UNFILTERED enumeration
 * @returns {{drift: Array, checked: number, skipped: Array}}
 *
 * A session is SKIPPED, never counted as drift, when it has no recorded visibility (nothing to
 * compare), no usable handle (nothing to look up), or its handle is absent from the observed map
 * (the window is gone — a closed window is not a visibility disagreement). Reporting any of those
 * as drift would manufacture alarms and bury the real ones.
 */
export function reconcileWindowVisibility(sessions, observed) {
  const map = observed instanceof Map ? observed : new Map();
  const drift = [];
  const skipped = [];
  let checked = 0;

  for (const s of Array.isArray(sessions) ? sessions : []) {
    const meta = s?.metadata || {};
    const recorded = meta.window_visible;
    if (recorded !== true && recorded !== false) { skipped.push({ session_id: s?.session_id, reason: 'no_recorded_visibility' }); continue; }
    const handle = Number(meta.window_handle);
    if (!Number.isFinite(handle) || handle === 0) { skipped.push({ session_id: s?.session_id, reason: 'no_usable_handle' }); continue; }
    if (!map.has(handle)) { skipped.push({ session_id: s?.session_id, reason: 'window_absent' }); continue; }

    checked++;
    const actual = map.get(handle);
    if (actual === recorded) continue;
    drift.push({
      session_id: s?.session_id,
      handle,
      recorded,
      actual,
      // BOTH directions are first-class. Neither is a special case of the other.
      direction: recorded === false && actual === true
        ? DRIFT_RECORDED_HIDDEN_BUT_VISIBLE
        : DRIFT_RECORDED_VISIBLE_BUT_HIDDEN,
    });
  }
  return { drift, checked, skipped };
}

/**
 * Human summary for an operator. States BOTH counts explicitly, including the zeros.
 *
 * Printing only the non-zero direction would let the undetected-by-design story quietly return: an
 * operator who never sees "recorded_visible_but_hidden: 0" cannot tell whether it was checked and
 * clean or never checked at all.
 */
export function summarizeDrift(result) {
  const d = result?.drift || [];
  const hiddenButVisible = d.filter((x) => x.direction === DRIFT_RECORDED_HIDDEN_BUT_VISIBLE).length;
  const visibleButHidden = d.filter((x) => x.direction === DRIFT_RECORDED_VISIBLE_BUT_HIDDEN).length;
  return `checked=${result?.checked ?? 0} drift=${d.length} `
    + `(${DRIFT_RECORDED_HIDDEN_BUT_VISIBLE}=${hiddenButVisible}, ${DRIFT_RECORDED_VISIBLE_BUT_HIDDEN}=${visibleButHidden}) `
    + `skipped=${(result?.skipped || []).length}`;
}
