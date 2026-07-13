#!/usr/bin/env node
/**
 * QF-20260712-917 (D6): stamp periodic_process_registry + rewrite runbook §7's
 * "Latest live run" witness after a scheduled `dr:rehearse` fires. Called by
 * .github/workflows/dr-restore-rehearsal-cron.yml on `always()` (PASS or FAIL
 * both need a fresh dated witness).
 *
 * Usage: node scripts/dr/stamp-rehearsal-result.mjs <report.json>
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { stampLastFired } from '../../lib/periodic-liveness/stamp-last-fired.js';
import { buildWitnessBlock, RUNBOOK_BLOCK_REGEX } from './rehearsal-witness-format.mjs';

const PROCESS_KEY = 'gha_cron:dr-restore-rehearsal-cron.yml';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runbookPath = path.join(repoRoot, 'ops', 'runbooks', 'disaster-recovery.md');

const reportPath = process.argv[2];
if (!reportPath) {
  console.error('Usage: node scripts/dr/stamp-rehearsal-result.mjs <report.json>');
  process.exit(1);
}

const report = fs.existsSync(reportPath)
  ? JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  : { overall: 'FAIL', error: 'no report produced (rehearsal crashed before --out was written)', scratchSchema: 'n/a', finishedAt: new Date().toISOString(), drills: { A: { status: 'NOT_RUN' }, B: { status: 'NOT_RUN' } }, statementAudit: { total: 0, reads: 0, scratchWrites: 0, forbidden: 0 }, cleanup: { schemaDropped: false } };

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { stamped, reason } = await stampLastFired(supabase, PROCESS_KEY);
console.log(`[stamp-rehearsal-result] registry stamp: stamped=${stamped}${reason ? ` reason=${reason}` : ''}`);

const runbook = fs.readFileSync(runbookPath, 'utf8');
if (!RUNBOOK_BLOCK_REGEX.test(runbook)) {
  console.error('[stamp-rehearsal-result] could not locate the "Latest live run" block in the runbook — leaving it untouched');
  process.exit(report.overall === 'PASS' ? 0 : 1);
}
fs.writeFileSync(runbookPath, runbook.replace(RUNBOOK_BLOCK_REGEX, buildWitnessBlock(report)));
console.log(`[stamp-rehearsal-result] runbook §7 updated with ${report.overall} result dated ${report.finishedAt}`);

process.exit(report.overall === 'PASS' ? 0 : 1);
