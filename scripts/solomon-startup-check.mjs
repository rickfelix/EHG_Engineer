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
import { getClaudeModel } from '../lib/config/model-config.js';
// SD-LEO-INFRA-ALWAYS-SWEEP-DESIGN-OF-RECORD-001: the sweep-mode resolver reads the design-of-record
// policy (leo_protocol_sections id=611 metadata.sweep_policy) via the canonical service-role client.
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
// SD-LEO-INFRA-SINGLETON-STALE-TREE-STALENESS-GAUGE-001: Solomon previously had NO checkout-freshness
// check at all (Adam and the coordinator already did) — this closes that gap.
import { checkoutFreshness, freshnessBadge, CRITICAL_PROTOCOL_FILES } from '../lib/governance/checkout-freshness.js';
import { isMainModule } from '../lib/utils/is-main-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// SD-LEO-INFRA-SOLOMON-MODEB-FABLE-PIN-TRIGGER-001: deterministic deep-sweep mode trigger.
// Chairman decision (2026-07-01): Mode-B (proactive backlog sweeps) activation is DECOUPLED from the
// §11 advice-outcome ledger and COUPLED to the Fable-5 model-pin swap — when Solomon's model pin is a
// Fable id, the deep-sweep tick flips from consult-only to proactive-sweep AT THE SAME TIME, no ledger
// wait. The pin is resolved via getClaudeModel('solomon') (the canonical CLAUDE_MODEL_SOLOMON →
// CLAUDE_MODEL → MODEL_DEFAULTS.claude.solomon chain — NOT re-implemented here). An explicit
// SOLOMON_SWEEP_MODE env value ('proactive'|'consult') overrides the pin-derived result (a
// deterministic escape hatch against a future Fable id that lacks the literal 'fable' substring).
// Pure function of its argument + env; resolve it at TICK time so a mid-session pin swap takes effect
// on the next tick without a code change. This gates ONLY which mode the tick runs — Solomon still
// proposes and never executes in either mode (CONST-002 unchanged).
export function solomonSweepMode(pin = getClaudeModel('solomon'), env = process.env) {
  const override = String(env.SOLOMON_SWEEP_MODE || '').trim().toLowerCase();
  if (override === 'proactive' || override === 'consult') return override;
  return /fable/i.test(String(pin || '')) ? 'proactive' : 'consult';
}

export function isProactiveSweepEnabled(pin = getClaudeModel('solomon'), env = process.env) {
  return solomonSweepMode(pin, env) === 'proactive';
}

// SD-LEO-INFRA-ALWAYS-SWEEP-DESIGN-OF-RECORD-001: the DESIGN-OF-RECORD row for Solomon's sweep policy.
// The pin-derivation above (solomonSweepMode) is a STALE-PIN gauge: getClaudeModel('solomon') resolves
// the CONFIGURED pin (claude-opus-4-8), NOT the live serving model — so a live Fable-5 session with the
// opus pin resolves 'consult', a /model switch never reaches the resolver, and a returning Fable pin
// does NOT auto-revert. The chairman-ratified ALWAYS-SWEEP policy is therefore encoded authoritatively
// as leo_protocol_sections id=611 metadata.sweep_policy='always' (a re-seed-safe metadata slot — the
// content seed never touches metadata). resolveSolomonSweepMode() below reads that policy as the
// authoritative source and DEMOTES the pin-derivation to a fail-safe fallback. Do NOT re-introduce
// pure pin-derivation for the live path.
const SWEEP_POLICY_ROW_ID = 611;

/**
 * Read the design-of-record sweep policy: leo_protocol_sections id=611 metadata.sweep_policy.
 * Returns the policy string (e.g. 'always') or null. FAIL-SOFT: any read error → null (never throws),
 * so the caller can fall back to the legacy pin-derivation. An optional client may be injected (tests);
 * otherwise the canonical service-role client is used.
 * @param {import('@supabase/supabase-js').SupabaseClient} [client]
 * @returns {Promise<string|null>}
 */
export async function getSolomonSweepPolicy(client) {
  try {
    const sb = client || createSupabaseServiceClient();
    const { data, error } = await sb
      .from('leo_protocol_sections')
      .select('metadata')
      .eq('id', SWEEP_POLICY_ROW_ID)
      .single();
    if (error) return null;
    const policy = data?.metadata?.sweep_policy;
    return typeof policy === 'string' ? policy : null;
  } catch {
    return null;
  }
}

/**
 * AUTHORITATIVE sweep-mode resolver (async — reads the design-of-record at tick time). Precedence:
 *   (1) SOLOMON_SWEEP_MODE env override ('proactive'|'consult') → return it (unchanged escape hatch);
 *   (2) design-of-record policy === 'always' → 'proactive', REGARDLESS of pin / live model / /model switch;
 *   (3) else (policy unset OR DB-read failure) → FAIL-SAFE to the legacy sync solomonSweepMode(pin, env).
 * Never throws (getSolomonSweepPolicy is fail-soft) — safe to call from the fail-open deep-sweep tick.
 * @param {{env?: object, pin?: string, client?: import('@supabase/supabase-js').SupabaseClient}} [opts]
 * @returns {Promise<'proactive'|'consult'>}
 */
export async function resolveSolomonSweepMode({ env = process.env, pin = getClaudeModel('solomon'), client } = {}) {
  const override = String(env.SOLOMON_SWEEP_MODE || '').trim().toLowerCase();
  if (override === 'proactive' || override === 'consult') return override;
  const policy = await getSolomonSweepPolicy(client);
  if (policy === 'always') return 'proactive';
  return solomonSweepMode(pin, env);
}

/** Async authoritative variant of isProactiveSweepEnabled — delegates to resolveSolomonSweepMode. */
export async function resolveIsProactiveSweepEnabled(opts = {}) {
  return (await resolveSolomonSweepMode(opts)) === 'proactive';
}

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
    // QF-20260701-062: chairman-directed 15min -> 5min durable baseline (tighter comms
    // responsiveness on the advisory lane). Off-round minutes avoid fleet-wide :00/:05 collision.
    cron: '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
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
      // SD-LEO-INFRA-ROLE-RUBRIC-SCORE-001 FR-3: the graded D1-D5 rubric self-score writer
      // (scripts/solomon-self-assessment-writer.cjs) is invoked from this tick's own reasoning —
      // additive to (not replacing) the 'self-adherence' duty-parity loop above.
      'self-assessment',
    ],
    label: 'Solomon Mode-B deep-reasoning sweep (agent judgment; HARD task_budget at entry, before any Read/Grep)',
    script: null, // agent-prompt tick — the deep sweep is reasoning, not a script
    cron: '0 */6 * * *',
    // SD-LEO-INFRA-SOLOMON-MODEB-FABLE-PIN-TRIGGER-001 + SD-LEO-INFRA-ALWAYS-SWEEP-DESIGN-OF-RECORD-001:
    // the tick resolves its MODE at tick time via resolveSolomonSweepMode — which reads the DESIGN-OF-RECORD
    // policy (leo_protocol_sections id=611 metadata.sweep_policy) as authoritative (always -> proactive,
    // REGARDLESS of the configured pin / live model / a /model switch), env override still wins, and it
    // fail-safes to the legacy pin-derivation when the policy is unset or the DB read fails.
    prompt: 'Solomon deep-sweep tick: (1) FIRST enforce the per-sweep task_budget at ENTRY (node -e require("./scripts/solomon-advisory.cjs").enforceSweepBudget — count/wall-clock/token) BEFORE any Read/Grep; if over budget, STOP. (2) Resolve the sweep MODE at TICK TIME from the DESIGN-OF-RECORD policy (fail-safe to the live pin) and log it: node -e "import(\'./scripts/solomon-startup-check.mjs\').then(m=>m.resolveSolomonSweepMode()).then(x=>process.stdout.write(x))". (3a) If mode===proactive (always-sweep policy of record, or a Fable pin fallback): pull ONE §4 backlog item, investigate the LIVE codebase with deep analysis, and surface EXACTLY ONE propose-only finding via node scripts/solomon-advisory.cjs send "<finding>" (dedup + quota + silence-by-default enforced). (3b) Else (consult mode, default): drain the consult inbox and answer the highest-value open solomon_consult with deep analysis via node scripts/solomon-advisory.cjs send "<answer>" --reply-to <consult-correlation> (dedup + quota enforced). Propose, NEVER execute/build in either mode (CONST-002).',
  },
  // QF-20260719-072 (Solomon advisory 39b7e635 + chairman-directed durability amendment 94204a87):
  // today's ratifications created scheduled obligations backed only by session memory. These two
  // entries are the L1 durability layer — every /solomon re-arms from this registry, and the
  // contract-parity check binds them once the posture duties carry durable markers. covers[]
  // pre-wires the expected marker slugs so the day they land in CLAUDE_SOLOMON.md the parity
  // check reconciles instead of gapping (the duty-parity-theater instance this QF closes).
  {
    key: 'weekly-program',
    covers: [
      'p1-work-posture',      // P1 standing-program set weekly at budget reset
      'p3-budget-mechanics',  // P3 weekly budget line to Adam (pre-metering self-report)
      'p4-portability-guard', // P4 Fable-terms re-check w/ auto-reversion
      'accuracy-review',      // §11 ACCURACY REVIEW DUTY (durable) — periodic hit-rate by duty cluster
      'autonomy-report',      // the weekly autonomy-report cadence rollup (the graded report itself
                              // rides the deep-sweep 'adam-autonomy-oversight-reporting' duty)
    ],
    label: 'Solomon weekly program (Mon budget reset): P3 budget line, standing-program set, accuracy review, autonomy-report cadence, P4 Fable-terms re-check, seed-run ping if fable_suitability_map still empty',
    script: null, // agent-judgment tick — posture/program setting is reasoning, not a script
    cron: '23 8 * * 1',
    prompt: 'Solomon weekly-program tick (Monday budget reset): (1) send the P3 budget line to Adam (estimated spend self-report until cost_tokens metering lands); (2) set the standing program for the week per the P1 preemption ladder; (3) run the §11 accuracy review (hit-rate by duty cluster; low-accuracy cluster -> propose-only calibration feedback flag); (4) roll up the autonomy-report cadence; (5) P4 portability re-check: verify live Fable budget terms, AUTO-REVERT to the episodic fallback posture if the budget shrank/vanished; (6) if fable_suitability_map is still EMPTY, send a seed-run ping (ping-on-silence). Propose-only throughout (CONST-002).',
  },
  {
    key: 'forecast-triggers',
    covers: [
      'forecast-cadence', // the per-wave forecast re-issue commitment (f8d8b0a1 method)
    ],
    label: 'Solomon daily forecast-trigger check: >15% velocity delta / gate-state change / >10% scope delta vs last-issued forecast basis — silent unless a trigger fires',
    script: null, // agent-judgment tick — cheap exact-counts, then re-issue judgment on fire
    cron: '37 7 * * *',
    prompt: 'Solomon daily forecast-trigger check: compare live exact counts against the LAST-ISSUED forecast basis — (a) completion velocity delta >15%, (b) any gate-state change on the forecast-critical path, (c) scope delta >10% (belt adds/removals). SILENT unless a trigger fires; on fire, re-issue the per-wave forecast with the trigger named. Propose-only (CONST-002).',
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
  // QF-20260719-072: tolerate trailing punctuation INSIDE the bold ("(durable).**") — the live
  // contract's ACCURACY REVIEW DUTY marker ends "(durable).**", which the strict ")**" tail
  // silently dropped: a scribed durable duty invisible to parity (the exact false-negative this
  // parser's header says cannot be allowed).
  const re = /\*\*\s*([^*]+?)\s+DUTY\s*\(\s*durable\b[^)]*\)\s*[.:;,]?\s*\*\*/gi;
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

// SD-LEO-INFRA-SINGLETON-STALE-TREE-STALENESS-GAUGE-001 (framework-seed candidate for
// SD-LEO-INFRA-INVARIANT-GAUGES-FRAMEWORK-001, still code-free — shipped standalone per the
// scripts/gauge-unranked-claimable-leaves.mjs precedent): Solomon's own contract doc, so drift
// there surfaces as STALE-CRITICAL. Solomon's deep-sweep tick has no dedicated script (it's
// agent-judgment, script:null in SOLOMON_LOOPS above) — no tick-script path to add here.
export const SOLOMON_CRITICAL_PATHS = Object.freeze([...CRITICAL_PROTOCOL_FILES, ROLE_CONTEXT_DOC]);

/** Advisory checkout-freshness badge (fail-open — never throws, never blocks startup). */
export function renderFreshness(repoRoot = REPO_ROOT) {
  try {
    return '═══ CHECKOUT FRESHNESS ═══\n  ' + freshnessBadge(checkoutFreshness(repoRoot, { role: 'solomon', criticalPaths: SOLOMON_CRITICAL_PATHS }));
  } catch (err) {
    return '═══ CHECKOUT FRESHNESS ═══\n  ✅ freshness check skipped (fail-open): ' + (err?.message || String(err));
  }
}

export function buildReport(argv = [], env = {}, repoRoot = REPO_ROOT) {
  const armed = parseArmedSet(argv, env);
  return [renderResponsibilities(repoRoot), '', renderLoops(armed), '', renderContractParity(repoRoot), '', renderFreshness(repoRoot)].join('\n');
}

// Fail-open entry: always exit 0; a hiccup never blocks /solomon startup.
function main() {
  try { console.log(buildReport(process.argv.slice(2), process.env)); } catch (err) { console.log('solomon-startup-check fail-open:', err?.message || String(err)); }
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main();
}
