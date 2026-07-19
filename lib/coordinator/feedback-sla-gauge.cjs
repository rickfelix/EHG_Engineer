'use strict';
// Feedback-consumption SLA gauge — QF-20260704-493 (Solomon referent-audit cell [4],
// chairman-commissioned coverage work 2026-07-04). Actionable feedback categories with
// NO consumption deadline can rot unconsumed indefinitely — adam_adherence_drift is the
// adherence system's own dead-letter class when nobody consumes it.
//
// Unbounded-generator family rules (docs/plans/archived/sd-leo-infra-chairman-email-channel-001-plan.md):
//   primary-state check  — planSlaBreaches() recomputes fresh from live feedback rows every call.
//   terminal suppression — only UNCONSUMED_STATUSES rows count; resolved rows never breach.
//   rate limit            — remindSlaBreaches() sends at most one reminder per category per day
//                            (metadata.sla_key dedup, checked before insert).
//   probe visibility      — every reminder attempt is console-logged, success or failure.

const SLA_CATEGORIES = Object.freeze({
  adam_adherence_drift: Object.freeze({ days: 7 }),
  completion_flag: Object.freeze({ days: 7 }),
  coordinator_review: Object.freeze({ days: 7 }),
  harness_backlog: Object.freeze({ days: 7, severityIn: ['high', 'critical'] }),
});
const UNCONSUMED_STATUSES = ['new', 'triaged'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** Pure: group already-fetched feedback rows into per-category SLA breaches. */
function computeBreaches(rows, nowMs) {
  const breaches = [];
  for (const [category, cfg] of Object.entries(SLA_CATEGORIES)) {
    const slaMs = cfg.days * DAY_MS;
    const matches = (rows || []).filter((r) => {
      if (r.category !== category) return false;
      if (cfg.severityIn && !cfg.severityIn.includes(String(r.severity || '').toLowerCase())) return false;
      return (nowMs - new Date(r.created_at).getTime()) > slaMs;
    });
    if (matches.length === 0) continue;
    const oldestAgeDays = Math.floor(Math.max(...matches.map((r) => nowMs - new Date(r.created_at).getTime())) / DAY_MS);
    breaches.push({ category, count: matches.length, oldestAgeDays });
  }
  return breaches;
}

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: the unconsumed-backlog scan is a counted
// read (breach counts/oldest-age come from the rows) — a read silently capped at the PostgREST
// 1000-row max would under-report breaches. Paginate to completion; fail-loud (throw) policy
// preserved via the wrap below.
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

/** Fetches unconsumed feedback rows and computes fresh SLA breaches (primary-state check). */
async function planSlaBreaches(supabase, { nowMs = Date.now() } = {}) {
  let data;
  try {
    data = await fapPaginate(() => supabase
      .from('feedback')
      .select('id, category, severity, created_at')
      .in('category', Object.keys(SLA_CATEGORIES))
      .in('status', UNCONSUMED_STATUSES)
      .order('id')); // unique-key tiebreaker for stable pagination
  } catch (e) {
    throw new Error(`planSlaBreaches query failed: ${(e && e.message) || String(e)}`);
  }
  return computeBreaches(data || [], nowMs);
}

/** Pure: today's dedup key for a category's reminder (rate limit: one per category per day). */
function slaKeyFor(category, nowMs) {
  return `${category}:${new Date(nowMs).toISOString().slice(0, 10)}`;
}

/** Rate-limited, deduped daily reminder: at most one feedback row per category per day. */
async function remindSlaBreaches(supabase, { nowMs = Date.now() } = {}) {
  const breaches = await planSlaBreaches(supabase, { nowMs });
  const sent = [];
  for (const b of breaches) {
    const key = slaKeyFor(b.category, nowMs);
    const { data: existing } = await supabase.from('feedback').select('id')
      .eq('category', 'feedback_sla_breach').eq('metadata->>sla_key', key).limit(1);
    if (existing && existing.length) {
      console.log(`[feedback-sla-gauge] category=${b.category} already reminded today (${key}) — skipping`);
      continue;
    }
    const { error } = await supabase.from('feedback').insert({
      type: 'issue', source_application: 'EHG_Engineer', source_type: 'auto_capture',
      category: 'feedback_sla_breach', status: 'new', severity: 'medium',
      title: `Feedback SLA breach: ${b.category} (${b.count} unconsumed, oldest ${b.oldestAgeDays}d)`,
      description: `${b.count} unconsumed '${b.category}' feedback row(s) exceed the ${SLA_CATEGORIES[b.category].days}-day consumption SLA; oldest is ${b.oldestAgeDays} days old.`,
      metadata: { sla_key: key, sla_category: b.category, count: b.count, oldest_age_days: b.oldestAgeDays },
    });
    console.log(`[feedback-sla-gauge] ${error ? 'FAILED to remind' : 'reminded'} category=${b.category} count=${b.count} oldest=${b.oldestAgeDays}d`);
    if (!error) sent.push(b.category);
  }
  return { breaches, sent };
}

module.exports = { SLA_CATEGORIES, UNCONSUMED_STATUSES, computeBreaches, planSlaBreaches, slaKeyFor, remindSlaBreaches };
