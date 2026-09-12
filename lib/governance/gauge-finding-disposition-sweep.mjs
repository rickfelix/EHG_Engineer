/**
 * Gauge-finding disposition sweep — QF-20260911-425.
 *
 * invariant_gauge_finding (gauge-registry.js's own entry: "consumer: gauge_finding_dispositions
 * (the designed drain); closingPath: a gauge_finding_dispositions row per finding") has 5,423+
 * feedback rows sitting status=new/triaged against EXACTLY ONE disposition ever written (for an
 * unrelated fingerprint, WAVE_LINKAGE_STARVATION) -- the designed drain was never built for this
 * category. This sweep builds it: group the outstanding findings by fingerprint (gauge_id -- the
 * only stable grouping dimension these snapshot-style findings carry; none of the 21 live gauge_id
 * values in this category expose a finer per-entity "subject"), and write ONE
 * gauge_finding_dispositions row per fingerprint through the EXISTING canonical writer
 * (acceptDisposition, scripts/gauge-findings/disposition.js) -- never a second writer.
 *
 * Deliberately does NOT attempt to flip the member feedback rows' own status. public.feedback
 * carries an unconditional append-only trigger (database/chairman-gated/
 * 20260907_feedback_immutability_trigger.sql, feedback_no_update) that rejects ANY UPDATE,
 * including a metadata-only patch -- there is no column-scoped exception. The disposition row
 * IS the designed closing artifact per the registry's own description; it is not a workaround for
 * an unreachable member-row mutation, it is the documented mechanism.
 */
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';
import { acceptDisposition, getDisposition } from '../../scripts/gauge-findings/disposition.js';

export const CATEGORY = 'invariant_gauge_finding';
export const UNDRAINED_STATUSES = ['new', 'triaged'];
const DEFAULT_RE_REVIEW_DAYS = 14;

/**
 * Pure grouping: outstanding finding rows -> one entry per fingerprint, sorted by count desc.
 * @param {Array<{id, created_at, metadata}>} rows
 * @returns {Array<{fingerprint:string, count:number, oldestCreatedAt:string, sampleIds:string[]}>}
 */
export function computeFingerprintGroups(rows) {
  const byFingerprint = new Map();
  for (const r of rows || []) {
    const fingerprint = (r.metadata && r.metadata.gauge_id) || '(unknown-gauge)';
    let group = byFingerprint.get(fingerprint);
    if (!group) {
      group = { fingerprint, count: 0, oldestCreatedAt: r.created_at, sampleIds: [] };
      byFingerprint.set(fingerprint, group);
    }
    group.count += 1;
    if (r.created_at && r.created_at < group.oldestCreatedAt) group.oldestCreatedAt = r.created_at;
    if (group.sampleIds.length < 3) group.sampleIds.push(r.id);
  }
  return [...byFingerprint.values()].sort((a, b) => b.count - a.count);
}

/**
 * Sweep: read every outstanding invariant_gauge_finding row, group by fingerprint, and upsert one
 * accepted_known_state disposition per fingerprint (idempotent via acceptDisposition's upsert on
 * the fingerprint UNIQUE constraint -- a re-run refreshes re_review_at/reason on the SAME rows,
 * never inserting a second one per fingerprint).
 * @param {object} supabase
 * @param {{apply?:boolean, reReviewDays?:number, dispositionedBy?:string}} [opts]
 */
export async function sweepGaugeFindingDispositions(supabase, opts = {}) {
  const { apply = false, reReviewDays = DEFAULT_RE_REVIEW_DAYS, dispositionedBy = 'gauge-finding-disposition-sweep' } = opts;

  const rows = await fetchAllPaginated(() => supabase
    .from('feedback')
    .select('id, created_at, metadata')
    .eq('category', CATEGORY)
    .in('status', UNDRAINED_STATUSES)
    .order('id', { ascending: true }));

  const groups = computeFingerprintGroups(rows);
  const reReviewAt = new Date(Date.now() + reReviewDays * 24 * 60 * 60 * 1000).toISOString();
  const result = { outstanding: rows.length, fingerprints: groups.length, dispositioned: 0, dry_run: !apply, groups };

  if (!apply) return result;

  for (const g of groups) {
    const existing = await getDisposition(supabase, g.fingerprint);
    const reason = `Disposition sweep (QF-20260911-425): ${g.count} outstanding invariant_gauge_finding row(s), oldest ${g.oldestCreatedAt}. Recurring backlog surfaced for review -- accepted as a known, tracked condition pending individual triage, not yet resolved.`;
    await acceptDisposition(supabase, {
      fingerprint: g.fingerprint,
      reReviewAt: existing ? existing.re_review_at : reReviewAt, // don't reset an already-scheduled re-review on a plain re-run
      reason,
      dispositionedBy,
    });
    result.dispositioned += 1;
  }
  return result;
}
