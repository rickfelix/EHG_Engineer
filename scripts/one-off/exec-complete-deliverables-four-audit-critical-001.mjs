#!/usr/bin/env node
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = 'ea65ac97-8f76-4a0f-98c0-64065048897b';

const evidence = {
  'Stage ALTER COLUMN TYPE': 'database/chairman-gated/20260817_four_audit_critical_timestamptz.sql -- 15 columns, 4 tables, USING-pinned, drop/recreate envelope for 11 dependent views/matviews (DATABASE sub-agent finding). Live-proven end-to-end via ROLLBACK-guarded dry run (dry_run.mjs) and TEMP-table USING-clause proof.',
  'Author an information_schema.columns-based': 'database/chairman-gated/20260817_four_audit_critical_timestamptz_verify.mjs -- mirrors schema-validator.js pattern, createDatabaseClient(engineer). --baseline run live against production: 15/15 naive confirmed, 6/6 sibling negative control aware. 5 unit tests passing.',
  "Audit high-traffic JS readers": '5 sites fixed + unit-tested (strand-age-gauge.cjs, claim-analysis.js x2, handoff-rejection-rates.mjs, duration-estimator.js, ghost-completion-check.mjs); docs/audits/four-audit-critical-timestamptz-js-reader-sweep.md documents the full classification table + explicit scope boundary (ehg/src 10 files verified SAFE; EHG_Engineer generic-pattern 40-file surface not exhaustively triaged, stated explicitly).',
  'Author a paired _DOWN.sql': '20260817_four_audit_critical_timestamptz_DOWN.sql -- 15 reverse USING-pinned statements + same 11-object drop/recreate envelope. Proven via live round-trip dry run.',
  'Assemble the chairman ceremony packet': 'database/chairman-gated/README.md new section: apply command, full proof sequence, quiesce-window warning.',
  'Document, as explicit out-of-scope findings': 'PRD FR-6 + risks section documents product_requirements_v2 fold-orphan gap and subagent-evidence-gate.js duplicate-normalizer debt; routed via completion-flags at LEAD-FINAL-APPROVAL.',
};

const { data: rows, error: readErr } = await supabase
  .from('sd_scope_deliverables')
  .select('id, deliverable_name')
  .eq('sd_id', SD_ID);
if (readErr) { console.error('READ ERR', readErr.message); process.exit(1); }

for (const row of rows) {
  const key = Object.keys(evidence).find(k => row.deliverable_name.startsWith(k));
  if (!key) { console.error('NO MATCH for', row.deliverable_name); continue; }
  const { error } = await supabase
    .from('sd_scope_deliverables')
    .update({ completion_status: 'completed', completion_evidence: evidence[key], verified_by: 'EXEC', verified_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) console.error('UPDATE ERR for', row.deliverable_name, error.message);
  else console.log('Completed:', row.deliverable_name.slice(0, 60));
}
