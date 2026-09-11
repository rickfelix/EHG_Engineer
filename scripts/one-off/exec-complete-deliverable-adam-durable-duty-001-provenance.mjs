#!/usr/bin/env node
// QF-20260903-433 / SD-LEO-FIX-ADAM-DURABLE-DUTY-001: stamp gate-evidence provenance
// (metadata.producer + run + content hash) on the one deliverable that was completed by
// hand (the other two were reconciled by the gate itself, which already stamps
// metadata.producer='gate_reconcile'). Per CLAUDE.md's provenance rule: a completed
// deliverable with no metadata.producer reads as evidence without provenance, i.e. absent.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_ID = '27eabc85-1de3-44e2-9b3b-8cb5eb87264b';
const NAME_PREFIX = 'Add regression coverage for the qualifier-form parse and the zero-marker CONTRACT DRIFT guard';

const { data: row, error: readErr } = await supabase
  .from('sd_scope_deliverables')
  .select('id, deliverable_name, metadata')
  .eq('sd_id', SD_ID)
  .ilike('deliverable_name', `${NAME_PREFIX}%`)
  .maybeSingle();
if (readErr || !row) { console.error('READ ERR', readErr?.message || 'not found'); process.exit(1); }

const { error } = await supabase
  .from('sd_scope_deliverables')
  .update({
    metadata: {
      ...row.metadata,
      producer: 'testing_subagent_exec_to_plan',
      producer_run_id: '1f905f30-c7c1-4338-a82b-bbdae85f8071', // sub_agent_execution_results row (TESTING, EXEC-TO-PLAN, PASS)
      content_hash: 'b23e1d41ca2d4975cde2ec99325fbe5e97c8a9df7f1f4be5c8cc1cf23bd08498', // .artifacts/sd001-node-test-output.txt sha256
      content_artifact: '.artifacts/sd001-node-test-output.txt',
    },
  })
  .eq('id', row.id);
if (error) { console.error('UPDATE ERR', error.message); process.exit(1); }
console.log('Provenance stamped on:', row.deliverable_name.slice(0, 60));
