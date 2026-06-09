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
const { pathToFileURL } = require('url');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const LEDGER_PATH = path.join(REPO_ROOT, '.adam-scan-ledger.json');
const ADVISORY_CLI = path.join(__dirname, 'adam-advisory.cjs');
const LEDGER_MAX_ENTRIES = 500;

/** Feature-flag helper: on|1|true => enabled; everything else (incl. undefined) => OFF. */
function isFlagEnabled(env = process.env) {
  const v = String(env.ADAM_GOVERNANCE_HEARTBEAT_V1 || 'off').toLowerCase();
  return v === 'on' || v === '1' || v === 'true';
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

function buildLedgerEntry({ scope, verdict, cleared = 0, flagEnabled, detail = null }) {
  return {
    ts: new Date().toISOString(),
    scope: scope ? scope.scope_key : 'none',
    verdict, // ADAM_OK | SURFACED | SUPPRESSED_FLAG_OFF
    cleared,
    flag: flagEnabled ? 'on' : 'off',
    ...(detail ? { detail } : {}),
  };
}

async function esm(rel) {
  return import(pathToFileURL(path.join(__dirname, rel)).href);
}

/** Fetch open SD dedup keys (read-only). Defensive: returns an empty Set on any error. */
async function fetchOpenSdKeys(supabase) {
  try {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key')
      .in('status', ['draft', 'active', 'in_progress', 'pending_approval']);
    return new Set((data || []).map((r) => r.sd_key).filter(Boolean));
  } catch {
    return new Set();
  }
}

async function runBriefing(scope, supabase, liveVentureCount) {
  const { briefHarness } = await esm('../lib/adam/briefings/harness.js');
  const { briefPlatform } = await esm('../lib/adam/briefings/platform.js');
  const { briefVenture } = await esm('../lib/adam/briefings/venture.js');
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

    const { enumerateScopes, resolveScopeArg, countLiveVentures } = await esm('../lib/adam/scope-registry.js');
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
    const { selectAdvisory, formatAdvisoryBody } = await esm('../lib/adam/rationale-bar.js');
    const { applyLivenessGuard } = await esm('../lib/adam/liveness-guard.js');

    const guarded = applyLivenessGuard(briefing.candidates || [], liveVentureCount);
    const openSdKeys = await fetchOpenSdKeys(supabase);
    const result = selectAdvisory(guarded.kept, { openSdKeys });

    if (!result.surfaced) {
      const entry = appendLedger(buildLedgerEntry({ scope, verdict: 'ADAM_OK', cleared: 0, flagEnabled }));
      process.stdout.write(`ADAM_OK scope=${scope.scope_key} (nothing cleared the bar)\n`);
      process.stdout.write(JSON.stringify(entry) + '\n');
      process.exit(0);
    }

    const body = formatAdvisoryBody(result.surfaced);
    if (!flagEnabled) {
      // Cleared the bar, but the surfacing path is inert until the flag flips.
      appendLedger(buildLedgerEntry({ scope, verdict: 'SUPPRESSED_FLAG_OFF', cleared: result.cleared, flagEnabled, detail: result.surfaced.dedup_key || null }));
      process.stdout.write(`SUPPRESSED_FLAG_OFF scope=${scope.scope_key} (1 cleared; ADAM_GOVERNANCE_HEARTBEAT_V1 is off)\n`);
      process.exit(0);
    }

    // flag ON: emit exactly ONE advisory via the existing lane.
    appendLedger(buildLedgerEntry({ scope, verdict: 'SURFACED', cleared: result.cleared, flagEnabled, detail: result.surfaced.dedup_key || null }));
    const r = spawnSync('node', [ADVISORY_CLI, 'send', body], { stdio: 'inherit' });
    process.exit(r.status == null ? 0 : r.status);
  } catch (e) {
    // FAIL OPEN — never break Adam's tick.
    process.stderr.write(`[adam-scan] read-only scan degraded to no-signal: ${e.message}\n`);
    process.exit(0);
  }
}

module.exports = { isFlagEnabled, parseArgs, buildLedgerEntry, usage, LEDGER_PATH };

if (require.main === module) {
  main();
}
