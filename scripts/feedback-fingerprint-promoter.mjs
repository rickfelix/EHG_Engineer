#!/usr/bin/env node
/**
 * SD-LEO-INFRA-HARNESS-BACKLOG-DRAIN-POLICY-001 / FR-5
 *
 * Scheduled promoter: groups feedback rows (category='harness_backlog',
 * archived_at IS NULL, created within a rolling 14-day window) by content
 * fingerprint (title+description, via lib/shared/content-fingerprint.cjs — the
 * same primitive lib/coordinator/signal-router.cjs uses for worker-signal
 * aggregation, FR-4). Any fingerprint with 3+ distinct occurrences is promoted to
 * exactly one QF-candidate via the existing QF-creation path
 * (scripts/create-quick-fix.js), citing the fingerprint, occurrence count, and
 * source feedback row ids.
 *
 * Idempotent: a fingerprint already promoted has metadata.promoted_to_qf stamped
 * on every contributing row; if ANY row in the current window's group already
 * carries that marker, the group is skipped (a later occurrence of an
 * already-promoted fingerprint does not create a duplicate QF, TS-3).
 *
 * QF creation is delegated to the CLI (not reimplemented) so dedup gates,
 * STALE_PREMISE liveness re-check, and per-feedback-row pre-claim all apply
 * exactly as they do for a human-filed QF.
 *
 * Usage:
 *   node scripts/feedback-fingerprint-promoter.mjs           # dry run (default)
 *   node scripts/feedback-fingerprint-promoter.mjs --apply    # actually create QFs
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { groupByFingerprint, shouldPromote, severityRank } from '../lib/shared/content-fingerprint.cjs';
// SD-LEO-INFRA-WITHHELD-PROMOTIONS-GET-001: the durable sink for withheld groups. In lib/, taking
// supabase as a PARAMETER, for the same reason the gate is — this script builds its own client at
// module scope and exports nothing, so anything left inline here is testable only by source regex.
import { writeMarkers, MARKER_KEY } from '../lib/governance/withheld-registry.mjs';
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';
import { derivePromotedSeverity } from '../lib/feedback/promoted-severity.js';
// SD-LEO-INFRA-GATE-SIDE-BELT-001: this producer mints quick_fixes unattended on a 6-hourly cron and
// was ungated, so it could mint into a full belt indefinitely. The gate lives in lib/ (not inline
// here) because this script has no exports and its guard tests are source-text regexes, which cannot
// see control flow — and control flow is all a gate is.
import { gatedQfMint, FINGERPRINT_PROMOTER_ENGINE } from '../lib/governance/qf-mint-gate.mjs';

const apply = process.argv.includes('--apply');
const WINDOW_DAYS = 14;
const THRESHOLD = 3;
const FINGERPRINT_TYPE = 'harness_backlog_feedback';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString();

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: feedback is an unbounded growing
// table; a heavy campaign week can file well over 1000 harness_backlog rows in the 14-day
// window, and every row here is grouped/promoted below — paginate to completion.
let rows;
try {
  rows = await fetchAllPaginated(() => supabase
    .from('feedback')
    .select('id, title, description, severity, created_at, metadata')
    .eq('category', 'harness_backlog')
    .is('archived_at', null)
    // SD-LEO-INFRA-WITHHELD-PROMOTIONS-GET-001: WAS a bare .gte('created_at', cutoff), which is
    // the silent-expiry mechanism itself — a group withheld by the demand gate ages out of this
    // window and becomes invisible to the very run that could finally promote it. A durable record
    // that the promoter cannot SEE is readable-but-inert, a more expensive version of the defect.
    //
    // So: in-window OR carrying a pending marker. Both halves of this were verified live before
    // being encoded, because a filter that silently matches nothing is precisely the class of bug
    // this seat spent the day removing:
    //   - with zero markers written, the widened query returns exactly the same 1264 rows as the
    //     bare .gte, so the change is a provable no-op until a marker exists;
    //   - and the second branch genuinely admits out-of-window rows (measured 3291 with a
    //     predicate guaranteed to match them), so it is not a decorative disjunct.
    //
    // TESTS PENDING-NESS, NOT MERE PRESENCE. The first version admitted any row carrying a marker
    // at all — and neither exit (promotion or disposition) deletes the key, so a CONSUMED marker
    // went on admitting its row forever and the candidate set grew monotonically toward the whole
    // table. Found at review. The nested `and(...)` requires the marker to be present AND not yet
    // promoted; the syntax was verified live before being encoded rather than assumed to parse.
    .or(`created_at.gte.${cutoff},and(metadata->>${MARKER_KEY}.not.is.null,metadata->${MARKER_KEY}->>promoted_qf_id.is.null,metadata->${MARKER_KEY}->>disposed_at.is.null)`)
    // SD-LEO-INFRA-SIGNAL-PROMOTION-RESOLUTION-CHECK-001 (FR-4): this predicate had NO status
    // filter at all, so a row already marked resolved stayed promotion-eligible for its whole
    // 14-day window. Measured live at authoring time: 38 resolved + 1 invalid in-window rows were
    // still eligible to be minted into fresh QFs.
    //
    // Written as "null OR not-in(terminal)" rather than an allow-list of good statuses, for two
    // reasons. (1) SQL semantics: `status NOT IN (...)` evaluates to NULL for a NULL status, which
    // would silently DROP those rows — the fail-closed direction, and dropping real work is the
    // dangerous one here. (2) An allow-list would silently exclude any status added later, failing
    // closed by default. Only known-terminal statuses are excluded; everything else, including
    // NULL and any future value, still promotes exactly as before.
    .or('status.is.null,status.not.in.(resolved,invalid)')
    .order('id', { ascending: true })); // unique tiebreaker (FR-6)
} catch (e) {
  console.error('ERROR (select):', JSON.stringify({ message: e.message }));
  process.exitCode = 1;
  process.exit();
}

const groups = groupByFingerprint(rows, (r) => ({
  type: FINGERPRINT_TYPE,
  body: `${r.title || ''}\n${r.description || ''}`,
  groupKey: r.id,
  severity: r.severity,
  timestamp: r.created_at
}));

let promoted = 0;
let skippedAlreadyPromoted = 0;
let skippedBelowThreshold = 0;

// Extracted so the demand gate can ENCLOSE the minting rather than merely precede it. A gate that
// only returns a verdict is one forgotten `if` away from being decorative — and that omission is
// invisible to a source-text guard test, which is all this script had.
let suppressedCount = 0;
// SD-LEO-INFRA-WITHHELD-PROMOTIONS-GET-001: the suppressed GROUPS, not just how many. A count
// cannot be recorded durably in any useful way — you cannot re-promote an integer — and the
// groups were already in hand at the point the counter was incremented.
let suppressedGroups = [];
async function promoteAll(reportOnly = false) {
  suppressedCount = 0;
  suppressedGroups = [];
for (const group of groups.values()) {
  if (!shouldPromote(group, THRESHOLD)) {
    skippedBelowThreshold++;
    continue;
  }

  const alreadyPromoted = group.rows.some(r => r.metadata?.promoted_to_qf);
  if (alreadyPromoted) {
    skippedAlreadyPromoted++;
    continue;
  }

  const sourceIds = group.rows.map(r => r.id);
  console.log(`\n[PROMOTABLE] fingerprint=${group.fingerprint.slice(0, 12)} occurrences=${sourceIds.length} severity=${group.max_severity}`);
  console.log(`  source rows: ${sourceIds.join(', ')}`);
  console.log(`  sample: ${group.sample_body.slice(0, 120)}`);

  if (!apply || reportOnly) {
    if (reportOnly) { suppressedCount++; suppressedGroups.push(group); }
    console.log(reportOnly ? '  [WITHHELD] would have created a QF-candidate here - suppressed by belt demand.' : '  [DRY RUN] would create QF-candidate here.');
    continue;
  }

  const title = `[Fingerprint x${sourceIds.length}] ${(group.sample_body.split('\n')[0] || group.fingerprint).slice(0, 100)}`;

  // SD-LEO-INFRA-SIGNAL-PROMOTION-RESOLUTION-CHECK-001 (FR-5): derive the severity the QF enters
  // the belt with rather than inheriting the reporter's own adjective. Corroboration is counted
  // from the distinct callsigns signal-router stamped across the contributing rows.
  const callsigns = new Set();
  for (const r of group.rows) for (const c of (r.metadata?.contributing_callsigns || [])) callsigns.add(c);
  const sev = derivePromotedSeverity({
    declared: group.max_severity,
    callsigns: callsigns.size,
    occurrences: sourceIds.length,
  });
  if (sev.derived) console.log(`  [SEVERITY] ${group.max_severity} -> ${sev.severity}: ${sev.reason}`);

  const description = `Auto-promoted from ${sourceIds.length} harness_backlog occurrences sharing fingerprint ${group.fingerprint} within a ${WINDOW_DAYS}-day window. Source feedback row ids: ${sourceIds.join(', ')}.`
    + (sev.derived ? ` Severity derived: reported ${group.max_severity}, promoted ${sev.severity} — ${sev.reason}` : '');

  try {
    execFileSync('node', [
      'scripts/create-quick-fix.js',
      '--title', title,
      '--type', 'bug',
      '--severity', sev.severity,
      '--description', description,
      '--feedback-id', sourceIds.join(','),
    ], { stdio: 'inherit' });

    const stampedAt = new Date().toISOString();
    for (const id of sourceIds) {
      const row = group.rows.find(r => r.id === id);
      // SD-LEO-INFRA-WITHHELD-PROMOTIONS-GET-001: this spread is taken from a snapshot read at the
      // top of the run, so anything written to metadata SINCE that read is clobbered here unless
      // carried explicitly. A pending marker is exactly such a thing. CONSUME it rather than drop
      // it: promotion is one of only two recorded ways out of pending, and a marker that simply
      // vanished on promotion would be the silent exit this SD exists to abolish, relocated.
      const priorMarker = row?.metadata?.[MARKER_KEY];
      // THE QF ID IS NOT AVAILABLE HERE, AND THE FIELD NO LONGER PRETENDS OTHERWISE. create-quick-fix.js
      // runs with stdio:'inherit' (deliberately — its output is streamed), so the minted id is never
      // captured by this process. The first version stored group.fingerprint under promoted_qf_id,
      // which made two writers of one field disagree: consumeMarker REFUSES a falsy id precisely
      // because "consumed with no id" is a silent exit, while this path quietly satisfied the same
      // field with something that is not an id at all. A field whose name is a claim the value does
      // not support is the defect class this SD is about, in miniature.
      //
      // So: record what is actually known — that it was promoted, when, and by which fingerprint —
      // and leave promoted_qf_id null. isPending treats promoted_at as a terminal stamp, so the
      // marker still exits pending state correctly; it simply does not assert an id nobody captured.
      const consumed = priorMarker
        ? { [MARKER_KEY]: { ...priorMarker, promoted_at: stampedAt, promoted_fingerprint: group.fingerprint } }
        : {};
      await supabase
        .from('feedback')
        .update({ metadata: { ...(row?.metadata || {}), ...consumed, promoted_to_qf: true, promoted_at: stampedAt, promoted_fingerprint: group.fingerprint } })
        .eq('id', id);
    }
    promoted++;
  } catch (e) {
    console.error(`  [PROMOTE_FAILED] create-quick-fix.js exited non-zero for fingerprint ${group.fingerprint.slice(0, 12)}: ${e.message}`);
  }
}
  // REPORT-ONLY RETURNS WHAT IT SUPPRESSED, NOT WHAT IT MINTED. Returning `promoted` here made the
  // gate print "suppressed 0" on a run that suppressed 34 — a number that looked measured and looked
  // like good news. In report-only mode nothing is ever promoted, so `promoted` is 0 by construction.
  //
  // SD-LEO-INFRA-WITHHELD-PROMOTIONS-GET-001: report-only now returns the GROUPS. The gate derives
  // the count from .length — NOT from Number(), which returns NaN for an array and would print
  // "suppressed 0" again, reintroducing the exact defect the paragraph above records. Both halves
  // are pinned by tests; suppressedCount is kept in step so the two can never disagree.
  return reportOnly ? suppressedGroups : promoted;
}

// DRY-RUN IS DELIBERATELY UNGATED. Without --apply nothing is minted, so there is no belt to
// protect — and gating here would suppress the [PROMOTABLE] output that four integration assertions
// read. The gate guards MINTING, not reporting.
//
// The consequence of gating on apply is stated rather than discovered: on a dry-run-only day no
// decision is recorded, so the startup badge reads NEVER RAN. That is the correct trade — a recorded
// decision for a run that could never have minted would be a measurement of nothing.
/**
 * SD-LEO-INFRA-WITHHELD-PROMOTIONS-GET-001: record the suppressed groups durably.
 *
 * A thin binding, not logic — it supplies the run context the pure registry needs and nothing
 * else. GITHUB_RUN_ID is read here rather than inside the registry so the module stays free of
 * ambient environment and remains testable without one.
 */
async function recordWithheld(sb, groups, demand) {
  const { written, failed } = await writeMarkers(sb, groups, demand, {
    runId: process.env.GITHUB_RUN_ID || null,
    nowIso: new Date().toISOString(),
    severityRank,
    threshold: THRESHOLD,
  });
  // THE HEADLINE MUST NOT OVERSTATE WHAT LANDED. The first version printed "these now survive
  // their 14-day window" unconditionally, including on a run where every write was rejected —
  // a claim of protection that had not happened, with nothing to contradict it. A total failure
  // now throws inside writeMarkers; a partial one is reported as partial, here, in the headline.
  if (failed && failed.length > 0) {
    console.log(`  [WITHHELD_RECORDED] PARTIAL: ${written} of ${written + failed.length} source row(s) marked across ${groups.length} group(s) — ${failed.length} FAILED and are NOT protected (first: ${failed[0].error})`);
  } else {
    console.log(`  [WITHHELD_RECORDED] ${written} source row(s) marked pending across ${groups.length} group(s) — these now survive their 14-day window.`);
  }
  return written;
}

let withheldByDemand = false;
if (!apply) {
  await promoteAll();
} else {
  // SD-LEO-INFRA-WITHHELD-PROMOTIONS-GET-001: writeMarkers is passed ONLY here, never on the
  // dry-run path above. Dry-run is deliberately ungated, so a durable write there would let every
  // operator preview permanently change what the next real run consumes — an observation that
  // mutates the thing observed. The opts literal stays brace-flat on purpose: a source-regex guard
  // matches this call site with a [^}] class that a nested object would break.
  const result = await gatedQfMint(supabase, { engine: FINGERPRINT_PROMOTER_ENGINE, onWithheld: () => promoteAll(true), writeMarkers: recordWithheld }, promoteAll);
  withheldByDemand = result.withheldByDemand;
}

console.log(`\nSummary: ${promoted} promoted, ${skippedAlreadyPromoted} already-promoted, ${skippedBelowThreshold} below threshold.`
  + (withheldByDemand ? ' — WITHHELD by belt demand, nothing minted.' : ''));
