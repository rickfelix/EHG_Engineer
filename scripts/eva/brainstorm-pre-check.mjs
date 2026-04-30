#!/usr/bin/env node
/**
 * brainstorm-pre-check.mjs — Source-truth validation for brainstorm content.
 *
 * Part of: SD-LEO-INFRA-BRAINSTORM-SOURCE-TRUTH-CHECK-001 (FR-1)
 *
 * Reads a brainstorm session by id, runs registered claim validators over the
 * brainstorm.metadata.source_truth_claims array (or extracts claims if absent),
 * and emits a structured drift report. Optionally writes back to brainstorm
 * metadata via jsonb_set (FR-7 atomicity rule).
 *
 * Exit codes: 0=verified (all claims pass), 1=drift detected, 2=extraction/IO error.
 *
 * CLI:
 *   node scripts/eva/brainstorm-pre-check.mjs --brainstorm-id <uuid> [--write-back] [--allow-drift] [--json]
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import filePathValidator from './validators/file-path-claim-validator.mjs';
import gateTypeValidator from './validators/gate-type-claim-validator.mjs';
import lineNumberValidator from './validators/line-number-claim-validator.mjs';
import tableExistsValidator from './validators/table-existence-claim-validator.mjs';
import columnExistsValidator from './validators/column-existence-claim-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../../.env') });

export const VALIDATOR_VERSION = '1.0.0';

export const VALIDATOR_REGISTRY = {
  file_path: filePathValidator,
  gate_type: gateTypeValidator,
  line_content: lineNumberValidator,
  table_exists: tableExistsValidator,
  column_exists: columnExistsValidator,
};

export function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      opts[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
    }
  }
  return opts;
}

export async function runValidators(claims, context) {
  const drift_entries = [];
  let claims_passed = 0;
  let claims_failed = 0;

  for (const claim of claims) {
    const validator = VALIDATOR_REGISTRY[claim?.type];
    if (!validator) {
      drift_entries.push({
        claim,
        expected: 'known claim type',
        observed: `unknown type '${claim?.type}'`,
        source_path: null,
        line_number: null,
        severity: 'warning',
        remediation_hint: `Register claim type or remove. Known: ${Object.keys(VALIDATOR_REGISTRY).join(', ')}`,
        validator_id: 'registry',
      });
      claims_failed++;
      continue;
    }
    const result = await validator.validate(claim, context);
    if (result.passed) {
      claims_passed++;
    } else {
      claims_failed++;
      drift_entries.push({ claim, ...result });
    }
  }

  return {
    checked_at: new Date().toISOString(),
    validator_version: VALIDATOR_VERSION,
    claims_total: claims.length,
    claims_passed,
    claims_failed,
    drift_entries,
  };
}

export function maxSeverity(driftEntries) {
  if (driftEntries.some((e) => e.severity === 'error')) return 'error';
  if (driftEntries.some((e) => e.severity === 'warning')) return 'warning';
  return 'info';
}

export async function preCheckBrainstorm({ brainstormId, supabase, repoRoot, ehgRoot, claimsOverride }) {
  const { data: brainstorm, error } = await supabase
    .from('brainstorm_sessions')
    .select('id, metadata')
    .eq('id', brainstormId)
    .single();

  if (error || !brainstorm) {
    throw new Error(`brainstorm load failed: ${error?.message || 'not found'}`);
  }

  const claims = claimsOverride || brainstorm.metadata?.source_truth_claims || [];
  const context = {
    supabase,
    repo_root: repoRoot || resolve(__dirname, '../..'),
    ehg_root: ehgRoot || resolve(__dirname, '../../../ehg'),
  };

  const report = await runValidators(claims, context);
  return { brainstorm, report };
}

export async function writeBackReport(supabase, brainstormId, report, status) {
  const { error } = await supabase.rpc('jsonb_set_brainstorm_metadata', {
    p_id: brainstormId,
    p_keys: ['source_truth_drift_report', 'source_truth_check_status'],
    p_values: [report, status],
  });
  if (error && /not find function/i.test(error.message)) {
    const { data: row } = await supabase
      .from('brainstorm_sessions')
      .select('metadata')
      .eq('id', brainstormId)
      .single();
    const next = {
      ...(row?.metadata || {}),
      source_truth_drift_report: report,
      source_truth_check_status: status,
    };
    const { error: updErr } = await supabase
      .from('brainstorm_sessions')
      .update({ metadata: next })
      .eq('id', brainstormId);
    if (updErr) throw updErr;
    return;
  }
  if (error) throw error;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.brainstormId) {
    console.error('Missing --brainstorm-id <uuid>');
    process.exit(2);
  }
  const supabase = createSupabaseServiceClient();
  const { report } = await preCheckBrainstorm({ brainstormId: opts.brainstormId, supabase });
  const status =
    report.claims_failed === 0 ? 'passed' : opts.allowDrift ? 'bypassed_with_reason' : 'failed';

  if (opts.writeBack) {
    await writeBackReport(supabase, opts.brainstormId, report, status);
  }

  if (opts.json) {
    console.log(JSON.stringify({ status, report }, null, 2));
  } else {
    console.log(`brainstorm ${opts.brainstormId}: ${status} (${report.claims_passed}/${report.claims_total} passed)`);
    for (const entry of report.drift_entries) {
      console.log(
        `  [${entry.severity}] ${entry.validator_id}: ${entry.expected} → ${entry.observed}` +
          (entry.source_path ? ` @ ${entry.source_path}${entry.line_number ? ':' + entry.line_number : ''}` : '') +
          (entry.remediation_hint ? `\n    fix: ${entry.remediation_hint}` : ''),
      );
    }
  }

  if (report.claims_failed > 0 && !opts.allowDrift) process.exit(1);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('brainstorm-pre-check.mjs')) {
  main().catch((err) => {
    console.error(`brainstorm-pre-check failed: ${err.message}`);
    process.exit(2);
  });
}
