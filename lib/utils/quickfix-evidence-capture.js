/**
 * Quick-Fix Evidence Capture Utilities
 * Captures console errors and screenshots for before/after comparison
 *
 * Uses Playwright MCP tools for browser automation
 *
 * Created: 2025-11-27 (QUICKFIX Enhancement)
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import path from 'path';

// Evidence storage directory
const EVIDENCE_DIR = path.join(process.cwd(), '.quickfix-evidence');

/**
 * Initialize evidence directory for a quick-fix
 * @param {string} qfId - Quick-fix ID
 * @returns {string} Path to evidence directory
 */
export function initEvidenceDir(qfId) {
  const qfEvidenceDir = path.join(EVIDENCE_DIR, qfId);

  if (!existsSync(EVIDENCE_DIR)) {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  if (!existsSync(qfEvidenceDir)) {
    mkdirSync(qfEvidenceDir, { recursive: true });
  }

  return qfEvidenceDir;
}

/**
 * Capture console errors baseline (before fix)
 * This stores console errors for later comparison
 *
 * @param {string} qfId - Quick-fix ID
 * @param {string} url - URL to capture errors from
 * @param {Object} options - Capture options
 * @returns {Promise<Object>} Captured console errors
 */
export async function captureConsoleErrorsBaseline(qfId, url, options = {}) {
  const evidenceDir = initEvidenceDir(qfId);
  const timestamp = new Date().toISOString();

  const result = {
    qfId,
    url,
    timestamp,
    phase: 'before',
    errors: [],
    warnings: [],
    captureMethod: 'manual', // Default to manual since MCP requires browser context
    success: false
  };

  try {
    // Try to use Playwright MCP if available in the current context
    // Note: MCP tools are only available in Claude Code conversations
    // For script execution, we'll provide guidance for manual capture

    console.log('\n📸 Console Error Baseline Capture\n');
    console.log(`   URL: ${url}`);
    console.log('   Phase: BEFORE fix\n');

    // Check if there's a console error in the issue description
    if (options.consoleError) {
      result.errors.push({
        type: 'error',
        message: options.consoleError,
        source: 'issue_description',
        timestamp
      });
      result.success = true;
      console.log(`   ✅ Captured error from issue: ${options.consoleError.substring(0, 80)}...`);
    }

    // Store baseline for later comparison
    const baselinePath = path.join(evidenceDir, 'console-baseline.json');
    writeFileSync(baselinePath, JSON.stringify(result, null, 2));
    console.log(`   📁 Baseline saved: ${baselinePath}\n`);

    // Provide instructions for MCP-based capture
    console.log('   💡 For live console capture, use Playwright MCP in Claude Code:');
    console.log('      1. mcp__playwright__browser_navigate({ url })');
    console.log('      2. mcp__playwright__browser_console_messages({ onlyErrors: true })\n');

    return result;

  } catch (err) {
    console.log(`   ⚠️  Console capture failed: ${err.message}`);
    result.error = err.message;
    return result;
  }
}

/**
 * Capture console errors after fix for comparison
 *
 * @param {string} qfId - Quick-fix ID
 * @param {string} url - URL to capture errors from
 * @param {Object} options - Capture options
 * @returns {Promise<Object>} Comparison results
 */
export async function captureConsoleErrorsAfterFix(qfId, url, options = {}) {
  const evidenceDir = initEvidenceDir(qfId);
  const timestamp = new Date().toISOString();

  const result = {
    qfId,
    url,
    timestamp,
    phase: 'after',
    errors: [],
    warnings: [],
    comparison: null,
    success: false
  };

  try {
    console.log('\n📸 Console Error After-Fix Capture\n');
    console.log(`   URL: ${url}`);
    console.log('   Phase: AFTER fix\n');

    // Load baseline for comparison
    const baselinePath = path.join(evidenceDir, 'console-baseline.json');
    let baseline = null;

    if (existsSync(baselinePath)) {
      baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
      console.log(`   📁 Loaded baseline from: ${baselinePath}`);
    }

    // If new errors provided, use them
    if (options.currentErrors && Array.isArray(options.currentErrors)) {
      result.errors = options.currentErrors.map(err => ({
        type: 'error',
        message: err,
        source: 'current_state',
        timestamp
      }));
    }

    // Compare with baseline
    if (baseline && baseline.errors.length > 0) {
      const baselineErrorMessages = baseline.errors.map(e => e.message);
      const currentErrorMessages = result.errors.map(e => e.message);

      result.comparison = {
        baselineErrorCount: baseline.errors.length,
        currentErrorCount: result.errors.length,
        errorsResolved: baselineErrorMessages.filter(e => !currentErrorMessages.includes(e)),
        newErrors: currentErrorMessages.filter(e => !baselineErrorMessages.includes(e)),
        originalErrorResolved: !currentErrorMessages.some(e =>
          baselineErrorMessages.some(be => e.includes(be) || be.includes(e))
        )
      };

      console.log('\n   📊 Comparison Results:');
      console.log(`      Baseline Errors: ${result.comparison.baselineErrorCount}`);
      console.log(`      Current Errors:  ${result.comparison.currentErrorCount}`);
      console.log(`      Resolved:        ${result.comparison.errorsResolved.length}`);
      console.log(`      New Errors:      ${result.comparison.newErrors.length}`);
      console.log(`      Original Fixed:  ${result.comparison.originalErrorResolved ? '✅ YES' : '❌ NO'}`);
    }

    // Store after-fix capture
    const afterPath = path.join(evidenceDir, 'console-after.json');
    writeFileSync(afterPath, JSON.stringify(result, null, 2));
    console.log(`\n   📁 After-fix saved: ${afterPath}\n`);

    result.success = true;
    return result;

  } catch (err) {
    console.log(`   ⚠️  After-fix capture failed: ${err.message}`);
    result.error = err.message;
    return result;
  }
}

/**
 * Capture screenshot evidence
 * Provides guidance for using Playwright MCP for screenshots
 *
 * @param {string} qfId - Quick-fix ID
 * @param {string} url - URL to screenshot
 * @param {string} phase - 'before' or 'after'
 * @returns {Promise<Object>} Screenshot result
 */
export async function captureScreenshot(qfId, url, phase = 'before') {
  const evidenceDir = initEvidenceDir(qfId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `screenshot-${phase}-${timestamp}.png`;
  const filepath = path.join(evidenceDir, filename);

  const result = {
    qfId,
    url,
    phase,
    filename,
    filepath,
    timestamp: new Date().toISOString(),
    captureMethod: 'mcp_required',
    success: false
  };

  console.log(`\n📸 Screenshot Capture (${phase.toUpperCase()})\n`);
  console.log(`   URL: ${url}`);
  console.log(`   Output: ${filepath}\n`);

  // Store metadata for later MCP capture
  const metadataPath = path.join(evidenceDir, `screenshot-${phase}-metadata.json`);
  writeFileSync(metadataPath, JSON.stringify(result, null, 2));

  console.log('   💡 To capture screenshot, use Playwright MCP in Claude Code:');
  console.log(`      mcp__playwright__browser_navigate({ url: "${url}" })`);
  console.log(`      mcp__playwright__browser_take_screenshot({ filename: "${filepath}" })\n`);

  return result;
}

/**
 * Generate evidence summary for quick-fix completion
 *
 * @param {string} qfId - Quick-fix ID
 * @returns {Object} Evidence summary
 */
export function generateEvidenceSummary(qfId) {
  const evidenceDir = path.join(EVIDENCE_DIR, qfId);

  const summary = {
    qfId,
    evidenceDir,
    hasBaseline: false,
    hasAfterCapture: false,
    hasBeforeScreenshot: false,
    hasAfterScreenshot: false,
    consoleComparison: null,
    files: []
  };

  if (!existsSync(evidenceDir)) {
    return summary;
  }

  // Check for baseline
  const baselinePath = path.join(evidenceDir, 'console-baseline.json');
  if (existsSync(baselinePath)) {
    summary.hasBaseline = true;
    summary.files.push('console-baseline.json');
  }

  // Check for after capture
  const afterPath = path.join(evidenceDir, 'console-after.json');
  if (existsSync(afterPath)) {
    summary.hasAfterCapture = true;
    summary.files.push('console-after.json');

    try {
      const afterData = JSON.parse(readFileSync(afterPath, 'utf-8'));
      summary.consoleComparison = afterData.comparison;
    } catch (_err) {
      // Ignore parse errors
    }
  }

  // Check for screenshots
  try {
    const files = require('fs').readdirSync(evidenceDir);
    summary.hasBeforeScreenshot = files.some(f => f.includes('screenshot-before'));
    summary.hasAfterScreenshot = files.some(f => f.includes('screenshot-after'));
    summary.files = files;
  } catch (_err) {
    // Ignore read errors
  }

  return summary;
}

/**
 * Clean up evidence directory for a completed quick-fix
 * Optionally archives to a permanent location
 *
 * @param {string} qfId - Quick-fix ID
 * @param {Object} options - Cleanup options
 */
export function cleanupEvidence(qfId, options = {}) {
  const evidenceDir = path.join(EVIDENCE_DIR, qfId);

  if (!existsSync(evidenceDir)) {
    return { success: true, message: 'No evidence to clean up' };
  }

  if (options.archive) {
    // Archive to permanent location (could be uploaded to S3, etc.)
    const archivePath = path.join(process.cwd(), '.quickfix-archive', qfId);
    try {
      execSync(`cp -r "${evidenceDir}" "${archivePath}"`, { stdio: 'pipe' });
      console.log(`   📦 Evidence archived to: ${archivePath}`);
    } catch (err) {
      console.log(`   ⚠️  Archive failed: ${err.message}`);
    }
  }

  if (options.delete) {
    try {
      execSync(`rm -rf "${evidenceDir}"`, { stdio: 'pipe' });
      return { success: true, message: 'Evidence deleted' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  return { success: true, message: 'Evidence preserved' };
}
