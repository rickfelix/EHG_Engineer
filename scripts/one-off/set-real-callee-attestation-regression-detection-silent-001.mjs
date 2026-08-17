import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('metadata')
  .eq('sd_key', SD_KEY)
  .single();

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

const real_callee_attestation = [
  {
    caller: 'server/index.js:401 (bootstrapRCAMonitoring, unconditional on server startup)',
    callee: 'lib/rca-monitor-bootstrap.js:36 (initializeRCAMonitoring)',
    integration: 'Confirmed live wiring, unmodified by this SD -- the whole monitor family (including the fixed monitorTestFailures) is genuinely invoked on every server start.',
    test_coverage: 'Untestable via unit test: this is a real network/process-lifecycle call site (Supabase Realtime channel subscription over websocket), not a pure function. Confirmed genuine by direct inspection and by the independently-run pg_publication_tables / pg_class probes against the live database throughout LEAD/PLAN/EXEC, not by a mocked unit test.',
  },
  {
    caller: 'lib/rca-runtime-triggers.js: monitorTestFailures() postgres_changes callback',
    callee: 'lib/rca-runtime-triggers.js: triggerRCA() -> triggerRCAOrThrow() -> root_cause_reports insert (service-role client)',
    integration: 'Real call, fixed field mappings and client in this SD.',
    test_coverage: 'tests/unit/rca-runtime-triggers-monitor-test-failures.test.js (TS-1 through TS-7, 8 tests) captures the REAL exported monitorTestFailures function\'s callback off a mocked .on(), asserting the actual insert payload shape. tests/unit/rca-trigger-failsoft.test.js (5 tests incl. new TS-9) exercises the REAL exported triggerRCA against a mocked Supabase client, asserting the service-role factory is used. All 13 pass; verified non-vacuous via mutation testing (trigger_tier 2->3 mutation caught by TS-1, reverted).',
  },
  {
    caller: 'lib/rca-runtime-triggers.js: triggerRCAOrThrow() (success path)',
    callee: 'lib/sub-agents/rca.js: execute() (invokeRCASubAgent)',
    integration: 'Pre-existing, unmodified call site (not touched by this SD).',
    test_coverage: 'Mocked in both new/updated test files (vi.mock on lib/sub-agents/rca.js) since this SD\'s scope is the trigger/write path, not the downstream RCA sub-agent analysis itself -- an HONEST GAP, not a hidden one: this SD does not add coverage for lib/sub-agents/rca.js\'s own internal correctness, which is out of scope and pre-existing.',
  },
  {
    caller: '(chairman ceremony, out-of-band, not a code call site)',
    callee: 'database/migrations/20260817_add_test_results_to_realtime_publication.sql (ALTER PUBLICATION supabase_realtime ADD TABLE test_results)',
    integration: 'Staged, NOT applied by this SD (chairman-gated DDL). Confirmed via a live pg_publication_tables query immediately before EXEC-TO-PLAN that test_results is still unpublished.',
    test_coverage: 'Cannot be tested until applied. TS-8 (documented in the PRD as an EXEC/post-ceremony verification step, not a PR-merge-blocking unit test) is the falsifiable end-to-end proof, deferred by design until the chairman applies the migration -- an HONEST GAP explicitly called out in the PRD\'s risks and acceptance criteria, not silently assumed.',
  },
];

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    metadata: {
      ...(existing?.metadata || {}),
      real_callee_attestation,
    },
  })
  .eq('sd_key', SD_KEY);

if (updateErr) {
  console.error('UPDATE_ERROR', updateErr.message);
  process.exit(1);
}

console.log('real_callee_attestation recorded for', SD_KEY);
