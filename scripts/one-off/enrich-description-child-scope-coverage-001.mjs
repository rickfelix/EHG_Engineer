#!/usr/bin/env node
/**
 * SD-LEO-FIX-CHILD-SCOPE-COVERAGE-001 (escalated from QF-20260911-793) — enrich the
 * auto-generated description to satisfy GATE_SD_QUALITY's 50-word minimum for bugfix SDs
 * with a substantive, non-boilerplate account of the actual defect and fix.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const description = `parent-orchestrator-handler.js emits 3 hard-coded functional requirements ("Child SD Orchestration", "Work Decomposition Structure", "Progress Tracking") for every auto-generated orchestrator PRD. CHILD_SCOPE_COVERAGE then requires lexical keyword overlap between EVERY parent deliverable and the union of all children's own deliverable names, scoring 33/100 and blocking PLAN-TO-LEAD -- because no child would ever phrase its own scope using coordinator-only language. The fix marks the 3 template FRs coordination_only:true at the source, threads that marker into each sd_scope_deliverables row's metadata via extract-deliverables-from-prd.js, and has the gate exclude coordination_only rows from its coverage denominator entirely before it queries child deliverables, auto-passing at 100 when every parent deliverable is template-only. Implemented and unit-tested on the escalated QF branch (4 tests added/updated, 123 plan-to-lead tests green); the column/guard trigger family this touches is unrelated -- this is a self-contained gate-logic fix.`;

const { error } = await supabase
  .from('strategic_directives_v2')
  .update({ description })
  .eq('sd_key', 'SD-LEO-FIX-CHILD-SCOPE-COVERAGE-001');

if (error) {
  console.error('FAILED:', error.message);
  process.exit(1);
}
console.log('✅ description updated:', description.split(/\s+/).length, 'words');
