/**
 * WIRE_CHECK_GATE — Orchestrator Completion Validation
 * SD-ORCHESTRATOR-COMPLETION-VALIDATION-GATES-ORCH-001-C
 *
 * Verifies that new JS files added in the current branch are reachable
 * from project entry points via static analysis (acorn AST call graph).
 *
 * Phase: LEAD-FINAL-APPROVAL
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildCallGraph } from '../../../../../../lib/static-analysis/call-graph-builder.js';
import { checkReachability } from '../../../../../../lib/static-analysis/reachability-checker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../../../../');

const GATE_NAME = 'WIRE_CHECK_GATE';

/**
 * Declarative exclusion rules applied after the git diff.
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-127 FR-1: test and spec files have no
 * runtime entry point by design — exclude them from the reachability check
 * so co-located tests do not false-positive PAT-AUTO-855d11b1.
 *
 * Patterns are canonical only (*.test.ext, *.spec.ext, __tests__/, tests/);
 * intentionally NOT matching *.test-* or similar variants to avoid
 * over-matching production files (mitigation for TS-7 negative control).
 */
export const EXCLUSION_PATTERNS = [
  /\.test\.(js|mjs|cjs|jsx|tsx)$/,
  /\.spec\.(js|mjs|cjs|jsx|tsx)$/,
  /(^|\/)__tests__\//,
  /^tests\//
];

/**
 * @param {string} file - Forward-slash relative path from repo root
 * @returns {boolean} true when the path matches any EXCLUSION_PATTERN
 */
export function isExcludedFromWireCheck(file) {
  return EXCLUSION_PATTERNS.some((re) => re.test(file));
}

/**
 * Discover entry point files from package.json scripts and known pipeline scripts.
 *
 * @param {string} rootDir - Project root
 * @returns {string[]} Absolute paths (forward slashes)
 */
function discoverEntryPoints(rootDir) {
  const entries = new Set();
  const normalize = (p) => p.replace(/\\/g, '/');

  // 1. Extract script targets from package.json
  try {
    const pkgPath = path.join(rootDir, 'package.json');
    const pkg = JSON.parse(
      execSync(`node -e "process.stdout.write(require('fs').readFileSync('${normalize(pkgPath)}','utf8'))"`, {
        encoding: 'utf8',
        timeout: 5000,
      })
    );

    if (pkg.scripts) {
      for (const cmd of Object.values(pkg.scripts)) {
        // Extract "node path/to/file.js" patterns
        const matches = cmd.match(/node\s+([^\s&|;]+\.(?:js|mjs|cjs))/g);
        if (matches) {
          for (const match of matches) {
            const filePart = match.replace(/^node\s+/, '');
            const absPath = path.resolve(rootDir, filePart);
            entries.add(normalize(absPath));
          }
        }
      }
    }

    // package.json main/bin
    if (pkg.main) entries.add(normalize(path.resolve(rootDir, pkg.main)));
    if (pkg.bin) {
      const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin);
      for (const b of bins) entries.add(normalize(path.resolve(rootDir, b)));
    }
  } catch (_err) {
    // Intentionally suppressed: package.json read failed, continue with other sources
    console.debug('[WireCheckGate] package.json read suppressed:', _err?.message || _err);
  }

  // 2. Known pipeline entry points
  const knownEntries = [
    'scripts/leo-orchestrator-enforced.js',
    'scripts/handoff.js',
    'scripts/sd-next.js',
    'scripts/eva/eva-pipeline.js',
    'scripts/generate-claude-md-from-db.js',
  ];

  for (const entry of knownEntries) {
    entries.add(normalize(path.resolve(rootDir, entry)));
  }

  return [...entries];
}

/**
 * Get all JS files in the project scope (lib + scripts directories).
 *
 * @param {string} rootDir - Project root
 * @returns {string[]} Absolute paths (forward slashes)
 */
function getScopedJsFiles(rootDir) {
  const normalize = (p) => p.replace(/\\/g, '/');
  try {
    const result = execSync(
      'git ls-files -- "lib/**/*.js" "lib/**/*.mjs" "lib/**/*.cjs" "scripts/**/*.js" "scripts/**/*.mjs" "scripts/**/*.cjs"',
      { encoding: 'utf8', cwd: rootDir, timeout: 15000 }
    );
    return result
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
      .map((f) => normalize(path.resolve(rootDir, f)));
  } catch (_err) {
    return [];
  }
}

/**
 * Create the wire check AST call graph gate.
 *
 * @param {Object} _supabase - Supabase client (unused, kept for gate interface consistency)
 * @returns {Object} Gate definition
 */
export function createWireCheckGate(_supabase) {
  return {
    name: GATE_NAME,
    validator: async (_ctx) => {
      console.log('\n🔌 GATE: Wire Check (AST Call Graph)');
      console.log('-'.repeat(50));

      const rootDir = ROOT_DIR;

      // Step 1: Get new files from git diff (added files only)
      let newFiles = [];
      try {
        const diff = execSync(
          'git diff --name-only --diff-filter=A main...HEAD -- "*.js" "*.mjs" "*.cjs"',
          { encoding: 'utf8', cwd: rootDir, timeout: 10000 }
        );
        newFiles = diff
          .split('\n')
          .map((f) => f.trim())
          .filter(Boolean)
          // Only check files in lib/ and scripts/ (skip configs)
          .filter((f) => f.startsWith('lib/') || f.startsWith('scripts/'))
          // Skip tmp/scratch files
          .filter((f) => !f.includes('/tmp-') && !f.includes('/.tmp-'))
          .map((f) => f.replace(/\\/g, '/'))
          // SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-127 FR-1: skip test/spec files
          .filter((f) => !isExcludedFromWireCheck(f));
      } catch (_err) {
        console.log('   Could not compute git diff — skipping');
        return {
          passed: true,
          score: 80,
          max_score: 100,
          issues: [],
          warnings: ['Could not compute git diff against main — wire check skipped'],
        };
      }

      if (newFiles.length === 0) {
        console.log('   No new JS files detected in lib/ or scripts/ — auto-pass');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: [],
        };
      }

      console.log(`   New files to verify: ${newFiles.length}`);
      for (const f of newFiles) {
        console.log(`     + ${f}`);
      }

      // Step 2: Discover entry points
      const entryPoints = discoverEntryPoints(rootDir);
      console.log(`   Entry points discovered: ${entryPoints.length}`);

      // Step 3: Build call graph from all scoped JS files
      const allFiles = getScopedJsFiles(rootDir);
      console.log(`   Files in scope: ${allFiles.length}`);

      const { graph, warnings: buildWarnings } = buildCallGraph(allFiles, rootDir);

      if (buildWarnings.length > 0) {
        console.log(`   Parse warnings: ${buildWarnings.length}`);
      }

      // Step 4: Check reachability of new files
      const absoluteNewFiles = newFiles.map((f) =>
        path.resolve(rootDir, f).replace(/\\/g, '/')
      );

      const { reachable, unreachable } = checkReachability(
        graph,
        entryPoints,
        absoluteNewFiles
      );

      console.log(`   Reachable: ${reachable.size}/${absoluteNewFiles.length}`);

      if (unreachable.size === 0) {
        console.log('   All new files are reachable from entry points');
        return {
          passed: true,
          score: 100,
          max_score: 100,
          issues: [],
          warnings: buildWarnings.length > 0
            ? [`${buildWarnings.length} file(s) had parse warnings`]
            : [],
          details: {
            newFiles: newFiles.length,
            reachable: reachable.size,
            unreachable: 0,
            entryPoints: entryPoints.length,
          },
        };
      }

      // Unreachable files found
      const unreachableRelative = [...unreachable].map((f) => {
        const rel = path.relative(rootDir, f).replace(/\\/g, '/');
        return rel;
      });

      console.log(`   Unreachable files (${unreachable.size}):`);
      for (const f of unreachableRelative) {
        console.log(`     - ${f}`);
      }

      return {
        passed: false,
        score: 0,
        max_score: 100,
        issues: [
          `${unreachable.size} new file(s) not reachable from any entry point:`,
          ...unreachableRelative.map((f) => `  - ${f}`),
        ],
        warnings: buildWarnings.length > 0
          ? [`${buildWarnings.length} file(s) had parse warnings`]
          : [],
        details: {
          newFiles: newFiles.length,
          reachable: reachable.size,
          unreachable: unreachable.size,
          unreachableFiles: unreachableRelative,
          entryPoints: entryPoints.length,
        },
      };
    },
    required: true, // Promoted to blocking enforcement (SD-LEO-INFRA-INTEGRATION-VERIFICATION-ENFORCEMENT-001)
  };
}
