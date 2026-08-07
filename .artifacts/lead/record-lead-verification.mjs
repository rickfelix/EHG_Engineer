import { createClient } from '@supabase/supabase-js';

const SD = 'SD-LEO-INFRA-TREND-EYES-OFF-001';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: before, error: readErr } = await sb
  .from('strategic_directives_v2')
  .select('id,sd_key,metadata')
  .eq('sd_key', SD)
  .single();
if (readErr) { console.error('READ FAILED:', readErr.message); process.exit(2); }

const md = before.metadata || {};

// The gate requires WHO read it and WHERE (file:line). A boolean is explicitly rejected.
const mechanism_verifications = [
  {
    verified_by: 'Alpha-2 fleet worker (session a3f4b741-975e-4ee7-b2e0-049d735d2fb0), LEAD phase 2026-08-07',
    verified_at: 'lib/solomon/chairman-sms-exchanges.js:100',
    claim: 'readChairmanSmsExchanges() exists and is reusable as the SMS lane reader',
    finding: 'CONFIRMED. Read all 146 lines first-hand. Signature (supabase, {windowHours, now}) returns {window, exchanges, counts}; reads sms_relay_staging + sms_outbound_obligations.'
  },
  {
    verified_by: 'Alpha-2 fleet worker (session a3f4b741-975e-4ee7-b2e0-049d735d2fb0), LEAD phase 2026-08-07',
    verified_at: 'lib/solomon/chairman-sms-exchanges.js:43',
    claim: 'the spine lists readChairmanSmsExchanges as "reused, not re-derived" for T1 REPEAT-QUESTION clustering',
    finding: 'PARTIALLY REFUTED — MATERIAL. The docblock at :43-46 states correlation is CHRONOLOGICAL ADJACENCY per counterpart phone, NOT similarity, and explains why: "a confident mispairing would produce a finding that cites the wrong exchange, which is worse than a gap." The module therefore supplies the bounded LANE READ but supplies NO question-class clustering. T1 clustering is NEW work, not reuse. PLAN must budget for it and must not inherit the reuse assumption.'
  },
  {
    verified_by: 'Alpha-2 fleet worker (session a3f4b741-975e-4ee7-b2e0-049d735d2fb0), LEAD phase 2026-08-07',
    verified_at: 'lib/solomon/chairman-sms-exchanges.js:102',
    claim: 'the reader supports a bounded window (needed so the cron does not grow unbounded)',
    finding: 'CONFIRMED and stronger than claimed — the bound is MANDATORY, not optional: throws "windowHours must be a positive number — an unbounded read is not permitted". DEFAULT_WINDOW_HOURS=48 at :32.'
  },
  {
    verified_by: 'Alpha-2 fleet worker (session a3f4b741-975e-4ee7-b2e0-049d735d2fb0), LEAD phase 2026-08-07',
    verified_at: 'lib/solomon/chairman-sms-exchanges.js:117',
    claim: 'run-receipt design needs quiet-because-flat to be distinguishable from dead-emitter',
    finding: 'CONFIRMED that the reader already honours this discipline at its own layer: a query error THROWS rather than returning [], with the rationale "Returning [] on error would make could-not-read and nothing-was-said indistinguishable." The scan script must not swallow this into an empty result.'
  }
];

// LEAD acceptance conditions — verified findings PLAN must honour. Recorded as metadata rather
// than edited into the spine: the chairman approved Solomon's design verbatim, so LEAD records
// constraints against it and does NOT silently amend an approved design.
const lead_acceptance_conditions = {
  recorded_by: 'Alpha-2 fleet worker, LEAD phase 2026-08-07',
  evidence_rows: {
    VALIDATION: 'd539b2c6-4c21-4fc6-ab29-482f46f8262c',
    Explore: '7d07830b-6b39-49bc-b88b-3e9ac855dd99'
  },
  conditions: [
    {
      id: 'C1',
      severity: 'high',
      title: 'T2 must read retention_archive UNION session_coordination, not session_coordination alone',
      finding: 'session_coordination is a SURVIVOR table: 3,725 live rows spanning only 2026-07-24 to 2026-08-07, 84% from the last 7 days. A trend computed on it measures the DELETION POLICY, not conduct. The codebase already says so at lib/coordination/answered-rate.cjs:3-8: "READ THE LEDGER, NEVER session_coordination... a survivor-table rate measures the deletion policy rather than anyone\'s conduct." The durable source exists and the spine does not name it: retention_archive holds 44,003 archived session_coordination rows spanning 2026-03-11 to 2026-08-06 (archive-before-delete at 20260713_fix_cleanup_expired_coordination_where_clause.sql:38-42).',
      requirement: 'T2 reads retention_archive UNION session_coordination as a named PRD requirement, with a two-sided test. Zero-new-tables holds only under this union.'
    },
    {
      id: 'C2',
      severity: 'high',
      title: 'T3 must not become the fourth writer to issue_patterns.trend',
      finding: 'calculate_pattern_trends() is LIVE in pg_proc (20260110_pattern_intelligence.sql:55), does 7d-vs-prior-30d trend detection over issue_patterns, has ZERO callers, and reads pattern_occurrences which has 0 rows. Separately, issue_patterns.trend IS populated (stable=1206 / decreasing=401 / increasing=38) by a different writer entirely: the age-based decay marker at scripts/detect-stale-patterns.js:104-120 — age, not a series.',
      requirement: 'T3 either reconciles with the existing calculate_pattern_trends / issue_patterns.trend writers or scopes away from that column. Decide explicitly in the PRD; do not add a fourth writer.'
    },
    {
      id: 'C3',
      severity: 'medium',
      title: 'chairman_decision_captures does not exist',
      finding: 'The spine names "chairman_decisions + captures" as a data source. chairman_decision_captures is not a live table. Nearest real surfaces: chairman_decision_audit, or the feedback category chairman_decision_capture (10 rows).',
      requirement: 'PRD names the actual surface it reads, or drops the source.'
    },
    {
      id: 'C4',
      severity: 'medium',
      title: 'Encode the feedback insert contract before the first cron run',
      finding: 'feedback.category is free-text (verified: varchar(50) nullable, no pg_enum, none of the 23 table constraints reference category) so solomon_trend_candidate / solomon_trend_params need no migration. BUT feedback has 4 NOT NULL no-default columns (type, source_application, source_type, title), two of them CHECK-constrained: type in {issue, enhancement} and source_type in {auto_capture, ...}. A naive cron writer takes a 23514 on its first run.',
      requirement: 'Write through the canonical writer lib/governance/emit-feedback.js and encode the required-column contract in the PRD. Additionally keep solomon_trend_candidate OUT of MACHINE_TELEMETRY_CATEGORIES (lib/governance/feedback-audience.js) — membership silently collapses ALL rows of a category into one per day and ignores the caller\'s dedup_key.'
    },
    {
      id: 'C5',
      severity: 'medium',
      title: 'Narrow the no-existing-series claim; resolve the merge_witness_telemetry overlap',
      finding: 'The spine claim "no current instrument owns longitudinal SERIES (gauges are point-event)" is REFUTED as written: 8+ longitudinal instruments exist, and lib/ship/witness-adoption.mjs:131 already builds a day-bucketed 60-day series with a consecutive-day streak over merge_witness_telemetry — a source this SD names as its own. The TRUE and better claim is conceded by the gauge registry in its own vocabulary: lib/governance/gauge-registry.js:320 defines accumulationSignal as "the alarm on the SERIES, distinct from the per-event signal", records it MISSING at :356 and :386, and states at :394 that "only the series exposes the outage".',
      requirement: 'PRD cites gauge-registry.js:320/356/386 instead of the global claim, and explicitly states how T-classes relate to witness-adoption.mjs:131. Also cite lib/learning/outcome-tracker.js:364 detectRecurrence as T2 point-event prior art rather than appearing unaware of it.'
    },
    {
      id: 'C6',
      severity: 'high',
      title: 'Wiring is the deliverable — the nearest precedent shipped unwired',
      finding: 'SD-LEO-INFRA-CONSULTANT-AGENT-PHASE-001 and -002 both reached COMPLETED, shipping scripts/eva/eva-trend-snapshot.mjs and scripts/eva/trend-detector.mjs. Both are verified UNWIRED — no npm script, no workflow entry. The in-repo lesson is already written at .github/workflows/solomon-judgment-expiry.yml:22-25: "that is not a disabled mechanism, it is an ABSENT one."',
      requirement: 'Acceptance binds to the COUNTER, not the CALL: a merged workflow file is not evidence. Ship evidence must be a real scheduled run producing a run-receipt row plus at least one candidate row, and the two-sided validation (seeded known-trend MUST fire AND flat series MUST NOT) must run in the same suite.'
    }
  ],
  reuse_targets_confirmed: {
    workflow_template: '.github/workflows/solomon-ledger-reconcile.yml (do NOT copy solomon-judgment-expiry.yml — it ships deliberately disabled, schedule commented out)',
    series_mechanic: 'lib/governance/recursion-governor.js writeThroughputSnapshot / fetchRecentSnapshots / detectSustainedBreach over the EXISTING codebase_health_snapshots table',
    run_receipt_triple: 'scripts/gauge-runner.mjs:585-595 writeHeartbeat (writer) + dimension gauge_runner_heartbeat + external pure predicate lib/governance/gauge-runner-liveness.js checkGaugeRunnerLiveness',
    per_day_cap_idiom: 'scripts/lib/ci-recurrence-detector.mjs DEFAULT_PER_DAY_CAP',
    scan_shape: 'lib/solomon/conduct-probes.js pure-probe / injectable-resolver split',
    auth_constraint: 'supabase-js + service-role ONLY; SUPABASE_POOLER_URL is injected into ZERO cron yml and is silently undefined on a GHA runner (solomon-late-verdict-reconcile-cron.yml:38-40)'
  }
};

const nextMd = { ...md, mechanism_verifications, lead_acceptance_conditions };

const { data: updated, error: updErr } = await sb
  .from('strategic_directives_v2')
  .update({ metadata: nextMd })
  .eq('sd_key', SD)
  .select('id,sd_key');

if (updErr) { console.error('UPDATE FAILED:', updErr.message); process.exit(2); }

// An UPDATE matching zero rows is indistinguishable from success — assert the row count.
if (!updated || updated.length !== 1) {
  console.error(`UPDATE MATCHED ${updated ? updated.length : 0} ROWS, expected exactly 1 — treating as FAILURE`);
  process.exit(3);
}

// Read back from the database rather than trusting the write.
const { data: after, error: verifyErr } = await sb
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD)
  .single();
if (verifyErr) { console.error('READBACK FAILED:', verifyErr.message); process.exit(2); }

const mv = after.metadata?.mechanism_verifications;
const lac = after.metadata?.lead_acceptance_conditions;
console.log('rows_updated=1');
console.log('mechanism_verifications persisted:', Array.isArray(mv) ? mv.length : 'MISSING');
console.log('  citations:', Array.isArray(mv) ? mv.map((v) => v.verified_at).join(', ') : 'n/a');
console.log('lead_acceptance_conditions persisted:', lac?.conditions?.length ?? 'MISSING');
console.log('preserved prior metadata keys:', Object.keys(md).every((k) => k in after.metadata) ? 'ALL PRESERVED' : 'LOSS DETECTED');
console.log('trend_eyes_go still present:', after.metadata?.trend_eyes_go ? 'yes' : 'NO — REGRESSION');
