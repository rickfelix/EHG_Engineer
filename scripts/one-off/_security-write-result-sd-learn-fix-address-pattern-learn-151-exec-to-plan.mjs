#!/usr/bin/env node
/**
 * Persist SECURITY evidence for SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151's EXEC-TO-PLAN handoff.
 *
 * The review itself was performed by the SECURITY sub-agent (Task tool) in the worktree
 * .worktrees/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151: a full read of every file the SD will
 * commit, a dangerous-construct scan, a DB write-surface enumeration, a credential-handling
 * check, and an INDEPENDENT re-run of the repo's own secret patterns over the reviewed
 * content (not a reliance on the hook or CI being green).
 *
 * Gate-evidence provenance (chairman ratification 6c263823): the secret-scan result stored on
 * this row is NOT hand-typed, and the patterns behind it are NOT copied into this file. They
 * are PARSED OUT OF .husky/pre-commit AT WRITE TIME, so the row re-derives its own number from
 * the same array the enforcing hook uses. Two consequences worth stating:
 *
 *   1. If the hook's pattern set changes, this script scans with the NEW set automatically --
 *      a copied-constant version would silently keep attesting against a stale set.
 *   2. It structurally avoids the self-referential false-positive class that bit the sibling SD
 *      (SD-LEARN-FIX-ADDRESS-PAT-LES-013), where a SECURITY evidence writer re-declared the
 *      connection-string DETECTION regex as a plain string constant and the scanner then matched
 *      that detection code as though it were a live credential. This file contains no literal
 *      credential-shaped regex at all, so there is nothing for the hook to match; the sibling's
 *      string-splitting workaround is unnecessary here.
 *
 * The hook itself scans only the ADDED lines of staged content. Every path this SD contributes
 * is a wholly new file, so "added lines" and "entire file content" are the same set -- scanning
 * full file bodies here is equivalent to, and no weaker than, what the hook will do at commit.
 *
 * Reproduce:  node scripts/one-off/_security-write-result-sd-learn-fix-address-pattern-learn-151-exec-to-plan.mjs
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151';
const HOOK_PATH = '.husky/pre-commit';
const DELIVERABLE = 'tests/unit/handoff/validation/validator-registry/gate-l-sd-creation.test.js';

/**
 * Parse the enforcing hook's detection-pattern array out of .husky/pre-commit.
 *
 * The array is a bash array of single-quoted ERE strings. Two dialect notes: the hook writes an
 * embedded single quote as the octal escape \047 (so the bash single-quoting never has to be
 * broken), which is normalised back to a quote character here; and the hook greps
 * case-insensitively, which is mirrored via the 'i' flag. Everything else in the set (\s, \b,
 * bounded repetition, negated classes) is common to ERE and JS RegExp.
 */
function loadHookPatterns() {
  const lines = readFileSync(HOOK_PATH, 'utf8').split(/\r?\n/);
  const start = lines.findIndex(l => /^\s*SECRET_PATTERNS=\(/.test(l));
  if (start === -1) throw new Error(`Could not locate the detection-pattern array in ${HOOK_PATH}`);

  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\)\s*$/.test(line)) break;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const first = trimmed.indexOf("'");
    const last = trimmed.lastIndexOf("'");
    if (first === -1 || last <= first) continue;
    const source = trimmed.slice(first + 1, last).replace(/\\047/g, "'");
    out.push({ source, regex: new RegExp(source, 'i') });
  }
  if (out.length === 0) throw new Error(`Parsed zero detection patterns from ${HOOK_PATH}`);
  return out;
}

/** Every path this SD will commit, taken from git rather than from a hand-maintained list. */
function listReviewedFiles() {
  const porcelain = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    encoding: 'utf8',
  });
  return porcelain
    .split(/\r?\n/)
    .filter(Boolean)
    .map(l => l.slice(3).trim())
    .filter(Boolean)
    .sort();
}

/** Re-derive the scan at write time so the row points at a measurement, not at a claim. */
function scanReviewedFiles(patterns, files) {
  const hits = [];
  const hashes = {};
  for (const file of files) {
    let content;
    try {
      content = readFileSync(file);
    } catch {
      continue; // deleted path listed by porcelain; nothing to scan
    }
    hashes[file] = createHash('sha256').update(content).digest('hex');
    const text = content.toString('utf8');
    for (const { source, regex } of patterns) {
      if (regex.test(text)) hits.push({ file, pattern: source.slice(0, 30) });
    }
  }
  return { hits, hashes };
}

const summary = 'PASS -- no security findings. This SD is test-only plus DB-admin one-offs; it ' +
  'changes no production code path, adds no route, no handler, no auth surface and no schema. ' +
  '(1) SECRET SCAN RE-DERIVED, NOT RESTATED: the repo\'s own detection patterns were parsed out ' +
  'of ' + HOOK_PATH + ' at write time and re-applied here to the full body of every file the SD ' +
  'commits -- 0 matches. Because every contributed path is a NEW file, the hook\'s added-lines ' +
  'scope and full-file scope coincide, so this is equivalent to the commit-time check rather ' +
  'than a weaker proxy. The per-file sha256 of exactly what was scanned is stored on this row. ' +
  '(2) NO HARDCODED CREDENTIALS: every credential reference in the diff is an environment read ' +
  '(process.env.NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) via the ' +
  'standard createClient or getSupabaseClient path already used repo-wide. No URL, key, token, ' +
  'connection string or private key appears as a literal anywhere in the diff; a supplementary ' +
  'sweep for JWT, sk-, ghp_/gho_/github_pat_, xoxb-, AKIA and Bearer token shapes also returned ' +
  'zero. (3) NO INJECTION VECTOR: all DB access goes through the supabase-js query builder with ' +
  'parameter binding (.eq/.update/.select) keyed on module-level constants; there is no string- ' +
  'concatenated SQL, no .rpc() with caller-shaped input, and no user-supplied value reaching a ' +
  'query at all -- these scripts take no argv, no stdin and no network input. (4) NO UNSAFE ' +
  'EXECUTION: zero eval, zero new Function, zero dangerouslySetInnerHTML across the diff. The ' +
  'one child_process use is in THIS evidence writer, via execFileSync with an argument array ' +
  '(no shell interpolation) on a fixed git subcommand -- reviewed and accepted, not a vector. ' +
  '(5) DELIVERABLE IS INERT: ' + DELIVERABLE + ' is a pure vitest unit test over an in-process ' +
  'scoring function -- no network, no filesystem write, no credential, no fixture containing ' +
  'realistic-looking secrets. (6) WRITE SURFACE BOUNDED AND REVIEWED: the service-role scripts ' +
  'write only to strategic_directives_v2 and issue_patterns, each row-scoped by .eq on an ' +
  'explicit sd_key or pattern_id, and every one is isMainModule-guarded so importing the module ' +
  'executes nothing. The metadata updates read-merge-write rather than replacing the blob, which ' +
  'is the correct handling of the destructive-overwrite class. BLAST RADIUS: zero at runtime.';

async function main() {
  const patterns = loadHookPatterns();
  const files = listReviewedFiles();
  const { hits, hashes } = scanReviewedFiles(patterns, files);

  if (hits.length > 0) {
    console.error('REFUSING to write PASS: the re-derived scan matched in the reviewed set:');
    for (const h of hits) console.error(`  ${h.file} <- pattern starting ${h.pattern}...`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error('REFUSING to write PASS: the reviewed file set is empty -- nothing was scanned.');
    process.exit(1);
  }

  const supabase = await getSupabaseClient();

  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 96,
    findings: [
      {
        id: 'S1-secret-scan-clean-patterns-derived-from-the-enforcing-hook',
        severity: 'INFO',
        summary: `Re-ran the repo's own detection patterns over every file the SD commits: 0 matches across ${files.length} files. The ${patterns.length} patterns were parsed out of ${HOOK_PATH} at write time rather than copied into the evidence script, so the check tracks the enforcing hook's current set and cannot drift from it. Per-file sha256 of the scanned content is recorded in metadata.reviewed_file_hashes.`,
      },
      {
        id: 'S2-no-hardcoded-credentials',
        severity: 'INFO',
        summary: 'Every credential reference is an environment read (process.env.NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) through createClient or the shared getSupabaseClient helper. No literal URL, key, token, connection string or private key anywhere in the diff. A supplementary sweep for JWT, sk-, ghp_/gho_/github_pat_, xoxb-, AKIA and Bearer shapes returned zero.',
      },
      {
        id: 'S3-no-injection-vector',
        severity: 'INFO',
        summary: 'All DB access uses the supabase-js query builder with bound parameters (.eq/.update/.select) keyed on module-level constants. No string-concatenated SQL, no .rpc() carrying caller-shaped input, and no external input reaches a query: the scripts accept no argv, no stdin and no network input.',
      },
      {
        id: 'S4-no-unsafe-execution',
        severity: 'INFO',
        summary: 'Zero eval, zero new Function, zero dangerouslySetInnerHTML in the diff. The single child_process use is in this evidence writer: execFileSync with an argument array (no shell) on a fixed git subcommand, reading only repo state. Reviewed and accepted.',
      },
      {
        id: 'S5-deliverable-is-inert',
        severity: 'INFO',
        summary: `${DELIVERABLE} is a pure in-process vitest unit test over a scoring function. No network, no filesystem write, no credential use, and no fixture containing realistic-looking secret material that could later be mistaken for a live key.`,
      },
      {
        id: 'S6-service-role-write-surface-bounded',
        severity: 'INFO',
        summary: 'The service-role one-offs write only to strategic_directives_v2 and issue_patterns, every statement row-scoped by .eq on an explicit sd_key or pattern_id. All are isMainModule-guarded, so importing the module performs no write. Metadata updates read-merge-write instead of replacing the blob, correctly avoiding the destructive-overwrite class.',
      },
    ],
    warnings: [
      'Low-severity, pre-existing convention (NOT introduced by this SD, no action required): the vitest JSON reports under .artifacts/testing/ embed absolute developer paths under C:/Users/<user>/, and the evidence scripts record the same worktree path in detailed_analysis.worktree. This discloses a local OS username only -- no credential. Already-committed reports in .artifacts/testing/ carry identical paths, so this is the established repo shape rather than a new leak.',
    ],
    recommendations: [
      'Accept the EXEC-TO-PLAN handoff from a security standpoint. Test-only deliverable, zero production code changed, zero secrets, zero injection or unsafe-execution vectors.',
      'Prefer deriving detection patterns from .husky/pre-commit at run time (as this script does) over copying them into evidence writers. It keeps the check current with the hook and structurally avoids the self-referential false positive where a writer re-declaring a credential-shaped detection regex is itself flagged as containing a credential.',
    ],
    summary,
    justification: summary,
    critical_issues: [],
    metadata: {
      review_type: 'EXEC_TO_PLAN_SECURITY',
      review_method:
        'full read of every file in the commit set, plus an independent secret scan whose patterns are parsed out of .husky/pre-commit at write time and applied to full file bodies (equivalent to the hook\'s added-lines scope because every contributed path is a new file), plus dangerous-construct, credential-handling and DB write-surface analysis',
      measured: true,
      secret_scan: {
        pattern_source: HOOK_PATH,
        pattern_source_sha256: createHash('sha256').update(readFileSync(HOOK_PATH)).digest('hex'),
        patterns_applied: patterns.length,
        patterns_hardcoded_in_this_script: 0,
        files_scanned: files.length,
        matches: 0,
        scope_note:
          'Full file bodies scanned. Every contributed path is a new file, so the hook\'s added-lines scope and full-file scope are the same set.',
      },
      reviewed_files: files,
      reviewed_file_hashes: hashes,
      hardcoded_credentials_found: 0,
      injection_vectors_found: 0,
      unsafe_eval_found: 0,
      unvalidated_external_input_found: 0,
      external_input_surfaces: 'none (no argv, no stdin, no network input, no HTTP handler)',
      production_code_paths_changed: 0,
      auth_surface_changed: false,
      schema_or_rls_changed: false,
      db_write_surface: {
        tables: ['strategic_directives_v2', 'issue_patterns'],
        scoping: 'row-scoped via .eq on explicit sd_key / pattern_id constants',
        client: 'supabase-js query builder (bound parameters, no raw SQL)',
        guarded: 'all one-offs are isMainModule-guarded',
      },
      model: 'Opus 5 (1M context)',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151',
      branch: 'feat/SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151',
      deliverable: DELIVERABLE,
    },
    phase: 'EXEC_TO_PLAN',
    validation_mode: 'retrospective',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'SECURITY',
    SD_KEY,
    { name: 'Chief Security Architect (SECURITY)' },
    results,
    { sdKey: SD_KEY, phase: 'EXEC_TO_PLAN' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  secret_scan:', JSON.stringify(stored.metadata?.secret_scan));
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
