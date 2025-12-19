#!/usr/bin/env node
/**
 * LEO v4.4 Evidence Pack Manifest Generator
 *
 * Generates structured manifests for test evidence packs,
 * bundling all artifacts (traces, screenshots, HAR files, console logs)
 * into a verifiable, immutable evidence package.
 *
 * Part of LEO Protocol v4.4 - Unified Test Evidence Architecture
 *
 * Usage:
 *   node lib/evidence/manifest-generator.js --run-id=<run-id>
 *   node lib/evidence/manifest-generator.js --test-results-dir=<dir>
 *
 * The manifest includes:
 * - List of all artifacts with paths and hashes
 * - Test result summary
 * - Environment snapshot
 * - Integrity hash for the entire pack
 *
 * @module manifest-generator
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Evidence Pack Manifest Schema (LEO v4.4)
 *
 * @typedef {Object} EvidencePackManifest
 * @property {string} version - Manifest schema version
 * @property {string} pack_id - Unique identifier for this evidence pack
 * @property {string} generated_at - ISO timestamp of manifest generation
 * @property {TestRunSummary} test_run - Summary of the test run
 * @property {Artifact[]} artifacts - List of all artifacts in the pack
 * @property {Environment} environment - Test environment snapshot
 * @property {IntegrityInfo} integrity - Hash and verification data
 */

/**
 * Generate SHA-256 hash of a file
 */
function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Generate SHA-256 hash of a string
 */
function hashString(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Get file metadata
 */
function getFileMetadata(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      size: stat.size,
      created: stat.birthtime.toISOString(),
      modified: stat.mtime.toISOString()
    };
  } catch {
    return null;
  }
}

/**
 * Determine artifact type from file extension
 */
function getArtifactType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const typeMap = {
    '.zip': 'trace',
    '.har': 'network-har',
    '.png': 'screenshot',
    '.jpeg': 'screenshot',
    '.jpg': 'screenshot',
    '.webm': 'video',
    '.json': 'data',
    '.txt': 'log',
    '.html': 'report'
  };
  return typeMap[ext] || 'unknown';
}

/**
 * Scan directory for test artifacts
 */
function scanArtifacts(baseDir, relativePath = '') {
  const artifacts = [];
  const fullPath = path.join(baseDir, relativePath);

  if (!fs.existsSync(fullPath)) {
    return artifacts;
  }

  const entries = fs.readdirSync(fullPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryRelPath = path.join(relativePath, entry.name);
    const entryFullPath = path.join(baseDir, entryRelPath);

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      artifacts.push(...scanArtifacts(baseDir, entryRelPath));
    } else if (entry.isFile()) {
      const metadata = getFileMetadata(entryFullPath);
      const hash = hashFile(entryFullPath);

      if (metadata && hash) {
        artifacts.push({
          path: entryRelPath,
          type: getArtifactType(entry.name),
          filename: entry.name,
          size_bytes: metadata.size,
          hash_sha256: hash,
          created_at: metadata.created,
          modified_at: metadata.modified
        });
      }
    }
  }

  return artifacts;
}

/**
 * Parse Playwright results.json if available
 */
function parsePlaywrightResults(testResultsDir) {
  const resultsPath = path.join(testResultsDir, 'results.json');

  if (!fs.existsSync(resultsPath)) {
    return null;
  }

  try {
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

    // Extract summary from Playwright JSON reporter output
    const stats = results.stats || {};
    const config = results.config || {};

    return {
      total_tests: stats.expected + stats.unexpected + stats.skipped || 0,
      passed: stats.expected || 0,
      failed: stats.unexpected || 0,
      skipped: stats.skipped || 0,
      flaky: stats.flaky || 0,
      duration_ms: stats.duration || 0,
      started_at: stats.startTime || null,
      status: stats.unexpected > 0 ? 'FAILED' : 'PASSED',
      projects: config.projects?.map(p => p.name) || [],
      base_url: config.projects?.[0]?.use?.baseURL || null
    };
  } catch (error) {
    console.error(`Error parsing results.json: ${error.message}`);
    return null;
  }
}

/**
 * Capture environment snapshot
 */
function captureEnvironment() {
  return {
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    env: {
      CI: process.env.CI || 'false',
      GITHUB_RUN_ID: process.env.GITHUB_RUN_ID || null,
      GITHUB_SHA: process.env.GITHUB_SHA || null,
      SD_ID: process.env.SD_ID || null,
      PRD_ID: process.env.PRD_ID || null
    },
    captured_at: new Date().toISOString()
  };
}

/**
 * Generate evidence pack manifest
 */
function generateManifest(testResultsDir, options = {}) {
  const packId = options.packId || `EVP-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  console.log(`Generating evidence pack manifest: ${packId}`);
  console.log(`Source directory: ${testResultsDir}`);

  // Scan for artifacts
  const artifacts = scanArtifacts(testResultsDir);
  console.log(`Found ${artifacts.length} artifacts`);

  // Parse test results
  const testRun = parsePlaywrightResults(testResultsDir);

  // Capture environment
  const environment = captureEnvironment();

  // Build manifest
  const manifest = {
    version: '1.0.0',
    pack_id: packId,
    generated_at: new Date().toISOString(),
    generator: 'LEO v4.4 Evidence Pack Manifest Generator',

    test_run: testRun || {
      total_tests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      duration_ms: 0,
      status: 'UNKNOWN'
    },

    artifacts: {
      count: artifacts.length,
      total_size_bytes: artifacts.reduce((sum, a) => sum + a.size_bytes, 0),
      by_type: artifacts.reduce((acc, a) => {
        acc[a.type] = (acc[a.type] || 0) + 1;
        return acc;
      }, {}),
      items: artifacts
    },

    environment: environment,

    integrity: {
      algorithm: 'SHA-256',
      artifact_hashes: artifacts.map(a => a.hash_sha256),
      manifest_hash: null // Will be set below
    },

    metadata: {
      sd_id: options.sdId || process.env.SD_ID || null,
      prd_id: options.prdId || process.env.PRD_ID || null,
      user_story_ids: options.userStoryIds || [],
      triggered_by: options.triggeredBy || 'MANIFEST_GENERATOR'
    }
  };

  // Calculate manifest hash (excluding the hash field itself)
  const manifestForHash = { ...manifest };
  delete manifestForHash.integrity.manifest_hash;
  manifest.integrity.manifest_hash = hashString(JSON.stringify(manifestForHash));

  return manifest;
}

/**
 * Save manifest to file
 */
function saveManifest(manifest, outputPath) {
  const content = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(outputPath, content);
  console.log(`Manifest saved to: ${outputPath}`);
  return outputPath;
}

/**
 * Verify manifest integrity
 */
function verifyManifest(manifestPath) {
  console.log(`Verifying manifest: ${manifestPath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const storedHash = manifest.integrity.manifest_hash;

  // Recalculate hash
  const manifestForHash = { ...manifest };
  delete manifestForHash.integrity.manifest_hash;
  const calculatedHash = hashString(JSON.stringify(manifestForHash));

  if (storedHash !== calculatedHash) {
    console.error('MANIFEST INTEGRITY CHECK FAILED');
    console.error(`Expected: ${storedHash}`);
    console.error(`Calculated: ${calculatedHash}`);
    return false;
  }

  console.log('Manifest integrity verified');

  // Verify artifact hashes
  let allValid = true;
  const baseDir = path.dirname(manifestPath);

  for (const artifact of manifest.artifacts.items) {
    const artifactPath = path.join(baseDir, artifact.path);

    if (!fs.existsSync(artifactPath)) {
      console.error(`Missing artifact: ${artifact.path}`);
      allValid = false;
      continue;
    }

    const currentHash = hashFile(artifactPath);
    if (currentHash !== artifact.hash_sha256) {
      console.error(`Hash mismatch for: ${artifact.path}`);
      console.error(`Expected: ${artifact.hash_sha256}`);
      console.error(`Current: ${currentHash}`);
      allValid = false;
    }
  }

  if (allValid) {
    console.log(`All ${manifest.artifacts.count} artifacts verified`);
  }

  return allValid;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let testResultsDir = path.join(process.cwd(), 'test-results');
  let outputPath = null;
  let verify = false;
  let sdId = null;

  for (const arg of args) {
    if (arg.startsWith('--test-results-dir=')) {
      testResultsDir = arg.split('=')[1];
    } else if (arg.startsWith('--output=')) {
      outputPath = arg.split('=')[1];
    } else if (arg.startsWith('--sd-id=')) {
      sdId = arg.split('=')[1];
    } else if (arg === '--verify') {
      verify = true;
    } else if (!arg.startsWith('--')) {
      // Assume it's a manifest path for verification
      if (verify) {
        testResultsDir = arg;
      }
    }
  }

  if (verify) {
    const success = verifyManifest(testResultsDir);
    process.exit(success ? 0 : 1);
  }

  // Generate manifest
  if (!fs.existsSync(testResultsDir)) {
    console.error(`Test results directory not found: ${testResultsDir}`);
    process.exit(1);
  }

  const manifest = generateManifest(testResultsDir, { sdId });

  // Default output path
  if (!outputPath) {
    outputPath = path.join(testResultsDir, 'evidence-pack-manifest.json');
  }

  saveManifest(manifest, outputPath);

  // Print summary
  console.log('\n========================================');
  console.log('Evidence Pack Manifest Generated');
  console.log('========================================');
  console.log(`Pack ID: ${manifest.pack_id}`);
  console.log(`Total artifacts: ${manifest.artifacts.count}`);
  console.log(`Total size: ${(manifest.artifacts.total_size_bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Artifact types: ${JSON.stringify(manifest.artifacts.by_type)}`);
  console.log(`Test status: ${manifest.test_run.status}`);
  console.log(`Manifest hash: ${manifest.integrity.manifest_hash}`);
  console.log('========================================');
}

// Export for programmatic use
export { generateManifest, saveManifest, verifyManifest };

// Run if executed directly
main().catch(console.error);
