#!/usr/bin/env node
// adam-startup-check — emit Adam's recurring-tick CronCreate specs at /adam startup.
//
// SD: SD-LEO-INFRA-ENABLE-ADAM-GOVERNANCE-001 (FR-1)
//
// /adam startup historically armed ZERO crons (it only tags role=adam + loads the
// contract). This is the durable fix: it EMITS Adam's tick specs (governance-scan +
// inbox-monitor + offer-coordinator-help) so the /adam agent arms them via the harness
// CronCreate tool — idempotently vs CronList. It is the durable replacement for any
// interim hand-armed cron. Mirrors scripts/coordinator-startup-check.mjs (emit-spec
// pattern: CronCreate/CronList are HARNESS tools, not Node-callable, so this only EMITS).
//
// Usage:
//   node scripts/adam-startup-check.mjs
//   node scripts/adam-startup-check.mjs --armed "governance-scan,inbox-monitor,offer-help"
//   (or ADAM_ARMED_CRONS env, comma-separated loop KEYS — prompts/script basenames also
//   match, but keys are canonical: prompts can contain commas) → armed|MISSING verdict.
//
// Fail-open: always exits 0; a hiccup never blocks /adam startup.

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// SD-LEO-INFRA-FLEET-FRESHNESS-GUARD-001: advisory, fail-open checkout-freshness badge.
import { checkoutFreshness, freshnessBadge, CRITICAL_PROTOCOL_FILES } from '../lib/governance/checkout-freshness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// The Adam role contract (durable). Loaded on /adam startup; referenced here for the summary.
export const ROLE_CONTEXT_DOC = 'CLAUDE_ADAM.md';

export const RESPONSIBILITIES = [
  'Silence-by-default, propose-only (CONST-002) — never execute / accept / graduate.',
  'Global <=1-advisory-per-tick cap; cite a live KR + counterfactual + dedup + a CONST self-check (the rationale bar).',
  'Daily deep governance-scan (one scope per tick, weighted round-robin); gated on ADAM_GOVERNANCE_HEARTBEAT_V1.',
  'Drain coordinator replies/reminders (the inbox); offer the coordinator concise analysis when it helps.',
  'Recurring SELF-adherence audit: probe own role-contract duties, ledger findings, source propose-only remediation on drift (never build — CONST-002).',
  'Reconcile the durable PM board against live reality every tick; alert the chairman ONLY on a genuine critical-path stall (never on an intended hold) via the verified escalation-email channel.',
];

// Adam's recurring tick. Each loop is one CronCreate spec the /adam agent arms idempotently.
//   - governance-scan: the flag-gated read-only opportunity-scan (the heartbeat body).
//   - inbox-monitor:   drain coordinator replies that arrived after a sync await timed out.
//   - offer-help:      an agent-judgment tick (no script) — propose-only, silence-by-default.
export const ADAM_LOOPS = [
  {
    // SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: the quiet-tick cutover (docs/protocol/
    // fleet-hibernation-quiet-tick.md). ONE self-pacing LLM tick composes the folded loops
    // (inbox-monitor, belt-countdown, offer-help — marked folded:true, kept in this registry
    // for the loop-parity guard). Cron minutes offset from the coordinator quiet-tick
    // (0,15,30,45) so the two parties never co-fire; the tick parks 180–900s via ScheduleWakeup.
    key: 'quiet-tick',
    label: 'Adam quiet-tick (folds inbox-monitor + belt-countdown + offer-help)',
    script: 'adam-quiet-tick.mjs',
    cron: '7,22,37,52 * * * *',
    // SD-LEO-INFRA-ADAM-INBOX-SURFACE-NOT-STAMP-001: QUIET_TICK_INBOX_DIRECTIVE /
    // QUIET_TICK_INBOX_ITEM are actionable tokens — omitting them from this allowlist
    // would make an isolated directive arrival read as a NO-OP tick (the read-stamped-
    // not-processed class rebuilt at the tick layer; caught by adversarial review of PR #5802).
    // QF-20260711-095 (token-contract parity lint, scripts/lint/quiet-tick-token-parity-lint.mjs):
    // QUIET_TICK_VENTURE_STALL_ALERT / QUIET_TICK_INBOX_CAP are ALSO emitted by
    // adam-quiet-tick.mjs but were missing here — the exact silent-fallthrough-to-NO-OP
    // class this comment already warns about, just for two different tokens.
    // QF-20260719-848: QUIET_TICK_SMS_INBOUND (undrained chairman SMS, contract INBOUND WATCH
    // duty) is the newest such token — kept in parity here so a cold-start tick surfaces + acts on it.
    prompt: 'Run `node scripts/adam-quiet-tick.mjs`. It prints ONE QUIET_TICK summary line and self-paces. If the output contains NO QUIET_TICK_PING / QUIET_TICK_STALL_ALERT / QUIET_TICK_VENTURE_STALL_ALERT / QUIET_TICK_OUTBOUND_PROBE / QUIET_TICK_INBOX_DIRECTIVE / QUIET_TICK_INBOX_ITEM / QUIET_TICK_INBOX_CAP / QUIET_TICK_SMS_INBOUND / QUIET_TICK_ERROR lines, this turn is a NO-OP: arm ScheduleWakeup(nextWakeSeconds from the output) and emit nothing else. Otherwise act on the flagged lines (QUIET_TICK_INBOX_DIRECTIVE lines are HARD interrupts — process the directed row, then `node scripts/adam-advisory.cjs ack <id>`; QUIET_TICK_INBOX_ITEM lines are directed inbox rows to action or deliberately leave pending; QUIET_TICK_VENTURE_STALL_ALERT flags a stalled venture to investigate/escalate, mirroring QUIET_TICK_STALL_ALERT; QUIET_TICK_INBOX_CAP means the inbox fetch hit its cap — more rows may remain beyond this tick, re-run the drain; QUIET_TICK_SMS_INBOUND flags an undrained chairman SMS reply — a HARD interrupt: drain + reply per the CHAIRMAN SMS CHANNEL DUTY, `node scripts/sms-relay-drain.cjs`), then arm the wakeup.',
  },
  {
    key: 'governance-scan',
    label: 'Daily governance opportunity-scan (gated on ADAM_GOVERNANCE_HEARTBEAT_V1)',
    script: 'adam-opportunity-scan.cjs',
    cron: '0 13 * * *',
    prompt: 'node scripts/adam-opportunity-scan.cjs --scan --scope auto',
  },
  {
    // SD-LEO-FIX-ADAM-INBOX-FULL-LANE-001: drain ALL coordinator-directed kinds (replies +
    // coordinator directives), not reply-only — closes the reply-only blindspot.
    key: 'inbox-monitor',
    folded: true, // SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: composed by adam-quiet-tick — never armed standalone
    label: 'Adam inbox — drain ALL coordinator-directed kinds (full-lane reader)',
    script: 'adam-advisory.cjs',
    // QF-20260701-062: chairman-directed 15min -> 5min durable baseline (tighter comms
    // responsiveness on the advisory lane). Off-round minutes avoid fleet-wide :00/:05 collision.
    cron: '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
    // SD-REFILL-00YJS6VB: --quiet suppresses the no-op "(no unread...)" line on a fully-empty
    // lane so the recurring tick is SILENT when there's nothing to drain (real rows + orphaned
    // WARNINGs still surface). Reduces narration churn during quiescent/chairman-attached work.
    prompt: 'node scripts/adam-advisory.cjs inbox --quiet',
  },
  {
    key: 'offer-help',
    folded: true, // SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: composed by adam-quiet-tick — never armed standalone
    label: 'Offer coordinator help (agent judgment, propose-only, silence-by-default)',
    script: null, // agent-prompt tick — no script to run
    cron: '0 */2 * * *',
    prompt: 'Adam offer-help tick: peek the coordinator state (node scripts/fleet-dashboard.cjs all) + your inbox; if the coordinator has a strategy/analysis question you can answer or is overloaded, offer ONE concise analysis via node scripts/adam-advisory.cjs send "<body>" — else STAY SILENT (silence-by-default, propose-only, CONST-002).',
  },
  {
    // SD-LEO-INFRA-AUTOMATED-RECURRING-ADAM-001 (child E): Adam audits its OWN role-contract
    // adherence (probes -> adam_adherence_ledger -> propose-only remediation for the coordinator;
    // Adam never builds, CONST-002). The self-improving governance loop.
    key: 'self-adherence',
    label: 'Adam self-adherence audit (role-contract probes -> ledger -> propose-only remediation)',
    script: 'adam-self-adherence-review.mjs',
    cron: '0 */6 * * *',
    prompt: 'node scripts/adam-self-adherence-review.mjs',
  },
  {
    // SD-LEO-INFRA-ADAM-COORDINATOR-HEALTH-001 (chairman mandate 2026-07-16): the mirror of
    // self-adherence, but audits the COORDINATOR — 3 KPIs (utilization, plan-adherence,
    // fail-loud integrity) -> a persisted reading -> a propose-only advisory on breach. Turns
    // Adam's ad-hoc coordinator audits (already caught real defects) into a standing loop.
    key: 'coordinator-health',
    label: 'Adam coordinator-health audit (3-KPI probe -> readings -> propose-only advisory on breach)',
    script: 'adam-coordinator-health.mjs',
    cron: '20 */6 * * *',
    prompt: 'node scripts/adam-coordinator-health.mjs',
  },
  {
    // SD-LEO-INFRA-ADAM-MACHINERY-CONSUMER-001 (FR2): the contract-named BELT COUNTDOWN DUTY
    // (CLAUDE_ADAM.md "BELT COUNTDOWN DUTY (durable)") previously lived only in session-scoped
    // crons and DIED with every Adam session (2026-06-11 handoff drill). Arming it here makes it
    // survive session restarts — closing the contract↔tooling gap the duty-marker parity test enforces.
    key: 'belt-countdown',
    folded: true, // SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: composed by adam-quiet-tick — never armed standalone
    label: 'Belt-countdown one-liner (ET 12h, rolling ETA to belt-dry) while the fleet is active',
    script: null, // agent-prompt tick — depth/burn come from DB rows via fleet-dashboard, never hand-converted ET↔UTC
    cron: '*/15 * * * *',
    prompt: 'Adam belt-countdown tick: if the fleet is active, post ONE belt-countdown line via node scripts/adam-advisory.cjs send "<line>" — Eastern time in 12-hour format with a rolling ETA to belt-dry (claimable-SD depth vs current fleet burn; read depth/burn from DB rows via node scripts/fleet-dashboard.cjs, never hand-convert ET↔UTC). If the fleet is idle/empty, STAY SILENT.',
  },
  {
    // SD-LEO-INFRA-REGISTER-TWO-EVERY-001 (DUTY 1): every-3-day propose-only doc-drift review. Reads ONLY
    // the SDs/QFs COMPLETED in the trailing 3 days (delta-scoped, NOT a full doc scour), maps each by
    // sd_type to the doc dirs most likely affected, clusters, and surfaces a doc-update PROPOSAL to the
    // coordinator. Edits no docs (CONST-002). Ships INERT behind ADAM_DOC_DRIFT_V1 (default OFF).
    key: 'doc-drift',
    label: 'Every-3-day doc-drift review (delta-scoped completed SDs/QFs -> doc-dir proposal, propose-only, gated on ADAM_DOC_DRIFT_V1)',
    script: 'adam-doc-drift-review.mjs',
    cron: '0 9 */3 * *',
    prompt: 'node scripts/adam-doc-drift-review.mjs',
  },
  {
    // SD-LEO-INFRA-REGISTER-TWO-EVERY-001 (DUTY 2): every-3-day propose-only GitHub-health assessment.
    // Aggregates existing GitHub-health producers (CI red, failed runs, open/stale/oversized PRs, merge
    // conflicts) PLUS open dependabot/code-scanning alerts into ONE ranked advisory to the coordinator.
    // Read-only (CONST-002). Ships INERT behind ADAM_GH_ASSESS_V1 (default OFF).
    key: 'github-assessment',
    label: 'Every-3-day GitHub-health assessment (CI/PR/alerts -> one ranked advisory, propose-only, gated on ADAM_GH_ASSESS_V1)',
    script: 'adam-github-assessment.mjs',
    cron: '30 9 */3 * *',
    prompt: 'node scripts/adam-github-assessment.mjs',
  },
  {
    // SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-B (Child B / FR-1+FR-5): the
    // contract-named BOARD RECONCILE DUTY. Reconciles the durable task ledger against live reality
    // every recurring tick (scripts/adam-quiet-tick.mjs's reconcileBoard()), not only at /adam cold
    // start — closing the same "durable but session-fragile" gap the belt-countdown duty closed.
    key: 'board-reconcile',
    // SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: folded — this loop ran the SAME adam-quiet-tick.mjs
    // at 12×/hour, duplicating the consolidated quiet-tick loop above (which composes
    // reconcileBoard() on every tick at 4×/hour + self-paced wakeups). Keeping both would
    // defeat the burn reduction the cutover exists for.
    folded: true,
    label: 'Board<->reality reconcile every tick (adam_task_ledger via rehydrateBoard)',
    script: 'adam-quiet-tick.mjs',
    cron: '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
    prompt: 'node scripts/adam-quiet-tick.mjs',
  },
  {
    // QF-20260719-343 (contract c3, leo_protocol_sections id=601, chairman-directed 2026-07-19):
    // routine heartbeat is now a BRIEF HOURLY SMS, not a half-hourly email. Quiet hours
    // (22:00-06:00 ET) + rate caps are enforced inside sendChairmanSMS's rubric gate. Was
    // SESSION-ONLY (session c514430f hand-armed as interim); registered here for durability.
    key: 'heartbeat-sms',
    label: 'Hourly brief status SMS (quiet-hours-respecting, silence-by-default on truly-nothing ticks)',
    script: 'adam-chairman-sms.mjs',
    cron: '14 * * * *',
    prompt: 'Adam heartbeat-sms tick: if there is truly nothing plan-relevant to report, stay SILENT (silence-by-default) — otherwise compose ONE short (1-2 sentence), professional-casual, plan-relevant status line and run node scripts/adam-chairman-sms.mjs --kind heartbeat_status --body "<line>" (quiet hours and rate caps are enforced by the send gate itself — do not skip the call to pre-empt them). Never send a false all-good; if something is actually wrong, send the decision/alert email instead (node scripts/adam-decision-email.mjs) rather than this heartbeat.',
  },
  {
    // QF-20260719-343 (contract c4, leo_protocol_sections id=601, chairman-directed 2026-07-19):
    // daily 6:00 AM ET plan-first morning brief by SMS. RECONCILED via a per-ET-date dedupe key
    // (enqueueChairmanSms already enforces at-most-once/day); the hourly heartbeat-sms tick
    // above doubles as the late-delivery check. Distinct from the unchanged doc+Gantt-MMS
    // daily-review surface (SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001).
    key: 'morning-brief-sms',
    label: 'Daily 6:00 AM ET plan-first morning brief SMS (reconciled via per-date dedupe key)',
    script: 'adam-chairman-sms.mjs',
    cron: '0 6 * * *',
    prompt: 'Adam morning-brief-sms tick: compose a self-contained, plan-first morning brief (roadmap position + overnight Slipped/Committing/Done condensed to phone scale, professional-casual), then run node scripts/adam-chairman-sms.mjs --kind morning_brief --dedupe-key "adam-morning-brief-<YYYY-MM-DD ET>" --body "<brief>". If a later tick finds today\'s dedupe key was never sent (the 6:00 fire was missed), compose and send it then instead -- late is better than never.',
  },
];

// Parse the armed-cron basenames/prompts the agent passes from its CronList output.
// Sources (first non-empty wins): --armed "a,b" arg, then ADAM_ARMED_CRONS env.
export function parseArmedSet(argv = [], env = {}) {
  let raw = '';
  const idx = argv.indexOf('--armed');
  if (idx !== -1 && argv[idx + 1]) raw = argv[idx + 1];
  else {
    const eq = argv.find((a) => a.startsWith('--armed='));
    if (eq) raw = eq.slice('--armed='.length);
    else if (env.ADAM_ARMED_CRONS) raw = env.ADAM_ARMED_CRONS;
  }
  const provided = raw.trim().length > 0;
  const set = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  return { provided, set };
}

// SD-LEO-INFRA-ADAM-MACHINERY-CONSUMER-001 (FR2): parse the contract's DURABLE recurring-duty
// markers from CLAUDE_ADAM.md. A durable duty is bolded as `**<NAME> DUTY (durable)**`; the
// captured NAME is slugged (lowercase, spaces→hyphens) so it can be matched against an
// ADAM_LOOPS key. The "(durable)" qualifier is load-bearing: TEMPORARY, self-deleting watchers
// (e.g. the .PUSHED-lifecycle autonomy-completion-watcher) are NOT marked durable, so they are
// excluded here and correctly stay session-scoped (NOT required in ADAM_LOOPS). Pure; no I/O.
// MARKER CONVENTION (keep CLAUDE_ADAM.md authors aware): a durable recurring duty is bolded as
//   **<NAME> DUTY (durable)**
// where <NAME> is a human label (letters/digits/spaces/hyphens, any case) and the literal token
// " DUTY (durable)" follows (case-insensitive on "durable", whitespace-tolerant). The slug is
// <NAME> lowercased with spaces→hyphens. The regex is deliberately FORGIVING so a stylistic
// variation (hyphenated name, mixed case, uppercase DURABLE) never SILENTLY drops a duty from
// enforcement — a false negative here = an unenforced duty, the exact failure this guards.
export function parseDurableDutyMarkers(markdown) {
  const slugs = new Set();
  const re = /\*\*\s*([A-Za-z0-9][A-Za-z0-9 -]*?)\s+DUTY\s*\(\s*durable\s*\)\s*\*\*/gi;
  let m;
  while ((m = re.exec(String(markdown || ''))) !== null) {
    slugs.add(m[1].trim().toLowerCase().replace(/\s+/g, '-'));
  }
  return [...slugs];
}

// FR2: which contract-named durable duties are MISSING from ADAM_LOOPS. [] === parity holds.
// This is the consumer-side invariant for the loop registry: a duty the contract PROMISES must
// actually exist in the tooling that arms it, or it silently dies every session.
export function missingDurableDuties(markdown, loops = ADAM_LOOPS) {
  const keys = new Set(loops.map((l) => l.key));
  return parseDurableDutyMarkers(markdown).filter((slug) => !keys.has(slug));
}

// A loop is "armed" when an armed-set was provided AND it contains the loop's KEY (the
// canonical comma-free token — prompts can contain commas, so a full prompt is unmatchable
// through the CSV --armed channel: offer-help would read MISSING forever and get re-armed
// as a duplicate every /adam startup), its full prompt, or (for script-backed loops) its
// script basename.
export function loopStatus(loop, armed) {
  if (!armed.provided) return 'unverified';
  if (armed.set.has(loop.key)) return 'armed';
  if (armed.set.has(loop.prompt)) return 'armed';
  if (loop.script && armed.set.has(loop.script)) return 'armed';
  return 'MISSING';
}

// Render Adam's responsibilities summary. Fail-open: never throws.
export function renderResponsibilities(repoRoot = REPO_ROOT) {
  const lines = ['═══ ADAM ROLE — recurring-tick responsibilities (propose, never execute) ═══'];
  RESPONSIBILITIES.forEach((r, i) => lines.push(`  ${i + 1}. ${r}`));
  let docOk = false;
  try { docOk = readFileSync(resolve(repoRoot, ROLE_CONTEXT_DOC), 'utf8').length > 0; } catch { docOk = false; }
  lines.push(docOk ? `  (durable role contract: ${ROLE_CONTEXT_DOC})`
                   : `  ⚠️  role contract not found at ${ROLE_CONTEXT_DOC} — summary above is the fallback (fail-open).`);
  return lines.join('\n');
}

// Render the tick-loop status + CronCreate specs for missing/unverified loops.
export function renderLoops(armed) {
  const lines = [`═══ ADAM RECURRING TICK (${ADAM_LOOPS.length} loops) — arm all idempotently ═══`];
  if (!armed.provided) {
    lines.push('  (no --armed set supplied — run CronList and re-invoke with --armed "<loop-key>,…" (e.g. "governance-scan,inbox-monitor") for an armed|MISSING verdict; emitting full spec below)');
  }
  const toArm = [];
  const toTearDown = [];
  for (const loop of ADAM_LOOPS) {
    // SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: folded loops stay registered (quiet-tick cores +
    // the loop-parity guard reference them) but are NEVER armed standalone — the quiet-tick
    // composes them. A live cron still matching a folded loop must be torn down.
    if (loop.folded) {
      const live = loopStatus(loop, armed) === 'armed';
      lines.push(`  [⏸ folded ] ${loop.key.padEnd(16)} ${loop.label} — composed by adam-quiet-tick; do NOT arm standalone${live ? ' (LIVE cron found — tear down below)' : ''}`);
      if (live) toTearDown.push(loop);
      continue;
    }
    const status = loopStatus(loop, armed);
    const badge = status === 'armed' ? '✅ armed' : status === 'MISSING' ? '❌ MISSING' : '… unverified';
    lines.push(`  [${badge}] ${loop.key.padEnd(16)} ${loop.label}`);
    lines.push(`              cron: ${loop.cron}`);
    if (status !== 'armed') toArm.push(loop);
  }
  if (toTearDown.length) {
    lines.push('');
    lines.push(`  → TEAR DOWN ${toTearDown.length} standalone cron(s) now folded into the quiet-tick (CronDelete the CronList entry whose prompt matches):`);
    for (const loop of toTearDown) lines.push(`     CronDelete <prompt: ${JSON.stringify(loop.prompt)}>`);
  }
  lines.push('');
  if (toArm.length === 0 && armed.provided) {
    lines.push(`  ✅ All ${ADAM_LOOPS.length} Adam tick loops armed. Nothing to arm.`);
  } else {
    lines.push(`  → Arm the ${armed.provided ? toArm.length + ' missing' : 'not-yet-armed'} loop(s) via CronCreate (idempotent — skip any already in CronList, incl. an interim hand-armed cron):`);
    for (const loop of toArm) {
      lines.push(`     CronCreate({ cron: ${JSON.stringify(loop.cron)}, prompt: ${JSON.stringify(loop.prompt)}, recurring: true })`);
    }
  }
  return lines.join('\n');
}

// SD-LEO-INFRA-SINGLETON-STALE-TREE-STALENESS-GAUGE-001 (framework-seed candidate for
// SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001, still code-free — shipped standalone per the
// scripts/gauge-unranked-claimable-leaves.mjs precedent): Adam's own contract + tick script,
// so drift there surfaces as STALE-CRITICAL, not just a generic behind-count.
export const ADAM_CRITICAL_PATHS = Object.freeze([...CRITICAL_PROTOCOL_FILES, ROLE_CONTEXT_DOC, 'scripts/adam-quiet-tick.mjs']);

/** Advisory checkout-freshness badge (fail-open — never throws, never blocks startup). */
export function renderFreshness(repoRoot = REPO_ROOT) {
  try {
    return '═══ CHECKOUT FRESHNESS ═══\n  ' + freshnessBadge(checkoutFreshness(repoRoot, { role: 'adam', criticalPaths: ADAM_CRITICAL_PATHS }));
  } catch (err) {
    return '═══ CHECKOUT FRESHNESS ═══\n  ✅ freshness check skipped (fail-open): ' + (err?.message || String(err));
  }
}

/**
 * SD-LEO-INFRA-ADAM-MACHINERY-CONSUMER-001 (FR2): RUNTIME contract↔tooling parity verdict.
 * Reads CLAUDE_ADAM.md and FAILS LOUD (a warning line at every /adam startup) when a durable
 * contract duty is missing from ADAM_LOOPS — so future drift surfaces to the operator, not only
 * to CI. Fail-open: a read/parse hiccup never throws or blocks startup.
 */
export function renderContractParity(repoRoot = REPO_ROOT) {
  const head = '═══ CONTRACT↔TOOLING PARITY ═══\n  ';
  try {
    const md = readFileSync(resolve(repoRoot, ROLE_CONTEXT_DOC), 'utf8');
    const missing = missingDurableDuties(md, ADAM_LOOPS);
    if (missing.length === 0) {
      return head + '✅ all durable CLAUDE_ADAM.md duties present in ADAM_LOOPS';
    }
    return head + `⚠️ CONTRACT DRIFT: durable duty(ies) declared in ${ROLE_CONTEXT_DOC} but absent from ADAM_LOOPS: ${missing.join(', ')} — they will DIE every session until armed. Add them to ADAM_LOOPS (scripts/adam-startup-check.mjs).`;
  } catch (err) {
    return head + '✅ parity check skipped (fail-open): ' + (err?.message || String(err));
  }
}

export function buildReport(argv = [], env = {}, repoRoot = REPO_ROOT) {
  const armed = parseArmedSet(argv, env);
  return [renderResponsibilities(repoRoot), '', renderLoops(armed), '', renderContractParity(repoRoot), '', renderFreshness(repoRoot)].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// SD-LEO-INFRA-ADAM-SOURCE-FROM-SSOT-CONTRACT-001 (FR-2): the SOURCING SSOT STATE PROBE.
// A read-only badge printed every /adam startup so a fresh Adam can NEVER miss that the
// Roadmap-SSOT + the (often dormant) sourcing engine exist before reaching for hand-mining.
// All helpers are PURE + the DB read is fail-open (a hiccup degrades to a skip line, never
// throws / blocks startup — same doctrine as the rest of this file).
// ─────────────────────────────────────────────────────────────────────────────

// The sourcing-engine activation flags, in escalation order (umbrella first, then per-engine,
// then the autosource switch). Each is an env feature flag, OFF unless explicitly on|1|true.
export const SOURCING_FLAGS = [
  'SOURCING_ENGINE_V1',
  'SOURCING_ROADMAP_ENGINE_V1',
  'SOURCING_GAUGE_GAP_MINER_V1',
  'SOURCING_DEFERRED_WATCHER_V1',
  'SOURCING_PROACTIVE_POPULATOR_V1',
  'LEO_ROADMAP_AUTOSOURCE',
];

/** Pure flag parse mirroring the sourcing-engine helpers: on|1|true => true; everything else => false. */
export function isSourcingFlagOn(env, name) {
  const v = String((env && env[name]) || 'off').toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}

/** Pure: read every SOURCING_FLAGS entry from env => [{ flag, on }]. */
export function readSourcingFlags(env = {}) {
  return SOURCING_FLAGS.map((flag) => ({ flag, on: isSourcingFlagOn(env, flag) }));
}

/**
 * Pure: aggregate UNPROMOTED roadmap_wave_items (promoted_to_sd_key == null) by wave.
 * @param {Array<{wave_id:string, promoted_to_sd_key:?string}>} items
 * @param {Array<{id:string, title:string, sequence_rank:number}>} waves
 * @returns {{ totalUnpromoted:number, byWave:Array<{wave_id:string,title:string,rank:number,count:number}> }}
 */
export function summarizeUnpromotedByWave(items = [], waves = []) {
  const titleById = new Map((waves || []).map((w) => [w.id, w]));
  const counts = new Map();
  let totalUnpromoted = 0;
  for (const it of items || []) {
    if (it && (it.promoted_to_sd_key === null || it.promoted_to_sd_key === undefined)) {
      totalUnpromoted += 1;
      counts.set(it.wave_id, (counts.get(it.wave_id) || 0) + 1);
    }
  }
  const byWave = [...counts.entries()].map(([wave_id, count]) => {
    const w = titleById.get(wave_id);
    return { wave_id, title: (w && w.title) || '(unknown wave)', rank: w ? w.sequence_rank : 9999, count };
  }).sort((a, b) => a.rank - b.rank);
  return { totalUnpromoted, byWave };
}

/** Pure: disposition coverage of sd_backlog_map. */
export function summarizeBacklogDisposition(total = 0, dispositioned = 0) {
  const t = Number(total) || 0;
  const d = Number(dispositioned) || 0;
  const pct = t === 0 ? 0 : Math.round((100 * d) / t);
  return { total: t, dispositioned: d, pct };
}

/** Pure: render the state-probe section from already-resolved data (no I/O). */
export function renderSourcingStateLines({ flags = [], wave = null, backlog = null } = {}) {
  const lines = ['═══ SOURCING SSOT STATE (read-only — route the SSOT before hand-mining) ═══'];
  // Flags
  const anyOn = flags.some((f) => f.on);
  lines.push('  Sourcing-engine flags: ' + (anyOn ? '' : '⚠️ ALL OFF — engine dormant; PROPOSE activation, do not substitute yourself tick-after-tick'));
  for (const f of flags) lines.push(`    ${f.on ? '🟢 on ' : '⚪ off'}  ${f.flag}`);
  // Roadmap-SSOT unpromoted items
  if (wave) {
    lines.push(`  Roadmap-SSOT (roadmap_wave_items) unpromoted: ${wave.totalUnpromoted} — promote via leo-create-sd --from-roadmap-item (REGISTER-FIRST)`);
    for (const w of wave.byWave.slice(0, 8)) lines.push(`    wave#${w.rank} ${String(w.count).padStart(4)} unpromoted  ${w.title}`);
    if (wave.byWave.length > 8) lines.push(`    … ${wave.byWave.length - 8} more wave(s)`);
  } else {
    lines.push('  Roadmap-SSOT: (unavailable — DB read skipped, fail-open)');
  }
  // Backlog disposition
  if (backlog) {
    lines.push(`  sd_backlog_map disposition: ${backlog.dispositioned}/${backlog.total} (${backlog.pct}%) — if rung-waves are empty, Wave-0 distillation precedes routing`);
  } else {
    lines.push('  sd_backlog_map disposition: (unavailable — DB read skipped, fail-open)');
  }
  lines.push('  ↳ Hand-mining the VDR gauge is LAST-RESORT (a SMELL the engine is off / backlog undistilled). See CLAUDE_ADAM.md "SOURCING SSOT — order of operations".');
  return lines.join('\n');
}

/**
 * Fail-open async DB read for the state probe. Returns { wave, backlog } (either may be null on
 * error). Accepts an injected supabase client for tests; otherwise builds one from env creds.
 */
export async function fetchSourcingState({ supabase = null, env = process.env } = {}) {
  let client = supabase;
  if (!client) {
    const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { wave: null, backlog: null };
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(url, key);
  }
  let wave = null;
  let backlog = null;
  try {
    const items = await client.from('roadmap_wave_items').select('wave_id,promoted_to_sd_key').is('promoted_to_sd_key', null);
    const waves = await client.from('roadmap_waves').select('id,title,sequence_rank');
    if (!items.error && !waves.error) wave = summarizeUnpromotedByWave(items.data || [], waves.data || []);
  } catch { wave = null; }
  try {
    const tot = await client.from('sd_backlog_map').select('*', { count: 'exact', head: true });
    const disp = await client.from('sd_backlog_map').select('*', { count: 'exact', head: true }).not('disposition', 'is', null);
    if (!tot.error && !disp.error) backlog = summarizeBacklogDisposition(tot.count, disp.count);
  } catch { backlog = null; }
  return { wave, backlog };
}

/** Compose the full state-probe section (async, fail-open — never throws). */
export async function renderSourcingState({ supabase = null, env = process.env } = {}) {
  try {
    const flags = readSourcingFlags(env);
    const { wave, backlog } = await fetchSourcingState({ supabase, env });
    return renderSourcingStateLines({ flags, wave, backlog });
  } catch (err) {
    return '═══ SOURCING SSOT STATE ═══\n  ✅ state probe skipped (fail-open): ' + (err?.message || String(err));
  }
}

// ── Main (fail-open: always exit 0) ──
/**
 * SD-LEO-INFRA-UPSCALE-ADAM-PROJECT-MANAGEMENT-DISCIPLINE-001-A (Child A / FR-4): rehydrate the
 * durable Adam task board (adam_task_ledger) on a cold /adam start (and post-compaction), BEFORE
 * Adam works its threads, so the session reconstructs its open items from the live sources. FAIL-SOFT
 * -- a rehydrate error (or missing DB creds / not-yet-applied migration) never blocks startup; it
 * degrades to a skip line. Surfaces a one-line 'board: N open threads (M parents)' summary.
 * Accepts an injected supabase client for tests; otherwise builds one from env creds.
 */
export async function renderBoardRehydrate({ supabase = null, env = process.env } = {}) {
  const head = '═══ ADAM TASK BOARD (rehydrate) ═══\n  ';
  try {
    let client = supabase;
    if (!client) {
      const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
      const key = env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return head + 'rehydrate skipped (no DB creds, fail-open)';
      const { createClient } = await import('@supabase/supabase-js');
      client = createClient(url, key);
    }
    const { rehydrateBoard } = await import('../lib/adam/task-rehydrate.js');
    const summary = await rehydrateBoard(client);
    const note = summary.errors && summary.errors.length ? ` (${summary.errors.length} source issue(s), fail-soft)` : '';
    return head + `board: ${summary.threads} open threads (${summary.parents} parents)${note}`;
  } catch (err) {
    return head + 'rehydrate skipped (fail-open): ' + (err?.message || String(err));
  }
}

// SD-LEO-INFRA-TOKEN-BURN-AUTOPILOT-001: the Adam role tag source for role-aware compaction
// thresholds (.claude/compaction-thresholds.cjs detectRoleFromFile). Peer of the coordinator's
// .claude/active-coordinator.json. Fail-open: a write error never blocks startup.
export function writeAdamMarker(env = process.env, repoRoot = REPO_ROOT) {
  try {
    if (!env.CLAUDE_SESSION_ID) return false;
    writeFileSync(resolve(repoRoot, '.claude', 'active-adam.json'),
      JSON.stringify({ session_id: env.CLAUDE_SESSION_ID, updated_at: new Date().toISOString() }, null, 2));
    return true;
  } catch { return false; }
}

async function main() {
  try {
    console.log('[ADAM-STARTUP] ' + (process.env.CLAUDE_SESSION_ID ? 'session=' + process.env.CLAUDE_SESSION_ID : 'session=unknown'));
    if (writeAdamMarker()) console.log('[ADAM-STARTUP] role marker written: .claude/active-adam.json');
    console.log(buildReport(process.argv.slice(2), process.env));
    // FR-2: the read-only Sourcing SSOT state probe (DB-backed, fail-open).
    console.log('');
    console.log(await renderSourcingState({ env: process.env }));
    // FR-4: rehydrate the durable Adam task board (fail-soft -- never blocks startup).
    console.log('');
    console.log(await renderBoardRehydrate({ env: process.env }));
  } catch (err) {
    console.warn('⚠️  adam-startup-check hiccup (non-blocking, fail-open): ' + (err && err.message ? err.message : String(err)));
  }
  process.exit(0);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
