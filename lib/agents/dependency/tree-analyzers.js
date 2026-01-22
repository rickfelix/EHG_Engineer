/**
 * Dependency Tree Analysis Functions
 * Tree depth and lock file consistency analysis
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { execSync } from 'child_process';

/**
 * Analyze dependency tree depth
 */
export async function analyzeDependencyTree(basePath, addFinding) {
  try {
    const result = execSync('npm list --depth=10 --json', {
      cwd: basePath,
      stdio: 'pipe',
      encoding: 'utf8'
    });

    const tree = JSON.parse(result);
    const maxDepth = getMaxDepth(tree);

    if (maxDepth > 15) {
      addFinding({
        type: 'DEEP_DEPENDENCY_TREE',
        severity: 'low',
        confidence: 0.7,
        file: 'dependencies',
        description: `Dependency tree is ${maxDepth} levels deep`,
        recommendation: 'Consider flattening dependencies or using npm dedupe',
        metadata: { depth: maxDepth, threshold: 15 }
      });
    }

  } catch {
    // npm list might fail, but that's not critical
  }
}

function getMaxDepth(node, currentDepth = 0) {
  if (!node.dependencies) return currentDepth;

  let maxDepth = currentDepth;
  for (const dep of Object.values(node.dependencies)) {
    const depth = getMaxDepth(dep, currentDepth + 1);
    maxDepth = Math.max(maxDepth, depth);
  }
  return maxDepth;
}

/**
 * Analyze package-lock.json consistency
 */
export async function analyzePackageLock(basePath, addFinding) {
  try {
    const packagePath = path.join(basePath, 'package.json');
    const lockPath = path.join(basePath, 'package-lock.json');

    // Check if lock file exists
    try {
      await fs.access(lockPath);
    } catch {
      addFinding({
        type: 'MISSING_LOCK_FILE',
        severity: 'medium',
        confidence: 0.9,
        file: 'package-lock.json',
        description: 'No package-lock.json found',
        recommendation: 'Commit package-lock.json for reproducible builds',
        metadata: {
          required: true,
          benefit: 'Ensures exact dependency versions across environments'
        }
      });
      return;
    }

    // Check lock file age vs package.json
    const packageStats = await fs.stat(packagePath);
    const lockStats = await fs.stat(lockPath);

    if (packageStats.mtime > lockStats.mtime) {
      addFinding({
        type: 'OUTDATED_LOCK_FILE',
        severity: 'high',
        confidence: 0.95,
        file: 'package-lock.json',
        description: 'package-lock.json is older than package.json',
        recommendation: 'Run npm install to update lock file',
        metadata: {
          packageModified: packageStats.mtime.toISOString(),
          lockModified: lockStats.mtime.toISOString(),
          command: 'npm install'
        }
      });
    }

  } catch {
    // File system error
  }
}
