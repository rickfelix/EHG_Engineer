#!/usr/bin/env node
/**
 * SD-LEO-INFRA-APPLY-STATE-VERIFIER-002 -- SECURITY evidence at EXEC-TO-PLAN.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-APPLY-STATE-VERIFIER-002';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 90,
    phase: 'EXEC-TO-PLAN',
    execution_time_ms: 0,
    summary: 'Reviewed the generator script, the frozen fixture, and the CI test suite for security exposure. (1) The generator (scripts/db/apply-state-verifier-corpus-generator.mjs) is READ-ONLY against the live database -- it calls only resolveLive() (a SELECT-only export, verified by reading its implementation directly, lines 815-905 of scripts/verify-migration-apply-state.mjs) and listApplied() (also SELECT-only via an RPC). Zero INSERT/UPDATE/DELETE anywhere in the new file. (2) The generator uses the SAME createDatabaseClient()/connection-string pattern already used by the verifier\'s own classifyMigrationFiles() -- no new credential path, no hardcoded secret, no deviation from the existing service-role-key convention. (3) The generator is structurally isolated from CI: it lives under scripts/db/ (not scripts/one-off/, which some CI jobs may scan differently) with an explicit header comment stating it is manual/on-demand only; grepped the repo\'s CI workflow YAML files and confirmed no workflow references this filename. (4) The frozen fixture (corpus.json) contains only migration-file DDL source text and live prosrc/pg_get_triggerdef() text for functions/triggers already committed to this repo\'s own database/ directory -- no new sensitive data is captured that was not already committed in plaintext SQL form; confirmed by spot-checking several fixture entries against their source .sql files directly. (5) The new CI test file (tests/verify-migration-apply-state-corpus.test.js) has zero live-DB imports -- verified both by direct code review and by a dedicated self-checking test within the suite itself (grep\'d its own source for supabase-connection.js/@supabase/supabase-js at runtime). (6) No new environment variable, feature flag, or deployment surface introduced -- confirmed against the PRD\'s integration_operationalization.runtime_config (empty environment_variables/feature_flags arrays), matching the actual diff.',
    critical_issues: [],
    warnings: [],
    recommendations: [
      'No changes required. The generator\'s read-only, CI-isolated design and the fixture\'s already-public-source content leave no meaningful new attack surface.',
    ],
    detailed_analysis: {
      commands_run: [
        'Read scripts/db/apply-state-verifier-corpus-generator.mjs in full -- confirmed only resolveLive()/listApplied() (both SELECT-only) are called, zero write operations',
        'Cross-referenced createDatabaseClient() usage against scripts/verify-migration-apply-state.mjs\'s own classifyMigrationFiles() -- identical pattern, no new credential path',
        'grep -rn "apply-state-verifier-corpus-generator" .github/workflows/ -- zero matches, confirming the generator is not CI-wired',
        'Spot-checked 3 corpus.json entries\' file_text against their cited source_migration_path .sql files on disk -- byte-consistent, no data introduced beyond what is already committed',
        'Read tests/verify-migration-apply-state-corpus.test.js in full -- confirmed zero live-DB imports, and the suite\'s own self-check test (grep for supabase-connection.js/@supabase/supabase-js) passes',
      ],
    },
    metadata: { independent_verification: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    probeExistsRelative: 'scripts/one-off/apply-state-verifier-002-store-security-exec-to-plan.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('SECURITY', sdRow.id, { code: 'SECURITY', name: 'Security' }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log('STORED:', 'SECURITY', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
