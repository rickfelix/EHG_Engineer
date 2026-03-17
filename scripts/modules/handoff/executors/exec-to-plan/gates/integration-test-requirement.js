/**
 * Integration Test Requirement Gate for EXEC-TO-PLAN
 * Part of SD-LEO-ORCH-QUALITY-GATE-ENHANCEMENTS-001-E
 *
 * For complex SDs (story_points >= 5 OR has_children OR modifies 3+ modules),
 * checks for integration test files in tests/integration/.
 *
 * BLOCKING for feature/refactor with SP >= 5.
 * NON-BLOCKING (advisory) for other complex SDs.
 *
 * Fixes GAP-003 (zero integration tests).
 */

import { existsSync, readFileSync, readdirSync, statSync, realpathSync } from 'fs';
import { resolve, relative, extname } from 'path';
import { execSync } from 'child_process';
import { categorizeTestFiles } from '../../../../../lib/test-categorizer.js';

/**
 * Valid integration test file extensions
 */
const TEST_FILE_EXTENSIONS = new Set(['.js', '.ts', '.mjs', '.cjs']);

/**
 * Minimum number of lines containing `test(` across all integration test files
 * to be considered non-trivial.
 */
const MIN_TEST_CALL_COUNT = 10;

/**
 * SD types where missing integration tests are BLOCKING when SP >= 5.
 */
const BLOCKING_SD_TYPES = new Set(['feature', 'refactor']);

/**
 * Determine if an SD is "complex" based on the criteria:
 * - story_points >= 5
 * - has children (parent_sd_id is referenced by other SDs)
 * - modifies 3+ modules
 *
 * @param {Object} sd - Strategic directive object
 * @param {Object} options - Additional context
 * @returns {{ isComplex: boolean, reasons: string[] }}
 */
function classifyComplexity(sd, options = {}) {
  const reasons = [];
  const storyPoints = sd.story_points || sd.metadata?.story_points || 0;
  const hasChildren = !!(options.hasChildren || sd.has_children);

  // Count modified modules from git diff
  // SD-LEO-FIX-HANDOFF-PIPELINE-GIT-001: Pass gitContext for cached lookups
  const modifiedModulesCount = options.modifiedModulesCount !== undefined
    ? options.modifiedModulesCount
    : countModifiedModules(options.gitContext);

  if (storyPoints >= 5) {
    reasons.push(`story_points=${storyPoints} (>= 5)`);
  }
  if (hasChildren) {
    reasons.push('SD has child SDs');
  }
  if (modifiedModulesCount >= 3) {
    reasons.push(`modified_modules=${modifiedModulesCount} (>= 3)`);
  }

  return {
    isComplex: reasons.length > 0,
    reasons,
    storyPoints,
    hasChildren,
    modifiedModulesCount
  };
}

/**
 * Count distinct top-level modules modified in the current branch.
 * A "module" is the first path segment (e.g., "scripts/", "lib/", "tests/").
 * SD-LEO-FIX-HANDOFF-PIPELINE-GIT-001: Accepts optional SharedGitContext to avoid redundant git calls.
 *
 * @param {Object} [gitContext] - SharedGitContext instance (optional, falls back to execSync)
 * @returns {number} Number of distinct modified modules
 */
function countModifiedModules(gitContext) {
  try {
    // SD-LEO-FIX-HANDOFF-PIPELINE-GIT-001: Use cached diffFiles when available
    let files;
    if (gitContext && gitContext.diffFiles) {
      files = gitContext.diffFiles;
    } else {
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8', timeout: 10000
      }).trim();

      let diffOutput;
      if (currentBranch === 'main' || currentBranch === 'master') {
        diffOutput = execSync('git diff --name-only HEAD', {
          encoding: 'utf8', timeout: 10000
        });
      } else {
        diffOutput = execSync('git diff --name-only main...HEAD', {
          encoding: 'utf8', timeout: 10000
        });
      }

      files = diffOutput.split('\n').map(f => f.trim()).filter(Boolean);
    }

    const modules = new Set();
    for (const file of files) {
      const firstSegment = file.split('/')[0];
      if (firstSegment) modules.add(firstSegment);
    }
    return modules.size;
  } catch {
    return 0;
  }
}

/**
 * Recursively find integration test files under a directory.
 * Does NOT follow symlinks outside the repo root (security).
 *
 * @param {string} dir - Directory to scan
 * @param {string} repoRoot - Repository root for symlink boundary check
 * @returns {string[]} Array of absolute file paths
 */
function findIntegrationTestFiles(dir, repoRoot) {
  const files = [];

  if (!existsSync(dir)) return files;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const fullPath = resolve(dir, entry.name);

    // Security: check for symlinks escaping repo root
    if (entry.isSymbolicLink()) {
      try {
        const realPath = realpathSync(fullPath);
        const rel = relative(repoRoot, realPath);
        if (rel.startsWith('..') || rel.startsWith('/') || /^[a-zA-Z]:/.test(rel)) {
          console.log(`   ⚠️  Skipping symlink escaping repo: ${entry.name} → ${realPath}`);
          continue;
        }
      } catch {
        console.log(`   ⚠️  Skipping unresolvable symlink: ${entry.name}`);
        continue;
      }
    }

    if (entry.isDirectory() || (entry.isSymbolicLink() && statSync(fullPath).isDirectory())) {
      files.push(...findIntegrationTestFiles(fullPath, repoRoot));
    } else if (entry.isFile() || (entry.isSymbolicLink() && statSync(fullPath).isFile())) {
      const ext = extname(entry.name);
      if (TEST_FILE_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Count lines containing `test(` in a set of files.
 *
 * @param {string[]} files - Array of absolute file paths
 * @returns {{ totalTestCalls: number, perFile: Array<{file: string, count: number}> }}
 */
function countTestCalls(files) {
  const perFile = [];
  let totalTestCalls = 0;

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      const count = lines.filter(line => line.includes('test(')).length;
      perFile.push({ file: filePath, count });
      totalTestCalls += count;
    } catch {
      perFile.push({ file: filePath, count: 0 });
    }
  }

  return { totalTestCalls, perFile };
}

/**
 * Check if SD has children by querying Supabase.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdId - SD UUID
 * @returns {Promise<boolean>}
 */
async function checkHasChildren(supabase, sdId) {
  if (!supabase) return false;
  try {
    const { data } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('parent_sd_id', sdId)
      .limit(1);
    return data && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * Create the GATE_INTEGRATION_TEST_REQUIREMENT gate validator.
 *
 * @param {Object} supabase - Supabase client
 * @returns {Object} Gate configuration { name, validator, required }
 */
export function createIntegrationTestRequirementGate(supabase) {
  return {
    name: 'GATE_INTEGRATION_TEST_REQUIREMENT',

    validator: async (ctx) => {
      console.log('\n🧪 GATE: Integration Test Requirement');
      console.log('-'.repeat(50));

      const sd = ctx.sd || {};
      const sdType = (sd.sd_type || 'feature').toLowerCase();
      const sdId = sd.id || sd.sd_key;

      console.log(`   SD Type: ${sdType}`);

      // Check if SD has children
      const hasChildren = await checkHasChildren(supabase, sdId);

      // Classify complexity
      // SD-LEO-FIX-HANDOFF-PIPELINE-GIT-001: Pass gitContext for cached git lookups
      const complexity = classifyComplexity(sd, {
        hasChildren,
        modifiedModulesCount: undefined, // auto-detect from git (uses gitContext when available)
        gitContext: ctx.gitContext
      });

      console.log(`   Complex: ${complexity.isComplex}`);
      if (complexity.isComplex) {
        console.log(`   Reasons: ${complexity.reasons.join(', ')}`);
      }

      // If not complex, gate passes automatically
      if (!complexity.isComplex) {
        console.log('   ✅ SD is not complex - integration test check not required');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
          details: {
            status: 'PASS',
            blocking: false,
            complexity: complexity,
            summary: 'SD complexity criteria not met - integration tests not required'
          }
        };
      }

      // Determine enforcement mode
      const isBlocking = complexity.storyPoints >= 5 && BLOCKING_SD_TYPES.has(sdType);
      console.log(`   Enforcement: ${isBlocking ? 'BLOCKING' : 'ADVISORY'}`);

      // Scan for integration test files
      const repoRoot = process.cwd();
      const integrationDir = resolve(repoRoot, 'tests', 'integration');

      if (!existsSync(integrationDir)) {
        const message = 'No integration test directory found at tests/integration/. ' +
          `Complex SDs (${complexity.reasons.join(', ')}) should include integration tests. ` +
          `Create tests/integration/ and add test files with > ${MIN_TEST_CALL_COUNT} test() calls.`;

        if (isBlocking) {
          console.log(`   ❌ BLOCKING: ${message}`);
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [message],
            warnings: [],
            details: {
              status: 'FAIL',
              blocking: true,
              complexity,
              integration_dir_exists: false,
              files_found: 0,
              test_call_count: 0,
              threshold: MIN_TEST_CALL_COUNT,
              summary: message
            }
          };
        } else {
          console.log(`   ⚠️  ADVISORY: ${message}`);
          return {
            passed: true,
            score: 50,
            max_score: 100,
            issues: [],
            warnings: [message],
            details: {
              status: 'WARN',
              blocking: false,
              complexity,
              integration_dir_exists: false,
              files_found: 0,
              test_call_count: 0,
              threshold: MIN_TEST_CALL_COUNT,
              summary: message
            }
          };
        }
      }

      // Find integration test files
      const testFiles = findIntegrationTestFiles(integrationDir, repoRoot);
      console.log(`   📄 Integration test files found: ${testFiles.length}`);

      if (testFiles.length === 0) {
        const message = 'No integration test files found in tests/integration/ ' +
          '(expected .js, .ts, .mjs, or .cjs files). ' +
          `Complex SDs (${complexity.reasons.join(', ')}) should include integration tests with > ${MIN_TEST_CALL_COUNT} test() calls.`;

        if (isBlocking) {
          console.log(`   ❌ BLOCKING: ${message}`);
          return {
            passed: false,
            score: 0,
            max_score: 100,
            issues: [message],
            warnings: [],
            details: {
              status: 'FAIL',
              blocking: true,
              complexity,
              integration_dir_exists: true,
              files_found: 0,
              test_call_count: 0,
              threshold: MIN_TEST_CALL_COUNT,
              summary: message
            }
          };
        } else {
          console.log(`   ⚠️  ADVISORY: ${message}`);
          return {
            passed: true,
            score: 50,
            max_score: 100,
            issues: [],
            warnings: [message],
            details: {
              status: 'WARN',
              blocking: false,
              complexity,
              integration_dir_exists: true,
              files_found: 0,
              test_call_count: 0,
              threshold: MIN_TEST_CALL_COUNT,
              summary: message
            }
          };
        }
      }

      // Gap 1: Categorize test files — detect mock-only "integration" tests
      const categorization = categorizeTestFiles(testFiles, repoRoot);
      if (categorization.summary.mockOnlyIntegration) {
        console.log(`   ⚠️  MOCK-ONLY DETECTION: All ${categorization.summary.integrationFileCount} integration test(s) use mocks with no real clients`);
        console.log('      These are effectively unit tests in the integration directory.');
        console.log('      Score penalty: -25 points');
      }

      // Count test() calls
      const { totalTestCalls, perFile } = countTestCalls(testFiles);
      console.log(`   🧪 Total test() calls: ${totalTestCalls} (threshold: > ${MIN_TEST_CALL_COUNT})`);

      // Log per-file breakdown
      for (const entry of perFile) {
        const relPath = relative(repoRoot, entry.file).replace(/\\/g, '/');
        console.log(`      ${relPath}: ${entry.count} test() calls`);
      }

      const relFilePaths = testFiles.map(f => relative(repoRoot, f).replace(/\\/g, '/'));

      if (totalTestCalls <= MIN_TEST_CALL_COUNT) {
        const message = `Integration tests are trivial: ${totalTestCalls} test() calls found ` +
          `(required: > ${MIN_TEST_CALL_COUNT}). ` +
          'Add more integration tests in tests/integration/ to meet the threshold.' +
          (isBlocking ? ' This is BLOCKING for this SD type.' : '');

        if (isBlocking) {
          console.log(`   ❌ BLOCKING: ${message}`);
          return {
            passed: false,
            score: Math.max(0, Math.round((totalTestCalls / MIN_TEST_CALL_COUNT) * 50)),
            max_score: 100,
            issues: [message],
            warnings: [],
            details: {
              status: 'FAIL',
              blocking: true,
              complexity,
              integration_dir_exists: true,
              files_found: testFiles.length,
              files: relFilePaths,
              per_file_counts: perFile.map(e => ({
                file: relative(repoRoot, e.file).replace(/\\/g, '/'),
                count: e.count
              })),
              test_call_count: totalTestCalls,
              threshold: MIN_TEST_CALL_COUNT,
              summary: message
            }
          };
        } else {
          console.log(`   ⚠️  ADVISORY: ${message}`);
          return {
            passed: true,
            score: 50 + Math.round((totalTestCalls / MIN_TEST_CALL_COUNT) * 25),
            max_score: 100,
            issues: [],
            warnings: [message],
            details: {
              status: 'WARN',
              blocking: false,
              complexity,
              integration_dir_exists: true,
              files_found: testFiles.length,
              files: relFilePaths,
              per_file_counts: perFile.map(e => ({
                file: relative(repoRoot, e.file).replace(/\\/g, '/'),
                count: e.count
              })),
              test_call_count: totalTestCalls,
              threshold: MIN_TEST_CALL_COUNT,
              summary: message
            }
          };
        }
      }

      // All checks passed — apply mock-only penalty if detected
      let finalScore = 100;
      const finalWarnings = [];

      if (categorization.summary.mockOnlyIntegration) {
        finalScore = 75;
        finalWarnings.push(
          `All ${categorization.summary.integrationFileCount} integration test file(s) contain only mocks (vi.mock/mockResolvedValue) with no real client connections. ` +
          'Consider adding tests that use real Supabase/API clients for true integration coverage. Score reduced to 75.'
        );
      }

      console.log(`   ✅ Integration tests meet requirements${finalScore < 100 ? ` (score: ${finalScore}, mock-only penalty applied)` : ''}`);
      return {
        passed: true,
        score: finalScore,
        max_score: 100,
        issues: [],
        warnings: finalWarnings,
        details: {
          status: finalScore === 100 ? 'PASS' : 'WARN',
          blocking: false,
          complexity,
          integration_dir_exists: true,
          files_found: testFiles.length,
          files: relFilePaths,
          per_file_counts: perFile.map(e => ({
            file: relative(repoRoot, e.file).replace(/\\/g, '/'),
            count: e.count
          })),
          test_call_count: totalTestCalls,
          threshold: MIN_TEST_CALL_COUNT,
          mock_only_integration: categorization.summary.mockOnlyIntegration,
          categorization_summary: categorization.summary,
          summary: `${finalScore === 100 ? 'PASS' : 'WARN'}: ${totalTestCalls} test() calls across ${testFiles.length} files (> ${MIN_TEST_CALL_COUNT} required)${categorization.summary.mockOnlyIntegration ? ' — mock-only penalty applied' : ''}`
        }
      };
    },

    required: true
  };
}

// Exported for testing
export {
  classifyComplexity,
  countModifiedModules,
  findIntegrationTestFiles,
  countTestCalls,
  MIN_TEST_CALL_COUNT,
  BLOCKING_SD_TYPES,
  TEST_FILE_EXTENSIONS
};
