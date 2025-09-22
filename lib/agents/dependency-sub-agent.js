/**
 * Dependency Sub-Agent - Intelligent Dependency Analysis
 * Extends BaseSubAgent for full integration with improvements
 * Analyzes npm packages, security vulnerabilities, and dependency health
 */

import BaseSubAgent from './base-sub-agent';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import { execSync } from 'child_process';

class DependencySubAgent extends BaseSubAgent {
  constructor() {
    super('Dependencies', '📦');
    
    // Dependency health thresholds
    this.thresholds = {
      vulnerabilities: {
        critical: 0,    // No critical vulnerabilities
        high: 2,        // Max 2 high vulnerabilities
        moderate: 10,   // Max 10 moderate vulnerabilities
        low: 50         // Max 50 low vulnerabilities
      },
      outdated: {
        major: 5,       // Max 5 major version behind
        minor: 20,      // Max 20 minor versions behind
        patch: 100      // Max 100 patch versions behind
      },
      bundleSize: 5,    // Max 5MB bundle size warning
      unusedDeps: 0.1,  // Max 10% unused dependencies
      licenseCompliance: 0.95  // 95% license compliance
    };
    
    // Dependency health tracking
    this.depHealth = {
      totalDependencies: 0,
      productionDeps: 0,
      devDependencies: 0,
      vulnerabilities: {},
      outdatedPackages: [],
      unusedDependencies: [],
      licenseIssues: [],
      bundleImpact: new Map(),
      duplicates: []
    };
  }

  /**
   * Analyze dependencies
   */
  async analyze(context = {}) {
    const basePath = context.basePath || process.cwd();
    
    console.log('📦 Intelligent Dependency Analysis Starting...');
    
    // Check if package.json exists
    const packagePath = path.join(basePath, 'package.json');
    let packageJson;
    
    try {
      packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
    } catch (error) {
      this.addFinding({
        type: 'MISSING_PACKAGE_JSON',
        severity: 'critical',
        confidence: 1.0,
        file: 'package.json',
        description: 'No package.json found in project',
        recommendation: 'Initialize npm project with `npm init`',
        metadata: {
          required: true
        }
      });
      return;
    }
    
    // Analyze package.json structure
    await this.analyzePackageJSON(packageJson, basePath);
    
    // Check for security vulnerabilities
    await this.analyzeVulnerabilities(basePath);
    
    // Check for outdated dependencies
    await this.analyzeOutdatedPackages(basePath);
    
    // Analyze license compliance
    await this.analyzeLicenses(basePath, packageJson);
    
    // Check for unused dependencies
    await this.analyzeUnusedDependencies(basePath, packageJson);
    
    // Analyze bundle size impact
    await this.analyzeBundleSize(basePath, packageJson);
    
    // Check for dependency duplicates
    await this.analyzeDuplicates(basePath);
    
    // Check for deprecated packages
    await this.analyzeDeprecatedPackages(packageJson);
    
    // Analyze dependency tree depth
    await this.analyzeDependencyTree(basePath);
    
    // Check package-lock.json consistency
    await this.analyzePackageLock(basePath);
    
    console.log(`✓ Analyzed ${this.depHealth.totalDependencies} dependencies`);
  }

  /**
   * Analyze package.json structure
   */
  async analyzePackageJSON(pkg, basePath) {
    const deps = pkg.dependencies || {};
    const devDeps = pkg.devDependencies || {};
    
    this.depHealth.totalDependencies = Object.keys(deps).length + Object.keys(devDeps).length;
    this.depHealth.productionDeps = Object.keys(deps).length;
    this.depHealth.devDependencies = Object.keys(devDeps).length;
    
    // Check for missing essential fields
    const essentialFields = ['name', 'version', 'description', 'author'];
    const missingFields = essentialFields.filter(field => !pkg[field]);
    
    if (missingFields.length > 0) {
      this.addFinding({
        type: 'INCOMPLETE_PACKAGE_JSON',
        severity: 'low',
        confidence: 1.0,
        file: 'package.json',
        description: `Missing fields: ${missingFields.join(', ')}`,
        recommendation: 'Add missing metadata fields to package.json',
        metadata: {
          missingFields
        }
      });
    }
    
    // Check for dev dependencies in production
    const prodDepNames = Object.keys(deps);
    const commonDevOnlyPackages = [
      '@types/', 'jest', 'mocha', 'chai', 'sinon', 'eslint', 'prettier',
      'webpack', 'babel', 'typescript', 'nodemon', 'ts-node'
    ];
    
    const devInProd = prodDepNames.filter(dep => 
      commonDevOnlyPackages.some(devPkg => dep.includes(devPkg))
    );
    
    if (devInProd.length > 0) {
      this.addFinding({
        type: 'DEV_DEPENDENCIES_IN_PRODUCTION',
        severity: 'medium',
        confidence: 0.9,
        file: 'package.json',
        description: `Dev-only packages in production dependencies: ${devInProd.join(', ')}`,
        recommendation: 'Move development tools to devDependencies',
        metadata: {
          packages: devInProd,
          impact: 'Increases bundle size and attack surface'
        }
      });
    }
    
    // Check for missing engines field
    if (!pkg.engines && prodDepNames.length > 0) {
      this.addFinding({
        type: 'MISSING_ENGINES_FIELD',
        severity: 'low',
        confidence: 0.8,
        file: 'package.json',
        description: 'No engines field specified',
        recommendation: 'Specify Node.js version requirements in engines field',
        metadata: {
          suggestion: 'engines: { "node": ">=14.0.0" }'
        }
      });
    }
    
    // Check for security-sensitive packages without version pinning
    const securityCritical = prodDepNames.filter(dep => 
      ['jsonwebtoken', 'bcrypt', 'crypto', 'passport', 'helmet'].includes(dep)
    );
    
    for (const criticalPkg of securityCritical) {
      const version = deps[criticalPkg];
      if (version.startsWith('^') || version.startsWith('~')) {
        this.addFinding({
          type: 'UNPINNED_SECURITY_PACKAGE',
          severity: 'medium',
          confidence: 0.9,
          file: 'package.json',
          description: `Security-critical package ${criticalPkg} uses flexible versioning`,
          recommendation: 'Pin exact versions for security-sensitive packages',
          metadata: {
            package: criticalPkg,
            currentVersion: version,
            suggestion: 'Use exact version without ^ or ~'
          }
        });
      }
    }
    
    // Check for too many dependencies
    if (this.depHealth.productionDeps > 50) {
      this.addFinding({
        type: 'TOO_MANY_DEPENDENCIES',
        severity: 'medium',
        confidence: 0.8,
        file: 'package.json',
        description: `${this.depHealth.productionDeps} production dependencies (high maintenance burden)`,
        recommendation: 'Audit and remove unnecessary dependencies',
        metadata: {
          count: this.depHealth.productionDeps,
          threshold: 50
        }
      });
    }
  }

  /**
   * Analyze security vulnerabilities
   */
  async analyzeVulnerabilities(basePath) {
    try {
      console.log('   Running npm audit...');
      
      // Run npm audit
      const auditResult = execSync('npm audit --json', {
        cwd: basePath,
        stdio: 'pipe',
        encoding: 'utf8'
      });
      
      const audit = JSON.parse(auditResult);
      
      if (audit.vulnerabilities) {
        this.depHealth.vulnerabilities = {
          critical: 0,
          high: 0,
          moderate: 0,
          low: 0,
          info: 0
        };
        
        // Count vulnerabilities by severity
        for (const [packageName, vuln] of Object.entries(audit.vulnerabilities)) {
          const severity = vuln.severity || 'info';
          this.depHealth.vulnerabilities[severity] = 
            (this.depHealth.vulnerabilities[severity] || 0) + 1;
          
          // Report critical and high vulnerabilities
          if (severity === 'critical' || severity === 'high') {
            this.addFinding({
              type: 'SECURITY_VULNERABILITY',
              severity: severity === 'critical' ? 'critical' : 'high',
              confidence: 1.0,
              file: 'package.json',
              description: `${severity.toUpperCase()} vulnerability in ${packageName}: ${vuln.title || 'Unknown issue'}`,
              recommendation: `Run 'npm audit fix' or update ${packageName}`,
              metadata: {
                package: packageName,
                severity,
                title: vuln.title,
                url: vuln.url,
                fixAvailable: vuln.fixAvailable
              }
            });
          }
        }
        
        // Check against thresholds
        for (const [severity, count] of Object.entries(this.depHealth.vulnerabilities)) {
          const threshold = this.thresholds.vulnerabilities[severity];
          if (threshold !== undefined && count > threshold) {
            this.addFinding({
              type: 'VULNERABILITY_THRESHOLD_EXCEEDED',
              severity: severity === 'critical' ? 'critical' : 'high',
              confidence: 1.0,
              file: 'security',
              description: `${count} ${severity} vulnerabilities exceed threshold of ${threshold}`,
              recommendation: 'Address vulnerabilities with npm audit fix or package updates',
              metadata: {
                severity,
                count,
                threshold,
                command: 'npm audit fix'
              }
            });
          }
        }
        
        console.log(`   Found ${audit.metadata?.vulnerabilities?.total || 0} total vulnerabilities`);
      }
      
    } catch (error) {
      if (error.status === 1) {
        // npm audit found issues but returned valid JSON
        try {
          const audit = JSON.parse(error.stdout);
          // Process audit results...
        } catch {
          this.addFinding({
            type: 'AUDIT_FAILED',
            severity: 'medium',
            confidence: 0.8,
            file: 'npm-audit',
            description: 'npm audit command failed',
            recommendation: 'Check npm installation and network connectivity',
            metadata: {
              error: error.message
            }
          });
        }
      } else {
        console.log('   npm audit failed:', error.message);
      }
    }
  }

  /**
   * Analyze outdated packages
   */
  async analyzeOutdatedPackages(basePath) {
    try {
      console.log('   Checking for outdated packages...');
      
      const outdatedResult = execSync('npm outdated --json', {
        cwd: basePath,
        stdio: 'pipe',
        encoding: 'utf8'
      });
      
      const outdated = JSON.parse(outdatedResult);
      
      if (Object.keys(outdated).length > 0) {
        let majorOutdated = 0;
        let minorOutdated = 0;
        let patchOutdated = 0;
        
        for (const [packageName, info] of Object.entries(outdated)) {
          const current = info.current;
          const wanted = info.wanted;
          const latest = info.latest;
          
          this.depHealth.outdatedPackages.push({
            name: packageName,
            current,
            wanted,
            latest,
            type: info.type
          });
          
          // Determine update type
          const currentParts = current.split('.');
          const latestParts = latest.split('.');
          
          if (latestParts[0] > currentParts[0]) {
            majorOutdated++;
          } else if (latestParts[1] > currentParts[1]) {
            minorOutdated++;
          } else {
            patchOutdated++;
          }
          
          // Flag security-critical packages that are very outdated
          const securityPackages = ['express', 'helmet', 'cors', 'jsonwebtoken'];
          if (securityPackages.includes(packageName) && latestParts[0] > currentParts[0]) {
            this.addFinding({
              type: 'OUTDATED_SECURITY_PACKAGE',
              severity: 'high',
              confidence: 0.9,
              file: 'package.json',
              description: `Security package ${packageName} is ${current} but latest is ${latest}`,
              recommendation: `Update ${packageName} to latest version`,
              metadata: {
                package: packageName,
                current,
                latest,
                type: 'security'
              }
            });
          }
        }
        
        // Report on outdated packages
        if (majorOutdated > this.thresholds.outdated.major) {
          this.addFinding({
            type: 'TOO_MANY_MAJOR_OUTDATED',
            severity: 'medium',
            confidence: 0.9,
            file: 'dependencies',
            description: `${majorOutdated} packages have major version updates available`,
            recommendation: 'Review and update packages with breaking changes',
            metadata: {
              count: majorOutdated,
              threshold: this.thresholds.outdated.major
            }
          });
        }
        
        console.log(`   Found ${Object.keys(outdated).length} outdated packages`);
      }
      
    } catch (error) {
      if (error.status === 1) {
        // npm outdated returns exit code 1 when packages are outdated, but may still have valid output
        try {
          if (error.stdout) {
            const outdated = JSON.parse(error.stdout);
            // Process results...
          }
        } catch {
          // Ignore parsing errors
        }
      }
      console.log('   Outdated package check completed');
    }
  }

  /**
   * Analyze licenses
   */
  async analyzeLicenses(basePath, packageJson) {
    try {
      console.log('   Analyzing licenses...');
      
      // Check if license-checker is available
      let licenseData = null;
      
      try {
        const licenseResult = execSync('npx license-checker --json', {
          cwd: basePath,
          stdio: 'pipe',
          encoding: 'utf8'
        });
        licenseData = JSON.parse(licenseResult);
      } catch {
        // license-checker not available, use basic analysis
      }
      
      if (licenseData) {
        const licenses = new Map();
        const problematicLicenses = ['GPL-3.0', 'AGPL-3.0', 'WTFPL'];
        const unknownLicenses = [];
        
        for (const [packageName, info] of Object.entries(licenseData)) {
          const license = info.licenses || 'Unknown';
          
          if (!licenses.has(license)) {
            licenses.set(license, []);
          }
          licenses.get(license).push(packageName);
          
          // Check for problematic licenses
          if (problematicLicenses.includes(license)) {
            this.addFinding({
              type: 'PROBLEMATIC_LICENSE',
              severity: 'high',
              confidence: 0.9,
              file: 'licenses',
              description: `Package ${packageName} uses ${license} license`,
              recommendation: 'Review license compatibility with your project',
              metadata: {
                package: packageName,
                license,
                type: 'legal-risk'
              }
            });
          }
          
          if (license === 'Unknown' || license === 'UNLICENSED') {
            unknownLicenses.push(packageName);
          }
        }
        
        // Report on unknown licenses
        if (unknownLicenses.length > 0) {
          this.addFinding({
            type: 'UNKNOWN_LICENSES',
            severity: 'medium',
            confidence: 0.8,
            file: 'licenses',
            description: `${unknownLicenses.length} packages have unknown licenses`,
            recommendation: 'Investigate license terms for packages with unknown licenses',
            metadata: {
              packages: unknownLicenses.slice(0, 5),
              count: unknownLicenses.length
            }
          });
        }
        
        console.log(`   Analyzed licenses for ${Object.keys(licenseData).length} packages`);
      }
      
      // Check project license
      if (!packageJson.license) {
        this.addFinding({
          type: 'MISSING_PROJECT_LICENSE',
          severity: 'low',
          confidence: 0.9,
          file: 'package.json',
          description: 'Project license not specified',
          recommendation: 'Add license field to package.json',
          metadata: {
            suggestion: 'Common licenses: MIT, Apache-2.0, ISC'
          }
        });
      }
      
    } catch (error) {
      console.log('   License analysis skipped:', error.message);
    }
  }

  /**
   * Analyze unused dependencies
   */
  async analyzeUnusedDependencies(basePath, packageJson) {
    try {
      console.log('   Checking for unused dependencies...');
      
      const deps = Object.keys(packageJson.dependencies || {});
      const unusedDeps = [];
      
      // Simple heuristic: check if dependency is imported/required in source files
      const sourceFiles = await this.findSourceFiles(basePath);
      
      for (const dep of deps) {
        let isUsed = false;
        
        // Check a sample of source files
        for (const file of sourceFiles.slice(0, 20)) {
          try {
            const content = await fs.readFile(file, 'utf8');
            
            // Check for imports/requires
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
        
        if (unusedRatio > this.thresholds.unusedDeps) {
          this.addFinding({
            type: 'UNUSED_DEPENDENCIES',
            severity: 'medium',
            confidence: 0.7, // Lower confidence due to heuristic nature
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
        
        this.depHealth.unusedDependencies = unusedDeps;
      }
      
    } catch (error) {
      console.log('   Unused dependency analysis failed:', error.message);
    }
  }

  /**
   * Analyze bundle size impact
   */
  async analyzeBundleSize(basePath, packageJson) {
    const deps = Object.keys(packageJson.dependencies || {});
    const heavyPackages = [
      'moment', 'lodash', 'axios', 'react', 'vue', '@angular/core',
      'three', 'd3', 'chart.js', 'webpack'
    ];
    
    const detectedHeavyPackages = deps.filter(dep => 
      heavyPackages.includes(dep) || dep.includes('polyfill')
    );
    
    if (detectedHeavyPackages.length > 0) {
      for (const pkg of detectedHeavyPackages) {
        let recommendation = 'Consider bundle size impact';
        let alternatives = '';
        
        switch (pkg) {
          case 'moment':
            recommendation = 'Consider switching to date-fns or day.js for smaller bundle size';
            alternatives = 'date-fns, day.js';
            break;
          case 'lodash':
            recommendation = 'Import only needed functions or use lodash-es';
            alternatives = 'Individual function imports';
            break;
          case 'axios':
            recommendation = 'Consider using native fetch API for simpler use cases';
            alternatives = 'fetch API';
            break;
        }
        
        this.addFinding({
          type: 'HEAVY_DEPENDENCY',
          severity: 'low',
          confidence: 0.8,
          file: 'package.json',
          description: `${pkg} is known to have significant bundle size impact`,
          recommendation,
          metadata: {
            package: pkg,
            alternatives,
            type: 'bundle-optimization'
          }
        });
      }
    }
    
    // Check for duplicate functionality
    const duplicateFunctionality = [
      { packages: ['axios', 'node-fetch'], functionality: 'HTTP requests' },
      { packages: ['lodash', 'ramda'], functionality: 'Utility functions' },
      { packages: ['moment', 'date-fns', 'day.js'], functionality: 'Date manipulation' },
      { packages: ['jest', 'mocha'], functionality: 'Testing framework' }
    ];
    
    for (const { packages, functionality } of duplicateFunctionality) {
      const found = packages.filter(pkg => deps.includes(pkg));
      
      if (found.length > 1) {
        this.addFinding({
          type: 'DUPLICATE_FUNCTIONALITY',
          severity: 'medium',
          confidence: 0.9,
          file: 'package.json',
          description: `Multiple packages for ${functionality}: ${found.join(', ')}`,
          recommendation: `Standardize on one package for ${functionality}`,
          metadata: {
            packages: found,
            functionality
          }
        });
      }
    }
  }

  /**
   * Analyze duplicates
   */
  async analyzeDuplicates(basePath) {
    try {
      // Check if there's a package-lock.json or yarn.lock to analyze
      const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
      let lockFile = null;
      
      for (const file of lockFiles) {
        try {
          await fs.access(path.join(basePath, file));
          lockFile = file;
          break;
        } catch {
          // File doesn't exist
        }
      }
      
      if (lockFile === 'package-lock.json') {
        // Analyze npm lock file for duplicates
        try {
          const lockContent = JSON.parse(
            await fs.readFile(path.join(basePath, lockFile), 'utf8')
          );
          
          // Simple duplicate detection (same package, different versions)
          const packageVersions = new Map();
          
          function analyzeDependencies(deps, prefix = '') {
            for (const [name, info] of Object.entries(deps || {})) {
              const fullName = prefix ? `${prefix}/${name}` : name;
              const version = info.version;
              
              if (!packageVersions.has(name)) {
                packageVersions.set(name, new Set());
              }
              packageVersions.get(name).add(version);
              
              if (info.dependencies) {
                analyzeDependencies(info.dependencies, fullName);
              }
            }
          }
          
          if (lockContent.dependencies) {
            analyzeDependencies(lockContent.dependencies);
          }
          
          // Find packages with multiple versions
          const duplicates = [];
          for (const [name, versions] of packageVersions) {
            if (versions.size > 1) {
              duplicates.push({
                package: name,
                versions: Array.from(versions)
              });
            }
          }
          
          if (duplicates.length > 5) {
            this.addFinding({
              type: 'DEPENDENCY_DUPLICATES',
              severity: 'medium',
              confidence: 0.8,
              file: 'package-lock.json',
              description: `${duplicates.length} packages have multiple versions installed`,
              recommendation: 'Run npm dedupe to reduce duplicate dependencies',
              metadata: {
                examples: duplicates.slice(0, 5),
                command: 'npm dedupe'
              }
            });
          }
          
        } catch (error) {
          // Lock file parsing error
        }
      }
      
    } catch (error) {
      console.log('   Duplicate analysis failed:', error.message);
    }
  }

  /**
   * Analyze deprecated packages
   */
  async analyzeDeprecatedPackages(packageJson) {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    // Known deprecated packages
    const deprecatedPackages = [
      'request', // Use axios or node-fetch
      'left-pad', // Use native padStart
      'babel-core', // Use @babel/core
      'babel-preset-es2015', // Use @babel/preset-env
      'node-uuid', // Use uuid
      'mkdirp', // Use fs.mkdir with recursive option
      'rimraf' // Use fs.rm with recursive option (Node 14+)
    ];
    
    const foundDeprecated = Object.keys(deps).filter(dep => 
      deprecatedPackages.includes(dep)
    );
    
    for (const pkg of foundDeprecated) {
      let replacement = '';
      
      switch (pkg) {
        case 'request':
          replacement = 'axios, node-fetch, or native fetch';
          break;
        case 'left-pad':
          replacement = 'String.prototype.padStart()';
          break;
        case 'babel-core':
          replacement = '@babel/core';
          break;
        case 'node-uuid':
          replacement = 'uuid';
          break;
        case 'mkdirp':
          replacement = 'fs.mkdir({ recursive: true })';
          break;
        case 'rimraf':
          replacement = 'fs.rm({ recursive: true })';
          break;
      }
      
      this.addFinding({
        type: 'DEPRECATED_PACKAGE',
        severity: 'high',
        confidence: 1.0,
        file: 'package.json',
        description: `Package ${pkg} is deprecated`,
        recommendation: `Replace ${pkg} with ${replacement}`,
        metadata: {
          package: pkg,
          replacement,
          deprecated: true
        }
      });
    }
  }

  /**
   * Analyze dependency tree depth
   */
  async analyzeDependencyTree(basePath) {
    try {
      // Check if dependency tree is too deep
      const result = execSync('npm list --depth=10 --json', {
        cwd: basePath,
        stdio: 'pipe',
        encoding: 'utf8'
      });
      
      const tree = JSON.parse(result);
      
      // Calculate maximum depth
      function getDepth(node, currentDepth = 0) {
        if (!node.dependencies) return currentDepth;
        
        let maxDepth = currentDepth;
        for (const dep of Object.values(node.dependencies)) {
          const depth = getDepth(dep, currentDepth + 1);
          maxDepth = Math.max(maxDepth, depth);
        }
        return maxDepth;
      }
      
      const maxDepth = getDepth(tree);
      
      if (maxDepth > 15) {
        this.addFinding({
          type: 'DEEP_DEPENDENCY_TREE',
          severity: 'low',
          confidence: 0.7,
          file: 'dependencies',
          description: `Dependency tree is ${maxDepth} levels deep`,
          recommendation: 'Consider flattening dependencies or using npm dedupe',
          metadata: {
            depth: maxDepth,
            threshold: 15
          }
        });
      }
      
    } catch (error) {
      // npm list might fail, but that's not critical
    }
  }

  /**
   * Analyze package-lock.json consistency
   */
  async analyzePackageLock(basePath) {
    try {
      const packagePath = path.join(basePath, 'package.json');
      const lockPath = path.join(basePath, 'package-lock.json');
      
      // Check if lock file exists
      try {
        await fs.access(lockPath);
      } catch {
        this.addFinding({
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
        this.addFinding({
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
      
    } catch (error) {
      // File system error
    }
  }

  /**
   * Find source files
   */
  async findSourceFiles(basePath) {
    const sourceFiles = [];
    const sourceDirs = ['src', 'lib', 'app', 'components', 'pages'];
    
    for (const dir of sourceDirs) {
      const fullPath = path.join(basePath, dir);
      
      async function scan(scanDir) {
        try {
          const entries = await fs.readdir(scanDir, { withFileTypes: true });
          
          for (const entry of entries) {
            const entryPath = path.join(scanDir, entry.name);
            
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
              continue;
            }
            
            if (entry.isDirectory()) {
              await scan(entryPath);
            } else if (entry.isFile() && 
                      (entry.name.endsWith('.js') || entry.name.endsWith('.ts') ||
                       entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx'))) {
              sourceFiles.push(entryPath);
            }
          }
        } catch {
          // Directory doesn't exist
        }
      }
      
      await scan(fullPath);
    }
    
    return sourceFiles;
  }
}

export default DependencySubAgent;