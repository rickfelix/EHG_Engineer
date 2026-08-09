/**
 * SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001 FR-8 — per-venture chairman-readable honesty audit.
 *
 * Answers three questions for one venture: what was SENT, what was BLOCKED, and WHY.
 *
 * EVERY REASON IS READ FROM A STORED RECORD, never recomputed here. That is the requirement and
 * it is not pedantry: a reason recomputed at read time answers "what would the gate decide NOW",
 * which is a different question from "why was this actually blocked", and the two diverge exactly
 * when something has changed — which is precisely when the chairman is asking.
 *
 * NO_DATA AND BLOCKED ARE RENDERED DISTINCTLY AND ARE NEVER MERGED. "We measured this venture and
 * it fell short" and "nobody is measuring this venture" look identical on a dashboard that shows
 * only a red light, and they call for opposite responses: one is a product problem, the other is
 * an instrumentation problem.
 *
 * @module lib/marketing/venture-honesty-audit
 */

import { ACTIVATION_VERDICT } from './venture-activation-gate.js';
import { CONSENT_EVENT } from './venture-consent.js';

/** What the audit can say about a venture's activation posture. */
export const AUDIT_STATUS = Object.freeze({
  PASS: 'PASS',
  BLOCKED: 'BLOCKED',
  NO_DATA: 'NO_DATA',
  NO_VERDICT_RECORDED: 'NO_VERDICT_RECORDED',
  VERDICT_UNREADABLE: 'VERDICT_UNREADABLE',
});

/** Human-facing gloss per status. Distinct sentences, because the whole point is that these
 *  outcomes are not interchangeable. */
export const STATUS_MEANING = Object.freeze({
  [AUDIT_STATUS.PASS]: 'measured demand met a ratified floor — this venture may activate',
  [AUDIT_STATUS.BLOCKED]: 'demand WAS measured and fell short of a ratified floor — a product problem',
  [AUDIT_STATUS.NO_DATA]: 'demand could NOT be measured — an instrumentation problem, not a demand problem',
  [AUDIT_STATUS.NO_VERDICT_RECORDED]: 'the gate has never been run for this venture — no verdict exists to read',
  [AUDIT_STATUS.VERDICT_UNREADABLE]: 'the verdict store could not be read — the audit cannot speak to this venture',
});

/**
 * Build the audit for one venture. Read-only: it SELECTs and never writes, so running it can
 * never change what it reports.
 */
export async function buildHonestyAudit({ supabase, ventureId }) {
  const audit = {
    venture_id: ventureId,
    activation: null,
    consent: null,
    sends: null,
    gaps: [],
  };

  // ── ACTIVATION: read the STORED verdict, newest first. ────────────────────────────────────
  const { data: verdictRows, error: verdictError } = await supabase
    .from('venture_demand_verdicts')
    .select('verdict, citation, path_to_pass, rungs, computed_at')
    .eq('venture_id', ventureId)
    .order('computed_at', { ascending: false })
    .limit(1);

  if (verdictError) {
    audit.activation = {
      status: AUDIT_STATUS.VERDICT_UNREADABLE,
      meaning: STATUS_MEANING[AUDIT_STATUS.VERDICT_UNREADABLE],
      detail: verdictError.message,
    };
    // Said out loud rather than rendered as "no problems found": an unreadable store and a clean
    // one are the same silence, and only one of them is safe.
    audit.gaps.push(`verdict store unreadable: ${verdictError.message}`);
  } else {
    const v = (verdictRows || [])[0];
    if (!v) {
      audit.activation = {
        status: AUDIT_STATUS.NO_VERDICT_RECORDED,
        meaning: STATUS_MEANING[AUDIT_STATUS.NO_VERDICT_RECORDED],
      };
      audit.gaps.push('no demand verdict has ever been recorded for this venture');
    } else {
      const status = v.verdict === ACTIVATION_VERDICT.PASS ? AUDIT_STATUS.PASS
        : v.verdict === ACTIVATION_VERDICT.BLOCKED ? AUDIT_STATUS.BLOCKED
        : AUDIT_STATUS.NO_DATA;
      audit.activation = {
        status,
        meaning: STATUS_MEANING[status],
        // STORED, not recomputed.
        reason: v.citation,
        path_to_pass: v.path_to_pass,
        computed_at: v.computed_at,
        unmeasurable_rungs: Object.values(v.rungs || {})
          .filter((r) => r && r.state === 'UNMEASURABLE')
          .map((r) => ({ rung: r.rung, reason: r.reason })),
      };
    }
  }

  // ── CONSENT: counts over the STORED append-only event log. ────────────────────────────────
  const { data: consentRows, error: consentError } = await supabase
    .from('venture_consent_events')
    .select('recipient_email, event_type, occurred_at')
    .eq('venture_id', ventureId)
    .order('occurred_at', { ascending: false });

  if (consentError) {
    audit.consent = { readable: false, detail: consentError.message };
    audit.gaps.push(`consent store unreadable: ${consentError.message}`);
  } else {
    // Latest event per recipient decides current permission — the same rule the send path uses,
    // applied to the same stored rows, so the audit cannot disagree with the gate.
    const latest = new Map();
    for (const row of consentRows || []) {
      if (!latest.has(row.recipient_email)) latest.set(row.recipient_email, row);
    }
    const values = [...latest.values()];
    audit.consent = {
      readable: true,
      total_events: (consentRows || []).length,
      recipients_known: latest.size,
      currently_permitted: values.filter((r) => r.event_type === CONSENT_EVENT.OPT_IN).length,
      currently_suppressed: values.filter((r) => r.event_type === CONSENT_EVENT.OPT_OUT).length,
    };
  }

  // ── SENDS: the STORED publish ledger. ─────────────────────────────────────────────────────
  const { data: ledgerRows, error: ledgerError } = await supabase
    .from('venture_channel_publish_ledger')
    .select('channel_type, decision, outcome, created_at')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (ledgerError) {
    audit.sends = { readable: false, detail: ledgerError.message };
    audit.gaps.push(`publish ledger unreadable: ${ledgerError.message}`);
  } else {
    audit.sends = { readable: true, total: (ledgerRows || []).length };
  }

  // ── THE GAP THIS AUDIT CANNOT CLOSE, stated rather than papered over. ─────────────────────
  // processStep returns { action: 'suppressed', reason } to its CALLER and nothing persists it.
  // So there is no stored per-attempt blocked-send record to count, and this audit reports the
  // SUPPRESSED POPULATION (recipients whose latest consent event is an opt_out) instead of a
  // count of blocked send attempts. Those are different numbers and the audit must not present
  // one as the other. Reporting a confident zero here would be the exact defect this SD abolishes.
  audit.gaps.push(
    'per-attempt blocked-send records are NOT persisted: processStep returns the suppression to its caller and nothing stores it, so "blocked" below is the SUPPRESSED POPULATION (recipients currently opted out), not a count of blocked send attempts'
  );

  return audit;
}

/** Chairman-facing rendering. Distinct lines per status — never one red light for both. */
export function renderHonestyAudit(audit) {
  const lines = [];
  lines.push(`Venture ${audit.venture_id} — marketing honesty audit`);
  lines.push('');

  const a = audit.activation || {};
  lines.push(`ACTIVATION: ${a.status}`);
  lines.push(`  ${a.meaning || ''}`);
  if (a.reason) lines.push(`  why (as recorded): ${a.reason}`);
  if (a.path_to_pass) lines.push(`  path to pass: ${a.path_to_pass}`);
  if (a.computed_at) lines.push(`  verdict recorded at: ${a.computed_at}`);
  for (const r of a.unmeasurable_rungs || []) lines.push(`  unmeasurable rung ${r.rung}: ${r.reason}`);
  if (a.detail) lines.push(`  detail: ${a.detail}`);
  lines.push('');

  const c = audit.consent || {};
  lines.push('CONSENT:');
  if (!c.readable) {
    lines.push(`  UNREADABLE — ${c.detail}`);
  } else {
    lines.push(`  recipients known: ${c.recipients_known} (from ${c.total_events} recorded events)`);
    lines.push(`  currently permitted: ${c.currently_permitted}`);
    lines.push(`  currently suppressed: ${c.currently_suppressed}`);
  }
  lines.push('');

  const s = audit.sends || {};
  lines.push('SENDS:');
  lines.push(s.readable ? `  publish-ledger entries: ${s.total}` : `  UNREADABLE — ${s.detail}`);
  lines.push('');

  lines.push('GAPS THIS AUDIT CANNOT CLOSE:');
  for (const g of audit.gaps) lines.push(`  - ${g}`);

  return lines.join('\n');
}

export default { AUDIT_STATUS, STATUS_MEANING, buildHonestyAudit, renderHonestyAudit };
