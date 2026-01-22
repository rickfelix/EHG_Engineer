/**
 * Optimization Analysis Functions
 * Bundle size, unused dependencies, duplicates, and deprecated packages
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import {
  HEAVY_PACKAGES,
  DUPLICATE_FUNCTIONALITY,
  DEPRECATED_PACKAGES,
  THRESHOLDS,
  LOCK_FILES
} from './config.js';

/**
 * Find source files for analysis
 */
export async function findSourceFiles(basePath) {
  const sourceFiles = [];
  const sourceDirs = ['src', 'lib', 'app', 'components', 'pages'];

  for (const dir of sourceDirs) {
    const fullPath = path.join(basePath, dir);
    await scanDirectory(fullPath, sourceFiles);
  }

  return sourceFiles;
}

async function scanDirectory(scanDir, sourceFiles) {
  try {
    const entries = await fs.readdir(scanDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(scanDir, entry.name);

      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        await scanDirectory(entryPath, sourceFiles);
      } else if (entry.isFile() && isSourceFile(entry.name)) {
        sourceFiles.push(entryPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }
}

function isSourceFile(filename) {
  return filename.endsWith('.js') || filename.endsWith('.ts') ||
         filename.endsWith('.jsx') || filename.endsWith('.tsx');
}

/**
 * Analyze unused dependencies
 */
export async function analyzeUnusedDependencies(basePath, packageJson, depHealth, addFinding) {
  try {
    console.log('   Checking for unused dependencies...');

    const deps = Object.keys(packageJson.dependencies || {});
    const unusedDeps = [];
    const sourceFiles = await findSourceFiles(basePath);

    for (const dep of deps) {
      let isUsed = false;

      for (const file of sourceFiles.slice(0, 20)) {
        try {
          const content = await fs.readFile(file, 'utf8');

          if (content.includes(`'${dep}'`) ||
              content.includes(`"${dep}"`) ||
              content.includes(`from '${dep}'`) ||
              content.includes(`require('${dep}')`)) {
            isUsed = true;
            break;
          }
        } catch {
          // File read error
        }
      }

      if (!isUsed) {
        unusedDeps.push(dep);
      }
    }

    if (unusedDeps.length > 0) {
      const unusedRatio = unusedDeps.length / deps.length;

      if (unusedRatio > THRESHOLDS.unusedDeps) {
        addFinding({
          type: 'UNUSED_DEPENDENCIES',
          severity: 'medium',
          confidence: 0.7,
          file: 'package.json',
          description: `${unusedDeps.length} potentially unused dependencies found`,
          recommendation: 'Use tools like depcheck to identify and remove unused dependencies',
          metadata: {
            packages: unusedDeps.slice(0, 5),
            count: unusedDeps.length,
            tool: 'npx depcheck'
          }
        });
      }

      depHealth.unusedDependencies = unusedDeps;
    }

  } catch (error) {
    console.log('   Unused dependency analysis failed:', error.message);
  }
}

/**
 * Analyze bundle size impact
 */
export function analyzeBundleSize(packageJson, addFinding) {
  const deps = Object.keys(packageJson.dependencies || {});

  const detectedHeavyPackages = deps.filter(dep =>
    HEAVY_PACKAGES.includes(dep) || dep.includes('polyfill')
  );

  for (const pkg of detectedHeavyPackages) {
    const { recommendation, alternatives } = getHeavyPackageInfo(pkg);

    addFinding({
      type: 'HEAVY_DEPENDENCY',
      severity: 'low',
      confidence: 0.8,
      file: 'package.json',
      description: `${pkg} is known to have significant bundle size impact`,
      recommendation,
      metadata: { package: pkg, alternatives, type: 'bundle-optimization' }
    });
  }

  // Check for duplicate functionality
  for (const { packages, functionality } of DUPLICATE_FUNCTIONALITY) {
    const found = packages.filter(pkg => deps.includes(pkg));

    if (found.length > 1) {
      addFinding({
        type: 'DUPLICATE_FUNCTIONALITY',
        severity: 'medium',
        confidence: 0.9,
        file: 'package.json',
        description: `Multiple packages for ${functionality}: ${found.join(', ')}`,
        recommendation: `Standardize on one package for ${functionality}`,
        metadata: { packages: found, functionality }
      });
    }
  }
}

function getHeavyPackageInfo(pkg) {
  switch (pkg) {
    case 'moment':
      return {
        recommendation: 'Consider switching to date-fns or day.js for smaller bundle size',
        alternatives: 'date-fns, day.js'
      };
    case 'lodash':
      return {
        recommendation: 'Import only needed functions or use lodash-es',
        alternatives: 'Individual function imports'
      };
    case 'axios':
      return {
        recommendation: 'Consider using native fetch API for simpler use cases',
        alternatives: 'fetch API'
      };
    default:
      return {
        recommendation: 'Consider bundle size impact',
        alternatives: ''
      };
  }
}

/**
 * Analyze duplicates in lock file
 */
export async function analyzeDuplicates(basePath, addFinding) {
  try {
    let lockFile = null;

    for (const file of LOCK_FILES) {
      try {
        await fs.access(path.join(basePath, file));
        lockFile = file;
        break;
      } catch {
        // File doesn't exist
      }
    }

    if (lockFile === 'package-lock.json') {
      await analyzeNpmLockDuplicates(basePath, lockFile, addFinding);
    }

  } catch {
    console.log('   Duplicate analysis failed');
  }
}

async function analyzeNpmLockDuplicates(basePath, lockFile, addFinding) {
  try {
    const lockContent = JSON.parse(
      await fs.readFile(path.join(basePath, lockFile), 'utf8')
    );

    const packageVersions = new Map();

    function analyzeDeps(deps, prefix = '') {
      for (const [name, info] of Object.entries(deps || {})) {
        const version = info.version;

        if (!packageVersions.has(name)) {
          packageVersions.set(name, new Set());
        }
        packageVersions.get(name).add(version);

        if (info.dependencies) {
          analyzeDeps(info.dependencies, `${prefix}${name}/`);
        }
      }
    }

    if (lockContent.dependencies) {
      analyzeDeps(lockContent.dependencies);
    }

    const duplicates = [];
    for (const [name, versions] of packageVersions) {
      if (versions.size > 1) {
        duplicates.push({ package: name, versions: Array.from(versions) });
      }
    }

    if (duplicates.length > 5) {
      addFinding({
        type: 'DEPENDENCY_DUPLICATES',
        severity: 'medium',
        confidence: 0.8,
        file: 'package-lock.json',
        description: `${duplicates.length} packages have multiple versions installed`,
        recommendation: 'Run npm dedupe to reduce duplicate dependencies',
        metadata: { examples: duplicates.slice(0, 5), command: 'npm dedupe' }
      });
    }

  } catch {
    // Lock file parsing error
  }
}

/**
 * Analyze deprecated packages
 */
export function analyzeDeprecatedPackages(packageJson, addFinding) {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

  const foundDeprecated = Object.keys(deps).filter(dep =>
    Object.keys(DEPRECATED_PACKAGES).includes(dep)
  );

  for (const pkg of foundDeprecated) {
    const replacement = DEPRECATED_PACKAGES[pkg];

    addFinding({
      type: 'DEPRECATED_PACKAGE',
      severity: 'high',
      confidence: 1.0,
      file: 'package.json',
      description: `Package ${pkg} is deprecated`,
      recommendation: `Replace ${pkg} with ${replacement}`,
      metadata: { package: pkg, replacement, deprecated: true }
    });
  }
}
