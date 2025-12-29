#!/usr/bin/env node

/**
 * Validate OpenAI Codex Output
 * Ensures artifacts meet LEO Protocol requirements
 * Part of the LEO Protocol Level 1 integration
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import chalk from 'chalk';
import { execSync } from 'child_process';

class CodexOutputValidator {
  constructor() {
    this.artifactDir = '/tmp/codex-artifacts';
    this.validationResults = [];
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate all aspects of Codex output
   */
  async validateOutput(manifestPath) {
    console.log(chalk.cyan('🔍 Validating Codex Output'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      // Find or use provided manifest
      const manifest = await this.loadManifest(manifestPath);
      console.log(chalk.blue(`\nValidating artifacts for: ${manifest.prd_id || 'Unknown PRD'}`));

      // Extract timestamp for finding related artifacts
      const timestamp = this.extractTimestamp(manifest.filename || manifestPath);

      // Run all validations
      const validations = [
        this.validateManifestStructure(manifest),
        this.validatePatchFile(timestamp),
        this.validateSBOM(timestamp),
        this.validateAttestation(timestamp),
        this.validateCrossReferences(manifest, timestamp),
        this.validateSecurityConstraints(timestamp),
        this.validateLEOCompliance(manifest, timestamp)
      ];

      const results = await Promise.all(validations);

      // Compile results
      const summary = this.compileSummary(results);

      // Display results
      this.displayResults(summary);

      return summary;

    } catch (error) {
      console.error(chalk.red('❌ Validation failed:'), error.message);
      throw error;
    }
  }

  /**
   * Load manifest file
   */
  async loadManifest(manifestPath) {
    let filepath = manifestPath;

    // If not provided, find the latest manifest
    if (!manifestPath) {
      const files = fs.readdirSync(this.artifactDir);
      const manifestFiles = files
        .filter(f => f.startsWith('manifest-') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (manifestFiles.length === 0) {
        throw new Error('No manifest files found in /tmp/codex-artifacts/');
      }

      filepath = path.join(this.artifactDir, manifestFiles[0]);
      console.log(chalk.yellow(`Using latest manifest: ${manifestFiles[0]}`));
    } else if (!path.isAbsolute(manifestPath)) {
      filepath = path.join(this.artifactDir, manifestPath);
    }

    const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    content.filename = path.basename(filepath);
    content.filepath = filepath;

    return content;
  }

  /**
   * Extract timestamp from filename
   */
  extractTimestamp(filename) {
    const match = filename.match(/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Validate manifest structure
   */
  async validateManifestStructure(manifest) {
    const required = ['prd_id', 'timestamp', 'artifacts'];
    const missing = required.filter(field => !manifest[field]);

    if (missing.length > 0) {
      this.errors.push(`Manifest missing required fields: ${missing.join(', ')}`);
      return { test: 'manifest_structure', passed: false, errors: missing };
    }

    // Validate PRD ID format
    if (manifest.prd_id && !manifest.prd_id.match(/^PRD-\d{4}-\d{3}$/)) {
      this.warnings.push(`Non-standard PRD ID format: ${manifest.prd_id}`);
    }

    // Validate timestamp
    const timestamp = new Date(manifest.timestamp);
    if (isNaN(timestamp.getTime())) {
      this.errors.push(`Invalid timestamp: ${manifest.timestamp}`);
      return { test: 'manifest_structure', passed: false };
    }

    this.validationResults.push('✅ Manifest structure valid');
    return { test: 'manifest_structure', passed: true };
  }

  /**
   * Validate patch file
   */
  async validatePatchFile(timestamp) {
    const patchPath = path.join(this.artifactDir, `changes-${timestamp}.patch`);

    if (!fs.existsSync(patchPath)) {
      this.errors.push(`Patch file not found: changes-${timestamp}.patch`);
      return { test: 'patch_file', passed: false };
    }

    const patchContent = fs.readFileSync(patchPath, 'utf8');

    // Check for valid diff format
    if (!patchContent.includes('---') || !patchContent.includes('+++')) {
      this.errors.push('Patch does not appear to be in unified diff format');
      return { test: 'patch_file', passed: false };
    }

    // Test if patch applies cleanly
    try {
      execSync(`git apply --check "${patchPath}" 2>&1`, {
        cwd: process.cwd(),
        encoding: 'utf8'
      });
      this.validationResults.push('✅ Patch applies cleanly');
    } catch (_error) {
      this.warnings.push('Patch does not apply cleanly to current codebase');
    }

    // Check for dangerous patterns
    const dangerous = [
      /rm\s+-rf/,
      /DROP\s+TABLE/i,
      /DELETE\s+FROM.*WHERE\s+1=1/i,
      /process\.exit/,
      /eval\(/
    ];

    dangerous.forEach(pattern => {
      if (pattern.test(patchContent)) {
        this.warnings.push(`Potentially dangerous pattern detected: ${pattern}`);
      }
    });

    return { test: 'patch_file', passed: true };
  }

  /**
   * Validate SBOM (Software Bill of Materials)
   */
  async validateSBOM(timestamp) {
    const sbomPaths = [
      path.join(this.artifactDir, `sbom-${timestamp}.cdx.json`),
      path.join(this.artifactDir, `sbom-${timestamp}.json`)
    ];

    const sbomPath = sbomPaths.find(p => fs.existsSync(p));

    if (!sbomPath) {
      this.errors.push(`SBOM file not found: sbom-${timestamp}.cdx.json`);
      return { test: 'sbom', passed: false };
    }

    const sbom = JSON.parse(fs.readFileSync(sbomPath, 'utf8'));

    // Validate CycloneDX format
    if (sbom.bomFormat !== 'CycloneDX') {
      this.errors.push(`Invalid SBOM format: ${sbom.bomFormat} (expected CycloneDX)`);
      return { test: 'sbom', passed: false };
    }

    // Validate spec version
    if (!sbom.specVersion || !sbom.specVersion.match(/^1\.[3-5]/)) {
      this.warnings.push(`SBOM spec version ${sbom.specVersion} may not be fully compatible`);
    }

    // Check for components
    if (!sbom.components || sbom.components.length === 0) {
      this.warnings.push('SBOM contains no components');
    }

    this.validationResults.push(`✅ SBOM valid (${sbom.components?.length || 0} components)`);
    return { test: 'sbom', passed: true };
  }

  /**
   * Validate attestation
   */
  async validateAttestation(timestamp) {
    const attestationPaths = [
      path.join(this.artifactDir, `attestation-${timestamp}.intoto`),
      path.join(this.artifactDir, `attestation-${timestamp}.json`)
    ];

    const attestationPath = attestationPaths.find(p => fs.existsSync(p));

    if (!attestationPath) {
      this.errors.push(`Attestation file not found: attestation-${timestamp}.intoto`);
      return { test: 'attestation', passed: false };
    }

    const attestation = JSON.parse(fs.readFileSync(attestationPath, 'utf8'));

    // Validate in-toto format
    if (!attestation._type || !attestation._type.includes('in-toto.io')) {
      this.errors.push(`Invalid attestation type: ${attestation._type}`);
      return { test: 'attestation', passed: false };
    }

    // Validate SLSA provenance
    if (!attestation.predicateType || !attestation.predicateType.includes('slsa.dev')) {
      this.warnings.push('Attestation does not use SLSA provenance format');
    }

    // Check for subject
    if (!attestation.subject || attestation.subject.length === 0) {
      this.errors.push('Attestation has no subject');
      return { test: 'attestation', passed: false };
    }

    // Verify digest if present
    if (attestation.subject[0]?.digest?.sha256) {
      const expectedFile = attestation.subject[0].name;
      if (expectedFile && fs.existsSync(path.join(this.artifactDir, expectedFile))) {
        const actualHash = this.calculateSHA256(path.join(this.artifactDir, expectedFile));
        if (actualHash !== attestation.subject[0].digest.sha256) {
          this.errors.push('Attestation digest does not match artifact');
          return { test: 'attestation', passed: false };
        }
      }
    }

    this.validationResults.push('✅ Attestation valid (in-toto format)');
    return { test: 'attestation', passed: true };
  }

  /**
   * Validate cross-references between artifacts
   */
  async validateCrossReferences(manifest, timestamp) {
    const artifacts = manifest.artifacts;

    if (!artifacts || artifacts.length === 0) {
      this.warnings.push('Manifest does not list artifacts');
      return { test: 'cross_references', passed: true };
    }

    // Check that all listed artifacts exist
    const missing = [];
    artifacts.forEach(artifact => {
      const possiblePaths = [
        path.join(this.artifactDir, artifact.name || artifact),
        path.join(this.artifactDir, `${artifact.name || artifact}-${timestamp}`),
      ];

      if (!possiblePaths.some(p => fs.existsSync(p))) {
        missing.push(artifact.name || artifact);
      }
    });

    if (missing.length > 0) {
      this.errors.push(`Artifacts listed in manifest but not found: ${missing.join(', ')}`);
      return { test: 'cross_references', passed: false };
    }

    // Verify SHA256 hashes if provided
    artifacts.forEach(artifact => {
      if (artifact.sha256) {
        const filepath = path.join(this.artifactDir, artifact.name || artifact);
        if (fs.existsSync(filepath)) {
          const actualHash = this.calculateSHA256(filepath);
          if (actualHash !== artifact.sha256) {
            this.warnings.push(`Hash mismatch for ${artifact.name}: expected ${artifact.sha256}, got ${actualHash}`);
          }
        }
      }
    });

    this.validationResults.push('✅ Cross-references valid');
    return { test: 'cross_references', passed: true };
  }

  /**
   * Validate security constraints
   */
  async validateSecurityConstraints(timestamp) {
    const patchPath = path.join(this.artifactDir, `changes-${timestamp}.patch`);

    if (!fs.existsSync(patchPath)) {
      return { test: 'security', passed: true };
    }

    const patchContent = fs.readFileSync(patchPath, 'utf8');

    // Check for hardcoded secrets
    const secretPatterns = [
      /api[_-]?key[\s]*=[\s]*["'][^"']+["']/i,
      /password[\s]*=[\s]*["'][^"']+["']/i,
      /secret[\s]*=[\s]*["'][^"']+["']/i,
      /token[\s]*=[\s]*["'][^"']+["']/i,
      /private[_-]?key/i
    ];

    secretPatterns.forEach(pattern => {
      if (pattern.test(patchContent)) {
        this.errors.push(`Potential hardcoded secret detected: ${pattern}`);
      }
    });

    // Check for insecure practices
    if (/eval\(|exec\(/.test(patchContent)) {
      this.warnings.push('Use of eval() or exec() detected - potential security risk');
    }

    if (/http:\/\//.test(patchContent) && !/http:\/\/localhost/.test(patchContent)) {
      this.warnings.push('Non-HTTPS URLs detected');
    }

    this.validationResults.push('✅ Security constraints checked');
    return { test: 'security', passed: this.errors.filter(e => e.includes('secret')).length === 0 };
  }

  /**
   * Validate LEO Protocol compliance
   */
  async validateLEOCompliance(manifest, timestamp) {
    const issues = [];

    // Check for CODEX-READY marker
    if (!manifest.marker && !JSON.stringify(manifest).includes('CODEX-READY')) {
      issues.push('Missing [CODEX-READY] marker');
    }

    // Check for handoff_id
    if (!manifest.handoff_id) {
      this.warnings.push('No handoff_id in manifest (recommended for tracking)');
    }

    // Check for PRD reference
    if (!manifest.prd_id) {
      issues.push('No PRD ID reference');
    }

    // Check that Codex didn't perform write operations
    const patchPath = path.join(this.artifactDir, `changes-${timestamp}.patch`);
    if (fs.existsSync(patchPath)) {
      const patchContent = fs.readFileSync(patchPath, 'utf8');

      // These patterns suggest actual file writes, not patches
      if (/File written to|Successfully wrote|Created file/.test(patchContent)) {
        issues.push('Patch suggests Codex performed write operations (should be read-only)');
      }
    }

    if (issues.length > 0) {
      this.warnings.push(`LEO Protocol compliance issues: ${issues.join(', ')}`);
      return { test: 'leo_compliance', passed: false, issues };
    }

    this.validationResults.push('✅ LEO Protocol compliant');
    return { test: 'leo_compliance', passed: true };
  }

  /**
   * Calculate SHA256 hash
   */
  calculateSHA256(filepath) {
    const content = fs.readFileSync(filepath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Compile validation summary
   */
  compileSummary(results) {
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return {
      total: results.length,
      passed,
      failed,
      errors: this.errors,
      warnings: this.warnings,
      validationResults: this.validationResults,
      isValid: this.errors.length === 0
    };
  }

  /**
   * Display validation results
   */
  displayResults(summary) {
    console.log('\n' + chalk.cyan('═'.repeat(60)));
    console.log(chalk.cyan.bold('📊 VALIDATION RESULTS'));
    console.log(chalk.cyan('═'.repeat(60)));

    // Overall status
    if (summary.isValid) {
      console.log(chalk.green.bold('\n✅ VALIDATION PASSED'));
      console.log(chalk.gray(`All ${summary.total} checks completed successfully`));
    } else {
      console.log(chalk.red.bold('\n❌ VALIDATION FAILED'));
      console.log(chalk.gray(`${summary.failed} of ${summary.total} checks failed`));
    }

    // Validation results
    if (this.validationResults.length > 0) {
      console.log(chalk.green('\n✓ Passed Checks:'));
      this.validationResults.forEach(result => {
        console.log(`  ${result}`);
      });
    }

    // Errors
    if (this.errors.length > 0) {
      console.log(chalk.red('\n✗ Errors:'));
      this.errors.forEach(error => {
        console.log(`  ${chalk.red('•')} ${error}`);
      });
    }

    // Warnings
    if (this.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠ Warnings:'));
      this.warnings.forEach(warning => {
        console.log(`  ${chalk.yellow('•')} ${warning}`);
      });
    }

    // Recommendation
    console.log('\n' + chalk.cyan('─'.repeat(60)));
    if (summary.isValid) {
      console.log(chalk.green('✅ Artifacts are ready for processing'));
      console.log(chalk.gray('   Run: node process-codex-artifacts.js <PRD-ID>'));
    } else {
      console.log(chalk.red('❌ Artifacts need correction before processing'));
      console.log(chalk.gray('   Please address the errors listed above'));
    }
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new CodexOutputValidator();
  const manifestPath = process.argv[2];

  validator.validateOutput(manifestPath)
    .then(summary => {
      process.exit(summary.isValid ? 0 : 1);
    })
    .catch(error => {
      console.error(chalk.red('Validation error:'), error.message);
      process.exit(1);
    });
}