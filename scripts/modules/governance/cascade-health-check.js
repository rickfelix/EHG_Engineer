#!/usr/bin/env node

/**
 * Cascade Health Check
 *
 * Scans all active SDs and runs full 6-layer cascade validation.
 * Produces per-SD and per-layer health report.
 *
 * Usage:
 *   node scripts/modules/governance/cascade-health-check.js
 *   node scripts/modules/governance/cascade-health-check.js --venture <venture-id>
 *   node scripts/modules/governance/cascade-health-check.js --json
 *
 * Part of SD-MAN-GEN-CORRECTIVE-VISION-GAP-005
 */

import { createClient } from '@supabase/supabase-js';
import { validateCascade } from './cascade-validator.js';
import { getStaleDocuments, getCascadeSummary } from './cascade-invalidation-engine.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runHealthCheck(options = {}) {
  const { ventureId, jsonOutput } = options;
  const silentLogger = { log: () => {}, warn: () => {}, error: () => {} };

  // Load active SDs
  let query = supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, strategic_objectives, metadata')
    .in('status', ['draft', 'in_progress', 'planning', 'ready']);

  const { data: sds, error } = await query;

  if (error) {
    console.error('Failed to load SDs:', error.message);
    process.exit(1);
  }

  if (!sds || sds.length === 0) {
    console.log('No active SDs found.');
    return { sds: [], summary: { total: 0, healthy: 0, violations: 0, warnings: 0 } };
  }

  const results = [];
  let totalViolations = 0;
  let totalWarnings = 0;
  let healthyCount = 0;

  for (const sd of sds) {
    const result = await validateCascade({
      sd: {
        title: sd.title,
        description: sd.description || '',
        strategic_objectives: sd.strategic_objectives || [],
        key_changes: sd.metadata?.key_changes || [],
        vision_key: sd.metadata?.vision_key || null,
        venture_id: ventureId || sd.metadata?.venture_id || null,
        metadata: sd.metadata || {},
        sd_key: sd.sd_key,
      },
      supabase,
      logger: silentLogger,
      dryRun: true,
    });

    const sdResult = {
      sd_key: sd.sd_key,
      title: sd.title,
      status: sd.status,
      phase: sd.current_phase,
      passed: result.passed,
      violations: result.violations.length,
      warnings: result.warnings.length,
      rulesChecked: result.rulesChecked,
      layers: {
        mission: getLayerStatus(result, 'mission'),
        constitution: getLayerStatus(result, 'constitution'),
        vision: getLayerStatus(result, 'vision'),
        strategy: getLayerStatus(result, 'strategy'),
        okr: getLayerStatus(result, 'okr'),
        sd: 'pass',
      },
      details: result.violations.concat(result.warnings),
    };

    results.push(sdResult);
    totalViolations += result.violations.length;
    totalWarnings += result.warnings.length;
    if (result.passed) healthyCount++;
  }

  const summary = {
    total: sds.length,
    healthy: healthyCount,
    unhealthy: sds.length - healthyCount,
    violations: totalViolations,
    warnings: totalWarnings,
  };

  if (jsonOutput) {
    console.log(JSON.stringify({ results, summary }, null, 2));
  } else {
    printReport(results, summary);
  }

  return { sds: results, summary };
}

function getLayerStatus(result, layerName) {
  const hasViolation = result.violations.some(v => v.layer === layerName || v.layer === `${layerName}_reverse`);
  const hasWarning = result.warnings.some(w => (typeof w === 'object' ? w.layer : '') === layerName);
  if (hasViolation) return 'fail';
  if (hasWarning) return 'warn';
  return 'pass';
}

function printReport(results, summary) {
  console.log('');
  console.log('='.repeat(70));
  console.log('  CASCADE HEALTH CHECK');
  console.log('='.repeat(70));
  console.log(`  SDs scanned: ${summary.total}`);
  console.log(`  Healthy: ${summary.healthy}  |  Unhealthy: ${summary.unhealthy}`);
  console.log(`  Violations: ${summary.violations}  |  Warnings: ${summary.warnings}`);
  console.log('='.repeat(70));
  console.log('');

  const statusIcon = { pass: '+', warn: '~', fail: 'X' };

  console.log('  SD Key                                    | M | C | V | S | O | Status');
  console.log('  ' + '-'.repeat(66));

  for (const r of results) {
    const key = r.sd_key.padEnd(42);
    const layers = ['mission', 'constitution', 'vision', 'strategy', 'okr']
      .map(l => statusIcon[r.layers[l]] || '?')
      .join(' | ');
    const status = r.passed ? 'PASS' : 'FAIL';
    console.log(`  ${key} | ${layers} | ${status}`);
  }

  console.log('');
  console.log('  Legend: M=Mission, C=Constitution, V=Vision, S=Strategy, O=OKR');
  console.log('  + = pass, ~ = warning, X = violation');
  console.log('');

  // Show details for failing SDs
  const failing = results.filter(r => !r.passed);
  if (failing.length > 0) {
    console.log('-'.repeat(70));
    console.log('  VIOLATIONS:');
    for (const r of failing) {
      console.log(`\n  ${r.sd_key}:`);
      for (const d of r.details) {
        if (d.enforcementLevel || d.layer) {
          const layer = d.layer || 'rule';
          const reason = d.reason || d.ruleText || 'Unknown';
          console.log(`    [${layer}] ${reason}`);
        }
      }
    }
    console.log('');
  }
}

/**
 * Query pending cascade invalidation flags and return stale document report.
 * Integrates with cascade-invalidation-engine.js for V09 dimension scoring.
 *
 * @param {Object} options
 * @param {Object} [options.supabaseClient] - Supabase client (uses module-level if omitted)
 * @param {string} [options.documentType] - Filter by type
 * @param {boolean} [options.jsonOutput] - Return JSON
 * @returns {Promise<{stale: Array, summary: Object}>}
 */
async function runStaleDocumentCheck(options = {}) {
  const client = options.supabaseClient || supabase;

  const [staleResult, summaryResult] = await Promise.all([
    getStaleDocuments(client, { documentType: options.documentType }),
    getCascadeSummary(client),
  ]);

  if (staleResult.error) {
    console.error('Failed to query stale documents:', staleResult.error);
    return { stale: [], summary: { pending: 0, resolved: 0, dismissed: 0 } };
  }

  if (options.jsonOutput) {
    console.log(JSON.stringify({ stale: staleResult.flags, summary: summaryResult }, null, 2));
  } else if (staleResult.count > 0) {
    console.log('');
    console.log('  STALE DOCUMENTS (Pending Cascade Invalidation)');
    console.log('  ' + '-'.repeat(60));
    for (const f of staleResult.flags) {
      console.log(`  [${f.document_type}] ${f.document_id} — flagged ${f.flagged_at}`);
    }
    console.log(`\n  Total: ${summaryResult.pending} pending, ${summaryResult.resolved} resolved, ${summaryResult.dismissed} dismissed`);
    console.log('');
  }

  return { stale: staleResult.flags, summary: summaryResult };
}

export { runHealthCheck, runStaleDocumentCheck };

// CLI entry point
const args = process.argv.slice(2);
const jsonFlag = args.includes('--json');
const staleFlag = args.includes('--stale');
const ventureIdx = args.indexOf('--venture');
const ventureId = ventureIdx >= 0 ? args[ventureIdx + 1] : null;

if (staleFlag) {
  runStaleDocumentCheck({ jsonOutput: jsonFlag }).then(({ stale }) => {
    if (stale.length > 0) process.exit(1);
  }).catch(err => {
    console.error('Stale document check failed:', err.message);
    process.exit(1);
  });
} else {
  runHealthCheck({ ventureId, jsonOutput: jsonFlag }).then(({ summary }) => {
    if (summary.unhealthy > 0) process.exit(1);
  }).catch(err => {
    console.error('Health check failed:', err.message);
    process.exit(1);
  });
}
