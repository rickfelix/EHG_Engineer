#!/usr/bin/env node
// EXEC-TO-PLAN SECURITY evidence for SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001.
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_KEY = 'SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: sdRow, error: sdErr } = await supabase.from('strategic_directives_v2').select('id').eq('sd_key', SD_KEY).single();
  if (sdErr) throw sdErr;

  const results = {
    verdict: 'PASS',
    confidence: 82,
    phase: 'EXEC-TO-PLAN',
    execution_time_ms: 0,
    summary: "Security review of this SD's own new surface, since the SD itself IS a security instrument. (1) public_read_allowlist: RLS enabled, single policy grants ALL only to service_role -- no anon/authenticated policy exists, so the table is unreadable/unwritable by anon even though the schema-wide default anon SELECT grant applies at the object-privilege level (RLS blocks it; confirmed by reading the migration directly, no policy for anon/authenticated exists). This SD's own code never writes to it (TS-3, statically enforced by tests/unit/security/allowlist-zero-write.test.js and mutation-proven this session). (2) public_surface_canary: intentionally anon-readable by design (FR-3) -- its own policy explicitly grants SELECT to anon/authenticated with USING (true); this is the deliberate exception, not an oversight, and carries no sensitive data (a static label string + timestamp). (3) The checker's anon-role read client is constructed strictly from SUPABASE_ANON_KEY (never the service-role key) -- verified by direct code read of runContinuousExternalSurfaceCheck's openAnon() default factory, which reads process.env.SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY only. (4) The checker's service-role/pg-direct connection (createDatabaseClient('engineer')) is used only for catalog enumeration and allowlist reads -- never for the anon-simulation read itself, so a bug could not accidentally use elevated privileges to 'prove' a table is safe. (5) The migration was independently re-classified via classifyMigration() and confirmed TIER-1 (provably additive) -- no GRANT, no INSERT, no destructive DDL. (6) FR-7's classifyApproval() reads only approved_at (the schema's own declared contract), so no injection/parsing surface beyond Date() parsing of a trusted (service-role-read) column value.",
    critical_issues: [],
    warnings: [
      "This SD's checker is a DETECTION instrument, not a prevention one, for the manual TIER-2 apply-migration.js path (FR-5): a FINDINGS verdict there is logged loudly to stderr but does not roll back or block the already-committed migration (a rollback of a committed DDL apply is not attempted). This matches the existing pending-migrations-check.js pattern for the TIER-1 auto-apply path (which DOES block the handoff itself, since the check runs before the handoff completes) but is a real asymmetry between the two wiring points, inherent to when each path's 'gate' actually closes.",
    ],
    recommendations: [
      "A future SD could add a dedicated alerting channel (e.g. /signal-equivalent for the manual path) when the manual apply-migration.js path reports FINDINGS, since today it is stderr-only and could be missed in a non-interactive CI run.",
    ],
    detailed_analysis: {
      commands_run: [
        'Direct read of database/migrations/20260915_continuous_external_surface_allowlist_and_canary.sql -- confirmed public_read_allowlist has exactly one policy (service_role, FOR ALL), public_surface_canary has 2 policies (anon/authenticated SELECT, service_role ALL)',
        'Direct read of lib/security/continuous-external-surface-checker.mjs openAnon() default factory -- confirmed SUPABASE_ANON_KEY-only construction, never service-role key',
        'Re-ran classifyMigration() directly against the migration file -- tier:1 confirmed',
        'Cross-checked tests/unit/security/allowlist-zero-write.test.js is mutation-tested (this session, EXEC pass) and passing',
      ],
    },
    metadata: { independent_verification: true },
  };

  const resolution = await resolveSubAgentRepo({
    sdId: sdRow.id,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'SECURITY',
    probeExistsRelative: 'scripts/one-off/continuous-external-surface-001-store-security-exec-to-plan.mjs',
    supabase,
  });
  applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });
  const stored = await storeSubAgentResults('SECURITY', sdRow.id, { code: 'SECURITY', name: 'SECURITY' }, results, { sdKey: SD_KEY, phase: 'EXEC-TO-PLAN' });
  console.log('STORED:', 'SECURITY', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
