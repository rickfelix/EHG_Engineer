#!/usr/bin/env node
/**
 * Triage manifest builder for SD-MAN-INFRA-TRIAGE-377-PRE-001.
 *
 * Reads docs/triage/raw-test-output.log (vitest run output), groups failures
 * by test file, identifies primary error pattern, assigns 3-bucket classification
 * per LEAD-locked rules in metadata.scope_amendment.locked_scope, and emits:
 *   - docs/triage/SD-MAN-INFRA-TRIAGE-377-PRE-001-manifest.json
 *   - docs/triage/SD-MAN-INFRA-TRIAGE-377-PRE-001-bucket-2-qfs.json
 *   - docs/triage/SD-MAN-INFRA-TRIAGE-377-PRE-001-bucket-3-candidates.json
 *
 * Heuristic bucket rules (codified from PRD FR-1/2/3):
 *  - Bucket 1 (delete-as-stale): "No test suite found in file" structural-broken cases.
 *  - Bucket 2 (inline Tier-1 QF): single-defect cascades — logger.warn, supabase.rpc
 *    mock incomplete, null-guard misses, and assertion-drift counts <= 5 per file.
 *  - Bucket 3 (child SD): >30 LOC scope or risk keywords (schema, auth, migration)
 *    OR file failing-tests count > 8.
 *
 * Bucket 3 cap: <=40% of files. If exceeded, the script raises a warning (PRD TS-4).
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const RAW = path.join(ROOT, 'docs/triage/raw-test-output.log');
const OUT_DIR = path.join(ROOT, 'docs/triage');
const SD_KEY = 'SD-MAN-INFRA-TRIAGE-377-PRE-001';

if (!fs.existsSync(RAW)) {
  console.error(`Missing input: ${RAW}`);
  process.exit(1);
}

const raw = fs.readFileSync(RAW, 'utf8');
const lines = raw.split(/\r?\n/);

// Step 1 — collect failing test file paths.
const failFileSet = new Set();
for (const line of lines) {
  const m = line.match(/^\s*FAIL\s+(tests\/[^\s]+\.test\.[jt]sx?)/);
  if (m) failFileSet.add(m[1]);
}
const failFiles = Array.from(failFileSet).sort();

// Step 2 — for each failing file, capture context around every mention of its path in the log.
// vitest's most informative error text appears in the bottom "Failed Suites"/"Failed Tests"
// sections, attributed by ` ❯ tests/.../foo.test.js:N:M` markers. The error message is on
// preceding lines. Capture ±25 lines around any mention of the test file path.
const fileSections = new Map();
for (const file of failFiles) fileSections.set(file, []);

const CONTEXT_RADIUS = 30;
for (let i = 0; i < lines.length; i++) {
  for (const file of failFiles) {
    if (lines[i].includes(file)) {
      const start = Math.max(0, i - CONTEXT_RADIUS);
      const end = Math.min(lines.length, i + CONTEXT_RADIUS);
      const slice = lines.slice(start, end);
      fileSections.get(file).push(...slice);
    }
  }
}
// dedupe to keep memory bounded; preserve first occurrence
for (const [file, body] of fileSections) {
  fileSections.set(file, Array.from(new Set(body)));
}

// Step 3 — also scan the bottom-of-file "Failed Tests <N>" / "Failed Suites <N>" sections,
// which often hold the cleanest error snippets keyed by test file path.
// (vitest emits these after the live FAIL block.)
const PATTERNS = [
  { id: 'no_test_suite_found', regex: /No test suite found in file/, family: 'structural_broken', bucket: 1 },
  { id: 'logger_warn_not_function', regex: /logger\.warn is not a function/, family: 'logger_missing_method', bucket: 2 },
  { id: 'supabase_rpc_not_function', regex: /supabase\.rpc is not a function/, family: 'mock_incomplete', bucket: 2 },
  { id: 'cannot_read_trend', regex: /Cannot read properties of undefined \(reading 'trend'\)/, family: 'null_guard_missing', bucket: 2 },
  { id: 'phase_column_drift', regex: /Could not find the 'phase' column of 'strategic_directives_v2'/, family: 'schema_drift', bucket: 3 },
  { id: 'cannot_find_module', regex: /Cannot find module/, family: 'module_resolution', bucket: 3 },
  { id: 'gate_verdict_regression', regex: /expected 'NOT_APPLICABLE' to be 'PASS'/, family: 'gate_verdict_regression', bucket: 3 },
  { id: 'pass_to_blocked', regex: /expected 'PASS' to be 'BLOCKED'/, family: 'gate_verdict_regression', bucket: 3 },
  { id: 'workflow_status_drift', regex: /expected 'FAILED' to be 'COMPLETED'/, family: 'workflow_status_drift', bucket: 3 },
  { id: 'cannot_create_test_directive', regex: /Failed to create test directive: Could not find the/, family: 'schema_drift', bucket: 3 },
  // generic drift assertions — only these are bucket 1 if isolated, bucket 2 if cluster
  { id: 'assert_false_to_true', regex: /AssertionError: expected false to be true/, family: 'drift_boolean', bucket: 'context' },
  { id: 'assert_true_to_false', regex: /AssertionError: expected true to be false/, family: 'drift_boolean', bucket: 'context' },
  { id: 'assert_undefined_defined', regex: /AssertionError: expected undefined to be (defined|true)/, family: 'drift_undefined', bucket: 'context' },
  { id: 'assert_zero_to_n', regex: /AssertionError: expected \+?0 to be \d/, family: 'drift_counter', bucket: 'context' },
  { id: 'assert_n_to_n', regex: /AssertionError: expected \d+ to be \d+/, family: 'drift_counter', bucket: 'context' },
  { id: 'assert_throw_function', regex: /AssertionError: expected \[Function\] to throw an error/, family: 'drift_throws', bucket: 'context' }
];

function classifyFile(file, body) {
  const text = body.join('\n');
  // find all matching patterns; pick highest-priority (first match in PATTERNS order)
  const hits = [];
  for (const p of PATTERNS) {
    const matches = text.match(new RegExp(p.regex.source, 'g'));
    if (matches) hits.push({ pattern_id: p.id, family: p.family, bucket: p.bucket, count: matches.length });
  }

  // count failing test names (best-effort)
  const failingTests = (text.match(/×\s+\S+|FAIL\s+/g) || []).length;

  if (hits.length === 0) {
    // Unclassified — most common case is "test file failed but error context didn't reach
    // our parser." Default to bucket 1 (delete-as-stale; must be reviewed before deletion).
    // PRD TR-3 deadness-evidence requirement still applies before any actual deletion.
    return {
      file,
      failing_tests: failingTests,
      primary_error_pattern: 'unknown',
      family: 'unclassified',
      bucket: 1,
      bucket_rationale: 'No recognized error pattern in captured context. Default to bucket 1 (delete-as-stale) pending TR-3 deadness verification. Reviewer must confirm the test target is gone or the test is genuinely stale.',
      evidence: { line: 0, snippet: '' }
    };
  }

  // primary = first hit by PATTERNS order
  const primary = hits[0];

  // resolve "context" bucket: if file has only drift assertions, it is bucket 1 (delete-as-stale)
  // unless count > 5, in which case bucket 2 (mass-update inline). This is a heuristic.
  let bucket = primary.bucket;
  let bucket_rationale = '';
  if (bucket === 'context') {
    const totalDrift = hits.filter(h => h.family.startsWith('drift_')).reduce((s, h) => s + h.count, 0);
    if (totalDrift <= 5) {
      bucket = 1;
      bucket_rationale = `Drift-only assertions (${totalDrift} total). Default to delete-as-stale; require deadness verification before commit.`;
    } else {
      bucket = 2;
      bucket_rationale = `Drift-cluster (${totalDrift} assertions). Bulk-update inline as Tier-1 QF if surface is small enough.`;
    }
  } else if (bucket === 1) {
    bucket_rationale = 'Structural break — file cannot be loaded by vitest. Delete unless feature is alive.';
  } else if (bucket === 2) {
    bucket_rationale = `Single-defect family ${primary.family} (${primary.count} hits). Tier-1 QF candidate.`;
  } else if (bucket === 3) {
    bucket_rationale = `Risk family ${primary.family} (${primary.count} hits). >30 LOC or risk keyword likely; deferred to child SD.`;
  }

  // Hard upgrade rule: only upgrade to bucket 3 when the family is genuinely architectural.
  // The earlier rule fired on incidental "schema|auth|migration" text references in test
  // bodies, over-classifying as bucket 3. Tighten to: family-driven OR very large failure set.
  const RISK_FAMILIES = ['schema_drift', 'gate_verdict_regression', 'workflow_status_drift', 'module_resolution'];
  if (RISK_FAMILIES.includes(primary.family) || failingTests > 15) {
    if (bucket !== 3) {
      bucket_rationale += ` Upgraded to bucket 3 (risk family ${primary.family} or failingTests=${failingTests}>15).`;
      bucket = 3;
    }
  }

  // evidence: first matching line (best-effort)
  let evidenceLine = 0;
  let evidenceSnippet = '';
  const primaryRegex = PATTERNS.find(p => p.id === primary.pattern_id).regex;
  for (let i = 0; i < body.length; i++) {
    if (primaryRegex.test(body[i])) {
      evidenceLine = i;
      evidenceSnippet = body[i].slice(0, 160).trim();
      break;
    }
  }

  return {
    file,
    failing_tests: failingTests,
    primary_error_pattern: primary.pattern_id,
    family: primary.family,
    bucket,
    bucket_rationale,
    evidence: { line: evidenceLine, snippet: evidenceSnippet },
    all_hits: hits
  };
}

const records = failFiles.map(f => classifyFile(f, fileSections.get(f) || []));

const buckets = { 1: [], 2: [], 3: [] };
for (const r of records) buckets[r.bucket].push(r);

const totalFiles = records.length;
const cap40 = Math.floor(totalFiles * 0.4);
const bucket3Share = buckets[3].length / totalFiles;

if (buckets[3].length > cap40) {
  console.warn(`⚠️  Bucket 3 cap exceeded: ${buckets[3].length}/${totalFiles} (${(bucket3Share * 100).toFixed(1)}%). LEAD scope cap is <=40%.`);
}

const manifest = {
  sd_key: SD_KEY,
  generated_at: new Date().toISOString(),
  source: 'docs/triage/raw-test-output.log',
  totals: {
    failing_files: totalFiles,
    bucket_1_delete_as_stale: buckets[1].length,
    bucket_2_inline_qf: buckets[2].length,
    bucket_3_child_sd: buckets[3].length,
    bucket_3_share_pct: +(bucket3Share * 100).toFixed(1),
    bucket_3_cap_pct: 40,
    cap_breach: buckets[3].length > cap40
  },
  files: records
};

const bucket2Qfs = buckets[2].map(r => ({
  qf_brief: {
    title: `Fix ${r.family} in ${path.basename(r.file)}`,
    type: 'bug',
    severity: 'low',
    target_application: 'EHG_Engineer',
    estimated_loc: r.family === 'logger_missing_method' ? 1 : (r.family === 'mock_incomplete' ? 5 : 10),
    description: `Pattern ${r.primary_error_pattern} (${r.family}) in ${r.file}. Bucket 2 — inline Tier-1 QF per PRD FR-2.`
  },
  source: r
}));

const bucket3Candidates = buckets[3].map(r => ({
  candidate_sd: {
    suggested_title: `Fix ${r.family} class — ${path.basename(r.file)}`,
    type: r.family === 'schema_drift' ? 'database' : (r.family === 'gate_verdict_regression' ? 'feature' : 'bugfix'),
    target_application: 'EHG_Engineer',
    risk_keywords: r.family === 'schema_drift' ? ['schema', 'migration'] : (r.family === 'gate_verdict_regression' ? ['gate', 'design'] : []),
    rationale: r.bucket_rationale
  },
  source: r
}));

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

fs.writeFileSync(path.join(OUT_DIR, `${SD_KEY}-manifest.json`), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(OUT_DIR, `${SD_KEY}-bucket-2-qfs.json`), JSON.stringify(bucket2Qfs, null, 2));
fs.writeFileSync(path.join(OUT_DIR, `${SD_KEY}-bucket-3-candidates.json`), JSON.stringify(bucket3Candidates, null, 2));

console.log('=== Manifest summary ===');
console.log(`Total failing files:      ${totalFiles}`);
console.log(`Bucket 1 (delete-stale):  ${buckets[1].length} (${((buckets[1].length / totalFiles) * 100).toFixed(1)}%)`);
console.log(`Bucket 2 (inline QF):     ${buckets[2].length} (${((buckets[2].length / totalFiles) * 100).toFixed(1)}%)`);
console.log(`Bucket 3 (child SD):      ${buckets[3].length} (${((buckets[3].length / totalFiles) * 100).toFixed(1)}%)  cap=${cap40}`);
console.log('');
console.log('=== Family distribution ===');
const familyCount = {};
for (const r of records) familyCount[r.family] = (familyCount[r.family] || 0) + 1;
for (const [fam, n] of Object.entries(familyCount).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${fam.padEnd(28)} ${n}`);
}
console.log('');
console.log('Outputs:');
console.log(`  ${path.relative(ROOT, path.join(OUT_DIR, SD_KEY + '-manifest.json'))}`);
console.log(`  ${path.relative(ROOT, path.join(OUT_DIR, SD_KEY + '-bucket-2-qfs.json'))}`);
console.log(`  ${path.relative(ROOT, path.join(OUT_DIR, SD_KEY + '-bucket-3-candidates.json'))}`);
