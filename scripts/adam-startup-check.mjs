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
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// SD-LEO-INFRA-FLEET-FRESHNESS-GUARD-001: advisory, fail-open checkout-freshness badge.
import { checkoutFreshness, freshnessBadge } from '../lib/governance/checkout-freshness.js';

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
];

// Adam's recurring tick. Each loop is one CronCreate spec the /adam agent arms idempotently.
//   - governance-scan: the flag-gated read-only opportunity-scan (the heartbeat body).
//   - inbox-monitor:   drain coordinator replies that arrived after a sync await timed out.
//   - offer-help:      an agent-judgment tick (no script) — propose-only, silence-by-default.
export const ADAM_LOOPS = [
  {
    key: 'governance-scan',
    label: 'Daily governance opportunity-scan (gated on ADAM_GOVERNANCE_HEARTBEAT_V1)',
    script: 'adam-opportunity-scan.cjs',
    cron: '0 13 * * *',
    prompt: 'node scripts/adam-opportunity-scan.cjs --scan --scope auto',
  },
  {
    key: 'inbox-monitor',
    label: 'Adam inbox — drain coordinator replies (durable reader)',
    script: 'adam-advisory.cjs',
    cron: '*/15 * * * *',
    prompt: 'node scripts/adam-advisory.cjs replies',
  },
  {
    key: 'offer-help',
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
  for (const loop of ADAM_LOOPS) {
    const status = loopStatus(loop, armed);
    const badge = status === 'armed' ? '✅ armed' : status === 'MISSING' ? '❌ MISSING' : '… unverified';
    lines.push(`  [${badge}] ${loop.key.padEnd(16)} ${loop.label}`);
    lines.push(`              cron: ${loop.cron}`);
    if (status !== 'armed') toArm.push(loop);
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

/** Advisory checkout-freshness badge (fail-open — never throws, never blocks startup). */
export function renderFreshness(repoRoot = REPO_ROOT) {
  try {
    return '═══ CHECKOUT FRESHNESS ═══\n  ' + freshnessBadge(checkoutFreshness(repoRoot, { role: 'adam' }));
  } catch (err) {
    return '═══ CHECKOUT FRESHNESS ═══\n  ✅ freshness check skipped (fail-open): ' + (err?.message || String(err));
  }
}

export function buildReport(argv = [], env = {}, repoRoot = REPO_ROOT) {
  const armed = parseArmedSet(argv, env);
  return [renderResponsibilities(repoRoot), '', renderLoops(armed), '', renderFreshness(repoRoot)].join('\n');
}

// ── Main (fail-open: always exit 0) ──
function main() {
  try {
    console.log('[ADAM-STARTUP] ' + (process.env.CLAUDE_SESSION_ID ? 'session=' + process.env.CLAUDE_SESSION_ID : 'session=unknown'));
    console.log(buildReport(process.argv.slice(2), process.env));
  } catch (err) {
    console.warn('⚠️  adam-startup-check hiccup (non-blocking, fail-open): ' + (err && err.message ? err.message : String(err)));
  }
  process.exit(0);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
