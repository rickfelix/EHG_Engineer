#!/usr/bin/env node
/**
 * SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001 FR-4 — record the completion-writer decision table
 * on the SD row.
 *
 * FR-4's acceptance is that every completion writer is listed with a decision, and that any
 * exclusion is RECORDED ON THE ROW "so a later audit finds the decision instead of the gap". This
 * writes the enumeration and a recommendation per writer. It does NOT make the ruling: each row
 * carries decision='PENDING_COORDINATOR' with the recommendation and its reasoning attached, so the
 * ruling has somewhere to land and the audit trail shows what was known when it was made.
 *
 * The distinction matters. A worker enumerating writers is measurement. A worker deciding that a
 * scheduled job may keep closing rows unwitnessed is policy, and that is not a worker's call.
 */
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-INFRA-COMPLETION-EVIDENCE-RUNTIME-001';

const WRITERS = [
  {
    path: 'scripts/modules/complete-quick-fix/orchestrator.js:61-105 buildMergedReconcileUpdate',
    surface: 'quick_fixes',
    invoked_by: 'human/worker via complete-quick-fix.js --scope-accepted',
    status_today: 'ENFORCED as of FR-2 (merged 4cf043c)',
    decision: 'ENFORCED',
    note: 'Terminal branch now writes verified_by from the scope-accepter. This was the 62-percent producer.'
  },
  {
    path: 'scripts/modules/complete-quick-fix/orchestrator.js:~733 completeQuickFix',
    surface: 'quick_fixes',
    invoked_by: 'human/worker via complete-quick-fix.js (normal + --force-complete)',
    status_today: 'ENFORCED as of FR-2',
    decision: 'ENFORCED',
    note: 'Previously wrote the MODE LABELS FORCE_COMPLETE/UAT_AGENT, which record how a row closed and never who. Now prefers a real identity with the mode as a suffix.'
  },
  {
    path: 'scripts/orphan-qf-reaper.mjs:187-207 and :280-303',
    surface: 'quick_fixes',
    invoked_by: 'GitHub Action, UNATTENDED, every 15 minutes',
    status_today: 'BYPASSES every gate; writes force_completed=true, verified_by=ORPHAN_REAPER, uat_verified untouched; checks only that a PR merged',
    decision: 'PENDING_COORDINATOR',
    recommendation: 'ENFORCE — but as a DISTINCT witness value, not by blocking. It should be possible to tell at a glance that a row was closed by an unattended cron on merge evidence alone, because that is exactly the thin close FR-2 exists to make visible. Blocking it would strand rows instead; the goal is legibility, not refusal.',
    caveat: 'Two existing tests hard-pin the literal ORPHAN_REAPER sentinel (tests/unit/scripts/orphan-qf-reaper-integration.test.js:162 and orphan-qf-reaper-force-completed.test.js). Any change here breaks them BY DESIGN and they must be updated in the same PR — known in advance, not to be discovered in CI.'
  },
  {
    path: 'scripts/modules/handoff/executors/lead-final-approval/index.js:526-534',
    surface: 'strategic_directives_v2',
    invoked_by: 'handoff.js execute LEAD-FINAL-APPROVAL',
    status_today: 'GATED via getRequiredGates()',
    decision: 'PENDING_COORDINATOR',
    recommendation: 'OUT OF SCOPE for FR-1/FR-2 as literally worded. strategic_directives_v2 has NO force_completed/uat_verified/verified_by columns, so those FRs cannot bind here without DDL. Record the exclusion rather than leaving it implicit.'
  },
  {
    path: 'scripts/sd-verify.js:341-350',
    surface: 'strategic_directives_v2',
    invoked_by: 'human CLI',
    status_today: 'UNGATED — writes status=completed with only an uncommitted-changes check, running NONE of the LEAD-FINAL gates. Its own header calls it a "Control Gap Fix".',
    decision: 'PENDING_COORDINATOR',
    recommendation: 'FLAG, do not fix here. This is the SD-side twin of the reaper: one gated writer beside an ungated side door. It is out of this SD stated scope but belongs on someone list, because a side door documented as a control gap is still a side door.'
  },
  {
    path: 'scripts/complete-orchestrator.js:342-350',
    surface: 'strategic_directives_v2',
    invoked_by: 'human CLI, hardcoded to one legacy SD (SD-FORGE-FOUNDATION-001)',
    status_today: 'effectively dead, but live if invoked',
    decision: 'PENDING_COORDINATOR',
    recommendation: 'EXCLUDE with reason — single-SD legacy one-off, no ongoing volume. Worth deleting rather than guarding.'
  }
];

const OPEN_QUESTION = {
  id: 'terminal-states-not-covered-by-the-CHECK',
  detail: "quick_fixes.status now allows ('open','in_progress','completed','escalated','cancelled','closed'). The completed_requires_verification CHECK covers ONLY 'completed'. A row routed to 'cancelled' or 'closed' satisfies no verification constraint at all. If FR-1/FR-2 are scoped to status='completed', those two states are an open sidestep and should be either covered or explicitly excluded with a reason."
};

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: row, error } = await supabase
    .from('strategic_directives_v2').select('id, metadata').eq('sd_key', SD_KEY).maybeSingle();
  if (error) throw new Error(`read failed: ${error.message}`);
  if (!row) throw new Error('SD not found');

  const metadata = {
    ...(row.metadata || {}),
    fr4_completion_writer_table: {
      at: new Date().toISOString(),
      by: 'Alpha-4 (worker 39aa8a1e)',
      purpose: 'FR-4 requires every completion writer listed with a decision, recorded on the row so a later audit finds the decision instead of the gap. This is the enumeration plus a recommendation per writer. The RULING is not made here — enumerating writers is measurement; deciding a scheduled job may keep closing rows unwitnessed is policy, and that is not a worker call.',
      writers: WRITERS,
      enforced_count: WRITERS.filter((w) => w.decision === 'ENFORCED').length,
      pending_count: WRITERS.filter((w) => w.decision === 'PENDING_COORDINATOR').length,
      highest_risk: 'scripts/orphan-qf-reaper.mjs — UNATTENDED on a 15-minute cron, and simultaneously the highest-volume producer of the thin stamps FR-2 targets AND the path that silently bypasses enforcement placed only in the CLI.',
      open_question: OPEN_QUESTION
    }
  };

  const { error: updErr } = await supabase.from('strategic_directives_v2').update({ metadata }).eq('sd_key', SD_KEY);
  if (updErr) throw new Error(`update failed: ${updErr.message}`);
  console.log(`FR-4 writer decision table recorded on ${SD_KEY}`);
  console.log(`  ENFORCED: ${metadata.fr4_completion_writer_table.enforced_count}`);
  console.log(`  PENDING_COORDINATOR: ${metadata.fr4_completion_writer_table.pending_count}`);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
