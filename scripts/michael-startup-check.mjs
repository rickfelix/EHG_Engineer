#!/usr/bin/env node
// michael-startup-check — emit Michael's recurring-tick CronCreate spec at /michael startup.
//
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A (FR-5), in the shape of scripts/solomon-startup-check.mjs
// (the emit-spec pattern: CronCreate/CronList are HARNESS tools, not Node-callable, so this only EMITS
// the spec the /michael agent arms idempotently vs CronList). The pure parity helpers are IMPORTED from
// the Solomon module rather than copied, so the two roles can never drift on what a durable marker is.
//
// Divergences from the Solomon precedent, each named in the PRD (DESIGN evidence 8601cbdd):
//   - MICHAEL_LOOPS has exactly ONE loop (quiet-tick); every renderer is singular-aware.
//   - covers[] carries the three PINNED durable-duty slugs; parity is an equality, not a count.
//   - renderContractParity prints an explicit line when there are no category claims to check
//     (the Solomon renderer goes silent at checked===0, which reads as green).
//   - MICHAEL_CRITICAL_PATHS includes the tick script and the BINDING posture companion.
//   - writes .claude/active-michael.json (copy of writeAdamMarker) after validating the session id.
//
// Usage:
//   node scripts/michael-startup-check.mjs
//   node scripts/michael-startup-check.mjs --armed "quiet-tick"
//   (or MICHAEL_ARMED_CRONS env, comma-separated loop KEYS) → armed|MISSING verdict.
//
// Fail-open: always exits 0; a hiccup never blocks /michael startup.

import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getClaudeModel } from '../lib/config/model-config.js';
import { checkoutFreshness, freshnessBadge, CRITICAL_PROTOCOL_FILES } from '../lib/governance/checkout-freshness.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import {
  slugifyDuty,
  parseDurableDutyMarkers,
  wiredDutySlugs,
  missingDurableDuties,
  categoryParityMismatches,
  loopStatus,
} from './solomon-startup-check.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// The Michael role contract (durable). Loaded on /michael startup; referenced here for the summary.
export const ROLE_CONTEXT_DOC = 'CLAUDE_MICHAEL.md';
export const POSTURE_DOC = 'CLAUDE_MICHAEL_MODEL_POSTURE.md';
export const TICK_SCRIPT = 'scripts/michael-quiet-tick.mjs';

// The three PINNED durable-duty slugs (CLAUDE_MICHAEL.md §3). The contract's marker literals are
// **GMAIL TAMING DUTY (durable)**, **TODOIST DRIVE DUTY (durable)**, **DISTRACTION MANAGEMENT DUTY
// (durable)**; slugifyDuty maps them to exactly these. Renaming a marker without renaming its cover
// here is contract drift and renderContractParity fails loud at every startup.
export const PINNED_DUTY_SLUGS = Object.freeze(['gmail-taming', 'todoist-drive', 'distraction-management']);

// The quiet-tick's action-line vocabulary (spec §1.4). Listed here as string literals so the
// emitter/consumer parity lint (scripts/lint/quiet-tick-token-parity-lint.mjs) sees this file as the
// consumer of every token scripts/michael-quiet-tick.mjs emits.
export const MICHAEL_TICK_TOKENS = Object.freeze([
  'QUIET_TICK_CLASSIFY_QUEUE',   // unmatched Gmail threads queued by the feeder, past 04:30 ET
  'QUIET_TICK_GRADE_QUEUE',      // Todoist items awaiting effort grades
  'QUIET_TICK_BRIEF_FINALIZE',   // a brief-of-record awaiting the seat's lede
  'QUIET_TICK_BRIEF_MISSING',    // no verified brief after 05:45 ET
  'QUIET_TICK_FEEDER_FAILED',    // a michael_feeder_runs row today with status failed
  'QUIET_TICK_INBOX_DIRECTIVE',  // a michael_handoff / coordinator-directed row awaiting the seat
  'QUIET_TICK_RULING_UNENCODED', // a staged ruling not yet encoded as a rule row
  'QUIET_TICK_ERROR',            // the tick itself errored (structural; exempt from parity)
]);

export const RESPONSIBILITIES = [
  'Chairman\'s personal-day STEWARD — tame Gmail, drive Todoist, manage distractions (propose-then-act; never claims, dispatches, sends SMS/email, or acts on fleet business).',
  'The morning conversation is the product: open with the shape of the day, then Gmail, then Todoist, one topic per message, at most one judgment call in flight; every ruling read back, then encoded as a michael_rules row with provenance (ENCODE-BEFORE-NEXT-USE).',
  'Overnight quiet-tick (every 15 min): classify the queued Gmail remainder (Sonnet, Opus re-judge), grade queued Todoist items, finalize the brief of record with the lede; STOP every sub-agent the moment its result is read.',
  'Silence by default: outside a chairman-initiated exchange the seat emits only QUIET_TICK lines; failures reach the chairman as one line in Adam\'s 6am SMS, never from Michael.',
  'Max-plan pin: Opus at medium effort for the conversation (CLAUDE_MODEL_MICHAEL), Sonnet fallback under quota — verify via /status; nothing in Michael\'s path bills an API key.',
  'Windowed liveness: the seat is expected 04:30-07:30 ET (periodic_process_registry role_session:michael expected_window_et); outside the window it is INTENTIONALLY_DOWN, not a blind spot.',
];

// Michael's recurring tick: exactly ONE loop (spec §1.4 MICHAEL_LOOPS). The quiet-tick runs every 15
// minutes, phased off the coordinator tick (:07/:22/:37/:52), and covers all three durable duties —
// the seat's share of each job rides this single tick rather than three crons.
export const MICHAEL_LOOPS = [
  {
    key: 'quiet-tick',
    covers: [...PINNED_DUTY_SLUGS],
    label: 'Michael quiet-tick — classify/grade queues, brief finalize, feeder + inbox + ruling checks; one QUIET_TICK=michael line plus QUIET_TICK_* action lines',
    script: 'michael-quiet-tick.mjs',
    cron: '7,22,37,52 * * * *',
    prompt: 'node scripts/michael-quiet-tick.mjs',
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
    else if (env.MICHAEL_ARMED_CRONS) raw = env.MICHAEL_ARMED_CRONS;
  }
  const provided = raw.trim().length > 0;
  const set = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  return { provided, set };
}

/** Pure: the contract's durable markers must equal the pinned set — an EQUALITY, not a count (DESIGN 8601cbdd C2). */
export function dutyParityVerdict(markdown, loops = MICHAEL_LOOPS) {
  const found = parseDurableDutyMarkers(markdown).sort();
  const pinned = [...PINNED_DUTY_SLUGS].sort();
  const missing = missingDurableDuties(markdown, loops);
  const unexpected = found.filter((s) => !pinned.includes(s));
  const absent = pinned.filter((s) => !found.includes(s));
  return { found, missing, unexpected, absent, ok: missing.length === 0 && unexpected.length === 0 && absent.length === 0 };
}

export function renderResponsibilities(repoRoot = REPO_ROOT) {
  const lines = ['═══ MICHAEL ROLE — recurring-tick responsibilities (chairman\'s personal-day steward; propose-then-act, silent by default) ═══'];
  RESPONSIBILITIES.forEach((r, i) => lines.push(`  ${i + 1}. ${r}`));
  lines.push(`  model pin: ${getClaudeModel('michael')} (fallback ${getClaudeModel('michael-fallback')}) — Max plan only, verify via /status`);
  let docOk = false;
  try { docOk = readFileSync(resolve(repoRoot, ROLE_CONTEXT_DOC), 'utf8').length > 0; } catch { docOk = false; }
  lines.push(docOk ? `  (durable role contract: ${ROLE_CONTEXT_DOC}; BINDING posture companion: ${POSTURE_DOC})`
                   : `  ⚠️  role contract not found at ${ROLE_CONTEXT_DOC} — summary above is the fallback (fail-open; seed the section and regenerate).`);
  lines.push(`  quiet-tick action lines: ${MICHAEL_TICK_TOKENS.join(', ')}`);
  return lines.join('\n');
}

export function renderLoops(armed, loops = MICHAEL_LOOPS) {
  const n = loops.length;
  const lines = [`═══ MICHAEL RECURRING TICK (${n} loop${n === 1 ? '' : 's'}) — arm idempotently ═══`];
  if (!armed.provided) {
    lines.push('  (no --armed set supplied — run CronList and re-invoke with --armed "<loop-key>" for an armed|MISSING verdict; emitting full spec below)');
  }
  const toArm = [];
  for (const loop of loops) {
    const status = loopStatus(loop, armed);
    const badge = status === 'armed' ? '✅ armed' : status === 'MISSING' ? '❌ MISSING' : '… unverified';
    lines.push(`  [${badge}] ${loop.key.padEnd(16)} ${loop.label}`);
    lines.push(`              cron: ${loop.cron}   covers: ${(loop.covers || []).join(', ')}`);
    if (status !== 'armed') toArm.push(loop);
  }
  lines.push('');
  if (toArm.length === 0 && armed.provided) {
    lines.push(`  ✅ The Michael tick loop is armed. Nothing to arm.`);
  } else {
    lines.push(`  → Arm the ${armed.provided ? toArm.length + ' missing' : 'not-yet-armed'} loop(s) via CronCreate (idempotent — skip any already in CronList):`);
    for (const loop of toArm) {
      lines.push(`     CronCreate({ cron: ${JSON.stringify(loop.cron)}, prompt: ${JSON.stringify(loop.prompt)}, recurring: true })`);
    }
  }
  return lines.join('\n');
}

/**
 * RUNTIME contract↔tooling parity verdict. Reads CLAUDE_MICHAEL.md and FAILS LOUD when a durable
 * contract duty is missing from MICHAEL_LOOPS, when a pinned duty is missing from the contract, or
 * when the contract carries a marker the pinned set does not know. Category parity is reported the
 * Solomon way, plus an EXPLICIT line when there is nothing to check. Fail-open on read errors.
 */
export function renderContractParity(repoRoot = REPO_ROOT, loops = MICHAEL_LOOPS) {
  const head = '═══ CONTRACT↔TOOLING PARITY ═══\n  ';
  try {
    const md = readFileSync(resolve(repoRoot, ROLE_CONTEXT_DOC), 'utf8');
    const v = dutyParityVerdict(md, loops);
    const lines = [];
    if (v.ok) lines.push(`✅ durable duties in ${ROLE_CONTEXT_DOC} equal the pinned set wired in MICHAEL_LOOPS: ${v.found.join(', ')}`);
    if (v.missing.length) lines.push(`⚠️ CONTRACT DRIFT: durable duty(ies) declared in ${ROLE_CONTEXT_DOC} but absent from MICHAEL_LOOPS covers: ${v.missing.join(', ')} — they will DIE every session until armed. Add them to MICHAEL_LOOPS (${TICK_SCRIPT.replace('quiet-tick', 'startup-check')}).`);
    if (v.absent.length) lines.push(`⚠️ CONTRACT DRIFT: pinned duty(ies) NOT found as markers in ${ROLE_CONTEXT_DOC}: ${v.absent.join(', ')} — the marker literal was renamed or removed.`);
    if (v.unexpected.length) lines.push(`⚠️ CONTRACT DRIFT: ${ROLE_CONTEXT_DOC} declares durable duty(ies) the pinned set does not know: ${v.unexpected.join(', ')} — add the slug to PINNED_DUTY_SLUGS and the loop covers, or fix the marker.`);

    const readScript = (basename) => {
      try { return readFileSync(resolve(repoRoot, 'scripts', basename), 'utf8'); } catch { return null; }
    };
    const { mismatches, unreadable, checked, ambiguous } = categoryParityMismatches(md, readScript);
    if (mismatches.length > 0) {
      for (const m of mismatches) lines.push(`⚠️ CATEGORY DRIFT: ${m.script} — contract mandates category='${m.expected}' but the script writes ${m.found.map((f) => `'${f}'`).join(', ')}. The contract governs; move the script.`);
    } else if (checked > 0) {
      lines.push(`✅ ${checked} contract category claim(s) match what the scripts write`);
    } else {
      // DESIGN 8601cbdd: never go silent here — a missing line reads as green.
      lines.push('ℹ️ category parity: no category claims in the contract to check (the Michael contract names no feedback categories in v1)');
    }
    if (unreadable.length > 0) lines.push(`ℹ️ category parity unverified for: ${unreadable.join(', ')} (script not readable from ${repoRoot})`);
    if (ambiguous.length > 0) lines.push(`ℹ️ ${ambiguous.length} contract category claim(s) NOT verified — the line names multiple scripts or categories and was not guessed at`);
    return head + lines.join('\n  ');
  } catch (err) {
    return head + '⚠️ parity check skipped (fail-open — the contract could not be read, so parity is UNVERIFIED, not passing): ' + (err?.message || String(err));
  }
}

// Michael's contract, its BINDING posture companion, and its script-backed tick are all
// STALE-CRITICAL paths (the Solomon precedent has no tick script; Michael does).
export const MICHAEL_CRITICAL_PATHS = Object.freeze([...CRITICAL_PROTOCOL_FILES, ROLE_CONTEXT_DOC, POSTURE_DOC, TICK_SCRIPT]);

/** Advisory checkout-freshness badge (fail-open — never throws, never blocks startup). */
export function renderFreshness(repoRoot = REPO_ROOT) {
  try {
    return '═══ CHECKOUT FRESHNESS ═══\n  ' + freshnessBadge(checkoutFreshness(repoRoot, { role: 'michael', criticalPaths: MICHAEL_CRITICAL_PATHS }));
  } catch (err) {
    return '═══ CHECKOUT FRESHNESS ═══\n  ✅ freshness check skipped (fail-open): ' + (err?.message || String(err));
  }
}

// Mirrors the coordination-inbox / role-status-identity path-traversal guard.
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

// The Michael role marker for role-aware compaction thresholds (.claude/compaction-thresholds.cjs
// detectRoleFromFile), peer of .claude/active-adam.json (scripts/adam-startup-check.mjs writeAdamMarker).
// Validates the session id before writing (SECURITY evidence 2ca8b0ee, low). Fail-open.
export function writeMichaelMarker(env = process.env, repoRoot = REPO_ROOT) {
  try {
    const sid = env.CLAUDE_SESSION_ID;
    if (!sid || !SESSION_ID_RE.test(sid)) return false;
    writeFileSync(resolve(repoRoot, '.claude', 'active-michael.json'),
      JSON.stringify({ session_id: sid, role: 'michael', updated_at: new Date().toISOString() }, null, 2));
    return true;
  } catch { return false; }
}

export function buildReport(argv = [], env = {}, repoRoot = REPO_ROOT) {
  const armed = parseArmedSet(argv, env);
  return [renderResponsibilities(repoRoot), '', renderLoops(armed), '', renderContractParity(repoRoot), '', renderFreshness(repoRoot)].join('\n');
}

export { slugifyDuty, parseDurableDutyMarkers, wiredDutySlugs, missingDurableDuties, loopStatus };

// Fail-open entry: always exit 0; a hiccup never blocks /michael startup.
function main() {
  try {
    console.log('[MICHAEL-STARTUP] ' + (process.env.CLAUDE_SESSION_ID ? 'session=' + process.env.CLAUDE_SESSION_ID : 'session=unknown'));
    if (writeMichaelMarker()) console.log('[MICHAEL-STARTUP] role marker written: .claude/active-michael.json');
    console.log(buildReport(process.argv.slice(2), process.env));
  } catch (err) { console.log('michael-startup-check fail-open:', err?.message || String(err)); }
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main();
}
