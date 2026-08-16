// Correction pass on the LEAD decision for SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001.
// The first LEAD decision (lead-decision-regression-detection-silent-001.mjs) claimed "zero
// new chairman-gated DDL." That claim was independently re-verified against the live DB
// (pg_publication_tables via direct Postgres, not REST) and found WRONG: test_results is not
// registered in the supabase_realtime publication, so a retargeted subscription would still
// never fire without one ALTER PUBLICATION statement. This corrects key_changes,
// success_criteria, success_metrics, scope_reduction_percentage, and metadata.lead_decision
// to reflect that one small piece of DDL is still required, staged (not applied) exactly like
// the original plan's CREATE TABLE would have been.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-REGRESSION-DETECTION-SILENT-001';

const { data: existing, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('key_changes, success_criteria, success_metrics, metadata')
  .eq('sd_key', SD_KEY)
  .single();

if (fetchErr) {
  console.error('FETCH_ERROR', fetchErr.message);
  process.exit(1);
}

const key_changes = [
  ...(existing.key_changes || []),
  {
    change: "CORRECTION: stage (do not apply) a migration containing ONE statement -- ALTER PUBLICATION supabase_realtime ADD TABLE test_results; -- discovered necessary via a direct pg_publication_tables query (independently verified, not from a sub-agent report alone): test_results/test_runs/test_failures are ALL absent from the supabase_realtime publication (0 of 21 registered tables), so a postgres_changes subscription on test_results would still silently never fire without this, even after the table/query/field-name fixes above.",
    impact: 'This IS real DDL (system-catalog change, alters production data-broadcast posture for every row change on test_results) and gets the SAME staged-not-applied, chairman-ceremony treatment the SD originally specified for the playwright_test_scenarios CREATE TABLE -- just a single, much smaller/safer ALTER PUBLICATION statement instead of a new table with columns and RLS policies.'
  }
];

const success_criteria = [
  ...(existing.success_criteria || []),
  {
    criterion: 'test_results is registered in the supabase_realtime publication before the fix is considered complete.',
    measure: "SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='test_results' returns exactly one row, verified at chairman-ceremony apply time -- not just staged, actually applied and confirmed."
  }
];

const success_metrics = [
  ...(existing.success_metrics || []),
  { metric: 'Chairman-gated DDL required by this SD (revised)', target: '1 statement (ALTER PUBLICATION, not CREATE TABLE) -- corrected from the earlier claim of 0', actual: '1 (staged, pending chairman apply)' }
];

const lead_decision_correction = {
  at: new Date(2026, 7, 16, 21, 5).toISOString(),
  by: 'LEAD (Golf-5, session 42d805b8-dd3a-443c-9dc9-fb3cb7de3b05)',
  corrects: 'metadata.lead_decision.decision (first pass) and metadata.lead_decision.nine_question_gate.q8_scope_reduction -- both previously claimed zero new chairman-gated DDL',
  what_changed: 'Independently queried pg_publication_tables via a direct Postgres connection (scripts/lib/supabase-connection.js createDatabaseClient, NOT the REST/PostgREST layer that produces the head-count trap this SD already warns about) after the Explore sub-agent flagged the risk. Confirmed test_results/test_runs/test_failures are 0-of-21 tables registered in the supabase_realtime publication.',
  revised_decision: 'One small piece of DDL (ALTER PUBLICATION supabase_realtime ADD TABLE test_results) IS still required and is staged, not applied, per the existing chairman-gated pattern -- this is a materially smaller/safer artifact than the originally-envisioned CREATE TABLE playwright_test_scenarios (no new table, no new columns, no new RLS policy surface), but it is not zero.',
  self_correction_signal: 'd93f5337-170c-4691-88b9-f20a769c3d95 (feedback signal to coordinator 0d37100a, correcting my own prior spec-conflict signal 5a3c36b2 within the same LEAD session, before PLAN handoff)',
  explore_agent_credit: 'Surfaced by the Explore sub-agent invoked for this SD\'s LEAD-TO-PLAN gate evidence -- it could not verify live DB state itself (read-only file search) but correctly flagged the risk and the exact check needed (pg_publication_tables), which I then ran directly and confirmed.'
};

const updatePayload = {
  key_changes,
  success_criteria,
  success_metrics,
  scope_reduction_percentage: 35,
  metadata: {
    ...(existing?.metadata || {}),
    lead_decision: {
      ...(existing?.metadata?.lead_decision || {}),
      correction: lead_decision_correction,
    },
  },
};

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update(updatePayload)
  .eq('sd_key', SD_KEY);

if (updateErr) {
  console.error('UPDATE_ERROR', updateErr.message);
  process.exit(1);
}

console.log('LEAD decision correction recorded for', SD_KEY);
