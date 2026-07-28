#!/usr/bin/env node
/**
 * Adam opportunity-scan CLI — the read-only proactive governance heartbeat.
 * SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001.
 *
 * Rotates through portfolio scopes ONE per tick (weighted round-robin), runs a
 * per-scope read-only briefing over existing tables, applies the rationale bar,
 * and either appends ADAM_OK to a local ledger (silence-by-default) or shells a
 * SINGLE ranked advisory to scripts/adam-advisory.cjs. Writes NOTHING to
 * strategy tables. Ships INERT behind ADAM_GOVERNANCE_HEARTBEAT_V1 (default OFF):
 * the advisory shell-out is gated; the read-only briefing/ledger may still run.
 *
 * Subcommands:  --briefing | --scan | --ledger
 * Scope:        --scope harness | platform | venture:<id> | auto   (default: auto)
 * Tick index:   --tick <n>   (deterministic round-robin selector; default 0)
 *
 * ESM/CJS note: lib/adam/* and lib/eva/* are ESM, so this CommonJS CLI loads
 * them via dynamic import(pathToFileURL(...)) (Windows-safe). The advisory lane
 * (scripts/adam-advisory.cjs) and the supabase client (lib/supabase-client.cjs)
 * are CommonJS and are require()d directly.
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const LEDGER_PATH = path.join(REPO_ROOT, '.adam-scan-ledger.json');
const ADVISORY_CLI = path.join(__dirname, 'adam-advisory.cjs');
const LEDGER_MAX_ENTRIES = 500;

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — strategic_directives_v2 (open-SD
// dedup check) and chairman_decisions (preference prior) are both unbounded/growing reads below;
// paginate rather than trust the implicit PostgREST 1000-row cap.
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../lib/db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

/** Feature-flag helper: on|1|true => enabled; everything else (incl. undefined) => OFF. */
function isFlagEnabled(env = process.env) {
  const v = String(env.ADAM_GOVERNANCE_HEARTBEAT_V1 || 'off').toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
}

/**
 * QF-20260610-863 (W0-3, FR-1/FR-2): conjunctive authoritative gate. The registry
 * (leo_feature_flags) was dead metadata — consumers read env only, so a registry
 * is_enabled=false had ZERO effect (proven live). Now BOTH must be ON to run:
 *   env OFF                      -> { enabled:false, source:'env_off' }        (registry never read)
 *   env ON + registry false      -> { enabled:false, source:'registry_kill' }  (remote kill-switch, fail-CLOSED)
 *   env ON + registry true       -> { enabled:true,  source:'env_and_registry_on' }
 *   env ON + row missing/DB err  -> { enabled:true,  source:'registry_degraded_env_verdict', degraded:true }
 * Asymmetry is deliberate: the kill direction is reliable (a readable registry
 * false always kills), but a transient DB blip degrades to the env verdict — it
 * can never silently flip ON a flag the env had off (env_off short-circuits before
 * any DB read), and never crashes the tick. Pure-DI (client injected) per FR-5.
 */
async function resolveGovernanceFlagGate(supabase, flagKey, envVerdict) {
  if (!envVerdict) return { enabled: false, source: 'env_off', degraded: false };
  try {
    const { data, error } = await supabase
      .from('leo_feature_flags')
      .select('is_enabled')
      .eq('flag_key', flagKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { enabled: true, source: 'registry_degraded_env_verdict', degraded: true, detail: 'no registry row' };
    return data.is_enabled === true
      ? { enabled: true, source: 'env_and_registry_on', degraded: false }
      : { enabled: false, source: 'registry_kill', degraded: false };
  } catch (e) {
    return { enabled: true, source: 'registry_degraded_env_verdict', degraded: true, detail: e.message };
  }
}

/** Parse argv into { mode, scope, tick }. mode is null when no subcommand flag is present. */
function parseArgs(argv) {
  let mode = null;
  if (argv.includes('--briefing')) mode = 'briefing';
  else if (argv.includes('--ledger')) mode = 'ledger';
  else if (argv.includes('--scan')) mode = 'scan';
  const sIdx = argv.indexOf('--scope');
  const scope = sIdx >= 0 ? String(argv[sIdx + 1] || 'auto') : 'auto';
  const tIdx = argv.indexOf('--tick');
  const tick = tIdx >= 0 ? Number(argv[tIdx + 1]) || 0 : 0;
  return { mode, scope, tick };
}

function usage() {
  return [
    'Usage: node scripts/adam-opportunity-scan.cjs <--briefing|--scan|--ledger> [--scope harness|platform|venture:<id>|auto] [--tick <n>]',
    '  --briefing   print the read-only per-scope briefing',
    '  --scan       evaluate the rationale bar; surface <=1 advisory or write ADAM_OK',
    '  --ledger     print the decision ledger (.adam-scan-ledger.json)',
  ].join('\n');
}

/** Append one verdict entry to the local ledger (bounded, best-effort). */
function appendLedger(entry) {
  let arr = [];
  try {
    if (fs.existsSync(LEDGER_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
      if (Array.isArray(parsed)) arr = parsed;
    }
  } catch {
    arr = [];
  }
  arr.push(entry);
  if (arr.length > LEDGER_MAX_ENTRIES) arr = arr.slice(-LEDGER_MAX_ENTRIES);
  try {
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(arr, null, 2) + '\n');
  } catch (e) {
    process.stderr.write(`[adam-scan] ledger write failed (non-fatal): ${e.message}\n`);
  }
  return entry;
}

function buildLedgerEntry({ scope, verdict, cleared = 0, flagEnabled, detail = null, trace = null, guardHealth = null }) {
  return {
    ts: new Date().toISOString(),
    scope: scope ? scope.scope_key : 'none',
    verdict, // ADAM_OK | SURFACED | SUPPRESSED_FLAG_OFF
    cleared,
    flag: flagEnabled ? 'on' : 'off',
    ...(detail ? { detail } : {}),
    // SD-LEO-INFRA-ADAM-PRIORITY-ANCHORING-001: audit the rank perturbations.
    ...(Array.isArray(trace) && trace.length ? { trace } : {}),
    // SD-LEO-INFRA-PURE-GUARD-UNWIRED-001 FR-4. THE READ THAT MAKES THE EMIT A SIGNAL.
    //
    // The ledger recorded 21 consecutive `ADAM_OK cleared=0` rows while waveAlignmentTerm was
    // failing closed on an empty linkage table — every row byte-identical, so "nothing qualified"
    // and "the term could not judge" were the same observation from outside. Computing the health
    // and not writing it down would leave pass 22 identical to the 21 before it, which is this
    // SD's own defect wearing the remedy's clothes; adversarial review caught exactly that here.
    ...(guardHealth ? { guard_health: guardHealth } : {}),
  };
}

/**
 * Render the guard-health line for stdout — the operator-facing half of the same read.
 *
 * Emitted UNCONDITIONALLY when health was computed, zeros included. A line that appears only when
 * something is wrong makes "measured and fine" indistinguishable from "not measured", which is the
 * ambiguity this whole SD is about, one level up.
 */
function formatGuardHealth(health) {
  if (!health || !health.summary) return '';
  const named = (health.results || [])
    .filter((r) => r.missingInput)
    .map((r) => ` ${r.guard} could not judge: '${r.missingInput}'.`)
    .join('');
  return `\n  ${health.summary}${named}`;
}

/**
 * THE DURABLE FORM of guard health — counts AND names.
 *
 * Writing only `summary` made the ledger row distinguishable but not ACTIONABLE: it said
 * "suspect=1" and named neither the term nor the absent input, so the one artifact an auditor reads
 * months later still required re-deriving what FR-2 AC-4 exists to state. The 21-pass evidence came
 * out of this ledger; stdout is ephemeral and is not where that reconstruction happens.
 */
function guardHealthForLedger(health) {
  if (!health || !health.summary) return null;
  return {
    summary: health.summary,
    // Always present, empty included — a field that appears only when non-empty makes
    // "measured, nothing missing" and "not measured" the same row again.
    missing: (health.results || [])
      .filter((r) => r.missingInput)
      .map((r) => ({ guard: r.guard, missing_input: r.missingInput, observations: r.observations })),
  };
}

/**
 * Build the ledger entry FROM A REAL selectAdvisory RESULT.
 *
 * Extracted from main() because main() is not exported and therefore not reachable from any test:
 * both ENDS of this read were well covered — buildLedgerEntry with a literal, formatGuardHealth
 * with a literal — while the WIRE between them was not, so deleting the argument that carries
 * `result.guard_health` into the ledger restored the byte-identical row and produced no test
 * signal at all. Third round running, the final hop was the unguarded one. Putting the logic in an
 * exported pure function leaves main() with nothing worth mutating.
 */
function advisoryLedgerEntry({ result, scope, verdict, flagEnabled, detail = null, trace = null }) {
  return buildLedgerEntry({
    scope,
    verdict,
    cleared: verdict === 'ADAM_OK' ? 0 : ((result && result.cleared) || 0),
    flagEnabled,
    detail,
    trace,
    guardHealth: guardHealthForLedger(result && result.guard_health),
  });
}

/** The ADAM_OK stdout line, likewise extracted so the interpolation is reachable from a test. */
function adamOkLine(scope, result) {
  const key = scope ? scope.scope_key : 'none';
  return `ADAM_OK scope=${key} (nothing cleared the bar)${formatGuardHealth(result && result.guard_health)}`;
}

/**
 * Decide the whole outcome of a scan — verdict, ledger entry and stdout — from a selectAdvisory
 * result. main() then performs side effects and holds no branching of its own.
 *
 * WHY THIS SHAPE, and what it does NOT close. Mutation testing found the three call sites that
 * passed `result` into the ledger builder still surviving, because they lived inside main(), which
 * is not exported and is therefore unreachable from any unit test. Collapsing them into ONE call
 * shrinks that surface to a single hop, and every decision it makes is tested here.
 *
 * The residual is real and is stated rather than papered over: `scanOutcome(...)` is still invoked
 * from main(), and a mutation that passed it a null result would produce no unit-test signal. That
 * last hop cannot be closed by unit tests at all — it needs a process-level test that actually runs
 * the CLI, which this scan cannot have cheaply because it reads the database first. Recording the
 * boundary precisely is the honest move; claiming the hop is covered would be the third repetition
 * of the exact defect this SD exists to remove.
 */
function scanOutcome({ result, scope, flagEnabled }) {
  const surfaced = result && result.surfaced;
  if (!surfaced) {
    return {
      verdict: 'ADAM_OK',
      entry: advisoryLedgerEntry({ result, scope, verdict: 'ADAM_OK', flagEnabled }),
      stdout: adamOkLine(scope, result),
    };
  }
  const detail = surfaced.dedup_key || null;
  if (!flagEnabled) {
    return {
      verdict: 'SUPPRESSED_FLAG_OFF',
      entry: advisoryLedgerEntry({ result, scope, verdict: 'SUPPRESSED_FLAG_OFF', flagEnabled, detail }),
      stdout: null,   // main() renders this one; it needs the gate source, which is not a scan input
    };
  }
  return {
    verdict: 'SURFACED',
    entry: advisoryLedgerEntry({ result, scope, verdict: 'SURFACED', flagEnabled, detail, trace: result.trace }),
    stdout: null,     // the advisory body is shelled out to the advisory lane
  };
}

// NOTE: lib/adam/* and lib/eva/* are ESM; this CommonJS CLI loads them via
// dynamic import() with STRING-LITERAL relative specifiers — both Windows-safe
// at runtime and traceable by the WIRE_CHECK static call-graph (a computed
// specifier would create no edge and false-positive the libs as unreachable).

/** Fetch open SD dedup keys (read-only). Defensive: returns an empty Set on any error. */
async function fetchOpenSdKeys(supabase) {
  try {
    const data = await fapPaginate(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key')
      .in('status', ['draft', 'active', 'in_progress', 'pending_approval'])
      .order('sd_key', { ascending: true })); // unique tiebreaker (FR-6)
    return new Set(data.map((r) => r.sd_key).filter(Boolean));
  } catch (e) {
    // GUARD_UNAVAILABLE: dedup check skipped this tick — the openSdKeys read failed, so a
    // candidate that duplicates an existing open SD will not be flagged as a duplicate this
    // tick (fail-open by original design; loud instead of silent per count-discipline policy).
    process.stderr.write(`GUARD_UNAVAILABLE: open-SD dedup check skipped this tick — sd_key read failed (${e && e.message ? e.message : e})\n`);
    return new Set();
  }
}

async function runBriefing(scope, supabase, liveVentureCount) {
  const { briefHarness } = await import('../lib/adam/briefings/harness.js');
  const { briefPlatform } = await import('../lib/adam/briefings/platform.js');
  const { briefVenture } = await import('../lib/adam/briefings/venture.js');
  if (scope.scope_key === 'harness') return briefHarness(supabase);
  if (scope.scope_key === 'platform') return briefPlatform(supabase, { liveVentureCount });
  return briefVenture(supabase, scope.venture_id);
}

async function main() {
  const argv = process.argv.slice(2);
  const { mode, scope: scopeArg, tick } = parseArgs(argv);

  if (!mode) {
    process.stderr.write(usage() + '\n');
    process.exit(2);
  }

  const flagEnabled = isFlagEnabled();

  // --ledger is a pure local read; no DB needed.
  if (mode === 'ledger') {
    try {
      const raw = fs.existsSync(LEDGER_PATH) ? fs.readFileSync(LEDGER_PATH, 'utf8') : '[]';
      process.stdout.write(raw.endsWith('\n') ? raw : raw + '\n');
    } catch (e) {
      process.stdout.write('[]\n');
      process.stderr.write(`[adam-scan] ledger read failed: ${e.message}\n`);
    }
    process.exit(0);
  }

  // Reads below are flag-independent (read-only). Fail OPEN on any error.
  try {
    const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
    const supabase = createSupabaseServiceClient('engineer');

    // QF-20260610-863: the registry is now AUTHORITATIVE — conjoin it with the env
    // verdict captured above. A registry is_enabled=false kills the loop live.
    const gate = await resolveGovernanceFlagGate(supabase, 'ADAM_GOVERNANCE_HEARTBEAT_V1', flagEnabled);
    if (gate.degraded) {
      process.stderr.write(`[adam-scan] flag gate degraded to env verdict (${gate.detail || 'registry unreadable'})\n`);
    }
    const gateEnabled = gate.enabled;

    const { enumerateScopes, resolveScopeArg, countLiveVentures } = await import('../lib/adam/scope-registry.js');
    const scopes = await enumerateScopes(supabase);
    const liveVentureCount = countLiveVentures(scopes);
    const scope = resolveScopeArg(scopes, scopeArg, tick);

    if (!scope) {
      process.stderr.write(`[adam-scan] scope '${scopeArg}' did not resolve to a live scope.\n` + usage() + '\n');
      process.exit(2);
    }

    const briefing = await runBriefing(scope, supabase, liveVentureCount);

    if (mode === 'briefing') {
      process.stdout.write(JSON.stringify({ scope: scope.scope_key, ...briefing }, null, 2) + '\n');
      process.exit(0);
    }

    // mode === 'scan'
    const { selectAdvisory, formatAdvisoryBody, LEO_ROADMAP_ID } = await import('../lib/adam/rationale-bar.js');
    const { applyLivenessGuard } = await import('../lib/adam/liveness-guard.js');

    const guarded = applyLivenessGuard(briefing.candidates || [], liveVentureCount);
    const openSdKeys = await fetchOpenSdKeys(supabase);

    // SD-LEO-INFRA-ADAM-PRIORITY-ANCHORING-001 (FR-2/FR-3): compute the bounded
    // preference weights + the LEO-Roadmap Q2 wave alignment, and attach both to
    // selectAdvisory. Behavior change is GATED BY THE FLAG: when the gate is off
    // we pass NEITHER (flat/no-op path) so selection is byte-identical to today.
    let selectOpts = { openSdKeys };
    if (gateEnabled) {
      try {
        const { computePreferenceWeights } = await import('../lib/adam/preference-model.js');
        const { calculateAlignment } = await import('../lib/integrations/okr-wave-linker.js');
        // chairman_decisions: weak soft prior (read-only, fail-soft to []).
        let decisions = [];
        try {
          decisions = await fapPaginate(() => supabase
            .from('chairman_decisions')
            .select('id, decision, status')
            .order('id', { ascending: true })); // unique tiebreaker (FR-6)
        } catch { decisions = []; }
        const pref = await computePreferenceWeights({ supabase, decisions });
        selectOpts.prefWeights = pref.weights;
        // Q2 alignment keyed STRICTLY on the LEO Roadmap; self-gates to no-op on 0 waves.
        let waveAlignment = null;
        try { waveAlignment = await calculateAlignment(supabase, LEO_ROADMAP_ID); } catch { waveAlignment = null; }
        selectOpts.waveAlignment = waveAlignment;
        // SD-LEO-INFRA-ADAM-GAUGE-ESTATE-SOURCING-001 (FR-1/FR-2 SPINE WIRE): the LIVE vision gauge
        // as an ADDITIONAL intra-tier lens (lower build% => higher rank). Per-candidate no-op until a
        // candidate DECLARES a `capability`; fail-soft to empty gaps on any gauge unavailability.
        // The capability_gap multiplier is bounded + folded into _effective, so it NEVER overrides
        // the KR-status tier (tier compared first). This closes loop piece B (gauge as a lens).
        let capabilityGap = null;
        try {
          const { readCapabilityGaps } = await import('../lib/adam/gauge-lens.js');
          capabilityGap = await readCapabilityGaps({ supabase });
        } catch { capabilityGap = null; }
        selectOpts.capabilityGap = capabilityGap;
      } catch (e) {
        // Fail-soft: drop the perturbation entirely -> byte-identical baseline.
        process.stderr.write(`[adam-scan] preference/wave term skipped (fail-soft): ${e.message}\n`);
        selectOpts = { openSdKeys };
      }
    }

    const result = selectAdvisory(guarded.kept, selectOpts);

    // ONE seam. Every verdict, ledger entry and stdout line is decided by the exported, tested
    // scanOutcome(); what remains below is side effects. See its docblock for the one hop this
    // still cannot cover and why.
    const outcome = scanOutcome({ result, scope, flagEnabled: gateEnabled });
    const entry = appendLedger(outcome.entry);

    if (outcome.verdict === 'ADAM_OK') {
      // The 21-pass path. `guard_health` is what separates "nothing qualified" from "the terms
      // could not judge" — without it these two rows are byte-identical.
      process.stdout.write(outcome.stdout + '\n');
      process.stdout.write(JSON.stringify(entry) + '\n');
      process.exit(0);
    }

    const body = formatAdvisoryBody(result.surfaced);
    if (outcome.verdict === 'SUPPRESSED_FLAG_OFF') {
      // Cleared the bar, but the surfacing path is inert until the gate clears
      // (env off, or QF-20260610-863: the authoritative registry killed it).
      process.stdout.write(`SUPPRESSED_FLAG_OFF scope=${scope.scope_key} (1 cleared; ADAM_GOVERNANCE_HEARTBEAT_V1 gate off: ${gate.source})\n`);
      process.exit(0);
    }

    // gate ON (env AND registry): emit exactly ONE advisory via the existing lane.
    const r = spawnSync('node', [ADVISORY_CLI, 'send', body], { stdio: 'inherit' });
    process.exit(r.status == null ? 0 : r.status);
  } catch (e) {
    // FAIL OPEN — never break Adam's tick.
    process.stderr.write(`[adam-scan] read-only scan degraded to no-signal: ${e.message}\n`);
    process.exit(0);
  }
}

module.exports = { isFlagEnabled, resolveGovernanceFlagGate, parseArgs, buildLedgerEntry, formatGuardHealth, guardHealthForLedger, advisoryLedgerEntry, adamOkLine, scanOutcome, usage, LEDGER_PATH };

if (require.main === module) {
  main();
}
