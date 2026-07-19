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
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// SD-LEO-INFRA-FLEET-FRESHNESS-GUARD-001: advisory, fail-open checkout-freshness badge.
import { checkoutFreshness, freshnessBadge, CRITICAL_PROTOCOL_FILES } from '../lib/governance/checkout-freshness.js';

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
  { key: 'solomon-ledger-resurface', label: 'Solomon ledger-pending resurface (aged advice-outcome rows -> Adam inbox)', script: 'solomon-ledger-pending-resurface.cjs', cron: '13,43 * * * *',
    gha_backed: true,
    prompt: 'node scripts/solomon-ledger-pending-resurface.cjs' },
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

export function buildReport(argv = [], env = {}, repoRoot = REPO_ROOT) {
  const armed = parseArmedSet(argv, env);
  return [renderResponsibilities(repoRoot), '', renderAdamLane(), '', renderLoops(armed), '', renderFreshness(repoRoot)].join('\n');
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
