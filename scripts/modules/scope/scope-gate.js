/**
 * Scope Gate (pre-commit) — SD-LEO-INFRA-OPUS-MODULE-SCOPE-001 (Module E of Opus 4.7).
 *
 * Blocks commits whose staged files violate the active SD's metadata.scope.
 * See archived plan: docs/plans/archived/sd-leo-infra-opus-module-scope-001-plan.md
 *
 * Exports (for tests):
 *   - loadScope(sdKey) → { mode, in_files, out_files, found, sd_key }
 *   - validateChange(scope, stagedFiles) → { passed, violations, warnings, reason }
 *   - main() → CLI entry, exits 0 (pass) or 1 (block)
 *
 * CLI usage (invoked from .husky/pre-commit):
 *   node scripts/modules/scope/scope-gate.js <SD-ID>
 *   node scripts/modules/scope/scope-gate.js            # resolves SD from git branch
 *
 * Escape hatch:
 *   SCOPE_OVERRIDE=<SD-ID> SCOPE_OVERRIDE_REASON="<ticket>" git commit ...
 *   Appends JSON-line entry to ~/.claude/scope-overrides.log.
 */

import { execSync } from 'node:child_process';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { minimatch } from 'minimatch';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_MODE = 'out_files_only';
const VALID_MODES = new Set(['strict', 'advisory', 'out_files_only']);
const OVERRIDE_LOG = join(homedir(), '.claude', 'scope-overrides.log');
const SD_ID_PATTERN = /SD-[A-Z]+(?:-[A-Z0-9]+)*-[0-9]+/;

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return null;
  }
  _supabase = createClient(url, key, { auth: { persistSession: false } });
  return _supabase;
}

function getStagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').map(l => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function getCurrentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function extractSdIdFromBranch(branch) {
  const m = String(branch || '').match(SD_ID_PATTERN);
  return m ? m[0] : null;
}

/**
 * Load scope configuration for an SD.
 * Returns { found: false } when SD or metadata.scope is absent — caller treats as "no enforcement".
 */
export async function loadScope(sdKey) {
  if (!sdKey) return { found: false, reason: 'no_sd_key' };
  const supabase = getSupabase();
  if (!supabase) return { found: false, reason: 'no_supabase_client' };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, metadata')
    .eq('sd_key', sdKey)
    .maybeSingle();

  if (error || !data) return { found: false, reason: 'sd_not_found', sd_key: sdKey };

  const raw = data.metadata?.scope;
  if (!raw || typeof raw !== 'object') {
    return { found: false, reason: 'no_scope_metadata', sd_key: sdKey };
  }

  const mode = VALID_MODES.has(raw.mode) ? raw.mode : DEFAULT_MODE;
  const in_files = Array.isArray(raw.in_files) ? raw.in_files : [];
  const out_files = Array.isArray(raw.out_files) ? raw.out_files : [];

  return { found: true, sd_key: sdKey, mode, in_files, out_files };
}

function matchesAny(file, patterns) {
  return patterns.some(p => minimatch(file, p, { dot: true, matchBase: false }));
}

/**
 * Validate staged files against a scope config.
 * Returns { passed, violations, warnings, reason }.
 * - strict: any file not in in_files is a violation
 * - advisory: files not in in_files produce warnings, never violations
 * - out_files_only: only files in out_files are violations (default)
 */
export function validateChange(scope, stagedFiles) {
  if (!scope || !scope.found) {
    return { passed: true, violations: [], warnings: [], reason: 'no_scope_enforcement' };
  }
  if (!Array.isArray(stagedFiles) || stagedFiles.length === 0) {
    return { passed: true, violations: [], warnings: [], reason: 'no_staged_files' };
  }

  const { mode, in_files, out_files } = scope;
  const violations = [];
  const warnings = [];

  // out_files block in ALL modes (explicitly forbidden).
  const outHits = stagedFiles.filter(f => matchesAny(f, out_files));
  violations.push(...outHits.map(f => ({ file: f, rule: 'out_files', pattern: out_files.find(p => minimatch(f, p, { dot: true })) })));

  if (mode === 'strict') {
    const notInScope = stagedFiles.filter(f => !outHits.includes(f) && !matchesAny(f, in_files));
    violations.push(...notInScope.map(f => ({ file: f, rule: 'not_in_files' })));
  } else if (mode === 'advisory') {
    const notInScope = stagedFiles.filter(f => !matchesAny(f, in_files));
    warnings.push(...notInScope.map(f => ({ file: f, rule: 'advisory_not_in_files' })));
  }
  // out_files_only: only out_files violations count; in_files not enforced.

  return {
    passed: violations.length === 0,
    violations,
    warnings,
    reason: violations.length === 0 ? `pass_${mode}` : `violation_${mode}`,
  };
}

function ensureOverrideLog() {
  const dir = dirname(OVERRIDE_LOG);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function logOverride(entry) {
  try {
    ensureOverrideLog();
    appendFileSync(OVERRIDE_LOG, JSON.stringify(entry) + '\n', 'utf8');
    return true;
  } catch (e) {
    process.stderr.write(`[scope-gate] WARN: failed to append override log: ${e.message}\n`);
    return false;
  }
}

function printViolationMessage(sdKey, scope, result) {
  const lines = [];
  lines.push('');
  lines.push('❌ Scope Gate BLOCKED commit');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push(`   Active SD: ${sdKey}`);
  lines.push(`   Mode: ${scope.mode}`);
  lines.push(`   Violations: ${result.violations.length}`);
  for (const v of result.violations.slice(0, 25)) {
    lines.push(`     • ${v.file}  [${v.rule}${v.pattern ? ` ← ${v.pattern}` : ''}]`);
  }
  if (result.violations.length > 25) {
    lines.push(`     ... and ${result.violations.length - 25} more`);
  }
  lines.push('');
  lines.push('   REMEDIATION:');
  lines.push(`     • Unstage the violating files (they are outside the SD's scope)`);
  lines.push(`     • Add them to metadata.scope.in_files if they are in-scope but missing`);
  lines.push(`     • File a follow-up SD/QF for adjacent work`);
  lines.push('');
  lines.push('   ESCAPE HATCH (audited):');
  lines.push(`     SCOPE_OVERRIDE=${sdKey} SCOPE_OVERRIDE_REASON="<ticket>" git commit ...`);
  lines.push(`     Audit log: ${OVERRIDE_LOG}`);
  lines.push('');
  process.stderr.write(lines.join('\n') + '\n');
}

function printAdvisory(sdKey, scope, result) {
  if (!result.warnings || result.warnings.length === 0) return;
  const lines = [];
  lines.push(`⚠️  Scope Gate ADVISORY (mode=${scope.mode}, SD=${sdKey}):`);
  for (const w of result.warnings.slice(0, 10)) {
    lines.push(`     • ${w.file}  [${w.rule}]`);
  }
  if (result.warnings.length > 10) {
    lines.push(`     ... and ${result.warnings.length - 10} more`);
  }
  process.stderr.write(lines.join('\n') + '\n');
}

/**
 * Main entry — used by CLI and pre-commit hook.
 * Returns exit code (0 pass, 1 block).
 */
export async function main(argv = process.argv.slice(2)) {
  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    return 0;
  }

  // Resolve SD: CLI arg → SCOPE_OVERRIDE → branch → give up silently.
  const branch = getCurrentBranch();
  const argSd = argv.find(a => SD_ID_PATTERN.test(a));
  const overrideSd = process.env.SCOPE_OVERRIDE && process.env.SCOPE_OVERRIDE.match(SD_ID_PATTERN)?.[0];
  const branchSd = extractSdIdFromBranch(branch);
  const sdKey = argSd || overrideSd || branchSd;

  if (!sdKey) {
    // Non-SD branches (docs/, reports/, main) get no enforcement.
    return 0;
  }

  const scope = await loadScope(sdKey);

  // No scope metadata on this SD → silent pass (opt-in per SD).
  if (!scope.found) {
    return 0;
  }

  const result = validateChange(scope, stagedFiles);

  // Override flow: even if violations exist, allow + audit when SCOPE_OVERRIDE matches.
  if (!result.passed && process.env.SCOPE_OVERRIDE) {
    const overrideMatches = process.env.SCOPE_OVERRIDE.includes(sdKey) || sdKey.includes(process.env.SCOPE_OVERRIDE);
    if (overrideMatches) {
      const reason = (process.env.SCOPE_OVERRIDE_REASON || '').trim();
      const entry = {
        timestamp: new Date().toISOString(),
        sd_key: sdKey,
        mode: scope.mode,
        violations: result.violations,
        staged_files: stagedFiles,
        reason: reason || null,
        reason_present: reason.length > 0,
        branch,
      };
      logOverride(entry);
      process.stderr.write(`⚠️  Scope Gate OVERRIDE applied for ${sdKey} (reason: ${reason || '<MISSING — flagged for /learn review>'})\n`);
      return 0;
    }
  }

  if (!result.passed) {
    printViolationMessage(sdKey, scope, result);
    return 1;
  }

  printAdvisory(sdKey, scope, result);
  return 0;
}

// CLI entry
const isDirectRun = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('scope-gate.js');
if (isDirectRun) {
  main().then(code => process.exit(code)).catch(err => {
    process.stderr.write(`[scope-gate] ERROR: ${err.message}\n`);
    // Fail-open on unexpected errors — do not block commits on bugs in the gate itself.
    process.exit(0);
  });
}
