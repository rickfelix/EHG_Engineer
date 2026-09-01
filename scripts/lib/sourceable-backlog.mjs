// scripts/lib/sourceable-backlog.mjs — SD-FDBK-FIX-COORDINATOR-AUDIT-MJS-002
//
// The coordinator-audit SOURCE BACKLOG verdict counted EVERY open category='harness_backlog'
// feedback row. But capture-completion-flags.js routes completion-flag captures (friction /
// harness / feedback flags filed at SD completion) into category='harness_backlog' with
// metadata.flag_class set and a title like "Completion flag (harness) — SD-XXX". Those are
// CLOSURE WITNESSES from already-completed SDs, not curated work to source into NEW draft SDs —
// counting them produced a false "source N high-priority" verdict (repro: 101 open / only 1 truly
// high-critical, but the verdict said "source 2-3"). This filters the backlog down to GENUINE,
// non-capture sourceable items so the verdict reflects real work.

/**
 * SD-LEO-INFRA-HARNESS-BACKLOG-PER-001 (FR-8): SUPERSEDED DESIGN NOTICE.
 *
 * This reader-side title-regex/flag_class heuristic was the SOLE protection under
 * SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001's reader-side-only design — it only
 * protects callers that route through THIS file (namely coordinator-audit.mjs's SOURCE
 * BACKLOG view). SD-LEO-INFRA-HARNESS-BACKLOG-PER-001 superseded that design with
 * write-time categorization (FR-1/FR-2: capture-completion-flags.js now writes real
 * per-flag findings directly to category='completion_flag_finding', not
 * 'harness_backlog') after two 2026-08-31 misread specimens — an Adam remedy-check and a
 * coordinator D6 hand-query, both reading raw category='harness_backlog' directly —
 * showed reader-side-only filtering does nothing for any ad-hoc query outside this one
 * file. This heuristic remains here, unchanged, ONLY to stay correct for any legacy row
 * still in flight before the FR-3/FR-4 backfill sweeps it to the new category — it is
 * redundant, not removable, for post-migration rows (which never reach category=
 * 'harness_backlog' in the first place and so never reach this filter at all).
 *
 * Is this feedback row a completion-flag / fleet-retro / coordinator-review AUTO-CAPTURE
 * (a closure artifact), as opposed to a genuine sourceable harness-backlog item?
 * Primary signal: metadata.flag_class (set by capture-completion-flags.js). Title fallback
 * covers rows fetched without metadata.
 *
 * SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 (FR-10): the alternation used to be
 * "completion flag" (no plural), so \b never broke between "flag" and the "s" in
 * capture-completion-flags.js's actual witness title "Completion flags witness — SD-XXX"
 * (both are word characters -- no boundary exists there) -- the witness rows silently
 * fell through this filter uncaught. "flags?" makes the plural match too.
 * @param {{title?:string, metadata?:object}} r feedback row
 * @returns {boolean}
 */
export const isAutoCaptureFeedback = (r) => {
  if (r && r.metadata && r.metadata.flag_class) return true;
  return /^\s*(completion flags?|fleet retro|coordinator review)\b/i.test(String((r && r.title) || ''));
};

/**
 * Filter a harness_backlog list to the genuine, sourceable items (drops auto-captures).
 * @param {Array} backlog
 * @returns {Array}
 */
export const sourceableBacklog = (backlog) => (backlog || []).filter((r) => !isAutoCaptureFeedback(r));
