import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-DURABLE-HOURLY-HEARTBEAT-001';

async function main() {
  const { data: existing, error: fetchErr } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', SD_KEY)
    .single();
  if (fetchErr) {
    console.error('FETCH ERROR:', fetchErr);
    process.exit(1);
  }

  const update = {
    description: 'The chairman\'s hourly status heartbeat (CLAUDE_ADAM contract 5g-c3) fires only via a session-scoped CronCreate job (scripts/adam-startup-check.mjs ADAM_LOOPS entry "heartbeat-sms", cron "14 * * * *") that is re-armed only when an /adam session starts. When the host machine loses power -- confirmed root cause: a hotel room cutting power on no-motion since 2026-08-09, not a software timer bug -- every local session/cron/wakeup dies with it, and the hourly SLA breaks silently. Two slips were witnessed 2026-08-12/13 (2h14m: 16:12->18:26Z; ~4.5h: 22:08Z->02:49Z), driving Adam self-score D8 (interface_clarity) to a 3-consecutive-cycle escalation (60/61/62). VALIDATED DESIGN (revised after LEAD-phase due-diligence found the morning-brief precedent this SD initially proposed mirroring is itself enqueue-only with no measured dispatcher, and has a live measured dual-key double-send defect -- see risks): the backstop is a fully ADDITIVE, read-then-conditionally-act GHA-cron sweep that never shares a dedupe key or kind with the live heartbeat path, so it cannot collide with, suppress, or falsely-alarm on legitimate live-path or chairman-reply sends.',
    scope: 'IN SCOPE: (1) a new GHA-cron sweep workflow + script (self-healing window, e.g. every 15-20min, active only 06:00-22:00 chairman-zone) that READS sms_outbound_obligations for any kind IN (heartbeat_status, heartbeat_status_backstop) row created within the current chairman-zone hour; if one exists (live heartbeat already sent, OR this sweep already filled the hour on an earlier tick this window), it no-ops; if none exists, it calls the EXISTING sendChairmanSMS() gated pipeline (reusing quiet-hours, rubric, and inline-dispatch-and-verify -- not a raw enqueue) with kind=heartbeat_status_backstop and a code-derived dedupeKey `heartbeat_backstop:<chairman-zone-hour-key>` for defense-in-depth against the sweep\'s own concurrent runs (paired with a GHA concurrency group, mirroring chairman-morning-brief-cron.yml); (2) a stale-retry check within the window: if a backstop-kind obligation from THIS hour exists but is status=failed/stuck-owed past a short freshness window, retry rather than treating key-existence as permanently satisfied (mirrors drive-report-sms-sweep.mjs\'s findObligation/status-readback pattern, not the naive key-existence-only pattern); (3) a dedicated last-hour-delta content builder (NOT a reuse of the daily buildMorningReviewBody, which is shaped for daily cadence and touches Solomon-authority forecast content) that reads durable state for a backstop-tagged line, falling back to a minimal presence line, never a fabricated all-good. OUT OF SCOPE (deliberately, to avoid the risks found in due-diligence): modifying scripts/adam-chairman-sms.mjs, scripts/adam-startup-check.mjs, or any live heartbeat_status send path; introducing any shared dedupe key between live and backstop traffic; modifying the morning-brief/morning-review sweeps; modifying the sms_outbound_obligations schema; modifying the SMS provider/Twilio integration.',
    key_changes: [
      { change: 'FR-1: New GHA-cron workflow + sweep script (chairman-hourly-heartbeat-backstop-cron.yml -> scripts/cron/chairman-hourly-heartbeat-backstop-sweep.mjs), self-healing window 06:00-22:00 chairman-zone, GHA concurrency group + cancel-in-progress to prevent overlapping runs.', impact: 'A missed/lagged/dead Adam session (incl. full local machine power-loss) can no longer silently drop the hourly SLA -- the cloud-side cron is independent of any local process.' },
      { change: 'FR-2 (revised): Read-check dedupe, NOT a shared write-time key with the live path. Query sms_outbound_obligations for kind IN (heartbeat_status, heartbeat_status_backstop) created within the current chairman-zone hour; skip entirely if any row exists. The backstop\'s OWN send uses a distinct kind (heartbeat_status_backstop) and a code-derived dedupeKey scoped to that kind only, as defense-in-depth against the sweep\'s own concurrent runs -- it never touches or depends on the live path\'s key scheme.', impact: 'Sidesteps the measured live defect where the morning-brief precedent\'s two independently-composed key schemes (code `morning_brief:<date>` vs LLM-prompted `adam-morning-brief-<date>`) do NOT dedupe against each other in production, and avoids suppressing the ~44% of heartbeat_status hours that legitimately carry more than one send (chairman replies via adam-quiet-tick.mjs, presence-reply carve-out) which a shared per-hour key on that kind would have silently dropped.' },
      { change: 'FR-2b (new, closes a LEAD-phase-found gap): stale-retry status readback -- before treating "a backstop row exists this hour" as done, read its status; retry (re-attempt send) if failed/stuck-owed past a short freshness window rather than treating key-existence as permanent.', impact: 'A single failed attempt early in the window no longer permanently burns the hour for the rest of the self-healing window (the failure mode found live in the morning-brief precedent\'s own `morning_brief:2026-08-13` failed row).' },
      { change: 'FR-2c (new, closes a LEAD-phase-found gap): the backstop send goes through the EXISTING sendChairmanSMS() gated pipeline (quiet-hours rubric check, no-secrets/length checks, inline reconcileOutboundSms dispatch-and-verify), not a raw enqueueChairmanSms() call.', impact: 'Closes the confirmed gap that the morning-brief precedent enqueues directly and has no measured, always-on dispatcher for owed rows -- reusing sendChairmanSMS gets dispatch-and-verify for free, and applies the same safety rubric a 06:00-22:00-cadence unattended send needs.' },
      { change: 'FR-3 (revised): quiet-hours handling is NOT reimplemented in the sweep -- it is inherited for free from sendChairmanSMS\'s existing rubric gate (chairman-zone-aware isSmsQuietHour, not a hardcoded ET check), which already establishes drop-not-queue behavior for heartbeat-class sends. The sweep\'s own window (06:00-22:00 chairman-zone) is a coarse pre-filter to avoid pointless GHA runs, not the authoritative quiet-hours enforcement.', impact: 'No divergent, hand-rolled quiet-hours logic to keep in sync with the existing rubric; the chairman-zone (not hardcoded ET) contract requirement (CLAUDE_ADAM.md) is honored automatically since it is the same gate the live path already uses.' },
      { change: 'FR-4 (revised): a NEW, dedicated last-hour-delta content builder for backstop fills (distinct from buildMorningReviewBody, which is daily-cadence-shaped and touches Solomon-authority forecast content inappropriate to emit 16x/day from an unattended cron) -- reads durable state relevant to the last hour; falls back to a minimal presence line, never a fabricated all-good.', impact: 'Avoids emitting near-identical daily-cadence content 16x/day and avoids an authority-posture mismatch on forecast-line content from an unattended, unreviewed sweep.' },
      { change: 'FR-5: Two-sided positive-control unit tests via dependency-injected supabase stub (mirroring tests/unit/cron/chairman-morning-brief-sweep.test.js\'s DI pattern): missed-hour (no heartbeat_status/heartbeat_status_backstop row this hour) -> assert the backstop sends exactly once; present-hour (a live or prior-backstop row already exists this hour) -> assert the backstop no-ops with zero send attempts.', impact: 'Both failure directions (silent-drop and double-send) are covered by an automated regression test that does not merely stub a return value (the gap found in the precedent\'s own TS-2 test, which never exercised a real concurrent write and would not have caught the measured live dual-key defect).' },
    ],
    strategic_objectives: [
      'Close the D8 (interface_clarity) N=3 self-score escalation by giving the hourly chairman heartbeat the same cloud-side durability the morning brief already has, eliminating the single point of failure (a live local Adam session/machine) that a hotel-room power cut can silently kill.',
      'Do not inherit the precedent\'s measured defects: LEAD-phase due-diligence found the morning-brief sweep it was originally scoped to mirror has (a) no measured always-on dispatcher for owed rows, (b) a live measured dual-key double-send (its own code-composed key and an independently LLM-composed key both exist as separate obligations on the same day), and (c) a zone-less ET gate inconsistent with the chairman-zone contract. This SD\'s design deliberately avoids all three rather than copying them forward.',
      'Reuse the existing gated send pipeline (sendChairmanSMS) rather than a raw enqueue, so the backstop inherits dispatch-and-verify, the pre-send safety rubric, and chairman-zone-aware quiet-hours for free instead of reimplementing any of them.',
    ],
    success_criteria: [
      { criterion: '[ ] Hourly heartbeat delivered even when the Adam ScheduleWakeup lags past the hour (awake hours)', measure: 'Unit test: given no heartbeat_status or heartbeat_status_backstop row created within the current chairman-zone hour, the backstop sweep calls sendChairmanSMS exactly once with kind=heartbeat_status_backstop.' },
      { criterion: '[ ] No double-send when Adam\'s live heartbeat already went out this hour (dedupe verified)', measure: 'Unit test: given an existing heartbeat_status row created within the current chairman-zone hour (regardless of that row\'s dedupe_key -- read-check, not a key-match), the backstop sweep makes zero sendChairmanSMS calls.' },
      { criterion: '[ ] Quiet-hours window respected; no overnight sends; morning flush intact', measure: 'Unit test asserts the sweep\'s coarse pre-filter is inert outside 06:00-22:00 chairman-zone; a separate test asserts that even inside the pre-filter window, a stubbed sendChairmanSMS quiet-hours-block response is correctly surfaced as no-send (not silently swallowed); morning-brief/review sweeps and their existing tests remain unmodified and passing.' },
      { criterion: '[ ] Two-sided control: missed-hour fills one, present-hour no-ops', measure: 'The FR-5 test pair (missed-hour sends exactly once; present-hour makes zero send attempts) both pass in the same test file as a matched pair.' },
    ],
    success_metrics: [
      { metric: 'Backstop fills a missed hourly heartbeat', target: 'Unit test: given no qualifying row for the current chairman-zone hour, the sweep sends exactly once via sendChairmanSMS with kind=heartbeat_status_backstop.' },
      { metric: 'Backstop never double-sends against a live heartbeat or a prior backstop fill this hour', target: 'Unit test: given an existing heartbeat_status or heartbeat_status_backstop row this hour, the sweep makes zero send calls -- verified by read-check, not by relying on a shared dedupe key matching.' },
      { metric: 'Stale-retry does not permanently burn the hour on a single failure', target: 'Unit test: given a heartbeat_status_backstop row this hour with status=failed older than the freshness threshold, the sweep retries (a second send attempt is made) rather than treating the hour as permanently filled.' },
      { metric: 'Zero regression to existing chairman-comms tests', target: 'tests/unit/cron/chairman-morning-brief-sweep.test.js, tests/unit/cron/chairman-morning-review-sweep.test.js, tests/unit/chairman/sms-bridge.test.js, tests/unit/comms/chairman-sms-enqueue-is-not-sent.test.js, tests/unit/comms/chairman-sms-gate/chairman-sms-gate.test.js all continue to pass unchanged (no shared code path modified).' },
    ],
    implementation_guidelines: [
      'Do not modify scripts/adam-chairman-sms.mjs, scripts/adam-startup-check.mjs, or any live heartbeat_status send path -- the backstop is purely additive and read-then-conditionally-act, per the LEAD-phase risk findings.',
      'Do not reimplement quiet-hours logic in the new sweep -- send through the existing sendChairmanSMS() pipeline so its chairman-zone-aware rubric gate (not a hardcoded ET check) is the sole quiet-hours authority.',
      'Do not use enqueueChairmanSms() directly for the actual send -- use sendChairmanSMS() so dispatch-and-verify (inline reconcileOutboundSms) and the pre-send safety rubric are inherited, closing the LEAD-phase-found gap that the morning-brief precedent has no measured always-on dispatcher for owed rows.',
      'Dedupe is READ-based (query existing rows for the current chairman-zone hour across both relevant kinds) as the primary mechanism; the backstop\'s own dedupeKey is scoped to its own distinct kind (heartbeat_status_backstop) purely as defense-in-depth against the sweep\'s own concurrent runs, paired with a GHA concurrency group -- it must never be compared against or share a namespace with the live path\'s key scheme.',
      'FR-5 positive-control tests must use dependency-injected supabase/send stubs (mirroring tests/unit/cron/chairman-morning-brief-sweep.test.js\'s DI pattern), not a live database, and must assert on the number of send-call invocations, not merely on a stubbed return-value shape (closing the gap found in the precedent\'s own TS-2 test).',
    ],
    metadata: {
      ...existing.metadata,
      mechanism_verifications: [
        { verified_by: 'Explore + validation-agent sub-agents, LEAD phase', verified_at: '.github/workflows/chairman-morning-brief-cron.yml:29-38 — self-healing window cron (both DST offsets) + concurrency group/cancel-in-progress, invokes node scripts/cron/chairman-morning-brief-sweep.mjs --once' },
        { verified_by: 'Explore + validation-agent sub-agents, LEAD phase', verified_at: 'lib/chairman/sms-bridge.js:221-245 enqueueChairmanSms() — UPSERT onConflict dedupe_key, ignoreDuplicates:true; on dedupe returns {enqueued:false, deduped:true} with no reason field' },
        { verified_by: 'validation-agent sub-agent, LEAD phase', verified_at: 'lib/comms/adam-outbound/chairman-sms-gate/index.js:92 treats any {enqueued:false} (including a benign dedupe) as a transport soft-failure and fires an [ACTION NEEDED] alert email at :150-155 — CONFIRMED risk, this SD design avoids ever sharing a key with the live path so this path is never hit by the backstop' },
        { verified_by: 'validation-agent sub-agent, LEAD phase', verified_at: 'MEASURED LIVE (sms_outbound_obligations, 2026-08-13): morning_brief:2026-08-13 (status=failed) and adam-morning-brief-2026-08-13 (status=delivered) exist as two SEPARATE obligations for the same day — the precedent\'s two independently-composed dedupe keys do not actually dedupe against each other in production' },
        { verified_by: 'validation-agent sub-agent, LEAD phase', verified_at: 'MEASURED LIVE (14-day window): heartbeat_status kind had 217 sends across 118 distinct chairman-zone hours, 52 hours (44%) with >1 send (chairman replies via adam-quiet-tick.mjs:965 --reply-to-inbound --kind heartbeat_status) — confirms a shared per-hour dedupe key scoped to kind=heartbeat_status would have suppressed legitimate replies; this SD\'s design uses a distinct kind (heartbeat_status_backstop) to avoid that' },
        { verified_by: 'validation-agent sub-agent, LEAD phase', verified_at: 'scripts/cron/sms-outbound-reconcile-sweep.mjs header + grep of .github/workflows/*.yml and package.json — no scheduled dispatcher invokes it; the only production caller of reconcileOutboundSms is the inline call at chairman-sms-gate/index.js:114-115 inside sendChairmanSMS — confirms enqueue-only (as the morning-brief precedent does) leaves rows undispatched; this SD sends via sendChairmanSMS specifically to inherit that inline dispatch-and-verify' },
        { verified_by: 'validation-agent sub-agent, LEAD phase', verified_at: 'lib/time/chairman-et-wall-clock.js isSmsQuietHour(now, zone) + lib/comms/adam-outbound/rubric-engine/lint.js:106-109,162-166 inQuietHours() (blocking rubric check) — the live, chairman-zone-aware quiet-hours authority this SD reuses via sendChairmanSMS rather than reimplementing' },
        { verified_by: 'validation-agent sub-agent, LEAD phase', verified_at: 'scripts/cron/drive-report-sms-sweep.mjs:299-305 findObligation(dedupeKey) status-readback pattern — the precedent for FR-2b\'s stale-retry-by-status (not by mere key-existence) requirement' },
        { verified_by: 'Explore sub-agent, LEAD phase', verified_at: 'tests/unit/cron/chairman-morning-brief-sweep.test.js — DI-stub test pattern (TS-1..TS-6) to mirror for the new backstop tests, with the noted gap (TS-2 never exercises a real concurrent write) explicitly NOT repeated per FR-5\'s invocation-count assertions' },
      ],
    },
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .update(update)
    .eq('sd_key', SD_KEY)
    .select('sd_key,title')
    .single();

  if (error) {
    console.error('UPDATE ERROR:', error);
    process.exit(1);
  }
  console.log('Updated:', JSON.stringify(data, null, 2));
}

main();
