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
    label: 'Solomon self-adherence audit (role-contract probes -> propose-only remediation)',
    script: 'solomon-self-adherence-review.mjs',
    cron: '0 */12 * * *',
    prompt: 'node scripts/solomon-self-adherence-review.mjs',
  },
  {
    key: 'deep-sweep',
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

// Parse the contract's DURABLE recurring-duty markers from CLAUDE_SOLOMON.md. A durable duty is
// bolded as `**<NAME> DUTY (durable)**`; the captured NAME is slugged (lowercase, spaces→hyphens)
// so it can be matched against a SOLOMON_LOOPS key. Forgiving regex (a false negative = an
// unenforced duty, the exact failure this guards). Pure; no I/O. Mirrors adam-startup-check.
export function parseDurableDutyMarkers(markdown) {
  const slugs = new Set();
  const re = /\*\*\s*([A-Za-z0-9][A-Za-z0-9 -]*?)\s+DUTY\s*\(\s*durable\s*\)\s*\*\*/gi;
  let m;
  while ((m = re.exec(String(markdown || ''))) !== null) {
    slugs.add(m[1].trim().toLowerCase().replace(/\s+/g, '-'));
  }
  return [...slugs];
}

// Which contract-named durable duties are MISSING from SOLOMON_LOOPS. [] === parity holds.
export function missingDurableDuties(markdown, loops = SOLOMON_LOOPS) {
  const keys = new Set(loops.map((l) => l.key));
  return parseDurableDutyMarkers(markdown).filter((slug) => !keys.has(slug));
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
