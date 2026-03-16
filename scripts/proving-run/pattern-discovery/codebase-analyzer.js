/**
 * Codebase Analyzer — reads current file structure across both repos
 * and maps existing files to stages using stage-config patterns.
 *
 * Part of: Pattern Discovery Agent (SD-AUTOMATED-PROVING-RUN-ENGINE-ORCH-001-B)
 */

import glob from 'glob';
const { sync: globSync } = glob;
import { existsSync, statSync } from 'fs';
import path from 'path';

const EHG_APP_PATH = path.resolve(process.cwd(), '..', 'ehg');

/**
 * Analyze codebase for a single stage, discovering existing files
 * across all 5 dimensions.
 * @param {object} stage - Stage mapping from stage-mapper
 * @param {object} options
 * @param {string} [options.engineerPath]
 * @param {string} [options.appPath]
 * @returns {object} Per-dimension file discovery results
 */
function analyzeStage(stage, options = {}) {
  const engineerPath = options.engineerPath || process.cwd();
  const appPath = options.appPath || EHG_APP_PATH;

  return {
    code: discoverFiles(appPath, stage.app?.filePatterns || []),
    db: discoverFiles(engineerPath, stage.engineer?.dbPatterns || []),
    service: discoverFiles(engineerPath, stage.engineer?.serviceScripts || []),
    tests: discoverFiles(engineerPath, stage.engineer?.testPatterns || []),
    artifacts: stage.requiredArtifacts || [],
  };
}

/**
 * Discover files matching glob patterns in a directory.
 * @param {string} basePath
 * @param {string[]} patterns
 * @returns {{ found: string[], count: number }}
 */
function discoverFiles(basePath, patterns) {
  if (!existsSync(basePath)) return { found: [], count: 0 };

  const found = new Set();

  for (const pattern of patterns) {
    try {
      const matches = globSync(pattern, {
        cwd: basePath,
        nodir: true,
        ignore: ['node_modules/**', '.git/**', 'dist/**'],
      });
      for (const m of matches) found.add(m);
    } catch {
      // Pattern may not match — that's expected
    }
  }

  const files = [...found];
  return { found: files, count: files.length };
}

/**
 * Analyze all stages across both repos.
 * @param {Object.<number, object>} stages
 * @param {object} options
 * @returns {Object.<number, object>}
 */
export function analyzeAllStages(stages, options = {}) {
  const results = {};

  for (const [stageNum, stage] of Object.entries(stages)) {
    const num = parseInt(stageNum);
    const analysis = analyzeStage(stage, options);

    // Compute dimension coverage
    const dimensionCoverage = {
      code: analysis.code.count > 0,
      db: analysis.db.count > 0,
      service: analysis.service.count > 0,
      tests: analysis.tests.count > 0,
      artifacts: analysis.artifacts.length > 0,
    };

    const coveredDimensions = Object.values(dimensionCoverage).filter(Boolean).length;

    results[num] = {
      ...analysis,
      coverage: dimensionCoverage,
      coveredDimensions,
      totalDimensions: 5,
      coveragePercent: Math.round((coveredDimensions / 5) * 100),
    };
  }

  return results;
}

/**
 * Find files that match patterns across both repos, returning rich metadata.
 * @param {string} basePath
 * @param {string[]} patterns
 * @returns {Array<{path: string, size: number, relativePath: string}>}
 */
export function discoverFilesWithMetadata(basePath, patterns) {
  if (!existsSync(basePath)) return [];

  const results = [];
  const seen = new Set();

  for (const pattern of patterns) {
    try {
      const matches = globSync(pattern, {
        cwd: basePath,
        nodir: true,
        ignore: ['node_modules/**', '.git/**', 'dist/**'],
      });

      for (const m of matches) {
        if (seen.has(m)) continue;
        seen.add(m);

        const fullPath = path.join(basePath, m);
        try {
          const stat = statSync(fullPath);
          results.push({
            relativePath: m,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          });
        } catch {
          results.push({ relativePath: m, size: 0, modified: null });
        }
      }
    } catch {
      // Pattern error — skip
    }
  }

  return results;
}
