#!/usr/bin/env node
/**
 * CLI entry point for the OPCO-A provisioning readiness report.
 * SD-FDBK-ENH-EHG-OPERATING-COMPANY-001-A. See lib/venture-provisioning/
 * exec-boundary-readiness.js for the FR-1/FR-2/FR-4 design rationale.
 *
 * Usage:
 *   node scripts/venture-provisioning/run-exec-boundary-readiness.mjs --venture <uuid> --deployment-url <url> [--dry-run]
 */
import dotenv from 'dotenv';
import { createSupabaseServiceClient } from '../lib/supabase-connection.js';
import { buildProvisioningReadinessReport, recordProvisioningReadiness } from '../../lib/venture-provisioning/exec-boundary-readiness.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

dotenv.config();

/**
 * Pure. Parses --venture, --deployment-url, --dry-run from argv.
 * @param {string[]} argv
 * @returns {{ ventureId: string|null, deploymentUrl: string|null, dryRun: boolean }}
 */
export function parseArgs(argv) {
  const getFlag = (flag) => { const i = argv.indexOf(flag); return i === -1 ? null : argv[i + 1]; };
  return {
    ventureId: getFlag('--venture'),
    deploymentUrl: getFlag('--deployment-url'),
    dryRun: argv.includes('--dry-run'),
  };
}

/**
 * Orchestrates the CLI run. Injectable deps for testability; returns an exit code
 * rather than calling process.exit() itself, so it can be unit-tested without
 * killing the test process.
 * @param {string[]} argv
 * @param {{ createSupabaseServiceClient?: Function, buildProvisioningReadinessReport?: Function, recordProvisioningReadiness?: Function, log?: Function, error?: Function }} [deps]
 * @returns {Promise<number>} process exit code
 */
export async function main(argv, deps = {}) {
  const log = deps.log || console.log;
  const error = deps.error || console.error;
  const buildReport = deps.buildProvisioningReadinessReport || buildProvisioningReadinessReport;
  const record = deps.recordProvisioningReadiness || recordProvisioningReadiness;
  const getClient = deps.createSupabaseServiceClient || createSupabaseServiceClient;

  const { ventureId, deploymentUrl, dryRun } = parseArgs(argv);

  if (!ventureId || !deploymentUrl) {
    error('Usage: run-exec-boundary-readiness.mjs --venture <uuid> --deployment-url <url> [--dry-run]');
    return 1;
  }

  const supabase = await getClient('engineer', { verbose: false });
  // dryRun is threaded into buildReport's deps so the FR-2/FR-3 side-effecting provisioning
  // calls are skipped entirely, not just the final persist step (security-agent finding
  // SEC-002: --dry-run previously still ran provisionOrganicChannel/provisionPaymentAccountSetup).
  const report = await buildReport({ supabase, ventureId, deploymentUrl }, { dryRun });

  log(JSON.stringify(report, null, 2));

  if (dryRun) {
    log('\n--dry-run: not persisting.');
    return 0;
  }

  const result = await record({ supabase, ventureId, report });
  log('\nPersisted:', JSON.stringify(result, null, 2));
  return result.ventureUpdated && result.artifactId ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => { console.error('Fatal error:', err.message); process.exit(1); });
}
