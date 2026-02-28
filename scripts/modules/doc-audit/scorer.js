/**
 * Doc-Audit Scorer — 10-dimension automated scoring engine
 *
 * All dimensions are mechanically computable (no LLM needed).
 * Each scoreD0N function returns { id, name, score, weight, findings, gaps }.
 *
 * Used by:
 *   scripts/eva/doc-health-audit.mjs  (entry point)
 */

import { existsSync } from 'fs';
import { join, dirname, normalize } from 'path';
import { DIMENSIONS, classifyScore } from './rubric.js';
import { PROHIBITED_DIRS } from './scanner.js';

/**
 * Score all 10 dimensions given scan results.
 * @param {{ files: FileInfo[], directories: DirInfo[] }} scanResult
 * @param {string} rootDir
 * @returns {{ dimensions: DimensionScore[], totalScore: number, thresholdAction: string }}
 */
export function scoreAllDimensions(scanResult, rootDir) {
  const { files, directories } = scanResult;

  const scorers = [
    scoreD01, scoreD02, scoreD03, scoreD04, scoreD05,
    scoreD06, scoreD07, scoreD08, scoreD09, scoreD10,
  ];

  const dimensions = scorers.map((fn, i) => {
    const dim = DIMENSIONS[i];
    const result = fn(files, directories, rootDir);
    return {
      id: dim.id,
      name: dim.name,
      score: Math.round(Math.max(0, Math.min(100, result.score))),
      weight: dim.weight,
      findings: result.findings,
      gaps: result.gaps,
    };
  });

  const totalScore = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0)
  );

  return {
    dimensions,
    totalScore,
    thresholdAction: classifyScore(totalScore),
  };
}

// ─── D01: Location Compliance (15%) ─────────────────────────────────────────

function scoreD01(files) {
  const findings = [];
  const gaps = [];

  const prohibited = files.filter(f => f.isProhibitedLocation);

  if (prohibited.length > 0) {
    for (const f of prohibited) {
      gaps.push(`${f.relPath} — .md file in prohibited directory`);
    }
  }

  const total = files.length;
  if (total === 0) return { score: 100, findings: ['No files to evaluate'], gaps };

  const compliant = total - prohibited.length;
  const score = Math.round((compliant / total) * 100);

  findings.push(`${compliant}/${total} files in allowed locations`);
  if (prohibited.length > 0) {
    findings.push(`${prohibited.length} files in prohibited dirs (${PROHIBITED_DIRS.join(', ')})`);
  }

  return { score, findings, gaps };
}

// ─── D02: Metadata Completeness (12%) ───────────────────────────────────────

function scoreD02(files) {
  const findings = [];
  const gaps = [];

  // Only evaluate docs/ files (root-level and lib READMEs are exempt)
  const docsFiles = files.filter(f => f.relPath.startsWith('docs'));
  if (docsFiles.length === 0) return { score: 100, findings: ['No docs/ files to evaluate'], gaps };

  let totalFields = 0;
  let presentFields = 0;

  for (const f of docsFiles) {
    if (f.name === 'README.md') continue; // READMEs don't need full metadata

    totalFields += f.metadata._requiredTotal || 6;
    presentFields += f.metadata._requiredPresent || 0;

    if (!f.hasMetadata) {
      gaps.push(`${f.relPath} — missing YAML front-matter entirely`);
    } else if (f.metadata._requiredPresent < f.metadata._requiredTotal) {
      const missing = f.metadata._requiredFields.filter(k => !f.metadata[k]);
      gaps.push(`${f.relPath} — missing: ${missing.join(', ')}`);
    }
  }

  const score = totalFields > 0 ? Math.round((presentFields / totalFields) * 100) : 100;
  findings.push(`${presentFields}/${totalFields} required metadata fields present across ${docsFiles.length} docs`);

  return { score, findings, gaps };
}

// ─── D03: Naming Convention (8%) ────────────────────────────────────────────

function scoreD03(files) {
  const findings = [];
  const gaps = [];

  const nonCompliant = files.filter(f => !f.isNamingCompliant);

  if (nonCompliant.length > 0) {
    for (const f of nonCompliant) {
      gaps.push(`${f.relPath} — not kebab-case`);
    }
  }

  const total = files.length;
  if (total === 0) return { score: 100, findings: ['No files to evaluate'], gaps };

  const compliant = total - nonCompliant.length;
  const score = Math.round((compliant / total) * 100);

  findings.push(`${compliant}/${total} files follow naming convention`);

  return { score, findings, gaps };
}

// ─── D04: Cross-Reference Integrity (12%) ───────────────────────────────────

function scoreD04(files, _directories, rootDir) {
  const findings = [];
  const gaps = [];

  const allLinks = files.flatMap(f => f.links);
  if (allLinks.length === 0) return { score: 100, findings: ['No internal links found'], gaps };

  let resolved = 0;
  let broken = 0;

  for (const link of allLinks) {
    const sourceDir = dirname(join(rootDir, link.source));
    const targetPath = normalize(join(sourceDir, link.target));

    if (existsSync(targetPath)) {
      resolved++;
    } else {
      broken++;
      gaps.push(`${link.source} → ${link.target} (broken)`);
    }
  }

  const total = allLinks.length;
  const score = Math.round((resolved / total) * 100);

  findings.push(`${resolved}/${total} internal links resolve`);
  if (broken > 0) findings.push(`${broken} broken links`);

  return { score, findings, gaps };
}

// ─── D05: Content Freshness (10%) ───────────────────────────────────────────

function scoreD05(files) {
  const findings = [];
  const gaps = [];

  const now = Date.now();
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
  const ONE_EIGHTY_DAYS = 180 * 24 * 60 * 60 * 1000;

  const datedFiles = files.filter(f => f.gitLastModified);
  if (datedFiles.length === 0) return { score: 50, findings: ['No git dates available'], gaps };

  let fresh = 0;  // < 90 days
  let stale = 0;  // 90-180 days
  let veryStale = 0; // > 180 days

  for (const f of datedFiles) {
    const age = now - f.gitLastModified.getTime();
    if (age <= NINETY_DAYS) {
      fresh++;
    } else if (age <= ONE_EIGHTY_DAYS) {
      stale++;
    } else {
      veryStale++;
      gaps.push(`${f.relPath} — last modified ${Math.round(age / (24 * 60 * 60 * 1000))} days ago`);
    }
  }

  // Score: fresh = 100%, stale = 50%, very stale = 0%
  const total = datedFiles.length;
  const weightedScore = (fresh * 100 + stale * 50 + veryStale * 0) / total;
  const score = Math.round(weightedScore);

  findings.push(`${fresh} fresh (<90d), ${stale} stale (90-180d), ${veryStale} very stale (>180d)`);

  return { score, findings, gaps };
}

// ─── D06: Index Coverage (10%) ──────────────────────────────────────────────

function scoreD06(_files, directories) {
  const findings = [];
  const gaps = [];

  // Only check docs/ subdirectories (not root)
  const docsDirs = directories.filter(d =>
    d.relPath.startsWith('docs') && d.relPath !== 'docs' && d.fileCount > 0
  );

  if (docsDirs.length === 0) return { score: 100, findings: ['No docs subdirectories'], gaps };

  let withReadme = 0;
  for (const d of docsDirs) {
    if (d.hasReadme) {
      withReadme++;
    } else {
      gaps.push(`${d.relPath}/ — missing README.md index`);
    }
  }

  const score = Math.round((withReadme / docsDirs.length) * 100);
  findings.push(`${withReadme}/${docsDirs.length} docs subdirectories have README.md`);

  return { score, findings, gaps };
}

// ─── D07: Structural Completeness (10%) ─────────────────────────────────────

function scoreD07(files) {
  const findings = [];
  const gaps = [];

  let checks = 0;
  let passed = 0;

  for (const f of files) {
    // Check 1: All docs have a title
    checks++;
    if (f.hasTitle) {
      passed++;
    } else {
      gaps.push(`${f.relPath} — missing # title heading`);
    }

    // Check 2: Long docs (>200 lines) need TOC
    if (f.lineCount > 200) {
      checks++;
      if (f.hasToc) {
        passed++;
      } else {
        gaps.push(`${f.relPath} — ${f.lineCount} lines but no TOC`);
      }
    }
  }

  if (checks === 0) return { score: 100, findings: ['No structural checks needed'], gaps };

  const score = Math.round((passed / checks) * 100);
  findings.push(`${passed}/${checks} structural checks passed`);

  return { score, findings, gaps };
}

// ─── D08: Database-First Compliance (8%) ────────────────────────────────────

function scoreD08(files, _directories, rootDir) {
  const findings = [];
  const gaps = [];

  // Generated CLAUDE*.md files at root are OK (they come from DB)
  // Rogue protocol .md files elsewhere are NOT OK
  const GENERATED_FILES = new Set([
    'CLAUDE.md', 'CLAUDE_CORE.md', 'CLAUDE_CORE_DIGEST.md',
    'CLAUDE_LEAD.md', 'CLAUDE_LEAD_DIGEST.md',
    'CLAUDE_PLAN.md', 'CLAUDE_PLAN_DIGEST.md',
    'CLAUDE_EXEC.md', 'CLAUDE_EXEC_DIGEST.md',
  ]);

  const protocolKeywords = ['leo protocol', 'phase handoff', 'lead phase', 'plan phase', 'exec phase'];

  let checks = 0;
  let compliant = 0;

  for (const f of files) {
    // Skip generated root-level CLAUDE files
    if (f.dir === '.' && GENERATED_FILES.has(f.name)) continue;

    // Check files in docs/03_protocols_and_standards for protocol content
    if (f.relPath.includes('protocols') || f.relPath.includes('leo')) {
      checks++;
      // These are fine — they're in the docs area
      compliant++;
    }
  }

  // Check for rogue CLAUDE-like files outside root
  const rogueFiles = files.filter(f =>
    f.name.startsWith('CLAUDE') && f.dir !== '.' && !f.relPath.includes('node_modules')
  );
  for (const f of rogueFiles) {
    checks++;
    gaps.push(`${f.relPath} — CLAUDE* file outside root (should be generated)`);
  }
  if (rogueFiles.length === 0 && checks === 0) checks = 1; // at least one pass check

  const total = Math.max(checks, 1);
  compliant = Math.max(compliant, checks - rogueFiles.length);
  const score = Math.round((compliant / total) * 100);

  findings.push(`${compliant}/${total} protocol files database-compliant`);
  if (rogueFiles.length > 0) findings.push(`${rogueFiles.length} rogue CLAUDE* files`);

  return { score, findings, gaps };
}

// ─── D09: Orphan Detection (8%) ────────────────────────────────────────────

function scoreD09(files) {
  const findings = [];
  const gaps = [];

  // Build set of all link targets
  const linkedPaths = new Set();
  for (const f of files) {
    for (const link of f.links) {
      // Normalize the target relative to the source
      const sourceDir = dirname(f.relPath);
      const resolved = normalize(join(sourceDir, link.target)).replace(/\\/g, '/');
      linkedPaths.add(resolved);
    }
  }

  // README files and root-level files are never orphans
  const checkable = files.filter(f =>
    f.name !== 'README.md' &&
    f.dir !== '.' &&
    !f.name.startsWith('CLAUDE') &&
    f.relPath.startsWith('docs')
  );

  if (checkable.length === 0) return { score: 100, findings: ['No checkable docs'], gaps };

  let linked = 0;
  for (const f of checkable) {
    const normalizedPath = f.relPath.replace(/\\/g, '/');
    if (linkedPaths.has(normalizedPath)) {
      linked++;
    } else {
      gaps.push(`${f.relPath} — not referenced by any index or cross-reference`);
    }
  }

  const score = Math.round((linked / checkable.length) * 100);
  findings.push(`${linked}/${checkable.length} docs are referenced from at least one index`);

  return { score, findings, gaps };
}

// ─── D10: Duplicate Detection (7%) ──────────────────────────────────────────

function scoreD10(files) {
  const findings = [];
  const gaps = [];

  // Group by normalized filename (strip dir, numbers, suffixes)
  const nameMap = new Map();
  for (const f of files) {
    if (f.name === 'README.md') continue; // READMEs are expected duplicates

    // Normalize: remove version numbers, leading numbers, trailing -v2 etc.
    const normalized = f.name
      .replace(/\.md$/, '')
      .replace(/[-_]v\d+.*$/, '')  // -v2, _v3
      .replace(/^\d+[-_]/, '')     // 01_, 02-
      .replace(/[-_]\d+$/, '')     // trailing -001
      .toLowerCase();

    if (!nameMap.has(normalized)) nameMap.set(normalized, []);
    nameMap.get(normalized).push(f.relPath);
  }

  // Find groups with >1 file (potential duplicates)
  let duplicateGroups = 0;
  let duplicateFiles = 0;
  for (const [name, paths] of nameMap) {
    if (paths.length > 1) {
      duplicateGroups++;
      duplicateFiles += paths.length;
      gaps.push(`Potential duplicate "${name}": ${paths.join(', ')}`);
    }
  }

  const uniqueNames = nameMap.size;
  const dupeRatio = uniqueNames > 0 ? duplicateGroups / uniqueNames : 0;
  const score = Math.round((1 - dupeRatio) * 100);

  findings.push(`${uniqueNames} unique doc names, ${duplicateGroups} potential duplicate groups`);

  return { score, findings, gaps };
}
