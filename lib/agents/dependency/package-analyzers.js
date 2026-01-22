/**
 * Package.json Analysis Functions
 * Analyzes package.json structure, fields, and dependencies
 */

import {
  ESSENTIAL_FIELDS,
  DEV_ONLY_PACKAGES,
  SECURITY_CRITICAL_PACKAGES
} from './config.js';

/**
 * Analyze package.json structure and field completeness
 */
export function analyzePackageJSON(pkg, depHealth, addFinding) {
  const deps = pkg.dependencies || {};
  const devDeps = pkg.devDependencies || {};

  depHealth.totalDependencies = Object.keys(deps).length + Object.keys(devDeps).length;
  depHealth.productionDeps = Object.keys(deps).length;
  depHealth.devDependencies = Object.keys(devDeps).length;

  // Check for missing essential fields
  const missingFields = ESSENTIAL_FIELDS.filter(field => !pkg[field]);

  if (missingFields.length > 0) {
    addFinding({
      type: 'INCOMPLETE_PACKAGE_JSON',
      severity: 'low',
      confidence: 1.0,
      file: 'package.json',
      description: `Missing fields: ${missingFields.join(', ')}`,
      recommendation: 'Add missing metadata fields to package.json',
      metadata: { missingFields }
    });
  }

  // Check for dev dependencies in production
  const prodDepNames = Object.keys(deps);
  const devInProd = prodDepNames.filter(dep =>
    DEV_ONLY_PACKAGES.some(devPkg => dep.includes(devPkg))
  );

  if (devInProd.length > 0) {
    addFinding({
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
    addFinding({
      type: 'MISSING_ENGINES_FIELD',
      severity: 'low',
      confidence: 0.8,
      file: 'package.json',
      description: 'No engines field specified',
      recommendation: 'Specify Node.js version requirements in engines field',
      metadata: { suggestion: 'engines: { "node": ">=14.0.0" }' }
    });
  }

  // Check for security-sensitive packages without version pinning
  const securityCritical = prodDepNames.filter(dep =>
    SECURITY_CRITICAL_PACKAGES.includes(dep)
  );

  for (const criticalPkg of securityCritical) {
    const version = deps[criticalPkg];
    if (version.startsWith('^') || version.startsWith('~')) {
      addFinding({
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
  if (depHealth.productionDeps > 50) {
    addFinding({
      type: 'TOO_MANY_DEPENDENCIES',
      severity: 'medium',
      confidence: 0.8,
      file: 'package.json',
      description: `${depHealth.productionDeps} production dependencies (high maintenance burden)`,
      recommendation: 'Audit and remove unnecessary dependencies',
      metadata: {
        count: depHealth.productionDeps,
        threshold: 50
      }
    });
  }
}

/**
 * Check project license
 */
export function analyzeProjectLicense(pkg, addFinding) {
  if (!pkg.license) {
    addFinding({
      type: 'MISSING_PROJECT_LICENSE',
      severity: 'low',
      confidence: 0.9,
      file: 'package.json',
      description: 'Project license not specified',
      recommendation: 'Add license field to package.json',
      metadata: { suggestion: 'Common licenses: MIT, Apache-2.0, ISC' }
    });
  }
}
