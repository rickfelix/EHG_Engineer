#!/usr/bin/env node
/**
 * e2e-demo-recorder — 5th detector of the LEO Wiring Verification Framework.
 *
 * SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-E (FR-1, FR-3, FR-4, FR-6)
 *
 * Loads an SD's smoke_test_steps from strategic_directives_v2, executes each
 * step via the appropriate executor (shell/sql/http), matches actual stdout
 * against expected_outcome via heuristic matchers, emits a JSON envelope on
 * stdout. The envelope shape conforms to scripts/wiring-validators/lib/envelope-schema.js
 * and is consumed by sibling D's wiring-validation-runner.js.
 *
 * Usage:
 *   node scripts/wiring-validators/e2e-demo-recorder.js <sd_key> [options]
 *
 * Options:
 *   --target-env={dev|test|prod}  Default: dev. Production requires --confirm-prod.
 *   --confirm-prod                Required when --target-env=prod. Writes audit_log row.
 *   --fixture <path>              Run against a fixture JSON file instead of querying DB.
 *   --help                        Show this help.
 *
 * Environment:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  Required for DB-backed runs
 *   STEP_TIMEOUT_MS                          Per-step timeout (default 60000)
 *   DEBUG_E2E_DEMO=1                         Verbose stderr logging
 *
 * Exit codes:
 *   0  All steps passed
 *   1  At least one step failed
 *   2  Skipped (no smoke_test_steps declared)
 *   3  Configuration error (missing flags, bad env, SD not found)
 *
 * Output: JSON envelope on stdout, conforming to envelope-schema.js
 */

import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { matchStep } from './lib/step-matchers.js';
import { executeStep } from './lib/step-executors.js';
import { ENVELOPE_SCHEMA_VERSION, parseEnvelope } from './lib/envelope-schema.js';

const STDOUT_TRUNCATE = 4096;
const STDERR_TRUNCATE = 2048;

function parseArgs(argv) {
  const args = { sd_key: null, target_env: 'dev', confirm_prod: false, fixture: null, help: false };
  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--confirm-prod') args.confirm_prod = true;
    else if (a.startsWith('--target-env=')) args.target_env = a.split('=')[1];
    else if (a === '--target-env') args.target_env = argv[++i];
    else if (a === '--fixture') args.fixture = argv[++i];
    else if (a.startsWith('--')) {
      throw new Error(`Unknown flag: ${a}`);
    }
    else positional.push(a);
  }
  if (positional.length > 0) args.sd_key = positional[0];
  return args;
}

function printHelp() {
  process.stderr.write(`e2e-demo-recorder — LEO Wiring Verification Framework detector

Usage:
  node scripts/wiring-validators/e2e-demo-recorder.js <sd_key> [options]

Options:
  --target-env=<dev|test|prod>  Default: dev. Production requires --confirm-prod.
  --confirm-prod                Required for --target-env=prod (writes audit_log row).
  --fixture <path>              Use fixture JSON instead of DB lookup (testing).
  --help, -h                    Show this help.

Exit codes: 0=passed, 1=failed, 2=skipped, 3=config error.
`);
}

function debug(msg) {
  if (process.env.DEBUG_E2E_DEMO === '1') {
    process.stderr.write(`[debug] ${msg}\n`);
  }
}

async function loadSdSteps(sd_key, supabase) {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, sd_type, smoke_test_steps')
    .eq('sd_key', sd_key)
    .maybeSingle();
  if (error) throw new Error(`DB error loading SD ${sd_key}: ${error.message}`);
  if (!data) throw new Error(`SD not found: ${sd_key}`);
  return data;
}

async function loadFixture(path) {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw);
}

async function writeProductionAuditEntry(supabase, sd_key) {
  // Best-effort: if audit_log INSERT fails, the safety gate must abort BEFORE running steps.
  const { error } = await supabase
    .from('audit_log')
    .insert({
      action: 'e2e_demo_run_against_prod',
      severity: 'warning',
      details: {
        sd_key,
        timestamp: new Date().toISOString(),
        invoked_by: 'e2e-demo-recorder',
        node_version: process.version
      }
    });
  if (error) {
    throw new Error(`Failed to write audit_log entry for prod execution: ${error.message}`);
  }
}

function truncate(s, max) {
  if (typeof s !== 'string') return String(s ?? '');
  if (s.length <= max) return s;
  return s.slice(0, max) + '\n...[truncated]';
}

function aggregateStatus(steps) {
  if (!steps.length) return 'skipped';
  const failed = steps.some(s => s.match_result === 'failed');
  const partial = steps.some(s => s.match_result === 'partial' || s.match_result === 'skipped');
  if (failed) return 'failed';
  if (partial) return 'partial';
  return 'passed';
}

async function runDetector(args, deps) {
  const { supabase } = deps;
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();

  // Load smoke_test_steps from fixture or DB
  let sd;
  if (args.fixture) {
    sd = await loadFixture(args.fixture);
  } else {
    sd = await loadSdSteps(args.sd_key, supabase);
  }

  const steps = Array.isArray(sd.smoke_test_steps) ? sd.smoke_test_steps : [];
  if (steps.length === 0) {
    return {
      envelope_schema_version: ENVELOPE_SCHEMA_VERSION,
      sd_key: sd.sd_key,
      check_type: 'e2e_demo',
      status: 'skipped',
      signals_detected: [],
      evidence: {
        steps: [],
        total_duration_ms: 0,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        note: 'no_smoke_steps_declared'
      }
    };
  }

  // Execute steps sequentially
  const evidence_steps = [];
  const signals_detected = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const step_number = step.step_number ?? (i + 1);
    const instruction = step.instruction ?? '';
    const expected = step.expected_outcome ?? '';

    debug(`step ${step_number}: ${instruction.slice(0, 80)}`);

    if (!instruction) {
      evidence_steps.push({
        step_number, instruction: '', exit_code: null,
        stdout: '', stderr: 'malformed step: missing instruction',
        match_result: 'skipped', match_method: 'NONE', duration_ms: 0
      });
      signals_detected.push(step_number);
      continue;
    }

    // Execute
    const exec = await executeStep(instruction, { supabase });
    // Match
    const match = matchStep(expected, exec.stdout);
    const match_result = exec.timed_out ? 'partial' :
                         match.matched ? 'passed' : 'failed';

    if (match_result === 'failed') signals_detected.push(step_number);

    const stepEvidence = {
      step_number,
      instruction,
      exit_code: exec.exit_code,
      stdout: truncate(exec.stdout, STDOUT_TRUNCATE),
      stderr: truncate(exec.stderr, STDERR_TRUNCATE),
      match_result,
      match_method: match.method ?? 'SUBSTRING',
      duration_ms: exec.duration_ms
    };
    if (match.delta) stepEvidence.delta = match.delta;
    if (match.warnings) stepEvidence.warnings = match.warnings;
    evidence_steps.push(stepEvidence);
  }

  const total_duration_ms = Date.now() - startedAtMs;
  const completed_at = new Date().toISOString();
  const status = aggregateStatus(evidence_steps);

  return {
    envelope_schema_version: ENVELOPE_SCHEMA_VERSION,
    sd_key: sd.sd_key,
    check_type: 'e2e_demo',
    status,
    signals_detected,
    evidence: {
      steps: evidence_steps,
      total_duration_ms,
      started_at: startedAt,
      completed_at
    }
  };
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    process.stderr.write(`Argument error: ${err.message}\n`);
    printHelp();
    process.exit(3);
  }

  if (args.help) { printHelp(); process.exit(0); }

  const validation = validateArgs(args);
  if (!validation.valid) {
    process.stderr.write(`Error: ${validation.error}\n`);
    if (args.target_env === 'prod' && !args.confirm_prod) {
      process.stderr.write('  Production execution writes a row to audit_log and may trigger side effects from smoke steps.\n');
      process.stderr.write('  Add --confirm-prod to proceed, or use --target-env=dev (default) or --target-env=test.\n');
    } else {
      printHelp();
    }
    process.exit(validation.exit_code);
  }

  // Build supabase client (skipped for fixture-only runs)
  let supabase = null;
  if (!args.fixture) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      process.stderr.write('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env\n');
      process.exit(3);
    }
    supabase = createClient(url, key);
  }

  // Production audit log entry (FR-6) — must succeed BEFORE any step runs
  if (args.target_env === 'prod' && supabase) {
    try {
      await writeProductionAuditEntry(supabase, args.sd_key);
    } catch (err) {
      process.stderr.write(`Error: ${err.message}\n`);
      process.stderr.write('Aborting before any steps execute (production safety gate).\n');
      process.exit(3);
    }
  }

  // Run detector
  let envelope;
  try {
    envelope = await runDetector(args, { supabase });
  } catch (err) {
    process.stderr.write(`Detector error: ${err.message}\n`);
    if (process.env.DEBUG_E2E_DEMO === '1') process.stderr.write(err.stack + '\n');
    process.exit(3);
  }

  // Validate envelope shape before emit (catches authoring bugs)
  try {
    parseEnvelope(envelope);
  } catch (err) {
    process.stderr.write(`Envelope schema violation (BUG in detector): ${err.message}\n`);
    process.stderr.write(JSON.stringify(envelope, null, 2) + '\n');
    process.exit(3);
  }

  // Emit envelope
  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');

  process.exit(statusToExitCode(envelope.status));
}

// Run if invoked directly
if (import.meta.url.startsWith('file:') &&
    process.argv[1] &&
    import.meta.url.includes(process.argv[1].replace(/\\/g, '/'))) {
  main();
}

/**
 * Validate parsed args. Returns { valid: bool, error?: string, exit_code?: number }.
 * Pure function — testable without spawning processes.
 */
export function validateArgs(args) {
  if (args.help) return { valid: true };
  if (!args.sd_key && !args.fixture) {
    return { valid: false, error: 'sd_key positional argument is required (or use --fixture <path>)', exit_code: 3 };
  }
  if (!['dev', 'test', 'prod'].includes(args.target_env)) {
    return { valid: false, error: `--target-env must be one of dev|test|prod (got: ${args.target_env})`, exit_code: 3 };
  }
  if (args.target_env === 'prod' && !args.confirm_prod) {
    return { valid: false, error: '--target-env=prod requires --confirm-prod flag.', exit_code: 3 };
  }
  return { valid: true };
}

/**
 * Map envelope status to process exit code.
 */
export function statusToExitCode(status) {
  if (status === 'passed') return 0;
  if (status === 'skipped') return 2;
  return 1;  // failed or partial
}

// Export for testing
export { parseArgs, runDetector, aggregateStatus, truncate };
