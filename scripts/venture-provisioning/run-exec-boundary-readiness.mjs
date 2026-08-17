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

async function main() {
  const argv = process.argv.slice(2);
  const getFlag = (flag) => { const i = argv.indexOf(flag); return i === -1 ? null : argv[i + 1]; };
  const ventureId = getFlag('--venture');
  const deploymentUrl = getFlag('--deployment-url');
  const dryRun = argv.includes('--dry-run');

  if (!ventureId || !deploymentUrl) {
    console.error('Usage: run-exec-boundary-readiness.mjs --venture <uuid> --deployment-url <url> [--dry-run]');
    process.exit(1);
  }

  const supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  const report = await buildProvisioningReadinessReport({ supabase, ventureId, deploymentUrl });

  console.log(JSON.stringify(report, null, 2));

  if (dryRun) {
    console.log('\n--dry-run: not persisting.');
    process.exit(0);
  }

  const result = await recordProvisioningReadiness({ supabase, ventureId, report });
  console.log('\nPersisted:', JSON.stringify(result, null, 2));
  process.exit(result.ventureUpdated && result.artifactId ? 0 : 1);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error('Fatal error:', err.message); process.exit(1); });
}
