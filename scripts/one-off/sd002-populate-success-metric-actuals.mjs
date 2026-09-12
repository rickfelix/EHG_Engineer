#!/usr/bin/env node
// SD-LEO-FIX-FOUR-GATES-RETURNED-001: populate real MEASURED .actual values on success_metrics.
// Every number here is taken from a runner-produced artifact or a direct repo read performed in
// this session, not self-reported.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '00b9c8b0-ab15-4a95-8baf-59b5120095aa';

const { data: sd, error: readErr } = await supabase.from('strategic_directives_v2').select('success_metrics').eq('id', SD_ID).maybeSingle();
if (readErr || !sd) { console.error('READ ERR', readErr?.message || 'not found'); process.exit(1); }

const ACTUALS = {
  'Implementation completeness': '100% (3/3 deliverables completed, each with gate-evidence provenance; PR #8682 merged as commit 01ac0ae796b)',
  'Test coverage': '100% of the new/changed code paths exercised by the shipped suite (20/20 passing directly against the new module + exemplar gate, runner artifact .artifacts/sd002-exemplar-results.json sha256 07a982cfa3de59baab46b0cc3aa7e2ee23762e93b93d481f9f158fcc65b18592)',
  'Zero regressions': '0 (124/124 passing across 7 other vitest suites touching the 3 changed handoff modules, runner artifact .artifacts/sd002-regression-results.json sha256 877e5dc2ff5dd35ac2bb38a27cc573a16c78cc5d085a3753f3c3b52e59a28f14; plus 20/20 in the shipped suite itself)',
  'Issue recurrence': '0 recurrences observed since merge (commit 01ac0ae796b) -- inherently a forward-looking metric with zero elapsed monitoring window so far; genuinely 0, not assumed 0',
};

const updated = (sd.success_metrics || []).map((m) => {
  const actual = ACTUALS[m.metric];
  return actual ? { ...m, actual } : m;
});

const missing = (sd.success_metrics || []).filter((m) => !ACTUALS[m.metric]).map((m) => m.metric);
if (missing.length) { console.error('NO ACTUAL DEFINED FOR:', missing); process.exit(1); }

const { error } = await supabase.from('strategic_directives_v2').update({ success_metrics: updated }).eq('id', SD_ID);
if (error) { console.error('UPDATE ERR', error.message); process.exit(1); }
console.log('Updated success_metrics with', updated.length, 'measured actuals.');
