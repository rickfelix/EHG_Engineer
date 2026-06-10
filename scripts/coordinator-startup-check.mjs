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

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ── Durable role context source (FR-1). This doc is the memory-independent source of truth. ──
export const ROLE_CONTEXT_DOC = 'docs/protocol/fleet-coordinator-and-worker-behavior.md';

// Concise, always-rendered responsibilities summary (surfaced even if the source doc is unreadable).
export const RESPONSIBILITIES = [
  'MANAGER, not IC — delegate mechanical/parallelizable work (SD creation, audits, investigations, cleanups) to sub-agents or the fleet queue; reserve your cycles for judgment (prioritization, sensitive RCA, the execute step of destructive actions). Verify sub-agent output.',
  'KEEP WORKERS BUSY is the KPI — continuously source claimable work; idle workers + available work is a problem to solve. The coordinator is EITHER delegating/sourcing OR torn down, never idling in between.',
  'RECURRING 3-SOURCE AUDIT — check SD queue, harness backlog (feedback category=harness_backlog), and inbox; source backlog into DRAFT SDs only when the queue would starve idle workers.',
  'BACKGROUND MONITORING during operator conversations — run the cron ticks but surface only important events (stuck worker, empty-queue+idle, claim/worktree conflict, a worker question, a completion).',
  'EXECUTIVE EMAIL is default-on — the operator is usually away; the email is the single gauge (active workers vs min(workable SDs, target)) + question escalation.',
  'TEARDOWN DISCIPLINE — when no claimable AND no sourceable work AND zero workers (sustained): CronDelete ALL loops first, then clear the coordinator pointer + final email. Do not idle loops past a finished campaign.',
  'You CANNOT start a worker\'s execution — only /loop or a human paste in the worker window can. To restore a thinned fleet, hand the operator the wake-up prompt.',
];

// ── Canonical standard cron loops (FR-2). The three original intervals match coordinator.md Step 4.
// SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (FR-5) added the daily flag-governance review loop.
// SD-LEO-INFRA-ARM-CANONICALIZE-WORK-001 added the work-triggered tri-party self-review loop so a
// coordinator restart re-arms it instead of leaving it dormant (its state file had silently frozen). ──
export const STANDARD_LOOPS = [
  { key: 'sweep',       label: 'Stale-session sweep',  script: 'stale-session-sweep.cjs',   cron: '*/5 * * * *',
    prompt: 'node scripts/stale-session-sweep.cjs' },
  { key: 'dashboard',   label: 'Fleet dashboard',      script: 'fleet-dashboard.cjs',       cron: '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
    prompt: 'node scripts/fleet-dashboard.cjs all' },
  { key: 'identity',    label: 'Fleet identity refresh', script: 'assign-fleet-identities.cjs', cron: '4,9,14,19,24,29,34,39,44,49,54,59 * * * *',
    prompt: 'node scripts/assign-fleet-identities.cjs' },
  { key: 'inbox',       label: 'Coordinator inbox',    script: 'fleet-dashboard.cjs',       cron: '*/2 * * * *',
    prompt: 'node scripts/fleet-dashboard.cjs inbox' },
  { key: 'audit',       label: 'Coordinator 3-source audit', script: 'coordinator-audit.mjs', cron: '*/15 * * * *',
    prompt: 'node scripts/coordinator-audit.mjs' },
  { key: 'email',       label: 'Executive email summary (default-on)', script: 'coordinator-email-summary.mjs', cron: '*/30 * * * *',
    prompt: 'node scripts/coordinator-email-summary.mjs' },
  // SD-LEO-INFRA-ACTIVATE-FEATURE-FLAG-001 (FR-5): daily feature-flag governance review.
  // Gated default-OFF behind leo_feature_flags FLAG_GOVERNANCE_REVIEW_V1 → cheap no-op until enabled.
  { key: 'flag-review', label: 'Feature-flag governance review', script: 'flag-governance-review.mjs', cron: '0 9 * * *',
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
  for (const loop of STANDARD_LOOPS) {
    const status = loopStatus(loop, armed);
    const badge = status === 'armed' ? '✅ armed' : status === 'MISSING' ? '❌ MISSING' : '… unverified';
    lines.push(`  [${badge}] ${loop.key.padEnd(10)} ${loop.label}`);
    lines.push(`              cron: ${loop.cron}   prompt: ${loop.prompt}`);
    if (status !== 'armed') toArm.push(loop);
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

export function buildReport(argv = [], env = {}, repoRoot = REPO_ROOT) {
  const armed = parseArmedSet(argv, env);
  return [renderResponsibilities(repoRoot), '', renderAdamLane(), '', renderLoops(armed)].join('\n');
}

// ── Main (fail-open: always exit 0) ──
function main() {
  try {
    console.log('[COORD-STARTUP] ' + (process.env.CLAUDE_SESSION_ID ? 'session=' + process.env.CLAUDE_SESSION_ID : 'session=unknown'));
    console.log(buildReport(process.argv.slice(2), process.env));
  } catch (err) {
    console.warn('⚠️  coordinator-startup-check hiccup (non-blocking, fail-open): ' + (err && err.message ? err.message : String(err)));
  }
  process.exit(0);
}

// Only run main when invoked directly (not when imported by tests).
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
