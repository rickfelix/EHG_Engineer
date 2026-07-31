// coordinator-startup-check.mjs — coordinator startup onboarding ritual.
//   SD-LEO-INFRA-COORDINATOR-STARTUP-ONBOARDING-001
//
// On `/coordinator start` this helper:
//   (FR-1) surfaces the DURABLE coordinator role context + prints a roles/responsibilities summary,
//   (FR-2) reports armed|MISSING status for ALL standard cron loops and emits the exact
//          CronCreate spec for any missing loop, and
//   (FR-4) is FAIL-OPEN — a missing role-context doc or any hiccup warns but never blocks startup.
//
// DESIGN CONSTRAINT: CronList/CronCreate are HARNESS tools, NOT Node-callable. This helper therefore
// EMITS the canonical standard-loop spec; the agent running /coordinator start compares it against CronList
// and arms only the missing loops (idempotent). To compute armed|MISSING the agent passes the currently
// -armed cron script basenames via --armed "a.cjs,b.mjs" (or COORD_ARMED_CRONS env, comma-separated).
// With no armed-set provided, every loop is reported as "unverified" and its CronCreate spec is emitted.
//
// Exit code is ALWAYS 0 (fail-open). Model: peer of scripts/coordinator-audit.mjs.

import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// SD-LEO-INFRA-FLEET-FRESHNESS-GUARD-001: advisory, fail-open checkout-freshness badge.
import { checkoutFreshness, freshnessBadge, CRITICAL_PROTOCOL_FILES } from '../lib/governance/checkout-freshness.js';
// QF-20260725-342: single source of truth for the resurface threshold (see that module's header).
import { createRequire as _createRequireQF342 } from 'node:module';
const { OPERATING_THRESHOLD_HOURS } = _createRequireQF342(import.meta.url)('../lib/coordination/resurface-threshold.cjs');
// SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 / FR-2: same resolver adam-register.cjs and the tracker
// both use, so the coordinator check reads exactly the state the hook wrote — no second path.
const { resolveStateReadPath } = _createRequireQF342(import.meta.url)('./hooks/lib/session-state-resolver.cjs');
// SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 / FR-3 + FR-6: ONE implementation of "was this contract
// really read" and ONE definition of the single-read bound, shared with adam-register.cjs and
// solomon-register.cjs. Importing the bound rather than restating it is the difference between an
// arming condition and an arming CLAIM — see roleArmingStates below.
const { contractReadVerdict, contractLineCount, contractSizeBytes, SINGLE_READ_SAFE_BYTES } =
  _createRequireQF342(import.meta.url)('../lib/protocol/contract-read-coverage.cjs');

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ── Durable role context source (FR-1). This doc is the memory-independent source of truth. ──
export const ROLE_CONTEXT_DOC = 'docs/protocol/fleet-coordinator-and-worker-behavior.md';

// Concise, always-rendered responsibilities summary (surfaced even if the source doc is unreadable).
export const RESPONSIBILITIES = [
  'REQUIRED PRIMING READ (Step P) — before acting as coordinator, READ .claude/commands/coordinator.md IN FULL plus the durable role doc, and attest ("Primed: coordinator.md + role doc read ✓") in the startup confirm banner. Same contract as the LEO phase-file reads (CLAUDE_LEAD.md / CLAUDE_PLAN.md). An unprimed coordinator skips duties.',
  'MANAGER, not IC — delegate mechanical/parallelizable work (SD creation, audits, investigations, cleanups) to sub-agents or the fleet queue; reserve your cycles for judgment (prioritization, sensitive RCA, the execute step of destructive actions). Verify sub-agent output.',
  'KEEP WORKERS BUSY is the KPI — continuously source claimable work; idle workers + available work is a problem to solve. The coordinator is EITHER delegating/sourcing OR torn down, never idling in between.',
  'FORECAST utilization, do not REACT (operator 2026-06-10) — track each worker busy-state + ETA-to-free + belt depth (coordinator-capacity-forecast.mjs, armed cron); when the forecast predicts the belt running short (demand_soon + buffer > claimable), reach Adam for sourcing BEFORE workers go idle. An idle worker the forecast did not anticipate = failure. Never wait to be asked how busy the fleet is.',
  'PRIORITIZE THE BACKLOG + WATCH INTERDEPENDENCIES (operator 2026-06-10) — the coordinator owns dispatch ordering: rank the claimable belt critical-path-first (unlock-count → priority → age) via coordinator-backlog-rank.mjs (armed cron; persists metadata.dispatch_rank that worker self-claim honors), and continuously track the dependency graph (blocked vs ready, stale dep-resolver anomalies, orchestrator parent/child gating). A critical-path SD sitting unclaimed while workers build leaf fixes = ordering failure.',
  'RECURRING 3-SOURCE AUDIT — check SD queue, harness backlog (feedback category=harness_backlog), and inbox; source backlog into DRAFT SDs only when the queue would starve idle workers.',
  'BACKGROUND MONITORING during operator conversations — run the cron ticks but surface only important events (stuck worker, empty-queue+idle, claim/worktree conflict, a worker question, a completion).',
  'CHAIRMAN EMAIL = the Adam exec-summary (GitHub-Actions cron, adam-exec-email-cron.yml) — the coordinator fleet email is RETIRED (chairman email cutover 2026-06-10); do NOT re-arm coordinator-email-summary.mjs. Escalate questions via the inbox/advisory lanes.',
  'TEARDOWN DISCIPLINE — when no claimable AND no sourceable work AND zero workers (sustained): CronDelete ALL loops first, then clear the coordinator pointer + final email. Do not idle loops past a finished campaign.',
  'You CANNOT start a worker\'s execution — only /loop or a human paste in the worker window can. To restore a thinned fleet, hand the operator the wake-up prompt.',
];

// ── Canonical standard cron loops (FR-2). The three original intervals match coordinator.md Step 4.
// SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (FR-5) added the daily flag-governance review loop.
// SD-LEO-INFRA-ARM-CANONICALIZE-WORK-001 added the work-triggered tri-party self-review loop so a
// coordinator restart re-arms it instead of leaving it dormant (its state file had silently frozen). ──
//
// SD-LEO-INFRA-DURABLE-COORDINATOR-LOOPS-001 / FR-1 — SCRIPT-SHAPED vs JUDGMENT-SHAPED
// classification (durability migration table). A `gha_backed: true` entry means this loop also
// has an always-on GitHub Actions cron that survives a coordinator session death (ADDITIVE, not
// exclusive — this STANDARD_LOOPS entry stays session-armed as a harmless redundant backup, per
// the shipped retention/backlog-rank precedent; see the FR-2 GHA workflow batch for the file list).
//
//   key                        | class          | GHA-backed?              | rationale
//   ---------------------------|----------------|---------------------------|--------------------------------
//   sweep                      | SCRIPT-SHAPED  | pending (FR-2 batch)      | deterministic sweep, no judgment
//   quiet-tick                 | JUDGMENT-SHAPED| no                        | folds flag/audit/advisory triage
//   dashboard                  | (report)       | no (out of FR-1 scope)    | deterministic but not migrated by this SD
//   identity                   | (report)       | no (out of FR-1 scope)    | deterministic but not migrated by this SD
//   inbox (folded)             | JUDGMENT-SHAPED| no                        | folded into quiet-tick
//   audit (folded)             | JUDGMENT-SHAPED| no                        | folded into quiet-tick
//   charter-audit (folded)     | JUDGMENT-SHAPED| no                        | self-audit, remediate-then-verify judgment
//   flag-review                | SCRIPT-SHAPED  | pending (FR-2 batch)      | deterministic governance review script
//   self-review                | JUDGMENT-SHAPED| no                        | LLM-driven tri-party self-review
//   hourly-review               | JUDGMENT-SHAPED| no                        | LLM-driven responsibilities review
//   capacity-forecast (folded) | JUDGMENT-SHAPED| no                        | predictive forecasting, folded into quiet-tick
//   backlog-rank (folded)      | SCRIPT-SHAPED  | YES (backlog-rank-cron.yml)| already migrated — excluded from FR-2
//   unranked-gauge             | SCRIPT-SHAPED  | pending (FR-2 batch)      | deterministic invariant gauge
//   singleton-relaunch          | SCRIPT-SHAPED  | pending (FR-2 batch)      | deterministic detection+scheduling only
//   relay-drain                | SCRIPT-SHAPED  | pending (FR-2 batch)      | deterministic queue drain
//   sms-relay-drain             | SCRIPT-SHAPED  | YES (sms-relay-drain-cron.yml) | QF-20260727-064: GHA-backed but session-armed ANYWAY — the workflow declares */5 and reports green while Actions deprioritisation makes the real cadence 1-3.7h (measured). The chairman's inbound lane cannot depend on a deprioritised runner.
//   relay-drop-gauge           | SCRIPT-SHAPED  | pending (FR-2 batch)      | deterministic invariant gauge
//   fleet-retro                | SCRIPT-SHAPED  | pending (FR-2 batch)      | capture is deterministic (label says capture/synthesis — FR-2 scopes strictly to the capture path; any judgment-shaped synthesis stays session-armed)
//   row-growth                 | SCRIPT-SHAPED  | pending (FR-2 batch)      | deterministic daily snapshot
//   review-rotation            | SCRIPT-SHAPED  | pending (FR-2 batch)      | deterministic rotation bookkeeping (WHICH subsystem is reviewed next), not the review itself
//   scripts-reachability        | SCRIPT-SHAPED  | pending (FR-2 batch)      | deterministic weekly gauge
//   retention                  | SCRIPT-SHAPED  | YES (retention-enforce-cron.yml) | already migrated — excluded from FR-2
//   roles-review                | JUDGMENT-SHAPED| no                        | coordinator self-review of duties
//   gauge-runner                | SCRIPT-SHAPED  | pending (FR-2 batch)      | deterministic invariant-gauge execution surface
//   feedback-sla                | SCRIPT-SHAPED  | pending (FR-2 batch)      | deterministic SLA-breach reminder
//   liveness-watcher            | SCRIPT-SHAPED  | PARTIAL (periodic-liveness-watcher-cron.yml owns self_stamped/eva_scheduler_heartbeat/github_actions_api classes) | this STANDARD_LOOPS entry keeps only the PID-anchored claude_sessions_heartbeat class a CI runner can't evaluate — FR-2 does NOT duplicate the already-GHA-backed classes
//   solomon-ledger-resurface     | SCRIPT-SHAPED  | pending (FR-2 batch)      | deterministic aged-row resurface
//
// NOTE: the original SD scope text also named a "root-freshness" loop. It does not exist anywhere
// in this array or the codebase (verified by VALIDATION, evidence row dd2f16c2-9c2e-424e-b7fb-94e76860b590)
// — dropped as a phantom/typo'd scope-text reference, not implemented.
//
// TS-3 — per-loop double-fire (session-armed + GHA both trigger the same window) idempotency
// verdict. TESTING gate finding (evidence row f3ece776-9f0e-4fc7-933d-40c2ca326c5d): a blanket
// "these scripts are idempotent" claim by analogy to retention/backlog-rank is explicitly
// insufficient — each of the 13 migrated scripts is verified individually below, citing the
// concrete evidence (source-file comment, dedup-key/query-before-insert pattern, or read-only
// no-write shape) rather than assumed safety.
//
//   key                       | verdict | evidence
//   --------------------------|---------|------------------------------------------------------
//   sweep                     | SAFE    | stale-session-sweep.cjs's own header: "Safe to run repeatedly — fully idempotent."
//   flag-review               | SAFE    | flag-governance-review.mjs queries feedback for an existing metadata->>digest_key='flag-gov:<today>' row before inserting; the flags .update(last_reviewed_at) is a plain timestamp overwrite (repeat-safe by construction)
//   unranked-gauge            | SAFE    | gauge-unranked-claimable-leaves.mjs is read + log only (no .insert/.upsert calls) — a pure gauge has nothing to duplicate
//   singleton-relaunch        | SAFE    | singleton-relaunch-scheduler.mjs defaults to dry-run/report-only (SINGLETON_RELAUNCH_SCHEDULING_ENABLED gate) and guards real writes behind its own stampLastFired marker
//   relay-drain                | SAFE    | coordinator-relay-drain.cjs only selects UNDRAINED relay_request rows (relay-queue.cjs's drainOne marks a row drained as part of processing it) — a second concurrent run finds nothing left to drain
//   sms-relay-drain             | SAFE    | QF-20260727-064. Verified IN THIS SCRIPT, not by analogy to relay-drain above (this table's own rule): lib/chairman/sms-bridge.js drainSmsRelayStaging selects `.is('drained_at', null)` (:803) and stamps `.update({drained_at})` per row as part of processing it (:817-819), so a redundant fire finds nothing left to drain. Additionally gated: the runner is a NO-OP unless SMS_RELAY_DRAIN_ENABLED is truthy, and is fail-soft (a drain error logs and exits 0)
//   relay-drop-gauge          | SAFE    | coordinator-relay-drop-gauge.cjs's own header: "Idempotent per (correlationId): a row already flagged for the same correlation is [skipped]"
//   fleet-retro               | SAFE    | coordinator-fleet-retro.mjs's insert uses an explicit dedup key on the capture path (source_id/type-scoped)
//   row-growth                | SAFE    | row-growth-snapshot.cjs is internally due-gated (~22h) per its own STANDARD_LOOPS comment above — an extra run inside the gate window is a documented no-op
//   review-rotation            | SAFE    | subsystem-review-rotation.cjs is internally due-gated (~6 days) per its own STANDARD_LOOPS comment above — extra arms/manual runs are documented no-ops
//   scripts-reachability        | SAFE    | scripts-reachability-gauge.mjs is internally due-gated (~6 days) per its own STANDARD_LOOPS comment above
//   gauge-runner                | SAFE    | gauge-runner.mjs's own header: "Idempotent (safe to re-run — findings are [deduped])"
//   feedback-sla                | SAFE    | lib/coordinator/feedback-sla-gauge.cjs's remindSlaBreaches is rate-limited/deduped per category per day via metadata.sla_key, per its own STANDARD_LOOPS comment above
//   solomon-ledger-resurface     | SAFE    | solomon-ledger-pending-resurface.cjs's own header: capped to once per stale ledger row per day via payload.dedup_key checked before insert
//
// All 13 verified SAFE for an occasional session+GHA double-fire. None required a code change to
// reach this verdict — the additive migration pattern only works because these loops were already
// built idempotent (a prerequisite the design doc's precedent, retention/backlog-rank, also relied on).
export const STANDARD_LOOPS = [
  { key: 'sweep',       label: 'Stale-session sweep',  script: 'stale-session-sweep.cjs',   cron: '*/5 * * * *',
    gha_backed: true,
    prompt: 'node scripts/stale-session-sweep.cjs' },
  // SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: the quiet-tick cutover (docs/protocol/
  // fleet-hibernation-quiet-tick.md). ONE self-pacing LLM tick composes the folded loops below
  // (inbox, audit, charter-audit, capacity-forecast, backlog-rank — marked folded:true, kept in
  // this registry for the loop-parity guard). Cron minutes offset from Adam's quiet-tick so the
  // two parties never co-fire. The tick itself parks 180–900s via ScheduleWakeup between fires.
  { key: 'quiet-tick', label: 'Coordinator quiet-tick (folds inbox+audit+charter-audit+capacity-forecast+backlog-rank)', script: 'coordinator-quiet-tick.mjs', cron: '0,15,30,45 * * * *',
    prompt: 'Run `node scripts/coordinator-quiet-tick.mjs`. It prints ONE QUIET_TICK summary line and self-paces. If the output contains NO QUIET_TICK_PING / QUIET_TICK_STALL_ALERT / QUIET_TICK_OUTBOUND_PROBE / QUIET_TICK_ERROR lines, this turn is a NO-OP: arm ScheduleWakeup(nextWakeSeconds from the output) and emit nothing else. Otherwise act on the flagged lines, then arm the wakeup.' },
  { key: 'dashboard',   label: 'Fleet dashboard',      script: 'fleet-dashboard.cjs',       cron: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
    prompt: 'node scripts/fleet-dashboard.cjs all' },
  { key: 'identity',    label: 'Fleet identity refresh', script: 'assign-fleet-identities.cjs', cron: '4,9,14,19,24,29,34,39,44,49,54,59 * * * *',
    prompt: 'node scripts/assign-fleet-identities.cjs' },
  { key: 'inbox', folded: true,       label: 'Coordinator inbox',    script: 'fleet-dashboard.cjs',       cron: '*/2 * * * *',
    prompt: 'node scripts/fleet-dashboard.cjs inbox' },
  { key: 'audit', folded: true,       label: 'Coordinator 3-source audit', script: 'coordinator-audit.mjs', cron: '*/15 * * * *',
    prompt: 'node scripts/coordinator-audit.mjs' },
  // QF-20260725-085: FINISHED-but-unrouted work (a branch ahead of origin/main with no open PR) — the
  // one class every other surface is blind to, because the others track work that is claimed, in
  // flight, or failing, and this work is none of those: it is invisible precisely BECAUSE it
  // succeeded. folded:true — composed by the quiet tick (COMPOSED_CORES key 'unrouted-branches'),
  // registered here for the loop-parity census so a cutover cannot silently drop the duty. NEVER
  // arm standalone. Deliberately NOT gha_backed: there is no unrouted-branches-cron.yml, and the
  // ~5050-ref sweep belongs next to a local checkout rather than on a runner. The cron value
  // mirrors the quiet tick's own cadence because that is the real fire rate — it is never armed,
  // but parseStandardLoops derives expected_interval_seconds from it, so an honest value beats
  // the 3600s no-cron fallback.
  { key: 'unrouted-branches', folded: true, label: 'Unrouted finished-work detector (branches with commits and no open PR)', script: 'audit-unrouted-branches.mjs', cron: '0,15,30,45 * * * *',
    prompt: 'node scripts/audit-unrouted-branches.mjs' },
  // SD-LEO-INFRA-COORDINATOR-CHARTER-SELF-AUDIT-001: durable charter-compliance self-audit (replaces the
  // lost session-only CronCreate). READ-ONLY detection; authoritative PID/armed-silence liveness; fail-loud
  // on a foundational query error; names a remediation per violation. The prompt compels REMEDIATE-THEN-VERIFY.
  { key: 'charter-audit', folded: true, label: 'Coordinator charter-compliance self-audit (durable, remediate-then-verify)', script: 'coordinator-charter-audit.mjs', cron: '8,23,38,53 * * * *',
    prompt: 'Run `node scripts/coordinator-charter-audit.mjs` (READ-ONLY). For EACH reported violation perform the named remediation ACTION, then RE-RUN and confirm the output ends with CHARTER_AUDIT_VIOLATIONS=0 — never observe-only.' },
  // RETIRED (chairman email cutover, advisory b7b73b86 / QF-20260609-024, 2026-06-10): the
  // coordinator fleet email (coordinator-email-summary.mjs) is no longer a standard loop. The ONE
  // chairman-facing email is the Adam exec-summary, scheduled durably via GitHub Actions
  // (.github/workflows/adam-exec-email-cron.yml, live when repo var ADAM_EMAIL_LIVE=true).
  // SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (FR-5): daily feature-flag governance review.
  // Gated default-OFF behind leo_feature_flags FLAG_GOVERNANCE_REVIEW_V1 → cheap no-op until enabled.
  { key: 'flag-review', label: 'Feature-flag governance review', script: 'flag-governance-review.mjs', cron: '0 9 * * *',
    gha_backed: true,
    prompt: 'node scripts/flag-governance-review.mjs' },
  // Work-triggered tri-party self-review: cheap poller (no-op below COORD_REVIEW_EVERY completed-SD delta),
  // fires the coordinator<->workers<->Adam review only when due. SD-LEO-INFRA-ARM-CANONICALIZE-WORK-001.
  { key: 'self-review', label: 'Coordinator self-review (work-triggered tri-party)', script: 'coordinator-self-review.mjs', cron: '*/5 * * * *',
    prompt: 'node scripts/coordinator-self-review.mjs' },
  // Hourly responsibilities review for the coordinator + a reminder to live Adam. CYCLE-DOWN:
  // self-suppresses when the fleet is quiescent (0 active workers/builds, nothing moved in 20m)
  // via lib/coordinator/fleet-quiescence.cjs — no churn when the line is stopped. Chairman req 2026-06-09.
  { key: 'hourly-review', label: 'Hourly responsibilities review (coordinator + Adam, cycle-down aware)', script: 'coordinator-hourly-review.cjs', cron: '17 * * * *',
    prompt: 'node scripts/coordinator-hourly-review.cjs' },
  // PROACTIVE capacity forecaster (operator directive 2026-06-10): tracks per-worker busy-state +
  // ETA-to-free and belt-depth-vs-demand; on a FORECAST deficit (workers about to run out of work) it
  // reaches Adam for sourcing BEFORE the belt empties (30m cooldown). --dispatch enables the auto-reach.
  { key: 'capacity-forecast', folded: true, label: 'Worker-utilization + belt dry-out forecaster (predictive Adam reach-out)', script: 'coordinator-capacity-forecast.mjs', cron: '3,13,23,33,43,53 * * * *',
    prompt: 'node scripts/coordinator-capacity-forecast.mjs --dispatch' },
  // Backlog-ordering pass (operator directive 2026-06-10, SRE duty 6): ranks the claimable belt
  // critical-path-first (unlock-count → priority → age) and persists metadata.dispatch_rank, which
  // worker-checkin's self-claim tiers honor when fresh — "what gets done first" is coordinator-driven
  // by default, not correction-by-dispatch.
  { key: 'backlog-rank', folded: true, label: 'Backlog prioritization pass (dispatch_rank for self-claim ordering)', script: 'coordinator-backlog-rank.mjs', cron: '6,21,36,51 * * * *',
    prompt: 'node scripts/coordinator-backlog-rank.mjs' },
  // SD-LEO-INFRA-GUARANTEE-CLAIMABLE-SD-RANKED-001-D: the observability leg for the belt-and-suspenders
  // above (rank-on-transition + this cron + the worker-checkin pool-window fix) — counts claimable leaf
  // SDs with no fresh dispatch_rank right now (>0 = drift: the guarantees above didn't hold). Cheap
  // (reuses backlog-rank's own claimable computation); offset from backlog-rank's own cadence so it
  // always observes a just-refreshed rank rather than racing it.
  { key: 'unranked-gauge', label: 'Eligible-but-unranked-leaf-count invariant gauge', script: 'gauge-unranked-claimable-leaves.mjs', cron: '9,24,39,54 * * * *',
    gha_backed: true,
    prompt: 'node scripts/gauge-unranked-claimable-leaves.mjs' },
  // QF-20260702-976: the OPERATING layer for SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-A.
  // The trigger + scheduler logic (lib/coordinator/singleton-relaunch-trigger.js, scripts/
  // singleton-relaunch-scheduler.mjs, npm-wired as singleton-relaunch:run) shipped but nothing
  // periodically invoked it — first live test 2026-07-02 DID-NOT-FIRE (0 singleton_relaunch_scheduled
  // records despite a coordinator behind-59 + fleet-quiescent trigger window). This loop makes
  // DETECTION + SCHEDULING operate (a durable singleton_relaunch_scheduled record + surfacing when
  // behind-N + quiescent + target-idle) — it does NOT itself perform an end-to-end autonomous
  // relaunch; the fresh-checkout spawn remains human-gated (see singleton-relaunch-trigger.js header
  // for the two explicitly-deferred downstream gaps: target-idle awaiting_tick predicate handling,
  // and the human-gated spawn step). Cheap (git + a few DB reads); offset from the other */15-ish
  // loops so it doesn't cluster.
  { key: 'singleton-relaunch', label: 'Singleton-relaunch quiescent-window scheduler (detection + scheduling only)', script: 'singleton-relaunch-scheduler.mjs', cron: '7,22,37,52 * * * *',
    gha_backed: true,
    prompt: 'npm run singleton-relaunch:run' },
  // SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-1/FR-2: drains
  // the tracked relay-request queue deliberately (never processed inline in the active
  // thread) and writes the CONFIRM-ON-RELAY receipt. Frequent — a queued relay-request is
  // exactly as urgent when the fleet is quiet (confirmed incident #1: ~2h undrained).
  { key: 'relay-drain', label: 'Relay-request queue drain + confirm-on-relay', script: 'coordinator-relay-drain.cjs', cron: '1,16,31,46 * * * *',
    gha_backed: true,
    prompt: 'node scripts/coordinator-relay-drain.cjs' },
  // QF-20260727-064: the CHAIRMAN's inbound SMS drain. sms-relay-drain-cron.yml declares
  // '*/5 * * * *' and every run reports SUCCESS, but GitHub Actions DEPRIORITISES scheduled
  // workflows on a busy repo, so the real cadence is nothing like 5 minutes. Measured run
  // starts (UTC 2026-07-26/27) 19:50, 20:44, 21:43, 22:43, 23:43, 01:20, 05:01, 08:41,
  // 11:59, 14:55 — gaps of 54, 59, 60, 60, 97, 221, 220, 197, 176 minutes. Hourly at best,
  // 3.7h at worst, never 5 minutes. Live consequence 2026-07-27: the chairman texted ~09:45Z,
  // the last drain had run 08:41Z, and at 11:47Z the row was STILL undrained.
  //
  // This is the fails-green class — flag on, workflow green, outcome absent — so it stays
  // gha_backed:true (the workflow is real and does fire) while ALSO being session-armed here,
  // exactly the "harmless redundant backup" posture the header table already sanctions for
  // GHA-backed loops. A live coordinator ticks far more reliably than a deprioritised runner.
  //
  // This also REPAIRS THE FR-3 ALARM rather than retuning it away. sms-relay-drain.cjs's
  // backlog-stall signal fires on rows undrained > SMS_RELAY_DRAIN_STALL_MINUTES (default 15).
  // Under a 1-3.7h effective cadence that threshold is breached by NORMAL operation, so the
  // alarm was either permanently firing or tuned to ignore the real failure. Restoring a true
  // ~5-minute cadence makes 15 minutes meaningful again — the honest fix, versus relaxing the
  // threshold to match a broken cadence and calling the silence health.
  //
  // NOT FIXED HERE, and deliberately so: draining a text into chairman_decisions is not the
  // same as ANSWERING it. A live Adam session must still read and reply, so out-of-session
  // inbound remains unanswered even at a correct cadence. The row says so explicitly.
  { key: 'sms-relay-drain', label: 'Chairman inbound SMS relay-staging drain', script: 'sms-relay-drain.cjs', cron: '*/5 * * * *',
    gha_backed: true,
    prompt: 'node scripts/sms-relay-drain.cjs' },
  // FR-3: the drop-gauge — flags any inbound RELAY/DECISION/REVIEW row with no matching
  // outbound within the window (default ~15min). Offset from relay-drain so it observes a
  // just-drained queue rather than racing it.
  { key: 'relay-drop-gauge', label: 'Unactioned relay/decision/review drop gauge', script: 'coordinator-relay-drop-gauge.cjs', cron: '11,26,41,56 * * * *',
    gha_backed: true,
    prompt: 'node scripts/coordinator-relay-drop-gauge.cjs' },
  // SD-LEO-INFRA-ENABLE-WIRE-AUTOMATIC-001 (FR-2a): restore the worker fleet-retro to a schedule
  // (it had drifted to manual — last ran ~2.5d ago). Re-arms the existing, idempotent capture/
  // synthesis script (reuses the feedback/issue_patterns pipeline; dedups on metadata.retro_key).
  // Cheap read+insert; */30 captures session_coordination FLEET-RETRO signals before they are swept.
  { key: 'fleet-retro',  label: 'Worker fleet-retro (periodic capture/synthesis)', script: 'coordinator-fleet-retro.mjs', cron: '*/30 * * * *',
    gha_backed: true,
    prompt: 'node scripts/coordinator-fleet-retro.mjs' },
  // SD-LEO-INFRA-STANDING-ROW-GROWTH-001: daily governance-table row-growth gauge.
  // Snapshots estimated row counts (PostgREST head+estimated — pg statistics, no COUNT(*))
  // into a coordination_events baseline series and alerts the coordinator inbox on
  // growth-factor / absolute-spike anomalies between consecutive snapshots. Internally
  // due-gated (~22h), so an extra arm or manual run is a cheap no-op. Catches the
  // management_reviews-45k / sd_baseline_items-13k class within a day, not by accident.
  { key: 'row-growth',  label: 'Governance row-growth gauge (daily)', script: 'row-growth-snapshot.cjs', cron: '30 8 * * *',
    gha_backed: true,
    prompt: 'node scripts/row-growth-snapshot.cjs' },
  // SD-LEO-INFRA-CODIFY-SUBSYSTEM-REVIEW-001: weekly subsystem-review rotation.
  // Stateless (registry = completed SDs stamping metadata.subsystem_review); posts ONE
  // coordinator-inbox review-supply row naming the next-due subsystem + the
  // /review-subsystem command. Due-gated ~6 days; extra arms/manual runs are no-ops.
  // Converts idle-fleet gaps into review supply (4 reviews -> 27 evidenced SDs on 2026-06-10).
  { key: 'review-rotation', label: 'Subsystem review rotation (weekly)', script: 'subsystem-review-rotation.cjs', cron: '0 9 * * 1',
    gha_backed: true,
    prompt: 'node scripts/subsystem-review-rotation.cjs' },
  // SD-LEO-INFRA-SCRIPTS-ESTATE-RECONCILIATION-001 (FR-1): weekly scripts-estate reachability
  // gauge. Scans scripts/** against the reference haystack (package.json, .github, .husky,
  // hooks/skills configs, docs, code, CLAUDE*.md), persists a coordination_events baseline
  // series (SCRIPTS_REACHABILITY_SNAPSHOT) and alerts the coordinator inbox ONLY on growth
  // (orphan_count +>=10 week-over-week) or broken npm aliases. Internally due-gated (~6d),
  // so an extra arm or manual run is a cheap no-op. Advisory — never CI-blocking.
  { key: 'scripts-reachability', label: 'Scripts-estate reachability gauge (weekly)', script: 'scripts-reachability-gauge.mjs', cron: '40 9 * * 1',
    gha_backed: true,
    prompt: 'node scripts/scripts-reachability-gauge.mjs' },
  // SD-MAN-INFRA-RETENTION-OPS-FINISHER-001: weekly archive-not-delete retention enforcement
  // (machinery shipped + chairman-GO'd by SD-LEO-INFRA-RETENTION-POLICY-UNBOUNDED-001; 196k rows
  // archived in the first live soak). Prompt mirrors scripts/retention-enforce.js --arming-spec.
  // Batch-clamped + per-table fail-soft, so a re-arm or manual run is safe; backlog convergence
  // (~513k workflow_trace_log + ~484k governance_audit_log) only progresses while this is armed.
  { key: 'retention', label: 'Weekly retention enforcement (archive-not-delete)', script: 'retention-enforce.js', cron: '0 3 * * 0',
    prompt: 'Run `npm run retention:apply` in EHG_Engineer and report the per-table archived/deleted counts; if the command exits non-zero or `npm run retention:check -- --liveness` reports STALE, surface to the coordinator.' },
  // QF-20260702-272: durable twice-daily roles/duties self-review — replaces a session-only CronCreate
  // (d5f7e707, 41 6,18 * * *) that DIED with its session, the same session-fragility class as Adam's
  // belt-countdown duty (already durably encoded). It caught a real live drift (Duty-5 let-workers-idle
  // miss, chairman-flagged 2026-07-02), so every coordinator startup now re-arms it. Same off-minute
  // twice-daily cadence as the original. Chairman endorsed each crew member keeping a recurring
  // self-review; coordinator itself requested this as sourceable candidate #1 (advisory 444cdd65 ref).
  { key: 'roles-review', label: 'Coordinator roles/duties self-review (twice-daily, durable)', script: 'coordinator-startup-check.mjs', cron: '41 6,18 * * *',
    prompt: 'Re-read the coordinator role contract (leo_protocol_sections id=605 + docs/protocol/fleet-coordinator-and-worker-behavior.md, rendered by `node scripts/coordinator-startup-check.mjs`) and self-audit duty execution against RESPONSIBILITIES: for each duty, confirm evidence of recent execution and REMEDIATE any drift found (e.g. idle workers with claimable work, a stale sourcing gap) rather than observe-only.' },
  // QF-20260703-563: the gauge-runner (SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001, the
  // invariant-gauges execution surface) had NO scheduled venue anywhere — 29h stale until an
  // interim session-only cron was hand-armed. Session crons die with sessions, the same
  // fragility class already fixed for Adam's belt-countdown and this coordinator's own
  // roles-review duty (QF-433/QF-272). Class 6b for the ledger: the instrument that watches
  // for unwired machinery was itself unwired. Hourly cadence — cheap, and the gauges'
  // detector functions are internally due-gated/idempotent, so an extra run is a no-op.
  { key: 'gauge-runner', label: 'Invariant-gauges execution surface (hourly, durable)', script: 'gauge-runner.mjs', cron: '0 * * * *',
    gha_backed: true,
    prompt: 'node scripts/gauge-runner.mjs --json' },
  // QF-20260719-720 (operator directive: duty adherence must be schedule-driven, not memory-driven):
  // three duties proven necessary by 2026-07-19 live incidents existed only as the incumbent
  // coordinator's session crons (f9382bc7/8d60db23/ea868bfd) — the exact session-fragility class
  // fixed for roles-review (QF-272) and gauge-runner (QF-563). Durably encoded here so every
  // coordinator startup re-arms them. Idempotency: advisory-drain acts per-item with per-item
  // actioned_at acks (an extra run finds nothing unactioned); silent-holder-audit skips holders
  // already carrying an unanswered status request; shared-root-freshness's pull is a no-op on an
  // up-to-date tree.
  { key: 'advisory-drain', label: 'Adam-advisory drain — ACT + per-item ack (the QF-298 gauge is the counter; this is the acting half)', script: 'read-adam-advisories.cjs', cron: '6,16,26,36,46,56 * * * *',
    prompt: 'Run `node scripts/read-adam-advisories.cjs`. For EACH unactioned advisory listed: ACTION it per its kind (route/decide/reply — never lean-filter advisories) and ack it PER-ITEM (actioned_at) — never bulk-ack. If none are listed this is a NO-OP. Incident basis: 14 advisories incl a chairman decision sat unactioned ~2.5h while every tick read clean.' },
  { key: 'silent-holder-audit', label: 'Silent-claim-holder audit — status-or-release on >3h no-signal with no work product', script: null, cron: '23 * * * *',
    prompt: 'Silent-holder audit: list fleet workers currently holding an sd_key claim. For each holder with >3h since their last /signal AND no work product in that window (no PR, no commits on the claim branch — WORK PRODUCT is the discriminator, never loop_state/started_at), send a status-or-release coordinator_request via the dispatch choke — unless that holder already has an unanswered status request pending (skip, no re-nudge). Release decisions stay with the sweep; this loop only asks.' },
  // QF-20260727-502. TWO CHANGES, BOTH FROM MEASUREMENT, NEITHER WEAKENING THE REAPER'S GUARD.
  //
  // (1) CADENCE 2h -> 20min. The loop remediates a tree that goes stale within MINUTES under six
  // parallel workers. One measured 2.5h coordinator session saw drift of 6, then 22, then 3
  // commits — every window far shorter than the 2h tick, so the remediation essentially never
  // arrived in time and the reaper refused for 5 then 6 consecutive ticks with the pool at 20/28.
  //
  // (2) THE DIRTY-REFUSAL IS DROPPED FOR THE FF-ONLY VERB ONLY. It bought no safety here and was
  // the thing converting a self-healing case into a 3am manual one. Measured across a four-cell
  // control matrix (tracked/untracked x overlapping/disjoint): `git merge --ff-only` CANNOT
  // clobber. On overlap it aborts with exit 1 and names the files, leaving local edits verbatim;
  // on disjoint dirt it fast-forwards cleanly. The shared root's dirt is dominantly UNTRACKED
  // (~138 porcelain entries: generated CLAUDE_*.md, scripts/one-off artifacts, worker leftovers),
  // which is exactly the untracked-disjoint cell that already fast-forwards today.
  //
  // *** THE OFF-BRANCH REFUSAL STAYS UNCONDITIONAL, AND THE GUARD ITSELF IS UNTOUCHED. *** This
  // relaxation applies to ff-only, the one verb git already protects. checkout/reset/rebase can
  // genuinely clobber a peer worktree and must keep refusing on a dirty or off-branch tree.
  //
  // NOT DOING THE LOCK-CLEARING HALF, DELIBERATELY. An earlier version of this fix had the loop
  // call clear-stale-index-lock.mjs first. The coordinator withdrew it after measuring that the
  // helper's zero-byte branch has NO age floor and NO live-process check — and git creates
  // .git/index.lock as zero bytes via O_CREAT|O_EXCL, writing content microseconds later. A cron
  // clearing zero-byte locks unconditionally can unlink the lock of a LIVE operation, which in a
  // six-worker shared root is a corruption risk strictly worse than the stale tree. Manual calls
  // were safe by TIMING, not by predicate. Hardening the helper is SD-LEO-INFRA-JAMMED-GIT-INDEX-001.
  { key: 'shared-root-freshness', label: 'Shared-root freshness — ff-only pull when main is behind origin (remediation half of the stale-tree gauge)', script: null, cron: '*/20 * * * *',
    prompt: 'Shared-root freshness: in the SHARED ROOT (never a worktree), if the branch is main AND `git fetch origin && git rev-list --count HEAD..origin/main` > 0, run `git merge --ff-only origin/main`. DO NOT gate this on a clean tree: ff-only cannot clobber — on overlapping changes it aborts with exit 1 and names the files, leaving your edits untouched, and the shared root dirt is dominantly untracked and disjoint, which fast-forwards cleanly. If it exits non-zero, REPORT the message verbatim (that is the loud failure, not a problem to work around). If the branch is NOT main, REPORT and do nothing — that refusal stays unconditional because another session may be mid-work. Do NOT clear .git/index.lock here: a zero-byte lock can be a live git operation microseconds old (see SD-LEO-INFRA-JAMMED-GIT-INDEX-001). The stale-tree gauge detects; this loop remediates.' },
  // QF-20260704-493: feedback-consumption SLA gauge daily reminder (Solomon referent-audit
  // cell [4]) — actionable feedback categories (adam_adherence_drift, completion_flag,
  // coordinator_review, harness_backlog escalations) had no consumption deadline. Internally
  // rate-limited/deduped per category per day (metadata.sla_key), so an extra run is a no-op.
  { key: 'feedback-sla', label: 'Feedback-consumption SLA breach reminder (daily)', script: 'coordinator-feedback-sla-gauge.cjs', cron: '45 9 * * *',
    gha_backed: true,
    prompt: 'node scripts/coordinator-feedback-sla-gauge.cjs' },
  // QF-20260705-533 (J1 adversarial sweep REFUTED-DORMANT): the watcher-of-watchers
  // (periodic-liveness-watcher.mjs, SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001) shipped with NO
  // scheduled invoker anywhere — the meta-watcher meant to catch dead periodic processes was
  // itself a dead periodic process. Venue is DELIBERATELY the dev host (not GHA): its 2+-signal
  // role_session checks read PID/process_alive_at signals that only exist where sessions run;
  // a CI venue would degrade to single-signal reads (the false-dead class the script's own
  // header warns about). Its __watcher_self__ self-stamp makes missed ticks self-evident on the
  // same dashboard it renders — the tick-evidence mitigation the retention loop lacked.
  // Twice-hourly off-minute cadence (cheap single registry scan; idempotent re-run).
  // SD-LEO-INFRA-OPERATIVE-AGENT-OWNERSHIP-001-A (FR-5): class-split. The GHA durable invoker
  // (.github/workflows/periodic-liveness-watcher-cron.yml) now owns timestamp-source rows
  // (self_stamped/eva_scheduler_heartbeat); this dev-host entry keeps ONLY the PID-anchored
  // role_session evaluation the venue note above justified — complementary filters, no row
  // double-evaluated across the two venues.
  { key: 'liveness-watcher', label: 'Periodic-process liveness watcher — role_session classes (dev-host venue)', script: 'periodic-liveness-watcher.mjs', cron: '17,47 * * * *',
    prompt: 'LIVENESS_CLASSES=claude_sessions_heartbeat node scripts/periodic-liveness-watcher.mjs' },
  // QF-20260705-797 (J1 adversarial sweep REFUTED-DORMANT, scoped to FR-1 of
  // SD-LEO-FIX-SOLOMON-RECOMMENDATION-GUARDRAIL-001): solomon-ledger-pending-resurface.cjs
  // shipped with an npm script only — no scheduled invoker anywhere — so aged
  // solomon_advice_outcome_ledger rows never resurfaced into Adam's inbox. Cheap (single SELECT
  // + per-row dedup check), fail-open (no active Adam session -> no-op), and self-rate-limits
  // to once per stale ledger row per day via its own payload.dedup_key, so a frequent tick is
  // safe. Also composed into scripts/coordinator-quiet-tick.mjs's COMPOSED_CORES.
  // QF-20260725-342: this prompt carried NO --threshold-hours, so the registered loop ran at the
  // script's 24h DEFAULT while only the GHA cron honored the 72h operating threshold. Built from
  // the shared constant so a future threshold change reaches every invoker at once.
  { key: 'solomon-ledger-resurface', label: 'Solomon ledger-pending resurface (aged advice-outcome rows -> Adam inbox)', script: 'solomon-ledger-pending-resurface.cjs', cron: '13,43 * * * *',
    gha_backed: true,
    prompt: `node scripts/solomon-ledger-pending-resurface.cjs --threshold-hours ${OPERATING_THRESHOLD_HOURS}` },
  // QF-20260720-638 (Solomon-designed, Adam-sourced): encodes the coordinator's manual
  // idle-QF claim-hint intervention as standing behavior. PROPOSE-ONLY (advisory hint row per
  // idle worker, never claims/mutates quick_fixes); belt-and-suspenders chairman-gated
  // exclusion — see the script's own header. Also composed into
  // scripts/coordinator-quiet-tick.mjs's COMPOSED_CORES.
  { key: 'idle-qf-hint', label: 'Idle-worker QF auto-hint (idle-capacity absorption into ranked open QFs)', script: 'coordinator-idle-qf-hint.mjs', cron: '5,15,25,35,45,55 * * * *',
    gha_backed: true,
    prompt: 'node scripts/coordinator-idle-qf-hint.mjs' },
];

// Parse the armed-cron basenames the agent passes from its CronList output.
// Sources (first non-empty wins): --armed "a.cjs,b.mjs" arg, then COORD_ARMED_CRONS env.
export function parseArmedSet(argv = [], env = {}) {
  let raw = '';
  const idx = argv.indexOf('--armed');
  if (idx !== -1 && argv[idx + 1]) raw = argv[idx + 1];
  else {
    const eq = argv.find((a) => a.startsWith('--armed='));
    if (eq) raw = eq.slice('--armed='.length);
    else if (env.COORD_ARMED_CRONS) raw = env.COORD_ARMED_CRONS;
  }
  const provided = raw.trim().length > 0;
  const set = new Set(
    raw.split(',').map((s) => s.trim()).filter(Boolean),
  );
  return { provided, set };
}

// A loop is "armed" when an armed-set was provided AND it contains the loop's prompt (script + args)
// or the loop's script basename. inbox + dashboard share fleet-dashboard.cjs, so we match on the full
// prompt first (so `fleet-dashboard.cjs all` ≠ `fleet-dashboard.cjs inbox`), falling back to basename.
export function loopStatus(loop, armed) {
  if (!armed.provided) return 'unverified';
  if (armed.set.has(loop.prompt)) return 'armed';
  if (armed.set.has(loop.script) && loop.script !== 'fleet-dashboard.cjs') return 'armed';
  return 'MISSING';
}

// Render the responsibilities summary (FR-1). Fail-open: never throws.
export function renderResponsibilities(repoRoot = REPO_ROOT) {
  const lines = [];
  lines.push('═══ COORDINATOR ROLE — responsibilities (MANAGER, not IC) ═══');
  RESPONSIBILITIES.forEach((r, i) => lines.push(`  ${i + 1}. ${r}`));
  let docOk = false;
  try {
    const doc = readFileSync(resolve(repoRoot, ROLE_CONTEXT_DOC), 'utf8');
    docOk = doc.includes('Coordinator responsibilities');
  } catch {
    docOk = false;
  }
  if (docOk) {
    lines.push(`  (durable role context: ${ROLE_CONTEXT_DOC})`);
  } else {
    lines.push(`  ⚠️  role-context doc not found/readable at ${ROLE_CONTEXT_DOC} — summary above is the fallback (fail-open).`);
  }
  return lines.join('\n');
}

// Canonical doc for the Adam<->coordinator comms lane (FR-7, SD-LEO-INFRA-RESILIENT-SYMMETRIC-ADAM-001).
export const ADAM_COMMS_DOC = 'docs/protocol/coordinator-adam-comms.md';

// Render the Adam advisory lane summary (FR-7): the coordinator's read + reply path, so the
// channel is discoverable on startup without reverse-engineering. Fail-open: never throws.
export function renderAdamLane() {
  return [
    '═══ ADAM ADVISORY LANE (read + reply) ═══',
    '  Adam advisories are session_coordination INFO rows (payload.kind=adam_advisory),',
    '  RETIRED ONLY by payload.actioned_at (read_at = delivered, NOT actioned).',
    '  • PEEK (read-only, stamps nothing):  node scripts/read-adam-advisories.cjs',
    '  • ACK [+ reply]:  node scripts/coordinator-ack-adam.cjs --advisory <id> [--reply "<body>"]',
    '  • REPLY by advisory:  node scripts/coordinator-reply.cjs --advisory <id> "<body>"',
    '  • Inbox render also lists them: node scripts/fleet-dashboard.cjs inbox',
    `  (canonical doc: ${ADAM_COMMS_DOC})`,
  ].join('\n');
}

// Render the standard-loop status + CronCreate specs for missing/unverified loops (FR-2).
export function renderLoops(armed) {
  const lines = [];
  lines.push(`═══ STANDARD CRON LOOPS (${STANDARD_LOOPS.length}) — verify all armed ═══`);
  if (!armed.provided) {
    lines.push('  (no --armed set supplied — run CronList and re-invoke with --armed "<script1>,<script2>,…" to get armed|MISSING; emitting full spec below)');
  }
  const toArm = [];
  const toTearDown = [];
  for (const loop of STANDARD_LOOPS) {
    // SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: folded loops stay in the registry (the quiet-tick
    // cores + loop-parity guard reference their scripts) but are NEVER armed as standalone crons —
    // the quiet-tick composes them. A live cron still matching a folded loop must be torn down.
    if (loop.folded) {
      const live = loopStatus(loop, armed) === 'armed';
      lines.push(`  [⏸ folded ] ${loop.key.padEnd(10)} ${loop.label} — composed by quiet-tick; do NOT arm standalone${live ? ' (LIVE cron found — tear down below)' : ''}`);
      if (live) toTearDown.push(loop);
      continue;
    }
    const status = loopStatus(loop, armed);
    const badge = status === 'armed' ? '✅ armed' : status === 'MISSING' ? '❌ MISSING' : '… unverified';
    const ghaMarker = loop.gha_backed ? ' [GHA-backed]' : '';
    lines.push(`  [${badge}] ${loop.key.padEnd(10)} ${loop.label}${ghaMarker}`);
    lines.push(`              cron: ${loop.cron}   prompt: ${loop.prompt}`);
    if (status !== 'armed') toArm.push(loop);
  }
  if (toTearDown.length) {
    lines.push('');
    lines.push(`  → TEAR DOWN ${toTearDown.length} standalone cron(s) now folded into the quiet-tick (CronDelete the CronList entry whose prompt matches):`);
    for (const loop of toTearDown) lines.push(`     CronDelete <prompt: ${JSON.stringify(loop.prompt)}>`);
  }
  lines.push('');
  if (toArm.length === 0 && armed.provided) {
    lines.push(`  ✅ All ${STANDARD_LOOPS.length} standard loops armed. Nothing to arm.`);
  } else {
    lines.push(`  → Arm the ${armed.provided ? toArm.length + ' missing' : 'not-yet-armed'} loop(s) via CronCreate (idempotent — skip any already in CronList):`);
    for (const loop of toArm) {
      lines.push(`     CronCreate({ cron: ${JSON.stringify(loop.cron)}, prompt: ${JSON.stringify(loop.prompt)}, recurring: true })`);
    }
  }
  return lines.join('\n');
}

// SD-LEO-INFRA-SINGLETON-STALE-TREE-STALENESS-GAUGE-001 (framework-seed candidate for
// SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001, still code-free — shipped standalone per the
// scripts/gauge-unranked-claimable-leaves.mjs precedent): the coordinator's own contract doc,
// so drift there surfaces as STALE-CRITICAL. Unlike Adam (single adam-quiet-tick.mjs) the
// coordinator has no single canonical "tick" script — STANDARD_LOOPS lists 15+ periodic
// scripts — so no tick-script path is added here to avoid an arbitrary/incomplete pick.
export const COORDINATOR_CRITICAL_PATHS = Object.freeze([...CRITICAL_PROTOCOL_FILES, ROLE_CONTEXT_DOC]);

/** Advisory checkout-freshness badge (fail-open — never throws, never blocks startup). */
export function renderFreshness(repoRoot = REPO_ROOT) {
  try {
    return '═══ CHECKOUT FRESHNESS ═══\n  ' + freshnessBadge(checkoutFreshness(repoRoot, { role: 'coordinator', criticalPaths: COORDINATOR_CRITICAL_PATHS }));
  } catch (err) {
    return '═══ CHECKOUT FRESHNESS ═══\n  ✅ freshness check skipped (fail-open): ' + (err?.message || String(err));
  }
}

/**
 * SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 / FR-2.
 *
 * THE AUDIT THAT PRODUCED THIS: no role had both halves. adam and solomon have register scripts that
 * check the contract read, but contracts too large to read in one call. The coordinator had a
 * contract small enough to read (CLAUDE_COORDINATOR.md ~25.5KB, under the 25k-token cap for any real
 * tokenizer — established from the byte count, not from a token ratio) and NO VERIFIER OF ANY KIND.
 * Its priming requirement terminated in a self-attestation that nothing checked.
 *
 * Deliberately mirrors adam-register.cjs checkContractRead rather than inventing a shape.
 *
 * WHY HERE AND NOT IN A NEW coordinator-register.cjs: registration is an inline node -e in
 * coordinator.md, and Step 4 of that same ritual already invokes THIS script at the fixed activation
 * moment. A parallel register script would mean inventing an invocation point that does not exist.
 *
 * FAIL-OPEN, LIKE EVERYTHING ELSE HERE. This reports; it never blocks. A gate that stops a
 * coordinator from starting because it has not yet read the contract it is starting in order to read
 * is a deadlock, and the script's contract is "exit code is ALWAYS 0".
 */
export const COORDINATOR_CONTRACT_FILE = 'CLAUDE_COORDINATOR.md';

export function checkCoordinatorContractRead(repoRoot = REPO_ROOT, stateReader = null) {
  const result = {
    contract_file: COORDINATOR_CONTRACT_FILE,
    contract_exists: false,
    contract_read: false,
    contract_read_partial: false,
    contract_last_read_at: null,
  };
  try {
    result.contract_exists = existsSync(resolve(repoRoot, COORDINATOR_CONTRACT_FILE));
    const state = stateReader ? stateReader() : readCoordinatorSessionState(repoRoot);
    if (!state) return result;
    const status = state.protocolFileReadStatus && state.protocolFileReadStatus[COORDINATOR_CONTRACT_FILE];
    if (status && status.readCount > 0) {
      // Routed through the SHARED verdict rather than reading lastReadWasPartial directly. This
      // contract fits in one call, so the old boolean was accurate for the common case — but a
      // coordinator that paginated (e.g. via /read-full) would have been recorded PARTIAL for doing
      // MORE work, which is the same inversion FR-3 removes for adam and solomon. One implementation,
      // three roles; the size tier inside the verdict is what keeps this file's happy path green.
      const verdict = contractReadVerdict(
        status,
        contractLineCount(repoRoot, COORDINATOR_CONTRACT_FILE),
        { sizeBytes: contractSizeBytes(repoRoot, COORDINATOR_CONTRACT_FILE) }
      );
      result.contract_read = verdict.read;
      result.contract_read_partial = !verdict.fully_read;
      result.contract_coverage_pct = verdict.coverage_pct;
      result.contract_read_basis = verdict.basis;
      result.contract_last_read_at = status.lastReadAt || null;
    } else if (Array.isArray(state.protocolFilesRead) && state.protocolFilesRead.includes(COORDINATOR_CONTRACT_FILE)) {
      result.contract_read = true; // legacy-array fallback, same as adam-register
      result.contract_read_basis = 'legacy_array_single_read_safe';
    }
  } catch { /* fail-open: tracking unavailable must never break coordinator startup */ }
  return result;
}

/** Read session state without throwing. Separated so tests can inject state directly. */
function readCoordinatorSessionState(repoRoot) {
  try {
    const statePath = resolveStateReadPath(repoRoot);
    if (!statePath || !existsSync(statePath)) return null;
    return JSON.parse(readFileSync(statePath, 'utf8').replace(/^﻿/, ''));
  } catch { return null; }
}

/**
 * The three role contracts this gate reasons about, and the sibling SD that makes each one readable.
 * Order is the render order.
 */
export const ROLE_CONTRACTS = Object.freeze([
  Object.freeze({ role: 'coordinator', file: COORDINATOR_CONTRACT_FILE, dependency: null }),
  Object.freeze({ role: 'adam', file: 'CLAUDE_ADAM.md', dependency: 'SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001' }),
  Object.freeze({ role: 'solomon', file: 'CLAUDE_SOLOMON.md', dependency: null }),
]);

/**
 * SD-LEO-INFRA-ROLE-CONTRACT-READ-GATE-001 / FR-6 — ARMING IS A MEASUREMENT, NOT A SENTENCE.
 *
 * *** THIS REPLACED THREE HARDCODED STRINGS, AND THE STRINGS WERE CORRECT. *** That is exactly why
 * they were dangerous. `adam : disarmed — CLAUDE_ADAM.md exceeds the read cap` was a true statement
 * about 2026-07-31 pinned into source, and its test asserted the string. So the day
 * SD-LEO-INFRA-ADAM-CONTRACT-READABLE-001 lands and CLAUDE_ADAM.md drops under the bound, the banner
 * would still have printed "disarmed", the test would still have passed, and the newly-compliant role
 * would have stayed dark with nothing anywhere reporting a discrepancy. A check whose verdict cannot
 * change when the world changes is not a check — it is a comment with a test around it. The SD's own
 * criterion is "encoded as a condition, not as prose", and the prose version met it only by coincidence.
 *
 * The dependency is read LIVE and at the only place it is actually observable: the contract's size on
 * disk. Deliberately NOT a DB lookup of the sibling SD's status — this runs inside a fail-open startup
 * path with no network, and more importantly the sibling's *deliverable* IS the smaller file. Asking
 * the filesystem asks whether the thing was actually achieved; asking the DB asks whether someone
 * marked it done. When those disagree, the filesystem is right.
 *
 * @param {string} [repoRoot]
 * @param {(file: string) => number|null} [sizer] test seam: byte size per contract file.
 * @returns {Array<{role:string,file:string,bytes:number|null,armed:boolean,reason:string}>}
 */
export function roleArmingStates(repoRoot = REPO_ROOT, sizer = null) {
  const sizeOf = sizer || ((file) => contractSizeBytes(repoRoot, file));
  return ROLE_CONTRACTS.map(({ role, file, dependency }) => {
    let bytes = null;
    try { bytes = sizeOf(file); } catch { bytes = null; }
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) {
      // Unmeasurable => DISARMED. Absence of evidence is never promoted to compliance; that promotion
      // is the defect this whole SD exists to remove.
      return { role, file, bytes: null, armed: false, reason: `${file} not found — cannot establish readability` };
    }
    const armed = n <= SINGLE_READ_SAFE_BYTES;
    return {
      role, file, bytes: n, armed,
      reason: armed
        ? `contract fits in one read (${n}B ≤ ${SINGLE_READ_SAFE_BYTES}B)`
        : `${file} exceeds the single-read bound (${n}B > ${SINGLE_READ_SAFE_BYTES}B)`
            + (dependency ? ` — blocked on ${dependency}` : ''),
    };
  });
}

/**
 * Render the contract-read state.
 *
 * PER-ROLE ARMING IS RENDERED, NOT IMPLIED. Global arming was rejected: it would make the one role
 * that can comply today wait on two that cannot, and would couple this SD to a sibling deliberately
 * sequenced after it. The risk of per-role is someone assuming uniform coverage, so the disarmed
 * roles are printed explicitly rather than left to inference.
 */
export function renderContractRead(repoRoot = REPO_ROOT, check = null, opts = {}) {
  const lines = ['═══ ROLE CONTRACT READ ═══'];
  try {
    const c = check || checkCoordinatorContractRead(repoRoot);
    if (!c.contract_exists) {
      lines.push(`  ✗ ${COORDINATOR_CONTRACT_FILE} not found — regenerate: node scripts/generate-claude-md-from-db.js`);
    } else if (!c.contract_read) {
      lines.push(`  ✗ NO RECORD of ${COORDINATOR_CONTRACT_FILE} being read this session.`);
      // Safe advice HERE and only here: this contract is under the read cap, so a no-offset Read
      // genuinely covers it. The same instruction on an over-cap contract silently truncates and is
      // then recorded as a complete read — see FR-3/FR-5.
      lines.push(`  → Read ${COORDINATOR_CONTRACT_FILE} in full before coordinating.`);
    } else if (c.contract_read_partial) {
      lines.push(`  ⚠ Last read of ${COORDINATOR_CONTRACT_FILE} was PARTIAL (offset/limit used).`);
      lines.push('  → Re-read it in full; this contract fits in one call.');
    } else {
      lines.push(`  ✅ ${COORDINATOR_CONTRACT_FILE} read${c.contract_last_read_at ? ` at ${c.contract_last_read_at}` : ''}`);
    }
    lines.push('  ── per-role arming (measured now, from each contract on disk) ──');
    for (const s of roleArmingStates(repoRoot, opts.sizer)) {
      lines.push(`  ${s.role.padEnd(11)} : ${s.armed ? 'ARMED' : 'disarmed'} — ${s.reason}`);
    }
  } catch (err) {
    lines.push('  ✅ contract-read check skipped (fail-open): ' + (err?.message || String(err)));
  }
  return lines.join('\n');
}

export function buildReport(argv = [], env = {}, repoRoot = REPO_ROOT) {
  const armed = parseArmedSet(argv, env);
  return [renderResponsibilities(repoRoot), '', renderAdamLane(), '', renderLoops(armed), '', renderContractRead(repoRoot), '', renderFreshness(repoRoot)].join('\n');
}

// SD-LEO-INFRA-BOOTSTRAPPABLE-SURVIVOR-AGNOSTIC-001: coordinator-cold-recovery.cjs shipped +
// npm-wired but was never invoked from the startup ritual, leaving the survivor-agnostic
// cold-recovery path unreachable. Dry-run by default; --execute (or COORD_COLD_RECOVERY_
// EXECUTE=1) releases + resume-redispatches orphaned claims. Fail-open: never throws.
export async function renderColdRecovery(argv = [], env = {}) {
  const dryRun = !(argv.includes('--execute') || env.COORD_COLD_RECOVERY_EXECUTE === '1');
  try {
    const { coldRecover } = await import('./coordinator-cold-recovery.cjs');
    const { createSupabaseServiceClient } = await import('../lib/supabase-client.cjs');
    const report = await coldRecover({ supabase: createSupabaseServiceClient(), dryRun });
    const lines = [`═══ COLD-RECOVERY SWEEP (${dryRun ? 'dry-run' : 'EXECUTE'}) ═══`];
    lines.push(`  in-flight: ${report.reconstructed}   orphaned: ${report.orphaned.length}`);
    if (report.orphaned.length) lines.push(`  ${dryRun ? 'would release+resume' : 'released+resume-redispatched'}: ${report.orphaned.join(', ')}`);
    if (report.errors.length) lines.push(`  ⚠️  errors: ${report.errors.join('; ')}`);
    return lines.join('\n');
  } catch (err) {
    return '═══ COLD-RECOVERY SWEEP ═══\n  ✅ skipped (fail-open): ' + (err?.message || String(err));
  }
}

// ── Main (fail-open: always exit 0) ──
function main() {
  try {
    console.log('[COORD-STARTUP] ' + (process.env.CLAUDE_SESSION_ID ? 'session=' + process.env.CLAUDE_SESSION_ID : 'session=unknown'));
    console.log(buildReport(process.argv.slice(2), process.env));
  } catch (err) {
    console.warn('⚠️  coordinator-startup-check hiccup (non-blocking, fail-open): ' + (err && err.message ? err.message : String(err)));
  }
  renderColdRecovery(process.argv.slice(2), process.env)
    .then(async (out) => {
      console.log(out);
      // SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): stamp on every successful
      // startup-check tick (the report + cold-recovery leg are fail-open by design).
      try {
        const { createSupabaseServiceClient } = await import('../lib/supabase-client.cjs');
        const { stampLastFired } = await import('../lib/periodic-liveness/stamp-last-fired.js');
        await stampLastFired(createSupabaseServiceClient(), 'standard_loop:roles-review');
      } catch (err) {
        console.warn('[COORD-STARTUP] stampLastFired failed (non-fatal): ' + err.message);
      }
    })
    .finally(() => process.exit(0));
}

// Only run main when invoked directly (not when imported by tests).
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
