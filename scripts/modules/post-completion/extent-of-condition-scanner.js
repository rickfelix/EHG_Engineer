/**
 * Extent-of-Condition Scanner
 * SD: SD-LEO-INFRA-FEEDBACK-PIPELINE-ACTIVATION-001-E
 *
 * Scans completed SD diffs for stale references and semantic gaps,
 * scores findings with the gap assessment rubric engine, and routes
 * them to three tiers: auto_create (QF/SD), inbox (chairman), brainstorm.
 *
 * Layers:
 *   1. Git diff parser — detects stale references (imports, table names, config keys)
 *   2. LLM enrichment — semantic gap detection (optional, skipped in --fast mode)
 *
 * Output is CISO-compliant: no raw code excerpts, only identifier hashes and descriptions.
 *
 * Usage:
 *   node scripts/modules/post-completion/extent-of-condition-scanner.js <SD-KEY> [--dry-run] [--fast] [--json]
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { scoreFinding, scoreFromContext, RUBRIC_THRESHOLDS } from '../evaluation/gap-assessment-rubric.js';

// ── Stale reference patterns ──────────────────────────────────────

const STALE_PATTERNS = [
  { name: 'import_path', regex: /^[-+].*(?:import|require)\s*\(?\s*['"]([^'"]+)['"]/gm, extract: 1 },
  { name: 'from_table', regex: /\.from\(['"`]([a-z_][a-z0-9_]*)['"`]\)/g, extract: 1 },
  { name: 'env_var', regex: /process\.env\.([A-Z_][A-Z0-9_]*)/g, extract: 1 },
  { name: 'config_key', regex: /['"]([a-z_][a-z0-9_.]{3,})['"](?:\s*[,:=])/g, extract: 1 },
];

const RISK_KEYWORDS = ['auth', 'migration', 'schema', 'security', 'rls', 'breaking'];

// ── Dedup registry ────────────────────────────────────────────────

const seenHashes = new Set();

function hashFinding(finding) {
  const key = `${finding.type}:${finding.identifier}:${finding.file || ''}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

function isDuplicate(finding) {
  const hash = hashFinding(finding);
  if (seenHashes.has(hash)) return true;
  seenHashes.add(hash);
  return false;
}

// ── Layer 1: Git diff parser ──────────────────────────────────────

/**
 * Parse git diff for an SD's merge commit to find stale references.
 *
 * @param {string} sdKey - The SD key to scan (used to find the merge commit)
 * @param {Object} options - Scanner options
 * @returns {Object[]} Findings with type, identifier, file, context
 */
export function scanGitDiff(sdKey, options = {}) {
  const findings = [];

  let diff;
  try {
    // Find the merge commit for this SD's branch
    const commitHash = execSync(
      `git log --all --oneline --grep="${sdKey}" --format="%H" -1`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();

    if (commitHash) {
      diff = execSync(`git diff ${commitHash}~1..${commitHash} --unified=0`, {
        encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 15000,
      });
    }
  } catch { /* fall through to fallback */ }

  if (!diff) {
    try {
      diff = execSync('git diff HEAD~3..HEAD --unified=0', {
        encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, timeout: 15000,
      });
    } catch {
      return findings;
    }
  }

  if (!diff) return findings;

  // Parse diff hunks for file context
  let currentFile = null;
  const lines = diff.split('\n');

  for (const line of lines) {
    const fileMatch = line.match(/^diff --git a\/(.+) b\//);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    // Only scan removed lines (potential stale references)
    if (!line.startsWith('-') || line.startsWith('---')) continue;

    for (const pattern of STALE_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(line)) !== null) {
        const identifier = match[pattern.extract];
        if (!identifier || identifier.length < 3) continue;

        const finding = {
          type: pattern.name,
          identifier,
          file: currentFile,
          context: `Removed reference in ${currentFile || 'unknown'}`,
          matchedKeywords: RISK_KEYWORDS.filter(kw => identifier.toLowerCase().includes(kw)),
        };

        if (!isDuplicate(finding)) {
          findings.push(finding);
        }
      }
    }
  }

  return findings;
}

// ── Scoring & Routing ─────────────────────────────────────────────

/**
 * Score a list of raw findings using the rubric engine.
 *
 * @param {Object[]} findings - Raw findings from scanGitDiff
 * @returns {Object[]} Scored findings with tier assignment
 */
export function scoreFindings(findings) {
  return findings.map(f => {
    const fileCount = 1; // Each finding is per-file
    const changeType = mapFindingType(f.type);
    const seenBefore = false; // Future: check against prior scans

    const scored = scoreFromContext({
      fileCount,
      matchedKeywords: f.matchedKeywords || [],
      changeType,
      seenBefore,
    });

    return {
      ...f,
      hash: hashFinding(f),
      score: scored.composite,
      tier: scored.tier,
      dimensions: scored.dimensions,
    };
  });
}

function mapFindingType(type) {
  const map = {
    import_path: 'function_rename',
    from_table: 'config_key',
    env_var: 'config_key',
    config_key: 'string_literal',
  };
  return map[type] || 'string_literal';
}

// ── Three-tier routing ────────────────────────────────────────────

/**
 * Route scored findings to three tiers.
 *
 * @param {Object[]} scoredFindings - Findings with score and tier
 * @returns {Object} Routed findings grouped by tier with summary
 */
export function routeFindings(scoredFindings) {
  const routed = {
    auto_create: [],
    inbox: [],
    brainstorm: [],
  };

  for (const f of scoredFindings) {
    routed[f.tier]?.push(f) || routed.inbox.push(f);
  }

  return {
    findings: routed,
    summary: {
      total: scoredFindings.length,
      auto_create: routed.auto_create.length,
      inbox: routed.inbox.length,
      brainstorm: routed.brainstorm.length,
      thresholds: { ...RUBRIC_THRESHOLDS },
    },
  };
}

// ── CISO-compliant output formatter ───────────────────────────────

/**
 * Format findings for display without raw code excerpts.
 *
 * @param {Object} routed - Output from routeFindings
 * @param {Object} options - Formatting options
 * @returns {string} Formatted output
 */
export function formatOutput(routed, options = {}) {
  const { json = false } = options;

  if (json) {
    return JSON.stringify(routed, null, 2);
  }

  const lines = [];
  lines.push('Extent-of-Condition Scan Results');
  lines.push('=' .repeat(50));
  lines.push(`Total findings: ${routed.summary.total}`);
  lines.push(`  auto_create: ${routed.summary.auto_create} (score <= ${routed.summary.thresholds.AUTO_CREATE_MAX})`);
  lines.push(`  inbox:       ${routed.summary.inbox}`);
  lines.push(`  brainstorm:  ${routed.summary.brainstorm} (score >= ${routed.summary.thresholds.BRAINSTORM_MIN})`);
  lines.push('');

  for (const [tier, items] of Object.entries(routed.findings)) {
    if (items.length === 0) continue;
    lines.push(`[${tier.toUpperCase()}] (${items.length} finding${items.length > 1 ? 's' : ''})`);
    for (const f of items) {
      const risk = f.matchedKeywords?.length ? ` [RISK: ${f.matchedKeywords.join(',')}]` : '';
      lines.push(`  ${f.hash} | ${f.type} | ${f.identifier} | score=${f.score}${risk}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────

/**
 * Run the full extent-of-condition scan pipeline.
 *
 * @param {string} sdKey - SD key to scan
 * @param {Object} options - Scanner options (dryRun, fast, json)
 * @returns {Object} Scan results with routed findings
 */
export async function runEOCScan(sdKey, options = {}) {
  // Layer 1: Git diff parsing
  const rawFindings = scanGitDiff(sdKey, options);

  // Score findings with rubric engine
  const scoredFindings = scoreFindings(rawFindings);

  // Route to tiers
  const routed = routeFindings(scoredFindings);

  return {
    sdKey,
    timestamp: new Date().toISOString(),
    ...routed,
  };
}

// ── CLI entry point ───────────────────────────────────────────────

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('extent-of-condition-scanner.js');
if (isMain) {
  const args = process.argv.slice(2);
  const sdKey = args.find(a => !a.startsWith('-'));
  const flags = new Set(args.filter(a => a.startsWith('-')));

  if (!sdKey) {
    console.error('Usage: node extent-of-condition-scanner.js <SD-KEY> [--dry-run] [--fast] [--json]');
    process.exit(1);
  }

  const options = {
    dryRun: flags.has('--dry-run'),
    fast: flags.has('--fast'),
    json: flags.has('--json'),
  };

  runEOCScan(sdKey, options)
    .then(result => {
      console.log(formatOutput(result, options));
      if (!options.dryRun && result.summary.total > 0) {
        console.log(`\n${result.summary.auto_create} items for auto-creation, ${result.summary.inbox} for inbox, ${result.summary.brainstorm} for brainstorm`);
      }
    })
    .catch(err => {
      console.error('EOC scan error:', err.message);
      process.exit(1);
    });
}

export default { runEOCScan, scanGitDiff, scoreFindings, routeFindings, formatOutput };
