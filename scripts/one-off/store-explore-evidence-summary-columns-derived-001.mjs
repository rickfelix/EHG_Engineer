import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-INFRA-SUMMARY-COLUMNS-DERIVED-001';

async function main() {
  const { data: sd, error } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (error) throw error;

  const results = {
    verdict: 'PASS',
    confidence_score: 95,
    summary: 'Explore pass confirmed all 3 files named in the mechanism claims exist with the exact content described. lib/eva/uat-robustness-gate.js:141-145 keys the stage-23 acceptance predicate on metadata.control_pack_evaluated (boolean), per a QF-20260830-666 comment at line 142 explaining the deliberate design. lib/chairman/sms-outbound-worker.js confirmed as a live worker claim queue (status=sending claim at lines 825-831, terminal transitions at 615/697-706/856); QF-20260912-394 (commit 88b8277bdb7, PR #8807) already added a terminal-carrier-error-code fast path (lines 92, 654-663). database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql (path correction: chairman-gated/, not migrations/) confirmed lines 21-35 documenting the ACCESS EXCLUSIVE lock hazard and mandatory SET lock_timeout=\'3s\' apply-time requirement.',
    detailed_analysis: {
      files_read: [
        'lib/eva/uat-robustness-gate.js',
        'lib/chairman/sms-outbound-worker.js',
        'database/chairman-gated/20260824_strategic_directives_canonical_writer_choke.sql'
      ],
      key_findings: [
        'uat-robustness-gate.js:141 if (!run.metadata?.control_pack_evaluated) -- keys on the boolean, not control_pack_failures presence, per the QF-20260830-666 comment at line 142',
        'sms-outbound-worker.js:825-831 claims a row via status=sending BEFORE any provider receipt exists -- confirms RISK sub-agent finding that a receipt-derived trigger could overwrite an in-flight claim',
        'sms-outbound-worker.js already carries QF-20260912-394\'s terminal-carrier-error-code fast path (TERMINAL_CARRIER_ERROR_CODES, line 92; branch at 654-663) -- part of instance 3\'s remedy may already be shipped',
        '20260824_strategic_directives_canonical_writer_choke.sql:21-35 -- CREATE TRIGGER on strategic_directives_v2 takes ACCESS EXCLUSIVE (blocks reads too); service_role/postgres have no lock_timeout; seq_scan=377,874; mandatory SET lock_timeout=\'3s\' before any DDL'
      ]
    },
    metadata: {
      repo_path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer',
      executed_from_cwd: process.cwd()
    }
  };

  await storeSubAgentResults('Explore', sd.id, { code: 'Explore', name: 'Explore' }, results, { source: 'manual', phase: 'LEAD' });
  console.log('OK stored Explore evidence for', SD_KEY);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
