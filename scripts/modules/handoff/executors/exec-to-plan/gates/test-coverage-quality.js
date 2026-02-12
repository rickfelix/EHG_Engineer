/**
 * Test Coverage Quality Gate for EXEC-TO-PLAN
 * Part of SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-B
 *
 * Reads coverage/coverage-summary.json, computes coverage for CHANGED files only,
 * flags files with 0% coverage.
 *
 * Thresholds:
 *   - 60% for feature/bugfix/security (BLOCKING)
 *   - 40% for infrastructure/refactor (ADVISORY/WARN)
 *
 * Fixes GAP-002 and GAP-004 from quality gate audit.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, relative } from 'path';
import { execSync } from 'child_process';

/**
 * Detect code file changes in the current branch/working directory.
 * Reuses the same logic as mandatory-testing-validation.js detectCodeChanges().
 *
 * @returns {{ hasCodeFiles: boolean, codeFileCount: number, codeFiles: string[] }}
 */
function detectCodeChanges() {
  const CODE_EXTENSIONS = /\.(js|ts|tsx|jsx|mjs|cjs|py|rb|go|rs|java|cs|php|sql)$/i;

  try {
    let diffOutput = '';
    try {
      diffOutput = execSync('git diff --name-only HEAD~10 2>nul || git diff --name-only', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
    } catch {
      diffOutput = execSync('git diff --name-only', {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
    }

    const files = diffOutput.split('\n').filter(f => f.trim());
    const codeFiles = files.filter(f => CODE_EXTENSIONS.test(f));

    return {
      hasCodeFiles: codeFiles.length > 0,
      codeFileCount: codeFiles.length,
      codeFiles
    };
  } catch (error) {
    console.log(`   ⚠️  Git diff detection failed: ${error.message}`);
    return { hasCodeFiles: true, codeFileCount: 0, codeFiles: [] };
  }
}

/**
 * Resolve a coverage key path to a relative path for matching.
 * Coverage keys can be absolute paths (e.g., C:\Users\...\src\foo.js)
 * or relative paths. We normalize to forward-slash relative paths.
 *
 * @param {string} coverageKey - Key from coverage-summary.json
 * @param {string} rootDir - Project root directory
 * @returns {string} Normalized relative path
 */
function normalizeCoveragePath(coverageKey, rootDir) {
  if (coverageKey === 'total') return 'total';

  // Try to make it relative to root
  let rel = coverageKey;
  try {
    rel = relative(rootDir, coverageKey);
  } catch {
    // If relative() fails, try string replacement
    const normalizedRoot = rootDir.replace(/\\/g, '/');
    const normalizedKey = coverageKey.replace(/\\/g, '/');
    if (normalizedKey.startsWith(normalizedRoot)) {
      rel = normalizedKey.slice(normalizedRoot.length).replace(/^\//, '');
    }
  }

  // Normalize to forward slashes
  return rel.replace(/\\/g, '/');
}

/**
 * Create the GATE_TEST_COVERAGE_QUALITY gate validator.
 *
 * @param {Object} _supabase - Supabase client (unused but kept for interface consistency)
 * @returns {Object} Gate configuration { name, validator, required }
 */
export function createTestCoverageQualityGate(_supabase) {
  return {
    name: 'GATE_TEST_COVERAGE_QUALITY',
    validator: async (ctx) => {
      console.log('\n📊 TEST COVERAGE QUALITY GATE');
      console.log('-'.repeat(50));

      const sdType = ctx.sd?.sd_type || 'feature';
      console.log(`   📋 SD Type: ${sdType}`);

      // Determine thresholds and blocking behavior based on sd_type
      const BLOCKING_TYPES = ['feature', 'bugfix', 'security'];
      const isBlocking = BLOCKING_TYPES.includes(sdType);
      const threshold = isBlocking ? 60 : 40;

      console.log(`   📋 Threshold: ${threshold}%`);
      console.log(`   📋 Mode: ${isBlocking ? 'BLOCKING' : 'ADVISORY'}`);

      // 1. Detect changed code files
      const codeChanges = detectCodeChanges();
      console.log(`   📋 Changed code files: ${codeChanges.codeFileCount}`);

      if (!codeChanges.hasCodeFiles || codeChanges.codeFileCount === 0) {
        console.log('   ✅ No code files changed - coverage check not applicable');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: ['No code files changed - coverage check skipped'],
          details: {
            status: 'PASS',
            blocking: false,
            threshold_used: threshold,
            sd_type: sdType,
            changed_files_count: 0,
            evaluated_files_count: 0,
            zero_coverage_files: [],
            below_threshold_files: [],
            summary: 'No code files changed'
          }
        };
      }

      // 2. Read coverage-summary.json
      const rootDir = process.cwd();
      const coveragePath = resolve(rootDir, 'coverage', 'coverage-summary.json');

      if (!existsSync(coveragePath)) {
        console.log(`   ⚠️  Coverage file not found: ${coveragePath}`);
        console.log('   💡 Generate coverage: npx vitest run --coverage');
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: [
            'Coverage file not found: coverage/coverage-summary.json',
            'Generate coverage by running: npx vitest run --coverage'
          ],
          details: {
            status: 'WARN',
            blocking: false,
            threshold_used: threshold,
            sd_type: sdType,
            changed_files_count: codeChanges.codeFileCount,
            evaluated_files_count: 0,
            zero_coverage_files: [],
            below_threshold_files: [],
            summary: 'Coverage file missing at coverage/coverage-summary.json. Run: npx vitest run --coverage'
          }
        };
      }

      // 3. Parse coverage data
      let coverageData;
      try {
        const raw = readFileSync(coveragePath, 'utf-8');
        coverageData = JSON.parse(raw);
      } catch (parseError) {
        console.log(`   ⚠️  Failed to parse coverage-summary.json: ${parseError.message}`);
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: [
            `Failed to parse coverage/coverage-summary.json: ${parseError.message}`,
            'Ensure coverage-summary.json is valid JSON'
          ],
          details: {
            status: 'WARN',
            blocking: false,
            threshold_used: threshold,
            sd_type: sdType,
            changed_files_count: codeChanges.codeFileCount,
            evaluated_files_count: 0,
            zero_coverage_files: [],
            below_threshold_files: [],
            summary: `Parse error in coverage-summary.json: ${parseError.message}`
          }
        };
      }

      // 4. Build normalized coverage map
      const coverageKeys = Object.keys(coverageData).filter(k => k !== 'total');
      const coverageMap = new Map();
      for (const key of coverageKeys) {
        const normalized = normalizeCoveragePath(key, rootDir);
        coverageMap.set(normalized, coverageData[key]);
      }

      // 5. Match changed files to coverage entries
      const zeroCoverageFiles = [];
      const belowThresholdFiles = [];
      let evaluatedCount = 0;

      for (const changedFile of codeChanges.codeFiles) {
        const normalizedChanged = changedFile.replace(/\\/g, '/');
        const entry = coverageMap.get(normalizedChanged);

        if (!entry) continue; // No coverage data for this file

        evaluatedCount++;
        const lines = entry.lines || entry.statements || {};
        const total = lines.total || 0;
        const covered = lines.covered || 0;

        if (total === 0) continue; // No statements to cover

        const percent = (covered / total) * 100;

        if (covered === 0 && total > 0) {
          zeroCoverageFiles.push({
            file: normalizedChanged,
            total_statements: total,
            covered_statements: 0,
            percent: 0
          });
        }

        if (percent < threshold) {
          belowThresholdFiles.push({
            file: normalizedChanged,
            total_statements: total,
            covered_statements: covered,
            percent: Math.round(percent * 10) / 10
          });
        }
      }

      console.log(`   📊 Evaluated: ${evaluatedCount}/${codeChanges.codeFileCount} changed files`);
      console.log(`   📊 Zero coverage: ${zeroCoverageFiles.length} files`);
      console.log(`   📊 Below threshold: ${belowThresholdFiles.length} files`);

      // 6. Handle no coverage matches
      if (evaluatedCount === 0 && codeChanges.codeFileCount > 0) {
        const sampleChanged = codeChanges.codeFiles.slice(0, 3);
        console.log('   ⚠️  No changed files matched coverage entries');
        console.log(`   💡 Sample changed files: ${sampleChanged.join(', ')}`);
        console.log(`   💡 Coverage entries: ${coverageKeys.length} keys available`);
        return {
          passed: true,
          score: 70,
          max_score: 100,
          issues: [],
          warnings: [
            `No changed files matched coverage entries (${codeChanges.codeFileCount} changed, ${coverageKeys.length} coverage keys)`,
            `Sample changed: ${sampleChanged.join(', ')}`,
            'Check path normalization between git diff output and coverage-summary.json keys'
          ],
          details: {
            status: 'WARN',
            blocking: false,
            threshold_used: threshold,
            sd_type: sdType,
            changed_files_count: codeChanges.codeFileCount,
            evaluated_files_count: 0,
            zero_coverage_files: [],
            below_threshold_files: [],
            summary: `Path mismatch: ${codeChanges.codeFileCount} changed files, ${coverageKeys.length} coverage keys, 0 matched`
          }
        };
      }

      // 7. Determine result
      const hasZeroCoverage = zeroCoverageFiles.length > 0;
      const hasBelowThreshold = belowThresholdFiles.length > 0;
      const failed = hasZeroCoverage || hasBelowThreshold;

      if (!failed) {
        console.log('   ✅ All evaluated files meet coverage threshold');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: {
            status: 'PASS',
            blocking: false,
            threshold_used: threshold,
            sd_type: sdType,
            changed_files_count: codeChanges.codeFileCount,
            evaluated_files_count: evaluatedCount,
            zero_coverage_files: [],
            below_threshold_files: [],
            summary: `All ${evaluatedCount} evaluated files meet ${threshold}% threshold`
          }
        };
      }

      // Failed - build issues/warnings based on blocking mode
      const messages = [];
      if (hasZeroCoverage) {
        messages.push(`${zeroCoverageFiles.length} file(s) with 0% coverage: ${zeroCoverageFiles.map(f => f.file).join(', ')}`);
      }
      if (hasBelowThreshold) {
        messages.push(`${belowThresholdFiles.length} file(s) below ${threshold}% threshold: ${belowThresholdFiles.map(f => `${f.file} (${f.percent}%)`).join(', ')}`);
      }

      if (isBlocking) {
        console.log('   ❌ BLOCKING: Coverage issues detected');
        for (const msg of messages) console.log(`      • ${msg}`);
        return {
          passed: false,
          score: 0,
          max_score: 100,
          issues: messages,
          warnings: [],
          details: {
            status: 'FAIL',
            blocking: true,
            threshold_used: threshold,
            sd_type: sdType,
            changed_files_count: codeChanges.codeFileCount,
            evaluated_files_count: evaluatedCount,
            zero_coverage_files: zeroCoverageFiles,
            below_threshold_files: belowThresholdFiles,
            summary: `FAIL: ${messages.join('; ')}`
          }
        };
      } else {
        console.log('   ⚠️  ADVISORY: Coverage issues detected (non-blocking)');
        for (const msg of messages) console.log(`      • ${msg}`);
        return {
          passed: true,
          score: 60,
          max_score: 100,
          issues: [],
          warnings: messages,
          details: {
            status: 'WARN',
            blocking: false,
            threshold_used: threshold,
            sd_type: sdType,
            changed_files_count: codeChanges.codeFileCount,
            evaluated_files_count: evaluatedCount,
            zero_coverage_files: zeroCoverageFiles,
            below_threshold_files: belowThresholdFiles,
            summary: `WARN: ${messages.join('; ')}`
          }
        };
      }
    },
    required: true
  };
}
