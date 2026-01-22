/**
 * Security Analysis Functions
 * Vulnerability scanning and security package analysis
 */

import { execSync } from 'child_process';
import { THRESHOLDS, PROBLEMATIC_LICENSES } from './config.js';

/**
 * Analyze security vulnerabilities via npm audit
 */
export async function analyzeVulnerabilities(basePath, depHealth, addFinding) {
  try {
    console.log('   Running npm audit...');

    const auditResult = execSync('npm audit --json', {
      cwd: basePath,
      stdio: 'pipe',
      encoding: 'utf8'
    });

    const audit = JSON.parse(auditResult);
    processAuditResults(audit, depHealth, addFinding);

  } catch (error) {
    if (error.status === 1 && error.stdout) {
      try {
        const audit = JSON.parse(error.stdout);
        processAuditResults(audit, depHealth, addFinding);
      } catch {
        addFinding({
          type: 'AUDIT_FAILED',
          severity: 'medium',
          confidence: 0.8,
          file: 'npm-audit',
          description: 'npm audit command failed',
          recommendation: 'Check npm installation and network connectivity',
          metadata: { error: error.message }
        });
      }
    } else {
      console.log('   npm audit failed:', error.message);
    }
  }
}

function processAuditResults(audit, depHealth, addFinding) {
  if (!audit.vulnerabilities) return;

  depHealth.vulnerabilities = {
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0
  };

  for (const [packageName, vuln] of Object.entries(audit.vulnerabilities)) {
    const severity = vuln.severity || 'info';
    depHealth.vulnerabilities[severity] =
      (depHealth.vulnerabilities[severity] || 0) + 1;

    if (severity === 'critical' || severity === 'high') {
      addFinding({
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
  for (const [severity, count] of Object.entries(depHealth.vulnerabilities)) {
    const threshold = THRESHOLDS.vulnerabilities[severity];
    if (threshold !== undefined && count > threshold) {
      addFinding({
        type: 'VULNERABILITY_THRESHOLD_EXCEEDED',
        severity: severity === 'critical' ? 'critical' : 'high',
        confidence: 1.0,
        file: 'security',
        description: `${count} ${severity} vulnerabilities exceed threshold of ${threshold}`,
        recommendation: 'Address vulnerabilities with npm audit fix or package updates',
        metadata: { severity, count, threshold, command: 'npm audit fix' }
      });
    }
  }

  console.log(`   Found ${audit.metadata?.vulnerabilities?.total || 0} total vulnerabilities`);
}

/**
 * Analyze package licenses using license-checker
 */
export async function analyzeLicenses(basePath, addFinding) {
  try {
    console.log('   Analyzing licenses...');

    const licenseResult = execSync('npx license-checker --json', {
      cwd: basePath,
      stdio: 'pipe',
      encoding: 'utf8'
    });

    const licenseData = JSON.parse(licenseResult);
    const unknownLicenses = [];

    for (const [packageName, info] of Object.entries(licenseData)) {
      const license = info.licenses || 'Unknown';

      if (PROBLEMATIC_LICENSES.includes(license)) {
        addFinding({
          type: 'PROBLEMATIC_LICENSE',
          severity: 'high',
          confidence: 0.9,
          file: 'licenses',
          description: `Package ${packageName} uses ${license} license`,
          recommendation: 'Review license compatibility with your project',
          metadata: { package: packageName, license, type: 'legal-risk' }
        });
      }

      if (license === 'Unknown' || license === 'UNLICENSED') {
        unknownLicenses.push(packageName);
      }
    }

    if (unknownLicenses.length > 0) {
      addFinding({
        type: 'UNKNOWN_LICENSES',
        severity: 'medium',
        confidence: 0.8,
        file: 'licenses',
        description: `${unknownLicenses.length} packages have unknown licenses`,
        recommendation: 'Investigate license terms for packages with unknown licenses',
        metadata: { packages: unknownLicenses.slice(0, 5), count: unknownLicenses.length }
      });
    }

    console.log(`   Analyzed licenses for ${Object.keys(licenseData).length} packages`);

  } catch (error) {
    console.log('   License analysis skipped:', error.message);
  }
}

/**
 * Analyze outdated packages with security impact
 */
export async function analyzeOutdatedPackages(basePath, depHealth, addFinding) {
  try {
    console.log('   Checking for outdated packages...');

    const outdatedResult = execSync('npm outdated --json', {
      cwd: basePath,
      stdio: 'pipe',
      encoding: 'utf8'
    });

    processOutdatedResults(JSON.parse(outdatedResult), depHealth, addFinding);

  } catch (error) {
    if (error.status === 1 && error.stdout) {
      try {
        processOutdatedResults(JSON.parse(error.stdout), depHealth, addFinding);
      } catch {
        // Ignore parsing errors
      }
    }
    console.log('   Outdated package check completed');
  }
}

function processOutdatedResults(outdated, depHealth, addFinding) {
  if (Object.keys(outdated).length === 0) return;

  let majorOutdated = 0;
  const securityPackages = ['express', 'helmet', 'cors', 'jsonwebtoken'];

  for (const [packageName, info] of Object.entries(outdated)) {
    const current = info.current;
    const latest = info.latest;

    depHealth.outdatedPackages.push({
      name: packageName,
      current,
      wanted: info.wanted,
      latest,
      type: info.type
    });

    const currentParts = current.split('.');
    const latestParts = latest.split('.');

    if (latestParts[0] > currentParts[0]) {
      majorOutdated++;

      if (securityPackages.includes(packageName)) {
        addFinding({
          type: 'OUTDATED_SECURITY_PACKAGE',
          severity: 'high',
          confidence: 0.9,
          file: 'package.json',
          description: `Security package ${packageName} is ${current} but latest is ${latest}`,
          recommendation: `Update ${packageName} to latest version`,
          metadata: { package: packageName, current, latest, type: 'security' }
        });
      }
    }
  }

  if (majorOutdated > THRESHOLDS.outdated.major) {
    addFinding({
      type: 'TOO_MANY_MAJOR_OUTDATED',
      severity: 'medium',
      confidence: 0.9,
      file: 'dependencies',
      description: `${majorOutdated} packages have major version updates available`,
      recommendation: 'Review and update packages with breaking changes',
      metadata: { count: majorOutdated, threshold: THRESHOLDS.outdated.major }
    });
  }

  console.log(`   Found ${Object.keys(outdated).length} outdated packages`);
}
