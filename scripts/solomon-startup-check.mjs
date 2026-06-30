#!/usr/bin/env node
// solomon-startup-check — emit Solomon's recurring-tick CronCreate specs at /solomon startup.
//
// SD: SD-LEO-INFRA-SOLOMON-CONSULT-001E-C (Phase E3, grandchild of SOLOMON-CONSULT-001E)
//
// Mirrors scripts/adam-startup-check.mjs (the emit-spec pattern: CronCreate/CronList are HARNESS
// tools, not Node-callable, so this only EMITS the specs the /solomon agent arms idempotently vs
// CronList). The /solomon command reads CLAUDE_SOLOMON.md and arms SOLOMON_LOOPS here.
//
// Usage:
//   node scripts/solomon-startup-check.mjs
//   node scripts/solomon-startup-check.mjs --armed "inbox-monitor,self-adherence,deep-sweep"
//   (or SOLOMON_ARMED_CRONS env, comma-separated loop KEYS) → armed|MISSING verdict.
//
// Fail-open: always exits 0; a hiccup never blocks /solomon startup.

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// The Solomon role contract (durable). Loaded on /solomon startup; referenced here for the summary.
export const ROLE_CONTEXT_DOC = 'CLAUDE_SOLOMON.md';

export const RESPONSIBILITIES = [
  'Deep-reasoning ORACLE — answer solomon_consult requests with high-effort analysis (propose, never execute).',
  'Drain the consult inbox; emit answers as oracle advisories (kind=adam_advisory + oracle:true), echoing the consult correlation.',
  'Self-LIMIT: a HARD per-sweep task_budget (count/wall-clock/token) at sweep ENTRY before any Read/Grep; per-SD + per-day quota; dedup (never re-answer the same consult).',
  'Recurring SELF-adherence audit: probe own role-contract duties, ledger findings, propose-only remediation on drift (never build).',
  'Max-plan pin: run on the Opus-4.8 model pin, on the Max plan (not API billing) — verify via /status before any sweep.',
  // SD-LEO-INFRA-SOLOMON-HOURLY-ROLE-REFRESHER-001: the coordinator dispatches an hourly coordinator_reminder
  // (topic=solomon_responsibilities) into Solomon's inbox (cycle-down-gated). It is COORDINATOR-DRIVEN (mirrors
  // the Adam hourly reminder) — NOT a Solomon-armed cron — so re-read your role contract when one arrives.
  'Hourly refresher: the coordinator sends an hourly coordinator_reminder (solomon_responsibilities) when the fleet is active — re-read your role contract on receipt.',
];

// Solomon's recurring tick. Each loop is one CronCreate spec the /solomon agent arms idempotently.
//   - inbox-monitor: drain solomon_consult + coordinator-directed kinds (the consult lane).
//   - self-adherence: probe own role-contract duties → propose-only remediation.
//   - deep-sweep: the Mode-B deep-reasoning sweep tick (agent-judgment; budget-gated at entry).
export const SOLOMON_LOOPS = [
  {
    key: 'inbox-monitor',
    label: 'Solomon inbox — drain solomon_consult + coordinator-directed kinds (full-lane reader)',
    script: 'solomon-advisory.cjs',
    cron: '*/15 * * * *',
    prompt: 'node scripts/solomon-advisory.cjs inbox --quiet',
  },
  {
    key: 'self-adherence',
    // SD-LEO-INFRA-SOLOMON-STARTUP-PARITY-RECALIBRATE-001: the contract marker is "SOLOMON SELF-ADHERENCE
    // DUTY (durable)" -> slug 'solomon-self-adherence'; alias it to this loop key so parity reconciles
    // (the 1 prior cry-wolf false positive — the loop IS armed).
    aliases: ['solomon-self-adherence'],
    label: 'Solomon self-adherence audit (role-contract probes -> propose-only remediation)',
    script: 'solomon-self-adherence-review.mjs',
    cron: '0 */12 * * *',
    prompt: 'node scripts/solomon-self-adherence-review.mjs',
  },
  {
    key: 'deep-sweep',
    // SD-LEO-INFRA-SOLOMON-STARTUP-PARITY-RECALIBRATE-001: the single deep-sweep tick SUBSUMES the Mode-B
    // deep-reasoning duties by contract design (§3/§4) rather than materializing each as its own cron.
    // It DECLARES them here via covers[] so the contract↔tooling parity check counts them as wired (the
    // prior ~7 blind/cry-wolf duties). Adding a duty to the contract requires adding its slug here.
    covers: [
      'harness-improvement-depth-sweep',
      'self-improvement-of-the-self-improvement-loop',
      'coordination-loop-observation',
      'adam-grounding-completeness-oversight',
      'adam-autonomy-oversight-reporting',
      'retro-learn-integration',
      'reinforcement-learning-signal',
      'deep-architecture-review',
      'deep-thinking-target-scan',
      'taste-judgement',
      'flaky-test-deep-rca',
      'dedup-unification-sweep',
      'autonomy-support',
      'reality-simulation',
      'model-effort-evaluation',
      'higher-order-effort-distribution-tier-design',
    ],
    label: 'Solomon Mode-B deep-reasoning sweep (agent judgment; HARD task_budget at entry, before any Read/Grep)',
    script: null, // agent-prompt tick — the deep sweep is reasoning, not a script
    cron: '0 */6 * * *',
    prompt: 'Solomon deep-sweep tick: FIRST enforce the per-sweep task_budget at ENTRY (node -e require("./scripts/solomon-advisory.cjs").enforceSweepBudget — count/wall-clock/token) BEFORE any Read/Grep; if over budget, STOP. Else drain the consult inbox and answer the highest-value open solomon_consult with deep analysis via node scripts/solomon-advisory.cjs send "<answer>" --reply-to <consult-correlation> (dedup + quota enforced). Propose, never execute.',
  },
];

// Parse the armed-cron keys the agent passes from its CronList output. --armed "a,b" arg, then env.
export function parseArmedSet(argv = [], env = {}) {
  let raw = '';
  const idx = argv.indexOf('--armed');
  if (idx !== -1 && argv[idx + 1]) raw = argv[idx + 1];
  else {
    const eq = argv.find((a) => a.startsWith('--armed='));
    if (eq) raw = eq.slice('--armed='.length);
    else if (env.SOLOMON_ARMED_CRONS) raw = env.SOLOMON_ARMED_CRONS;
  }
  const provided = raw.trim().length > 0;
  const set = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  return { provided, set };
}

// Slug a duty NAME deterministically: lowercase, collapse every run of non-alphanumerics (spaces,
// '&', '/', '(', ')', backticks, punctuation) to a single hyphen, trim leading/trailing hyphens. So
// "ADAM AUTONOMY OVERSIGHT & REPORTING" -> "adam-autonomy-oversight-reporting" and
// "HARNESS-IMPROVEMENT (DEPTH) SWEEP" -> "harness-improvement-depth-sweep". Pure.
export function slugifyDuty(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Parse the contract's DURABLE recurring-duty markers from CLAUDE_SOLOMON.md. A durable duty is bolded
// as `**<NAME> DUTY (durable[; <qualifier>])**`. SD-LEO-INFRA-SOLOMON-STARTUP-PARITY-RECALIBRATE-001:
// the regex is BROADENED so a false-negative (an unenforced duty silently dropped — the exact failure
// this guards) cannot happen on a real contract marker:
//   - the NAME accepts ANY non-`*` chars (so '(DEPTH)', '&', '/', '`/learn`' qualifiers are captured),
//     lazily up to ' DUTY (durable';
//   - the qualifier accepts `(durable; ...)` / `(durable, ...)` / `(durable)` (content after 'durable').
// The captured NAME is slugified via slugifyDuty. Pure; no I/O.
export function parseDurableDutyMarkers(markdown) {
  const slugs = new Set();
  const re = /\*\*\s*([^*]+?)\s+DUTY\s*\(\s*durable\b[^)]*\)\s*\*\*/gi;
  let m;
  while ((m = re.exec(String(markdown || ''))) !== null) {
    const slug = slugifyDuty(m[1]);
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

// SD-LEO-INFRA-SOLOMON-STARTUP-PARITY-RECALIBRATE-001: the set of duty slugs a loop registry WIRES.
// A duty is "wired" if it is a loop KEY, an alias of a loop (loop.aliases — e.g. the contract slug
// 'solomon-self-adherence' aliases loop key 'self-adherence'), OR a declared COVER of a loop
// (loop.covers — the Mode-B duties the single deep-sweep tick subsumes by contract design §3/§4, rather
// than materializing each as its own cron). Pure.
export function wiredDutySlugs(loops = SOLOMON_LOOPS) {
  const wired = new Set();
  for (const l of loops) {
    if (l.key) wired.add(slugifyDuty(l.key));
    for (const a of (Array.isArray(l.aliases) ? l.aliases : [])) wired.add(slugifyDuty(a));
    for (const c of (Array.isArray(l.covers) ? l.covers : [])) wired.add(slugifyDuty(c));
  }
  return wired;
}

// Which contract-named durable duties are MISSING from the loop registry. [] === parity holds.
// Parity is now loopKeys ∪ aliases ∪ covers >= durable-markers (a duty is wired if it is a key OR an
// alias OR a declared cover of a loop) — so the single deep-sweep tick that subsumes the Mode-B duties
// no longer reads as ~7 unwired duties (cry-wolf), and the 'solomon-self-adherence' marker reconciles
// with loop key 'self-adherence' via the alias (the 1 prior false positive).
export function missingDurableDuties(markdown, loops = SOLOMON_LOOPS) {
  const wired = wiredDutySlugs(loops);
  return parseDurableDutyMarkers(markdown).filter((slug) => !wired.has(slug));
}

// A loop is "armed" when an armed-set was provided AND it contains the loop's KEY, full prompt, or
// (for script-backed loops) its script basename.
export function loopStatus(loop, armed) {
  if (!armed.provided) return 'unverified';
  if (armed.set.has(loop.key)) return 'armed';
  if (armed.set.has(loop.prompt)) return 'armed';
  if (loop.script && armed.set.has(loop.script)) return 'armed';
  return 'MISSING';
}

export function renderResponsibilities(repoRoot = REPO_ROOT) {
  const lines = ['═══ SOLOMON ROLE — recurring-tick responsibilities (deep-reasoning oracle; propose, never execute) ═══'];
  RESPONSIBILITIES.forEach((r, i) => lines.push(`  ${i + 1}. ${r}`));
  let docOk = false;
  try { docOk = readFileSync(resolve(repoRoot, ROLE_CONTEXT_DOC), 'utf8').length > 0; } catch { docOk = false; }
  lines.push(docOk ? `  (durable role contract: ${ROLE_CONTEXT_DOC})`
                   : `  ⚠️  role contract not found at ${ROLE_CONTEXT_DOC} — summary above is the fallback (fail-open; ships before Phase E-B seeds the section).`);
  return lines.join('\n');
}

export function renderLoops(armed) {
  const lines = [`═══ SOLOMON RECURRING TICK (${SOLOMON_LOOPS.length} loops) — arm all idempotently ═══`];
  if (!armed.provided) {
    lines.push('  (no --armed set supplied — run CronList and re-invoke with --armed "<loop-key>,…" for an armed|MISSING verdict; emitting full spec below)');
  }
  const toArm = [];
  for (const loop of SOLOMON_LOOPS) {
    const status = loopStatus(loop, armed);
    const badge = status === 'armed' ? '✅ armed' : status === 'MISSING' ? '❌ MISSING' : '… unverified';
    lines.push(`  [${badge}] ${loop.key.padEnd(16)} ${loop.label}`);
    lines.push(`              cron: ${loop.cron}`);
    if (status !== 'armed') toArm.push(loop);
  }
  lines.push('');
  if (toArm.length === 0 && armed.provided) {
    lines.push(`  ✅ All ${SOLOMON_LOOPS.length} Solomon tick loops armed. Nothing to arm.`);
  } else {
    lines.push(`  → Arm the ${armed.provided ? toArm.length + ' missing' : 'not-yet-armed'} loop(s) via CronCreate (idempotent — skip any already in CronList):`);
    for (const loop of toArm) {
      lines.push(`     CronCreate({ cron: ${JSON.stringify(loop.cron)}, prompt: ${JSON.stringify(loop.prompt)}, recurring: true })`);
    }
  }
  return lines.join('\n');
}

/**
 * RUNTIME contract↔tooling parity verdict. Reads CLAUDE_SOLOMON.md and FAILS LOUD (a warning line at
 * every /solomon startup) when a durable contract duty is missing from SOLOMON_LOOPS — so future drift
 * surfaces to the operator. Fail-open: a read/parse hiccup never throws or blocks startup (and the
 * contract doc may not exist until Phase E-B seeds it — that is a skip, not a failure).
 */
export function renderContractParity(repoRoot = REPO_ROOT) {
  const head = '═══ CONTRACT↔TOOLING PARITY ═══\n  ';
  try {
    const md = readFileSync(resolve(repoRoot, ROLE_CONTEXT_DOC), 'utf8');
    const missing = missingDurableDuties(md, SOLOMON_LOOPS);
    if (missing.length === 0) {
      return head + '✅ all durable CLAUDE_SOLOMON.md duties present in SOLOMON_LOOPS';
    }
    return head + `⚠️ CONTRACT DRIFT: durable duty(ies) declared in ${ROLE_CONTEXT_DOC} but absent from SOLOMON_LOOPS: ${missing.join(', ')} — they will DIE every session until armed. Add them to SOLOMON_LOOPS (scripts/solomon-startup-check.mjs).`;
  } catch (err) {
    return head + '✅ parity check skipped (fail-open): ' + (err?.message || String(err));
  }
}

export function buildReport(argv = [], env = {}, repoRoot = REPO_ROOT) {
  const armed = parseArmedSet(argv, env);
  return [renderResponsibilities(repoRoot), '', renderLoops(armed), '', renderContractParity(repoRoot)].join('\n');
}

// Fail-open entry: always exit 0; a hiccup never blocks /solomon startup.
function main() {
  try { console.log(buildReport(process.argv.slice(2), process.env)); } catch (err) { console.log('solomon-startup-check fail-open:', err?.message || String(err)); }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('solomon-startup-check.mjs')) {
  main();
}
