#!/usr/bin/env node

/**
 * Process OpenAI Codex Artifacts
 * Reads artifacts from /tmp/codex-artifacts/ and applies patches
 * Part of the LEO Protocol Level 1 integration
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import chalk from 'chalk';
import dotenv from 'dotenv';
dotenv.config();

class CodexArtifactProcessor {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    this.artifactDir = '/tmp/codex-artifacts';
    this.processedDir = '/tmp/codex-artifacts/processed';

    // Ensure directories exist
    if (!fs.existsSync(this.artifactDir)) {
      fs.mkdirSync(this.artifactDir, { recursive: true });
    }
    if (!fs.existsSync(this.processedDir)) {
      fs.mkdirSync(this.processedDir, { recursive: true });
    }
  }

  /**
   * Process artifacts for a specific PRD
   */
  async processArtifacts(prdId, options = {}) {
    console.log(chalk.cyan('🔄 Processing Codex Artifacts'));
    console.log(chalk.gray('─'.repeat(60)));

    try {
      // Find manifest file for this PRD
      const manifest = await this.findManifest(prdId);
      if (!manifest) {
        throw new Error(`No artifacts found for PRD: ${prdId}`);
      }

      console.log(chalk.green(`✅ Found manifest: ${manifest.filename}`));
      console.log(`  Handoff ID: ${manifest.handoff_id || 'N/A'}`);
      console.log(`  Timestamp: ${manifest.timestamp}`);

      // Validate all artifacts exist
      const artifacts = await this.validateArtifacts(manifest);
      console.log(chalk.green(`✅ Validated ${Object.keys(artifacts).length} artifacts`));

      // Read and validate patch
      const patch = await this.readPatch(artifacts.patch);
      console.log(chalk.green(`✅ Patch loaded: ${patch.stats.files} files, +${patch.stats.additions}/-${patch.stats.deletions} lines`));

      // Validate SBOM
      const sbom = await this.validateSBOM(artifacts.sbom);
      console.log(chalk.green(`✅ SBOM validated: ${sbom.components.length} components`));

      // Validate attestation
      const attestation = await this.validateAttestation(artifacts.attestation);
      console.log(chalk.green(`✅ Attestation validated: ${attestation.predicateType}`));

      // Test patch in dry-run mode
      if (!options.skipDryRun) {
        console.log(chalk.yellow('\n🧪 Testing patch (dry-run)...'));
        const dryRunResult = await this.applyPatch(artifacts.patch, true);
        if (!dryRunResult.success) {
          throw new Error(`Patch dry-run failed: ${dryRunResult.error}`);
        }
        console.log(chalk.green('✅ Patch applies cleanly'));
      }

      // Apply patch for real
      if (!options.dryRun) {
        console.log(chalk.yellow('\n📝 Applying patch...'));
        const applyResult = await this.applyPatch(artifacts.patch, false);
        if (!applyResult.success) {
          throw new Error(`Patch application failed: ${applyResult.error}`);
        }
        console.log(chalk.green('✅ Patch applied successfully'));

        // Update database
        await this.updateDatabase(prdId, manifest, artifacts);
        console.log(chalk.green('✅ Database updated'));

        // Move to processed
        await this.moveToProcessed(manifest, artifacts);
        console.log(chalk.green('✅ Artifacts moved to processed/'));
      }

      // Generate summary
      const summary = {
        prdId,
        handoffId: manifest.handoff_id,
        timestamp: new Date().toISOString(),
        filesModified: patch.files,
        linesAdded: patch.stats.additions,
        linesRemoved: patch.stats.deletions,
        componentsAffected: sbom.components.length,
        status: options.dryRun ? 'dry-run-successful' : 'applied'
      };

      this.displaySummary(summary);

      return summary;

    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);

      // Update database with error
      await this.updateDatabaseError(prdId, error.message);

      throw error;
    }
  }

  /**
   * Find manifest file for PRD
   */
  async findManifest(prdId) {
    const files = fs.readdirSync(this.artifactDir);
    const manifestFiles = files.filter(f => f.startsWith('manifest-') && f.endsWith('.json'));

    for (const filename of manifestFiles) {
      const filepath = path.join(this.artifactDir, filename);
      try {
        const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));

        // Check if this manifest is for our PRD
        if (content.prd_id === prdId ||
            content.task?.includes(prdId) ||
            JSON.stringify(content).includes(prdId)) {
          return { ...content, filename, filepath };
        }
      } catch (error) {
        console.warn(`Warning: Could not parse ${filename}:`, error.message);
      }
    }

    return null;
  }

  /**
   * Validate all artifacts exist
   */
  async validateArtifacts(manifest) {
    // Extract timestamp - could be numeric or ISO format
    const match = manifest.filename.match(/manifest-(.+)\.json/);
    const timestamp = match?.[1];
    if (!timestamp) {
      throw new Error('Could not extract timestamp from manifest filename');
    }

    const artifacts = {
      manifest: manifest.filepath,
      patch: path.join(this.artifactDir, `changes-${timestamp}.patch`),
      sbom: path.join(this.artifactDir, `sbom-${timestamp}.cdx.json`),
      attestation: path.join(this.artifactDir, `attestation-${timestamp}.intoto`)
    };

    // Check each artifact exists
    for (const [type, filepath] of Object.entries(artifacts)) {
      if (!fs.existsSync(filepath)) {
        // Try alternative naming
        const altPath = filepath.replace('.cdx', '');
        if (fs.existsSync(altPath)) {
          artifacts[type] = altPath;
        } else {
          throw new Error(`Missing artifact: ${type} at ${filepath}`);
        }
      }
    }

    return artifacts;
  }

  /**
   * Read and parse patch file
   */
  async readPatch(patchPath) {
    const patchContent = fs.readFileSync(patchPath, 'utf8');

    // Parse patch statistics
    const files = [];
    const stats = { files: 0, additions: 0, deletions: 0 };

    const lines = patchContent.split('\n');
    lines.forEach(line => {
      if (line.startsWith('--- a/')) {
        const file = line.substring(6);
        files.push(file);
        stats.files++;
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        stats.additions++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        stats.deletions++;
      }
    });

    return { content: patchContent, files, stats };
  }

  /**
   * Validate SBOM format
   */
  async validateSBOM(sbomPath) {
    const sbomContent = JSON.parse(fs.readFileSync(sbomPath, 'utf8'));

    // Validate CycloneDX format
    if (sbomContent.bomFormat !== 'CycloneDX') {
      throw new Error('Invalid SBOM format. Expected CycloneDX');
    }

    if (!sbomContent.specVersion?.startsWith('1.')) {
      throw new Error('Invalid SBOM spec version');
    }

    return {
      format: sbomContent.bomFormat,
      version: sbomContent.specVersion,
      components: sbomContent.components || []
    };
  }

  /**
   * Validate attestation format
   */
  async validateAttestation(attestationPath) {
    const attestationContent = JSON.parse(fs.readFileSync(attestationPath, 'utf8'));

    // Validate in-toto format
    if (!attestationContent._type?.includes('in-toto.io')) {
      throw new Error('Invalid attestation format. Expected in-toto');
    }

    if (!attestationContent.predicateType) {
      throw new Error('Missing predicateType in attestation');
    }

    return {
      type: attestationContent._type,
      predicateType: attestationContent.predicateType,
      subject: attestationContent.subject
    };
  }

  /**
   * Apply patch to codebase
   */
  async applyPatch(patchPath, dryRun = false) {
    try {
      const command = dryRun
        ? `git apply --check "${patchPath}" 2>&1`
        : `git apply "${patchPath}" 2>&1`;

      const output = execSync(command, {
        encoding: 'utf8',
        cwd: process.cwd()
      });

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        output: error.stdout || error.stderr
      };
    }
  }

  /**
   * Update database with processing results
   */
  async updateDatabase(prdId, manifest, artifacts) {
    // Update handoff record
    if (manifest.handoff_id) {
      await this.supabase
        .from('codex_handoffs')
        .update({
          status: 'processed',
          artifacts_received_at: manifest.timestamp,
          artifacts: {
            manifest: manifest.filename,
            patch: path.basename(artifacts.patch),
            sbom: path.basename(artifacts.sbom),
            attestation: path.basename(artifacts.attestation)
          },
          patch_sha256: this.calculateSHA256(artifacts.patch),
          applied_by: 'CLAUDE',
          applied_at: new Date().toISOString()
        })
        .eq('id', manifest.handoff_id);
    }

    // Update PRD status
    await this.supabase
      .from('product_requirements_v2')
      .update({
        codex_status: 'completed',
        codex_handoff_id: manifest.handoff_id,
        codex_artifacts: {
          processed_at: new Date().toISOString(),
          artifacts: Object.keys(artifacts).map(k => path.basename(artifacts[k]))
        }
      })
      .eq('id', prdId);
  }

  /**
   * Update database with error
   */
  async updateDatabaseError(prdId, errorMessage) {
    try {
      await this.supabase
        .from('product_requirements_v2')
        .update({
          codex_status: 'error',
          codex_artifacts: {
            error: errorMessage,
            error_at: new Date().toISOString()
          }
        })
        .eq('id', prdId);
    } catch (dbError) {
      console.warn('Warning: Could not update database with error:', dbError.message);
    }
  }

  /**
   * Calculate SHA256 of file
   */
  calculateSHA256(filepath) {
    const content = fs.readFileSync(filepath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Move artifacts to processed directory
   */
  async moveToProcessed(manifest, artifacts) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const processedSubDir = path.join(this.processedDir, `prd-${manifest.prd_id}-${timestamp}`);

    fs.mkdirSync(processedSubDir, { recursive: true });

    for (const [_type, filepath] of Object.entries(artifacts)) {
      const filename = path.basename(filepath);
      const destPath = path.join(processedSubDir, filename);
      fs.renameSync(filepath, destPath);
    }

    // Save processing report
    const report = {
      processed_at: new Date().toISOString(),
      prd_id: manifest.prd_id,
      handoff_id: manifest.handoff_id,
      artifacts: Object.keys(artifacts).map(k => path.basename(artifacts[k])),
      applied_by: 'CLAUDE'
    };

    fs.writeFileSync(
      path.join(processedSubDir, 'processing-report.json'),
      JSON.stringify(report, null, 2)
    );
  }

  /**
   * Display summary
   */
  displaySummary(summary) {
    console.log('\n' + chalk.cyan('═'.repeat(60)));
    console.log(chalk.cyan.bold('📊 PROCESSING SUMMARY'));
    console.log(chalk.cyan('═'.repeat(60)));

    console.log(chalk.green('\n✅ Artifacts processed successfully!\n'));

    console.log(chalk.yellow('Details:'));
    console.log(`  PRD ID: ${chalk.white(summary.prdId)}`);
    console.log(`  Handoff ID: ${chalk.white(summary.handoffId)}`);
    console.log(`  Status: ${chalk.white(summary.status)}`);

    console.log(chalk.yellow('\nChanges:'));
    console.log(`  Files Modified: ${chalk.white(summary.filesModified.length)}`);
    console.log(`  Lines Added: ${chalk.green('+' + summary.linesAdded)}`);
    console.log(`  Lines Removed: ${chalk.red('-' + summary.linesRemoved)}`);
    console.log(`  Components: ${chalk.white(summary.componentsAffected)}`);

    if (summary.status === 'applied') {
      console.log(chalk.green('\n✅ Patches have been applied to the codebase!'));
      console.log(chalk.gray('   Remember to review changes and commit when ready.'));
    } else {
      console.log(chalk.yellow('\n⚠️  Dry run completed. Use --apply to actually apply patches.'));
    }
  }

  /**
   * List available artifacts
   */
  async listArtifacts() {
    const files = fs.readdirSync(this.artifactDir);
    const manifestFiles = files.filter(f => f.startsWith('manifest-') && f.endsWith('.json'));

    console.log(chalk.cyan('\nAvailable Artifacts:'));
    console.log(chalk.gray('─'.repeat(60)));

    if (manifestFiles.length === 0) {
      console.log(chalk.gray('  No artifacts found in /tmp/codex-artifacts/'));
    } else {
      for (const filename of manifestFiles) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(this.artifactDir, filename), 'utf8'));
          const timestamp = filename.match(/manifest-(\d+)\.json/)?.[1];
          const date = timestamp ? new Date(parseInt(timestamp)).toISOString() : 'Unknown';

          console.log(`  ${chalk.white(content.prd_id || 'Unknown PRD')}`);
          console.log(`    Manifest: ${chalk.gray(filename)}`);
          console.log(`    Created: ${chalk.gray(date)}`);
          console.log(`    Task: ${chalk.gray(content.task || 'N/A')}\n`);
        } catch (_error) {
          console.log(`  ${chalk.red('Invalid manifest:')} ${filename}`);
        }
      }
    }

    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.gray('\nUsage: node process-codex-artifacts.js <PRD-ID> [--dry-run]'));
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const processor = new CodexArtifactProcessor();
  const prdId = process.argv[2];
  const options = {
    dryRun: process.argv.includes('--dry-run'),
    skipDryRun: process.argv.includes('--skip-dry-run'),
    apply: process.argv.includes('--apply')
  };

  // Override dryRun if --apply is specified
  if (options.apply) {
    options.dryRun = false;
  }

  if (!prdId || prdId === '--list') {
    processor.listArtifacts().catch(console.error);
  } else {
    processor.processArtifacts(prdId, options)
      .then(_summary => {
        process.exit(0);
      })
      .catch(_error => {
        process.exit(1);
      });
  }
}