// QF-20260818-459 PART 2 (BURN-DOWN): classify every reason-less roadmap-link exception
// (metadata.roadmap_link_exception.reason_supplied === false) as either
//   serves-ratified-live-priority:<venture-1-revenue-path|crack-gate|chairman-commission>
// or
//   reactive-fix:<class>
// and stamp the verdict onto each row's metadata + emit one summary artifact for Adam.
//
// Classification rubric applied (see the QF's own text): "serves-ratified-live-priority"
// requires a DIRECT trace to one of the three named, ratified priorities -- not just
// harness work that indirectly supports the fleet. Everything else, including security
// hardening, gate-bug fixes, CI-ops, coordination-infra, and observability work, is
// reactive-fix -- honest by default, not inflated. Drive-score SDs are classified as
// chairman-commission: it is the chairman's own explicitly-championed north-star metric
// system, not incidental harness plumbing (see project_six_dimension_drive_system memory).
//
// The mapping below was built by reading every row's title/type/status directly (not a
// keyword regex) against that rubric. Any row NOT in this map (created after this script's
// query snapshot) is left unclassified and reported separately -- never silently skipped.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/QF-20260818-459';
function abs(p) { return pathToFileURL(path.join(ROOT, p)).href; }
const { supabase } = await import(abs('lib/sd-creation/context.js'));

const CLASSIFICATION = {
  'SD-LEO-INFRA-GATE-THRESHOLD-TUNING-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-WRITER-SUB-AGENT-001': 'reactive-fix:harness-observability',
  'SD-LEO-INFRA-GUARD-FIRING-RECORDS-001': 'reactive-fix:harness-observability',
  'SD-LEO-INFRA-FORCE-ROLE-SESSIONS-001': 'reactive-fix:harness-observability',
  'SD-LEO-INFRA-NORMATIVE-SIGNAL-AUDIT-001': 'reactive-fix:harness-observability',
  'SD-LEO-INFRA-TIER-GATE-FLAG-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-COORDINATION-BUS-ACCESS-001': 'reactive-fix:security-hardening',
  'SD-LEO-INFRA-RELEASED-MID-PHASE-001': 'reactive-fix:coordination-infra',
  'SD-LEO-INFRA-STRUCTURED-FIELDS-HONEST-001': 'reactive-fix:harness-observability',
  'SD-LEO-INFRA-ONE-GENUINELY-DEAD-001': 'reactive-fix:harness-hardening',
  'SD-LEO-INFRA-FIVE-GUARDS-WIRED-001': 'reactive-fix:ci-ops',
  'SD-LEO-INFRA-RESUME-FINAL-READ-001': 'reactive-fix:coordination-infra',
  'SD-LEO-INFRA-THREE-GAPS-APPLIED-001': 'reactive-fix:security-hardening',
  'SD-LEO-INFRA-CHAIRMAN-SMS-LANE-001': 'serves-ratified-live-priority:chairman-commission',
  'SD-LEO-INFRA-PLAN-POSITION-READABLE-001': 'reactive-fix:harness-observability',
  'SD-LEO-INFRA-TRIAGE-2026-BULK-001': 'reactive-fix:ci-ops',
  'SD-LEO-INFRA-BOTH-BELT-GAUGES-001': 'reactive-fix:harness-observability',
  'SD-LEO-INFRA-SIGNAL-ROUTER-AUTO-001': 'reactive-fix:coordination-infra',
  'SD-LEO-INFRA-CONTROL-SURFACE-POSTURE-001': 'reactive-fix:security-hardening',
  'SD-LEO-INFRA-INGRESS-BOUND-DEFINER-BASIS-001': 'reactive-fix:security-hardening',
  'SD-LEO-INFRA-VALIDATION-DUPE-DETECTION-DEAD-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-PERSIST-BELT-CAPACITY-001': 'reactive-fix:harness-observability',
  'SD-LEO-FIX-CREDENTIAL-GUARD-INVERSION-001': 'reactive-fix:security-hardening',
  'SD-LEO-INFRA-STAMP-ARMING-TIME-001': 'reactive-fix:harness-observability',
  'SD-LEO-INFRA-TREND-EYES-OFF-001': 'serves-ratified-live-priority:chairman-commission',
  'SD-LEO-FIX-POINT-STARVATION-COUPLING-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-ONE-SYNTHETIC-ROW-001': 'reactive-fix:harness-hardening',
  'SD-LEO-INFRA-VERIFY-CONSUMER-HANDOFF-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-SESSION-MESSAGING-NUDGE-001': 'reactive-fix:coordination-infra',
  'SD-LEO-INFRA-UNCAPPED-ROADMAP-ITEMS-001': 'reactive-fix:data-integrity',
  'SD-LEO-INFRA-FENCE-PARITY-QUICK-001': 'reactive-fix:security-hardening',
  'SD-LEO-FIX-SHELL-INJECTION-RCE-001': 'reactive-fix:security-hardening',
  'SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-002': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-SWEEP-REPO-SCANNERS-001': 'reactive-fix:harness-hardening',
  'SD-LEO-FIX-SHELL-INJECTION-REACHABLE-001': 'reactive-fix:security-hardening',
  'SD-LEO-INFRA-PUBLISH-SHELL-INJECTION-001': 'reactive-fix:security-hardening',
  'SD-LEO-FIX-CHILD-TAIL-CHAIRMAN-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001': 'reactive-fix:coordination-infra',
  'SD-LEO-INFRA-STANDING-OBSERVABILITY-ACCEPTANCE-001': 'reactive-fix:harness-hardening',
  'SD-LEO-INFRA-EXPLORE-UNREGISTERED-LEO-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-DRAIN-INVENTORY-CANNOT-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-ADOPT-EXISTING-READCANONICALBODY-001': 'reactive-fix:harness-hardening',
  'SD-LEO-INFRA-DRIVE-STATE-OBSERVABILITY-001': 'reactive-fix:harness-observability',
  'SD-LEO-FIX-ATOMIC-COORDINATOR-ACK-001': 'reactive-fix:coordination-infra',
  'SD-LEO-INFRA-REPO-WIDE-GITATTRIBUTES-001': 'reactive-fix:harness-hardening',
  'SD-LEO-INFRA-WORKER-REACHABLE-ACK-001': 'reactive-fix:coordination-infra',
  'SD-LEO-INFRA-STRUCTURAL-SOLOMON-CONSULT-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-FLEET-WIDE-VITEST-001': 'reactive-fix:ci-ops',
  'SD-LEO-FEAT-CODIFY-HONEST-ACTIVATION-001': 'serves-ratified-live-priority:venture-1-revenue-path',
  'SD-LEO-INFRA-DRIVE-STATE-FORCING-001': 'reactive-fix:harness-hardening',
  'SD-LEO-INFRA-RETRO-INTEGRITY-RUN-001': 'reactive-fix:harness-observability',
  'SD-LEO-FEAT-VENTURE-DEMAND-VALIDATION-001': 'serves-ratified-live-priority:venture-1-revenue-path',
  'SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001': 'reactive-fix:harness-hardening',
  'SD-LEO-INFRA-LEO-CREATE-PLAN-001': 'reactive-fix:harness-hardening',
  'SD-LEO-INFRA-REAP-COMPLETED-WORKTREE-001': 'reactive-fix:coordination-infra',
  'SD-LEO-INFRA-CHECKIN-DISPATCH-READ-001': 'reactive-fix:coordination-infra',
  'SD-LEO-INFRA-STORY-E2E-AUTO-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-EVERY-CLAIM-WRITE-001': 'reactive-fix:coordination-infra',
  'SD-LEO-INFRA-COMPLETION-FAIL-OWN-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-HEAL-BEFORE-COMPLETE-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-ABSENT-GATE-SCORE-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-STORY-E2E-WRITE-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-VITEST-TIER-REAL-001': 'reactive-fix:ci-ops',
  'SD-LEO-INFRA-MIGRATION-APPLY-STATE-002': 'reactive-fix:data-integrity',
  'SD-LEO-INFRA-CLOSE-SHELL-INJECTION-001': 'reactive-fix:security-hardening',
  'SD-LEO-INFRA-CAPACITY-FORECASTER-BELT-001': 'reactive-fix:harness-observability',
  'SD-LEO-INFRA-COMPLETE-SMS-RELAY-001': 'serves-ratified-live-priority:chairman-commission',
  'SD-LEO-INFRA-DRIVE-SCORE-DENOMINATOR-001': 'serves-ratified-live-priority:chairman-commission',
  'SD-LEO-INFRA-DRIVE-SCORE-LEG1-001': 'serves-ratified-live-priority:chairman-commission',
  'SD-LEO-INFRA-DRIVE-SCORE-LEG2-001': 'serves-ratified-live-priority:chairman-commission',
  'SD-LEO-INFRA-QUIET-HOURS-GATE-001': 'serves-ratified-live-priority:chairman-commission',
  'SD-LEO-INFRA-COORDINATOR-HEALTH-BREACH-001': 'reactive-fix:harness-observability',
  'SD-LEO-INFRA-CONTRACT-READ-FIT-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-TODOIST-YOUTUBE-ROADMAP-001': 'reactive-fix:data-integrity',
  'SD-LEO-INFRA-VENTURE-STATUS-LANGUAGE-001': 'serves-ratified-live-priority:venture-1-revenue-path',
  'SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001': 'serves-ratified-live-priority:chairman-commission',
  'SD-LEO-INFRA-AGE-GAUGE-NON-001': 'reactive-fix:harness-observability',
  'SD-LEO-FIX-FINGERPRINT-STOP-CHAIRMAN-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-EXCLUDE-MONITORING-TELEMETRY-001': 'reactive-fix:harness-hardening',
  'SD-LEO-INFRA-RECONCILE-VENTURE-ARTIFACTS-001': 'reactive-fix:data-integrity',
  'SD-LEO-INFRA-AUTHOR-VENTURE-LIFECYCLE-001': 'serves-ratified-live-priority:venture-1-revenue-path',
  'SD-LEO-INFRA-RECONCILE-20260711-ORCHESTRATOR-001': 'reactive-fix:data-integrity',
  'SD-LEO-INFRA-DRIVE-SCORE-PER-001': 'serves-ratified-live-priority:chairman-commission',
  'SD-LEO-INFRA-CF-ADAPTER-PER-VENTURE-SCOPING-001': 'reactive-fix:data-integrity',
  'SD-LEO-INFRA-VENTURE-BURN-RLS-TENANT-PREDICATE-001': 'reactive-fix:security-hardening',
  'SD-LEO-INFRA-RECORD-VENTURE-ERROR-DEFINER-POSTURE-001': 'reactive-fix:security-hardening',
  'SD-LEO-INFRA-FEEDBACK-ANON-RLS-GAPS-001': 'reactive-fix:security-hardening',
  'SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001': 'serves-ratified-live-priority:chairman-commission',
  'SD-LEO-FEAT-PROVEN-BETTER-NEW-001': 'serves-ratified-live-priority:venture-1-revenue-path',
  'SD-LEO-FEAT-AGENT-READINESS-SERVICE-001': 'serves-ratified-live-priority:venture-1-revenue-path',
  'SD-LEO-INFRA-CHECKER-READBACK-WRITE-001': 'reactive-fix:harness-hardening',
  'SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001': 'reactive-fix:coordination-infra',
  'SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001': 'reactive-fix:security-hardening',
  'SD-ALTIFYAI-FDBK-FIX-GENERIC-SECURITY-SUB-001': 'reactive-fix:gate-bug',
  'SD-ALTIFYAI-FDBK-FIX-HANDOFF-ENTRY-POINT-001': 'reactive-fix:harness-hardening',
  'SD-ALTIFYAI-FDBK-FIX-HOUSEKEEPING-WEEKLY-REPORT-001': 'reactive-fix:ci-ops',
  'SD-LEO-INFRA-CHAIRMAN-APPLY-CEREMONY-001': 'serves-ratified-live-priority:chairman-commission',
  'SD-LEO-FIX-PROGRAMMATIC-LOCAL-LLM-001': 'reactive-fix:gate-bug',
  'SD-LEO-FIX-BELT-CAPACITY-VERDICTS-001': 'reactive-fix:harness-observability',
  'SD-LEO-ENH-ORPHAN-FAILURE-CONFIG-001': 'reactive-fix:harness-hardening',
  'SD-LEO-FIX-QUIET-HOURS-GATE-001': 'serves-ratified-live-priority:chairman-commission',
  'SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001': 'reactive-fix:incident',
  'SD-FDBK-FIX-APEXNICHE-FEEDBACK-DEDUP-001': 'reactive-fix:incident',
  'SD-LEO-FIX-ALTIFYAI-LIVE-SITE-001': 'serves-ratified-live-priority:venture-1-revenue-path',
  'SD-LEO-FIX-ALTIFYAI-WIRE-CLERK-001': 'serves-ratified-live-priority:venture-1-revenue-path',
  'SD-FDBK-FIX-VENTURE-CRACK-GATE-001': 'serves-ratified-live-priority:crack-gate',
  'SD-FDBK-FIX-EHG-ERRORCAPTUREPROVIDER-SENDS-001': 'reactive-fix:security-hardening',
  'SD-MAN-INFRA-VENTURE-CRACK-GATE-001': 'serves-ratified-live-priority:crack-gate',
  'SD-FDBK-FIX-EXIT-GATE-CONFORMANCE-001': 'reactive-fix:gate-bug',
  'SD-FDBK-FIX-SECURITY-ISUNTRUSTEDORIGIN-OMITS-001': 'reactive-fix:security-hardening',
  'SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001': 'reactive-fix:gate-bug',
  'SD-LEO-GEN-SECURITY-TELEGRAM-BOT-001': 'reactive-fix:security-hardening',
  'SD-MAN-INFRA-COMPLETION-PROBES-CROSS-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-ARM-BINDING-EXIT-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-SHIP-PREFLIGHT-REPORTS-001': 'reactive-fix:gate-bug',
  'SD-LEO-FIX-REVIEW-GATE-POLARITY-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-CLOSE-REMAINING-CROSS-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-ANON-TRUNCATE-SWEEP-001': 'reactive-fix:security-hardening',
  'SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001': 'reactive-fix:gate-bug',
  'SD-FDBK-ENH-LEO-ASSIST-PHASE-001': 'reactive-fix:harness-hardening',
  'SD-FDBK-ENH-RETRO-SUB-AGENT-001': 'reactive-fix:gate-bug',
  'SD-FDBK-ENH-VITEST-PROJECT-237-001': 'reactive-fix:ci-ops',
  'SD-FDBK-ENH-DELETION-SAFEGUARD-CLI-001': 'reactive-fix:gate-bug',
  'SD-LEO-INFRA-REVOKE-DEFAULT-PUBLIC-001': 'reactive-fix:security-hardening',
};

const { data: rows, error } = await supabase
  .from('strategic_directives_v2')
  .select('id, sd_key, title, sd_type, status, created_at, metadata')
  .not('metadata->roadmap_link_exception', 'is', null)
  .order('created_at', { ascending: true });
if (error) { console.error('QUERY_ERR', error.message); process.exit(1); }

const noReason = rows.filter(r => r.metadata?.roadmap_link_exception?.reason_supplied === false);
console.log(`NO_REASON_COUNT (live, at classify time): ${noReason.length}`);

const classified = [];
const unmapped = [];
for (const row of noReason) {
  const verdict = CLASSIFICATION[row.sd_key];
  if (!verdict) { unmapped.push(row); continue; }
  classified.push({ ...row, verdict });
}
console.log(`MAPPED: ${classified.length} | UNMAPPED (created after snapshot, left for follow-up): ${unmapped.length}`);
if (unmapped.length) {
  console.log('UNMAPPED sd_keys:', unmapped.map(r => r.sd_key).join(', '));
}

let updated = 0;
for (const row of classified) {
  const nextException = {
    ...row.metadata.roadmap_link_exception,
    drift_classification: row.verdict,
    drift_classification_recorded_at: new Date().toISOString(),
    drift_classification_recorded_by: 'QF-20260818-459',
  };
  const { error: updErr } = await supabase
    .from('strategic_directives_v2')
    .update({ metadata: { ...row.metadata, roadmap_link_exception: nextException } })
    .eq('id', row.id);
  if (updErr) { console.error(`UPDATE_ERR ${row.sd_key}:`, updErr.message); continue; }
  updated += 1;
}
console.log(`STAMPED: ${updated}/${classified.length}`);

// Summary tallies for the artifact
const byVerdict = {};
for (const row of classified) byVerdict[row.verdict] = (byVerdict[row.verdict] || 0) + 1;
const priorityTotal = classified.filter(r => r.verdict.startsWith('serves-ratified-live-priority:')).length;
const reactiveTotal = classified.filter(r => r.verdict.startsWith('reactive-fix:')).length;

console.log('\n=== SUMMARY (for the artifact) ===');
console.log(`Total classified: ${classified.length}`);
console.log(`serves-ratified-live-priority: ${priorityTotal}`);
console.log(`reactive-fix: ${reactiveTotal}`);
for (const [k, v] of Object.entries(byVerdict).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

// Emit the full classified list as JSON so the markdown artifact can be built deterministically.
console.log('\n=== JSON (for artifact generation) ===');
console.log(JSON.stringify({ classified: classified.map(r => ({ sd_key: r.sd_key, title: r.title, sd_type: r.sd_type, status: r.status, created_at: r.created_at, verdict: r.verdict })), unmapped: unmapped.map(r => r.sd_key), byVerdict, priorityTotal, reactiveTotal }, null, 2));
