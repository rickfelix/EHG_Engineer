import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const id = '170637e5-c8e1-4d44-ab4e-206bf39c8c50';
const metrics = [
  { metric: 'Implementation completeness', target: '100% of scope items implemented',
    actual: '5/5 FRs implemented (FR-1 PR #8652; FR-2..FR-5 PR #8661). FR-2 carve delivered with all 75 markers preserved, but its 23,300-token exit is unreachable under its own pinned-marker constraint (measured: 8.8 KB headers + ~47 KB rule prose) — signalled 61023b11 for a binding-companion ruling.',
    evidence: { kind: 'db_probe', ref: { table: 'user_stories', match: { sd_id: id, status: 'completed' }, expect: '>=5' } } },
  { metric: 'Test coverage', target: '≥80% code coverage for new code',
    actual: '94% statements / 100% lines on lib/protocol/contract-carve.mjs (the only new library; vitest --coverage 2026-09-11); one-off scripts are exercised by dry-run + idempotent re-run.',
    evidence: { kind: 'test', ref: 'tests/unit/contract-carve.test.js' } },
  { metric: 'Zero regressions', target: '0 existing tests broken',
    actual: '0 regressions: 191/191 affected unit tests pass; 74/74 Adam ratification markers present, 0 regressions vs pre-carve baseline (check-ratification-markers.mjs --check); drift gate: no drift.',
    evidence: { kind: 'gate_score', ref: { handoff: 'EXEC-TO-PLAN', expect: '>=85' } } },
  { metric: 'Issue recurrence', target: '0 recurrences after fix deployed',
    actual: '0 recurrences of the EXEC/LEAD over-cap defect since FR-1 merged 2026-09-08 (CLAUDE_EXEC.md now fits:true 19,024 tok and is on MUST_CONFIRM_SINGLE_READ_FIT; CLAUDE_CORE.md 23,851 under cap). CLAUDE_ADAM.md remains fits:false (33,821 tok, was 54,867) pending the binding-companion ruling — recorded, not claimed fixed.',
    evidence: { kind: 'test', ref: 'tests/unit/claude-md-confirmed-fit-tier.test.js' } },
];
const { error } = await sb.from('strategic_directives_v2').update({ success_metrics: metrics }).eq('id', id);
console.log(error ? 'ERR ' + error.message : 'success_metrics updated (4 metrics, 4 evidence bindings)');
