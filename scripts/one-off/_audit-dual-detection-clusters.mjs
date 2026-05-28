#!/usr/bin/env node
/**
 * Audit dual-detection clusters across EHG_Engineer production code
 * SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001 FR-1
 *
 * READ-ONLY. Hard-asserts no DB writes by refusing to run when SUPABASE_SERVICE_ROLE_KEY is set.
 *
 * Three clusters enumerated:
 *   A - SD-type detection (sd_type column, metadata.is_* flags, sd_key prefix, LEGITIMATE_NO_VENTURE_SD_TYPES)
 *   B - Claim ownership detection (claiming_session_id, active_session_id, is_working_on, is_alive)
 *   C - Gate-skip detection (gate.condition, context.skipGate, metadata.skip_*)
 *
 * Output:
 *   .audit-out/dual-detection-clusters.json — JSON intermediate (gitignored)
 *   docs/audits/sd-leo-infra-consolidate-dual-detection-001-audit.md — markdown deliverable
 *
 * Determinism: output is sorted alphabetical-path then ascending-line. Two runs on the same
 * tree produce byte-identical files (TR-2).
 *
 * Portability: uses `git ls-files` + native JS regex scanning. No external grep/rg dependency.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// TR-1: read-only assertion. Audit must never run with service-role credentials.
if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('REFUSED: audit script must run without SUPABASE_SERVICE_ROLE_KEY (read-only enforcement per TR-1).');
  console.error('Unset the env var before running, e.g.:  unset SUPABASE_SERVICE_ROLE_KEY && node scripts/one-off/_audit-dual-detection-clusters.mjs');
  process.exit(2);
}

const CLUSTER_PATTERNS = {
  A: [
    { id: 'A.1', description: 'sd_type direct comparison (e.g. sd.sd_type === "orchestrator")', pattern: /\bsd\.sd_type\s*===?\s*["']/ },
    { id: 'A.2', description: 'destructured sd_type comparison ({ sd_type } === "...")', pattern: /\bsd_type\s*===?\s*["'](?:orchestrator|venture|infrastructure|feature|fix|documentation)/ },
    { id: 'A.3', description: 'metadata.is_parent boolean read', pattern: /metadata\?\.is_parent\s*===?\s*true/ },
    { id: 'A.4', description: 'metadata.is_orchestrator boolean read', pattern: /metadata\?\.is_orchestrator\s*===?\s*true/ },
    { id: 'A.5', description: 'metadata.is_venture boolean read', pattern: /metadata\?\.is_venture\s*===?\s*true/ },
    { id: 'A.6', description: 'sd_key prefix check (startsWith SD-LEO/SD-FDBK/etc.)', pattern: /\.startsWith\(["']SD-(?:LEO|FDBK|VENTURE|QF|CRONGENIUS|LEARN|MAN|CANVAS)/ },
    { id: 'A.7', description: 'LEGITIMATE_NO_VENTURE_SD_TYPES usage', pattern: /\bLEGITIMATE_NO_VENTURE_SD_TYPES\b/ },
    { id: 'A.8', description: 'category check (sd.category === "...")', pattern: /\bsd\.category\s*===?\s*["']/ },
  ],
  B: [
    // Cluster B patterns are READ-FOR-DECISION only. Writes (.update({...}), .insert({...})) and SQL
    // SELECT column lists are out of scope for the ownership-detection helper (which only ANSWERS
    // "who holds this SD?", it doesn't SET the holder). Writes need their own consolidation, but
    // that's a separate SD — out of scope per the brief's framing of Cluster B as "detection."
    { id: 'B.1', description: 'claiming_session_id property read (sd.X, data.X, etc.)', pattern: /(?<!')\b(?:sd|data|row|session|claim|holder)\.claiming_session_id\b/ },
    { id: 'B.1b', description: 'claiming_session_id supabase .eq() filter (read-intent query)', pattern: /\.eq\(\s*["']claiming_session_id["']/ },
    { id: 'B.2', description: 'active_session_id property read', pattern: /(?<!')\b(?:sd|data|row|session|claim|holder)\.active_session_id\b/ },
    { id: 'B.2b', description: 'active_session_id supabase .eq() filter (read-intent query)', pattern: /\.eq\(\s*["']active_session_id["']/ },
    { id: 'B.3', description: 'is_working_on property read', pattern: /(?<!')\b(?:sd|data|row|session|claim|holder)\.is_working_on\b/ },
    { id: 'B.3b', description: 'is_working_on supabase .eq() filter', pattern: /\.eq\(\s*["']is_working_on["']/ },
    { id: 'B.4', description: 'is_alive property read', pattern: /(?<!')\b(?:sd|data|row|session|claim|holder)\.is_alive\b/ },
    { id: 'B.5', description: 'CLAIM_HOLDING_STATUSES import or use', pattern: /\bCLAIM_HOLDING_STATUSES\b/ },
    { id: 'B.6', description: 'has_uncommitted_changes property read', pattern: /(?<!')\b(?:sd|data|row|session|claim|holder)\.has_uncommitted_changes\b/ },
  ],
  C: [
    { id: 'C.1', description: 'gate.condition or shouldSkip pattern', pattern: /\b(?:gate\.condition|shouldSkipGate|shouldSkipFor[A-Z])/ },
    { id: 'C.2', description: 'metadata.skip_* flag read', pattern: /metadata\?\.skip_[a-z_]+/ },
    { id: 'C.3', description: 'context.skipGate explicit injection', pattern: /\bcontext\.skipGate\b/ },
    { id: 'C.4', description: 'SD-type-gated gate skip (e.g. sd_type !== "orchestrator" return)', pattern: /if\s*\(\s*sd\.sd_type\s*!==?\s*["']/ },
  ],
};

const EXCLUDE_PATH_PREFIXES = [
  'tests/',
  'test/',
  'scripts/archive/',
  '.prd-payloads/',
  '.rca/',
  '.audit-out/',
  'docs/audits/',
  'node_modules/',
  '.worktrees/',
  'dist/',
  'build/',
];

const EXCLUDE_FILE_SUFFIXES = [
  '.test.js',
  '.test.mjs',
  '.test.cjs',
  '.spec.js',
  '.spec.mjs',
  '.spec.cjs',
];

function isExcluded(file) {
  for (const prefix of EXCLUDE_PATH_PREFIXES) {
    if (file.startsWith(prefix)) return true;
  }
  for (const suffix of EXCLUDE_FILE_SUFFIXES) {
    if (file.endsWith(suffix)) return true;
  }
  return false;
}

function listProductionFiles(repoRoot) {
  const raw = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return raw
    .split('\n')
    .filter(Boolean)
    .map(f => f.replace(/\\/g, '/'))
    .filter(f => /\.(?:js|mjs|cjs)$/i.test(f))
    .filter(f => !isExcluded(f))
    .sort();
}

function scanFile(filePath, repoRoot) {
  const abs = path.join(repoRoot, filePath);
  let content;
  try {
    content = fs.readFileSync(abs, 'utf8');
  } catch (err) {
    return [];
  }
  const lines = content.split('\n');
  const hits = [];
  for (const [clusterId, rules] of Object.entries(CLUSTER_PATTERNS)) {
    for (const rule of rules) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (rule.pattern.test(line)) {
          hits.push({
            cluster: clusterId,
            rule_id: rule.id,
            rule_description: rule.description,
            file: filePath,
            line: i + 1,
            content: line.trim().slice(0, 240),
          });
        }
      }
    }
  }
  return hits;
}

// HIGH-IMPACT path matchers — these ARE the production routing/handoff/claim infrastructure
// where dual-detection drift causes real bugs. This SD migrates HIGH-IMPACT in-scope.
// Everything else routes to MIGRATE_FOLLOW_UP (filed as a follow-up SD/QF after this one ships).
const HIGH_IMPACT_PATTERNS = [
  /^lib\/handoff\//,
  /^lib\/claim/,
  /^scripts\/modules\/handoff\//,
  /^scripts\/lib\/handoff-/,
  /^scripts\/modules\/parent-orchestrator-handler\.js$/,
  /^scripts\/modules\/decomposition-gate\.js$/,
  /^scripts\/phase-preflight\.js$/,
  /^scripts\/sd-start\.js$/,
  /^scripts\/stale-session-sweep\.cjs$/,
  /^scripts\/leo-cleanup\.js$/,
  /^scripts\/modules\/sd-next\/display\/recommendations\.js$/,
  /^scripts\/modules\/handoff\/validation\//,
  /^scripts\/leo-orchestrator\//,
  /^scripts\/modules\/leo-orchestrator\//,
  /^scripts\/orchestrator-preflight\.js$/,
  /^scripts\/modules\/orchestrator\//,
];

function isHighImpact(file) {
  return HIGH_IMPACT_PATTERNS.some(re => re.test(file));
}

function classify(hit) {
  const hotPathFiles = new Set([
    'scripts/lib/handoff-preflight.js',
    'scripts/phase-preflight.js',
    'scripts/modules/handoff/orchestrator-completion-guardian.js',
    'scripts/modules/decomposition-gate.js',
  ]);
  const canonicalHelperFiles = new Set([
    'lib/handoff/parent-detection.js',
    'lib/sd/type-detection.js',
    'lib/claim/ownership-detection.js',
    'lib/handoff/gate-skip-detection.js',
    'lib/claim/holding-statuses.cjs',
    'lib/sd-type-enum.js',
    'lib/eva/bridge/sd-router.js',
    'lib/utils/sd-type-validation.js',
  ]);
  if (canonicalHelperFiles.has(hit.file)) {
    return { classification: 'EXCLUDE_OUT_OF_SCOPE', rationale: 'Canonical helper file — defines the pattern, not a consumer.' };
  }
  if (hit.file.startsWith('scripts/one-off/')) {
    return { classification: 'EXCLUDE_OUT_OF_SCOPE', rationale: 'One-off diagnostic script; not part of production routing.' };
  }
  if (hit.file.startsWith('database/') || hit.file.startsWith('migrations/')) {
    return { classification: 'EXCLUDE_OUT_OF_SCOPE', rationale: 'Database migration / schema metadata — not a detection consumer.' };
  }
  if (hotPathFiles.has(hit.file)) {
    return { classification: 'KEEP_METADATA_ONLY', rationale: 'Hot-path runs mid-handoff; metadata-flag-only preserves read-after-write transactional consistency (per RISK C1). Uses sync helper variant.' };
  }
  if (isHighImpact(hit.file)) {
    return { classification: 'MIGRATE', rationale: 'HIGH-IMPACT call site on the production handoff/claim/routing path. In scope for this SD.' };
  }
  return { classification: 'MIGRATE_FOLLOW_UP', rationale: 'Lower-impact consumer (enrichment script, utility CLI, server route). Files as follow-up SD/QF after this SD ships.' };
}

function renderMarkdown(audit) {
  const lines = [];
  lines.push('# Dual-detection cluster audit — SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001');
  lines.push('');
  lines.push(`Generated (deterministic): ${audit.generated_at}`);
  lines.push(`Repo: ${audit.repo}`);
  lines.push(`Git HEAD: ${audit.git_head}`);
  lines.push(`Files scanned: ${audit.files_scanned}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Cluster | Description | Total | MIGRATE | KEEP_META_ONLY | FOLLOW_UP | EXCLUDE |');
  lines.push('|---------|-------------|------:|--------:|---------------:|----------:|--------:|');
  for (const cId of ['A', 'B', 'C']) {
    const hits = audit.clusters[cId].hits;
    const migrate = hits.filter(h => h.classification === 'MIGRATE').length;
    const keep = hits.filter(h => h.classification === 'KEEP_METADATA_ONLY').length;
    const followUp = hits.filter(h => h.classification === 'MIGRATE_FOLLOW_UP').length;
    const exclude = hits.filter(h => h.classification === 'EXCLUDE_OUT_OF_SCOPE').length;
    lines.push(`| ${cId} | ${audit.clusters[cId].name} | ${hits.length} | ${migrate} | ${keep} | ${followUp} | ${exclude} |`);
  }
  const totalAll = ['A', 'B', 'C'].reduce((s, c) => s + audit.clusters[c].hits.length, 0);
  const totalMigrate = ['A', 'B', 'C'].reduce((s, c) => s + audit.clusters[c].hits.filter(h => h.classification === 'MIGRATE').length, 0);
  const totalFollowUp = ['A', 'B', 'C'].reduce((s, c) => s + audit.clusters[c].hits.filter(h => h.classification === 'MIGRATE_FOLLOW_UP').length, 0);
  lines.push(`| **Total** | — | **${totalAll}** | **${totalMigrate}** | — | **${totalFollowUp}** | — |`);
  lines.push('');
  lines.push('**This SD ships MIGRATE + KEEP_METADATA_ONLY.** MIGRATE_FOLLOW_UP sites file as a follow-up SD/QF after this one merges. EXCLUDE_OUT_OF_SCOPE sites are not touched.');
  lines.push('');

  for (const cId of ['A', 'B', 'C']) {
    const cluster = audit.clusters[cId];
    lines.push(`## Cluster ${cId}: ${cluster.name}`);
    lines.push('');
    lines.push(cluster.description);
    lines.push('');
    if (cluster.hits.length === 0) {
      lines.push('_No matches found._');
      lines.push('');
      continue;
    }
    lines.push('| Rule | File | Line | Classification | Snippet |');
    lines.push('|------|------|-----:|----------------|---------|');
    for (const hit of cluster.hits) {
      const snippet = hit.content.replace(/\|/g, '\\|').slice(0, 110);
      lines.push(`| ${hit.rule_id} | \`${hit.file}\` | ${hit.line} | ${hit.classification} | \`${snippet}\` |`);
    }
    lines.push('');
    const byClass = {};
    for (const hit of cluster.hits) {
      if (!byClass[hit.classification]) byClass[hit.classification] = new Set();
      byClass[hit.classification].add(hit.rationale);
    }
    lines.push('### Rationale per classification');
    lines.push('');
    for (const [cls, rationales] of Object.entries(byClass).sort()) {
      lines.push(`- **${cls}**: ${[...rationales].sort().join(' / ')}`);
    }
    lines.push('');
  }

  lines.push('## Methodology');
  lines.push('');
  lines.push('- File list sourced from `git ls-files` (tracked files only), filtered to *.js / *.mjs / *.cjs.');
  lines.push('- Per-file scan via native JS RegExp; matches recorded with file:line + classification.');
  lines.push('- Excluded prefixes: tests/, test/, scripts/archive/, .prd-payloads/, .rca/, .audit-out/, docs/audits/, node_modules/, .worktrees/, dist/, build/');
  lines.push('- Excluded suffixes: *.test.{js,mjs,cjs}, *.spec.{js,mjs,cjs}');
  lines.push('- Classification (per RISK C1 from LEAD sub-agent review):');
  lines.push('  - **MIGRATE**: standard call site; migrated to canonical helper in Phase 2/3/4/5.');
  lines.push('  - **KEEP_METADATA_ONLY**: hot-path files (handoff-preflight, phase-preflight, orchestrator-completion-guardian, decomposition-gate) where read-after-write consistency requires the sync helper variant.');
  lines.push('  - **EXCLUDE_OUT_OF_SCOPE**: canonical helper files, one-off diagnostic scripts, database migrations.');
  lines.push('- Output is deterministic-sorted (file alphabetical → line ascending → rule_id) for diffability across runs (TR-2).');
  lines.push('- Read-only enforcement (TR-1): script refuses to run when SUPABASE_SERVICE_ROLE_KEY is set in env.');
  lines.push('');
  lines.push('## Phase 2-5 scoping');
  lines.push('');
  lines.push('The migration count in each Phase MUST match the per-cluster MIGRATE counts in this report. KEEP_METADATA_ONLY sites use the sync helper variant. EXCLUDE_OUT_OF_SCOPE sites are not touched by this SD.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const auditOutDir = path.join(REPO_ROOT, '.audit-out');
  const docsDir = path.join(REPO_ROOT, 'docs', 'audits');
  fs.mkdirSync(auditOutDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  const gitHead = (() => {
    try {
      return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  })();

  const files = listProductionFiles(REPO_ROOT);

  const allHits = [];
  for (const file of files) {
    const hits = scanFile(file, REPO_ROOT);
    for (const hit of hits) {
      const { classification, rationale } = classify(hit);
      hit.classification = classification;
      hit.rationale = rationale;
    }
    allHits.push(...hits);
  }

  // Deterministic sort across all hits
  allHits.sort((a, b) => {
    if (a.cluster !== b.cluster) return a.cluster.localeCompare(b.cluster);
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.rule_id.localeCompare(b.rule_id);
  });

  const audit = {
    sd_key: 'SD-LEO-INFRA-CONSOLIDATE-DUAL-DETECTION-001',
    generated_at: '2026-05-28T00:00:00Z',
    repo: 'EHG_Engineer',
    git_head: gitHead,
    files_scanned: files.length,
    clusters: {
      A: {
        name: 'SD-type detection',
        description: 'Multiple call sites classify an SD\'s type by reading sd_type column, metadata.is_* flags, sd_key prefix, or LEGITIMATE_NO_VENTURE_SD_TYPES set. Migration target: `lib/sd/type-detection.js` (FR-2).',
        hits: allHits.filter(h => h.cluster === 'A'),
      },
      B: {
        name: 'Claim ownership detection',
        description: 'Multiple call sites determine "who holds this SD" by reading claude_sessions.claiming_session_id, .active_session_id, .is_working_on, .is_alive, .has_uncommitted_changes. Migration target: `lib/claim/ownership-detection.js` (FR-3).',
        hits: allHits.filter(h => h.cluster === 'B'),
      },
      C: {
        name: 'Gate-skip detection',
        description: 'Multiple call sites decide whether a handoff gate should run by checking gate.condition callbacks, context.skipGate injection, metadata.skip_* flags, or SD-type-conditional skip. Migration target: `lib/handoff/gate-skip-detection.js` (FR-4).',
        hits: allHits.filter(h => h.cluster === 'C'),
      },
    },
  };

  const jsonPath = path.join(auditOutDir, 'dual-detection-clusters.json');
  fs.writeFileSync(jsonPath, JSON.stringify(audit, null, 2), 'utf8');

  const mdPath = path.join(docsDir, 'sd-leo-infra-consolidate-dual-detection-001-audit.md');
  fs.writeFileSync(mdPath, renderMarkdown(audit), 'utf8');

  console.log('Audit complete.');
  console.log(`  Files scanned: ${files.length}`);
  console.log(`  JSON:     ${path.relative(REPO_ROOT, jsonPath)}`);
  console.log(`  Markdown: ${path.relative(REPO_ROOT, mdPath)}`);
  console.log('');
  for (const cId of ['A', 'B', 'C']) {
    const hits = audit.clusters[cId].hits;
    const migrate = hits.filter(h => h.classification === 'MIGRATE').length;
    const keep = hits.filter(h => h.classification === 'KEEP_METADATA_ONLY').length;
    const exclude = hits.filter(h => h.classification === 'EXCLUDE_OUT_OF_SCOPE').length;
    console.log(`  Cluster ${cId}: total=${hits.length} MIGRATE=${migrate} KEEP_METADATA_ONLY=${keep} EXCLUDE_OUT_OF_SCOPE=${exclude}`);
  }
}

main();
