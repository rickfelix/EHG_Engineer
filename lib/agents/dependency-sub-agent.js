/**
 * Dependency Sub-Agent - Intelligent Dependency Analysis
 * Extends BaseSubAgent for full integration with improvements
 * Analyzes npm packages, security vulnerabilities, and dependency health
 *
 * REFACTORED: Modularized from 947 LOC to ~80 LOC (SD-LEO-REFAC-TESTING-INFRA-001)
 * Modules: config, package-analyzers, security-analyzers, optimization-analyzers, tree-analyzers
 */

import BaseSubAgent from './base-sub-agent.js';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

import {
  THRESHOLDS,
  createDepHealthState,
  analyzePackageJSON,
  analyzeProjectLicense,
  analyzeVulnerabilities,
  analyzeLicenses,
  analyzeOutdatedPackages,
  analyzeUnusedDependencies,
  analyzeBundleSize,
  analyzeDuplicates,
  analyzeDeprecatedPackages,
  analyzeDependencyTree,
  analyzePackageLock
} from './dependency/index.js';

class DependencySubAgent extends BaseSubAgent {
  constructor() {
    super('Dependencies', '\u{1F4E6}');
    this.thresholds = THRESHOLDS;
    this.depHealth = createDepHealthState();
  }

  async analyze(context = {}) {
    const basePath = context.basePath || process.cwd();
    const addFinding = this.addFinding.bind(this);

    console.log('\u{1F4E6} Intelligent Dependency Analysis Starting...');

    // Check if package.json exists
    const packagePath = path.join(basePath, 'package.json');
    let packageJson;

    try {
      packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
    } catch {
      addFinding({
        type: 'MISSING_PACKAGE_JSON',
        severity: 'critical',
        confidence: 1.0,
        file: 'package.json',
        description: 'No package.json found in project',
        recommendation: 'Initialize npm project with `npm init`',
        metadata: { required: true }
      });
      return;
    }

    // Run all analysis modules
    analyzePackageJSON(packageJson, this.depHealth, addFinding);
    await analyzeVulnerabilities(basePath, this.depHealth, addFinding);
    await analyzeOutdatedPackages(basePath, this.depHealth, addFinding);
    await analyzeLicenses(basePath, addFinding);
    analyzeProjectLicense(packageJson, addFinding);
    await analyzeUnusedDependencies(basePath, packageJson, this.depHealth, addFinding);
    analyzeBundleSize(packageJson, addFinding);
    await analyzeDuplicates(basePath, addFinding);
    analyzeDeprecatedPackages(packageJson, addFinding);
    await analyzeDependencyTree(basePath, addFinding);
    await analyzePackageLock(basePath, addFinding);

    console.log(`\u2713 Analyzed ${this.depHealth.totalDependencies} dependencies`);
  }
}

export default DependencySubAgent;
