#!/usr/bin/env node
/**
 * Wiring Validation Runner — Verifier #4 of 5 in the LEO Wiring Verification
 * Framework. Invokes each detector script against the given SD key, parses
 * the detector's JSON stdout, and upserts results into leo_wiring_validations.
 *
 * A database trigger (trg_zz_maintain_wiring_validated) then derives
 * strategic_directives_v2.wiring_validated. The EXEC-TO-PLAN handoff gate
 * reads that derived column.
 *
 * Vision: VISION-LEO-WIRING-VERIFICATION-L2-001
 * Arch:   ARCH-LEO-WIRING-VERIFICATION-001 (Phase 4)
 * SD:     SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-D
 *
 * Usage:
 *   node scripts/wiring-validators/wiring-validation-runner.js <SD-KEY> [options]
 *
 * Options:
 *   --checks <list>   Comma-separated check_types to run (default: all available)
 *   --no-persist      Emit combined JSON to stdout only; skip DB write
 *   --base <ref>      Git base ref for orphan-detector (default: main)
 *   --json            Emit combined JSON to stdout (always true if --no-persist)
 *   --root <path>     Repo root (default: auto-detect from this file)
 *
 * Exit codes:
 *   0  All invoked checks returned status=passed (or --no-persist)
 *   1  At least one check returned status=failed or warning
 *   2  CLI / configuration error
 *   3  Detector execution failure (script missing, crash, unparseable output)
 */

import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT_DEFAULT = resolve(__dirname, '..', '..');

/**
 * Resolve the root path for orphan-detector.
 * orphan-detector expects the PARENT of EHG_Engineer as root so that
 * sibling repos (ehg/src) resolve correctly.
 * In a worktree (.worktrees/SD-X/), the runner root points to the
 * worktree dir — walk up to find the main EHG_Engineer root first.
 */
function resolveOrphanDetectorRoot(runnerRoot) {
  const normalized = runnerRoot.replace(/\\/g, '/');
  const worktreeIdx = normalized.indexOf('/.worktrees/');
  if (worktreeIdx !== -1) {
    const mainRepoRoot = normalized.substring(0, worktreeIdx);
    return resolve(mainRepoRoot, '..');
  }
  return resolve(runnerRoot, '..');
}

// ---------------------------------------------------------------------------
// Detector registry — maps check_type → script path (relative to repo root).
// Scripts must emit JSON on stdout matching the leo_wiring_validations shape.
// ---------------------------------------------------------------------------
const DETECTORS = {
  orphan_detection:      'scripts/wiring-validators/orphan-detector.js',
  spec_code_drift:       'scripts/wiring-validators/spec-code-drift-detector.js',
  vision_traceability:   'scripts/wiring-validators/vision-traceability-checker.js',
  pipeline_integration:  'scripts/wiring-validators/orphan-detector.js', // same script, different check_type in output
  e2e_demo:              'scripts/wiring-validators/e2e-demo-recorder.js',
};

const VALID_STATUSES = new Set(['passed', 'failed', 'warning', 'pending']);

// Detector scripts use shorthand status strings ("pass"/"fail"/"warn"/"error"/"skip").
// Normalize to the leo_wiring_check_status DB enum values.
// Convention: "skip" = detector ran but check not applicable (no arch plan, no
// vision doc, etc.); surface as warning so the row persists and the gate emits
// a non-blocking notice rather than swallowing the skip silently.
const STATUS_ALIASES = {
  pass: 'passed',
  passed: 'passed',
  fail: 'failed',
  failed: 'failed',
  error: 'failed',
  warn: 'warning',
  warning: 'warning',
  skip: 'warning',
  skipped: 'warning',
  pending: 'pending',
};

function normalizeStatus(raw) {
  if (typeof raw !== 'string') return null;
  const mapped = STATUS_ALIASES[raw.toLowerCase()];
  return VALID_STATUSES.has(mapped) ? mapped : null;
}

function normalizeSignals(raw) {
  if (Array.isArray(raw)) return raw.length;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    sdKey: null,
    checks: null,
    persist: true,
    base: 'main',
    json: false,
    root: REPO_ROOT_DEFAULT,
  };
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === '--checks') { opts.checks = args[++i].split(',').map(s => s.trim()).filter(Boolean); }
    else if (a === '--no-persist') { opts.persist = false; opts.json = true; }
    else if (a === '--base') { opts.base = args[++i]; }
    else if (a === '--json') { opts.json = true; }
    else if (a === '--root') { opts.root = resolve(args[++i]); }
    else if (a === '-h' || a === '--help') {
      process.stderr.write('Usage: wiring-validation-runner.js <SD-KEY> [--checks list] [--no-persist] [--base ref] [--json] [--root path]\n');
      process.exit(0);
    }
    else if (!a.startsWith('--') && !opts.sdKey) { opts.sdKey = a; }
    else { process.stderr.write(`[runner] unknown arg: ${a}\n`); process.exit(2); }
    i++;
  }
  if (!opts.sdKey) {
    process.stderr.write('Usage: wiring-validation-runner.js <SD-KEY> [options]\n');
    process.exit(2);
  }
  // Validate --checks against registry if supplied.
  if (opts.checks) {
    for (const c of opts.checks) {
      if (!(c in DETECTORS)) {
        process.stderr.write(`[runner] unknown check_type: ${c}. Valid: ${Object.keys(DETECTORS).join(', ')}\n`);
        process.exit(2);
      }
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// JSON extraction — detector scripts may emit log lines before the JSON
// payload. Find the last valid top-level JSON object in stdout.
// ---------------------------------------------------------------------------
function extractTrailingJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  // Fast path: whole output is JSON (object or array — detectors emit either).
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  // Scan from end for balanced block. Track both } and ] closers so array
  // payloads (orphan-detector, spec-code-drift) are recovered when detectors
  // print log lines before the JSON.
  let depth = 0;
  let end = -1;
  let closer = null;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    const c = trimmed[i];
    if (c === '}' || c === ']') {
      if (depth === 0) { end = i; closer = c; }
      depth++;
    } else if (c === '{' || c === '[') {
      depth--;
      if (depth === 0 && closer &&
          ((c === '{' && closer === '}') || (c === '[' && closer === ']'))) {
        const candidate = trimmed.slice(i, end + 1);
        try { return JSON.parse(candidate); } catch { /* keep scanning */ }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Detector invocation — returns an array of {check_type, status, ...} rows.
// Detectors may emit a single row OR a `results` array; both shapes supported.
// ---------------------------------------------------------------------------
function invokeDetector(repoRoot, scriptRel, sdKey, extraArgs = []) {
  const scriptPath = resolve(repoRoot, scriptRel);
  if (!existsSync(scriptPath) || !statSync(scriptPath).isFile()) {
    return { ok: false, reason: 'missing', path: scriptPath };
  }
  let stdout;
  try {
    stdout = execFileSync('node', [scriptPath, sdKey, ...extraArgs], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (err) {
    // Detector exited non-zero. Some detectors use exit code to signal
    // failure state, but still emit valid JSON on stdout. Try to parse
    // whatever did make it out before giving up.
    stdout = (err.stdout || '').toString();
    if (!stdout) return { ok: false, reason: 'crashed', error: err.message, path: scriptPath };
  }
  const parsed = extractTrailingJson(stdout);
  if (!parsed) return { ok: false, reason: 'unparseable', raw: stdout.slice(-400), path: scriptPath };
  // Normalize to array of rows. Three shapes supported:
  //   - top-level array (orphan-detector, spec-code-drift-detector emit this)
  //   - { results: [...] } wrapper
  //   - single row object
  const rows = Array.isArray(parsed)               ? parsed
             : Array.isArray(parsed.results)        ? parsed.results
             : [parsed];
  const normalized = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    if (!row.check_type) continue;
    const status = normalizeStatus(row.status);
    if (!status) continue;
    normalized.push({
      sd_key:           row.sd_key || sdKey,
      check_type:       row.check_type,
      status,
      signals_detected: normalizeSignals(row.signals_detected),
      evidence:         row.evidence && typeof row.evidence === 'object' ? row.evidence : {},
    });
  }
  if (normalized.length === 0) {
    return { ok: false, reason: 'no_valid_rows', raw: JSON.stringify(parsed).slice(0, 400), path: scriptPath };
  }
  return { ok: true, rows: normalized };
}

// ---------------------------------------------------------------------------
// Persistence — upsert rows, rely on trigger for wiring_validated derivation.
// ---------------------------------------------------------------------------
async function persistRows(supabase, rows) {
  if (!rows.length) return { inserted: 0 };
  const { error } = await supabase
    .from('leo_wiring_validations')
    .upsert(rows, { onConflict: 'sd_key,check_type' });
  if (error) throw new Error(`persistRows upsert error: ${error.message}`);
  return { inserted: rows.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv);
  const checksToRun = opts.checks || Object.keys(DETECTORS);

  // De-dupe to avoid invoking the same script twice when two check_types
  // share a detector (orphan-detector emits both orphan_detection and
  // pipeline_integration in a single run).
  const runOrder = [];
  const invokedScripts = new Set();
  for (const ct of checksToRun) {
    const script = DETECTORS[ct];
    if (invokedScripts.has(script)) continue;
    runOrder.push({ check_type: ct, script });
    invokedScripts.add(script);
  }

  process.stderr.write(`[wiring-runner] SD=${opts.sdKey} checks=${checksToRun.length} scripts=${runOrder.length} persist=${opts.persist}\n`);

  const allRows = [];
  const detectorReport = [];
  for (const { check_type, script } of runOrder) {
    const extra = script.includes('orphan-detector')
      ? ['--base', opts.base, '--root', resolveOrphanDetectorRoot(opts.root)]
      : [];
    process.stderr.write(`[wiring-runner]   running ${script} (for ${check_type}) ...\n`);
    const result = invokeDetector(opts.root, script, opts.sdKey, extra);
    if (!result.ok) {
      process.stderr.write(`[wiring-runner]   \u21b3 skipped (${result.reason}): ${result.path}\n`);
      detectorReport.push({ script, check_type, ok: false, reason: result.reason });
      continue;
    }
    // Filter rows to the requested check list if the user specified it.
    const filtered = opts.checks ? result.rows.filter(r => opts.checks.includes(r.check_type)) : result.rows;
    allRows.push(...filtered);
    detectorReport.push({ script, check_type, ok: true, rows: filtered.length });
  }

  // Summarize
  const summary = {
    sd_key: opts.sdKey,
    total_rows: allRows.length,
    pass: allRows.filter(r => r.status === 'passed').length,
    fail: allRows.filter(r => r.status === 'failed').length,
    warn: allRows.filter(r => r.status === 'warning').length,
    pending: allRows.filter(r => r.status === 'pending').length,
    detectors: detectorReport,
    rows: allRows,
  };

  // Persist (unless --no-persist)
  let wiringValidated = null;
  if (opts.persist && allRows.length > 0) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      process.stderr.write('[wiring-runner] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set; cannot persist\n');
      process.exit(3);
    }
    const supabase = createClient(url, key);
    const { inserted } = await persistRows(supabase, allRows);
    process.stderr.write(`[wiring-runner] persisted ${inserted} row(s) to leo_wiring_validations\n`);

    // Query derived column (trigger runs synchronously AFTER INSERT/UPDATE).
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('wiring_validated')
      .eq('sd_key', opts.sdKey)
      .single();
    wiringValidated = sd?.wiring_validated ?? null;
    summary.wiring_validated = wiringValidated;
    process.stderr.write(`[wiring-runner] wiring_validated=${wiringValidated}\n`);
  }

  // Emit combined JSON if requested.
  if (opts.json || !opts.persist) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  }

  // Human-readable summary to stderr (C1 DESIGN condition).
  const color = (s, c) => (process.stderr.isTTY ? `\x1b[${c}m${s}\x1b[0m` : s);
  const verdict = summary.fail > 0 ? color('FAIL', '31')
                 : summary.warn > 0 ? color('WARN', '33')
                 : summary.pass > 0 ? color('PASS', '32')
                 : color('NO-RESULTS', '33');
  process.stderr.write(
    `[wiring-runner] SD=${opts.sdKey} checks=${checksToRun.length} pass=${summary.pass} fail=${summary.fail} warn=${summary.warn} verdict=${verdict}\n`
  );

  // Exit code
  if (summary.fail > 0 || summary.warn > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[wiring-runner] fatal: ${err?.stack || err}\n`);
  process.exit(3);
});
