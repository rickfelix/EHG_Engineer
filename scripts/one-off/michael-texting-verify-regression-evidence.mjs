#!/usr/bin/env node
/**
 * SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001 - REGRESSION evidence at VERIFY.
 * Backward-compatibility / regression check for scripts/michael/checkpoint-send.mjs changes.
 * PARTIAL row written up front as crash insurance; UPDATED with the real verdict after validation.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { readFileSync } from 'node:fs';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-CHAIRMAN-TEXTING-001';

const PARTIAL = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 40,
  phase: 'VERIFY',
  execution_time_ms: 0,
  summary: 'PARTIAL (in-flight) REGRESSION row written up front as crash insurance per SD-FDBK-ENH-REGRESSION-SUB-AGENT-001. If this text is still present, the regression validation chain did not complete and this verdict is NOT final.',
  critical_issues: [],
  warnings: [{ id: 'REG-PARTIAL', severity: 'LOW', issue: 'Validation in progress at write time.', evidence: 'n/a' }],
  recommendations: [],
  detailed_analysis: { status: 'in_progress' },
  metadata: { partial: true },
};

async function main() {
  const payloadPath = process.argv[2];
  const results = payloadPath ? JSON.parse(readFileSync(payloadPath, 'utf8')) : PARTIAL;
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;
  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'REGRESSION',
    probeExistsRelative: 'scripts/one-off/michael-texting-verify-regression-evidence.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('REGRESSION', sdRow.id, { code: 'REGRESSION', name: 'Regression Validation Specialist' }, results, { sdKey: SD_KEY, phase: 'VERIFY' });
  console.log('STORED:', 'REGRESSION', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase, confidence: stored?.confidence }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
