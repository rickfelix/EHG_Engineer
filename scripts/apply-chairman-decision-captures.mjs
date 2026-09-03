#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CHAIRMAN-DECISION-QUEUE-003 — FR-4: apply the captured chairman decisions
 * through the FIXED path.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE COUNT IS NOT THE CONTRACT — THE QUERY IS
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * There were four captures at LEAD time. The SD's own FR-5 records that a third arrived before the
 * SD finished filing and a fourth within the hour, and the LEAD pass found the SD's decision-row-id
 * list had ALSO gone stale. So this script hardcodes no ids and no count: it queries
 * feedback WHERE category='chairman_decision_capture' every run, and reports what it found.
 *
 * DRY-RUN IS THE DEFAULT. Pass --apply to write. This is the chairman's own decision queue; a
 * script that writes to it by default is one typo from resolving a decision nobody made.
 *
 * TWO CLASSES OF CAPTURE:
 *   - RPC captures (decided: approve/reject) call fn_chairman_decide. FR-1
 *     (database/chairman-gated/20260803_chairman_decide_null_safe_and_type_honest.sql) is now
 *     LIVE (SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001 Explore evidence, verified against
 *     pg_proc), so these are no longer permanently blocked -- isFixApplied() still probes the
 *     catalog live on every run rather than assuming, so a captured decision refuses with a
 *     stated reason instead of half-writing the row by hand if the migration is ever rolled
 *     back. The captures themselves say so: "do NOT hand-write the row (the 20260628
 *     canonical-resolve migration exists because hand-writes left lying decision fields)."
 *   - Hold captures (metadata.no_rpc_apply_needed) need no RPC. The row deliberately STAYS pending
 *     so it re-surfaces on unpark; what is missing is the marker that makes it render HELD with
 *     its trigger instead of as critical pending.
 *
 * Usage:
 *   node scripts/apply-chairman-decision-captures.mjs            # dry-run, always safe
 *   node scripts/apply-chairman-decision-captures.mjs --apply    # write
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resolveFeedback } from '../lib/governance/resolve-feedback.js';

const APPLY = process.argv.includes('--apply');
// QF-20260902-882: widened from the single literal 'chairman_decision_capture'. The sibling
// category 'chairman_ruling_capture' was invisible to this script (4 live rows, none ever
// reconcilable by any path) -- both categories share the exact same capture shape
// (metadata.decision_id / metadata.no_rpc_apply_needed / metadata.decided) and reconcile
// identically; only the category label differs.
const CATEGORIES = ['chairman_decision_capture', 'chairman_ruling_capture'];

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * Is the FR-1 migration applied? The RPC captures are unresolvable until it is.
 *
 * Returns true / false / null, and null means UNKNOWN — which the caller must report as unknown.
 * The first version of this probe called a `exec_sql_select` RPC that does not exist, silently
 * returned null, and the caller printed "FR-1 is not applied". Blocking was the safe direction, but
 * the STATED REASON was false: an instrument that cannot tell "absent" from "could not look"
 * reporting the first is this SD's own defect class, reproduced in the tool written to close it.
 *
 * SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001: a second version queried the catalog via a direct pg
 * client (createDatabaseClient()), which works locally (.env carries SUPABASE_DB_PASSWORD) but
 * returns null-forever on the scheduled workflow -- no *cron*.yml in this repo injects a DB
 * password/pooler URL (repo convention is supabase-js + service-role only; see
 * apply-chairman-decision-captures-cron.yml), so the probe would silently report FR-1 UNKNOWN on
 * every scheduled run and permanently BLOCK every RPC capture. Route through the `exec_sql`
 * RPC instead (SECURITY INVOKER, SELECT/WITH-only, already used the same way as a pooler-fallback
 * in scripts/audit-rpc-execute-grants.mjs) -- it runs over the same supabase-js client the rest of
 * this script already authenticates, so it works identically locally and in CI.
 */
async function isFixApplied() {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_text: "SELECT 1 FROM pg_proc WHERE proname = 'fn_chairman_decision_value'",
    });
    if (error) return null;                       // unknown — never guess "applied", never claim "absent"
    const rows = data?.[0]?.result;
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return null;
  }
}

/**
 * The unpark trigger, preferring structured metadata and falling back to the documented
 * "(trigger: ...)" form in the capture prose. Returns null when neither is present — the caller
 * reports that rather than writing a hold whose exit condition is invisible, which would restate
 * the very problem a hold marker exists to solve.
 */
export function extractUnparkTrigger(capture) {
  const fromMeta = capture?.metadata?.unpark_trigger;
  if (typeof fromMeta === 'string' && fromMeta.trim()) return fromMeta.trim();
  const m = /\(trigger:\s*([^)]+)\)/i.exec(capture?.description || '');
  return m ? m[1].trim() : null;
}

/** Classify a capture into the action it needs. Pure — unit-testable without a database. */
export function classifyCapture(capture) {
  const meta = capture?.metadata || {};
  if (!meta.decision_id) {
    return { action: 'skip', reason: 'capture carries no metadata.decision_id — nothing to apply to' };
  }
  if (meta.no_rpc_apply_needed === true) {
    return { action: 'mark_held', decisionId: meta.decision_id, unparkTrigger: extractUnparkTrigger(capture) };
  }
  if (meta.decided === 'approve' || meta.decided === 'reject') {
    return {
      action: 'rpc',
      decisionId: meta.decision_id,
      rpcAction: meta.decided === 'approve' ? 'approved' : 'rejected',
    };
  }
  return { action: 'skip', reason: `unrecognised metadata.decided=${JSON.stringify(meta.decided)}` };
}

async function main() {
  const { data: captures, error } = await supabase
    .from('feedback').select('id, title, description, status, metadata')
    .in('category', CATEGORIES).order('created_at');
  if (error) { console.error('query failed: ' + error.message); process.exit(1); }

  const fixApplied = await isFixApplied();
  console.log(`captures in categories [${CATEGORIES.join(', ')}]: ${captures.length}   (queried, not assumed)`);
  console.log(`FR-1 applied (fn_chairman_decision_value present): ${fixApplied === null ? 'UNKNOWN' : fixApplied}`);
  console.log(APPLY ? 'MODE: APPLY (writing)\n' : 'MODE: DRY-RUN — pass --apply to write\n');

  const counts = { applied: 0, blocked: 0, skipped: 0, already: 0 };

  for (const cap of captures) {
    const plan = classifyCapture(cap);
    const tag = `${cap.id.slice(0, 8)} ${cap.title.slice(0, 58)}`;

    if (plan.action === 'skip') { counts.skipped++; console.log(`SKIP    ${tag}\n        ${plan.reason}`); continue; }

    if (plan.action === 'rpc') {
      if (fixApplied !== true) {
        counts.blocked++;
        console.log(`BLOCKED ${tag}\n        needs fn_chairman_decide (${plan.rpcAction}) on decision ${plan.decisionId.slice(0, 8)}`);
        // Say which of the two it is. Both block — but "not applied" and "could not determine"
        // call for different next actions, and collapsing them sends the reader to the wrong one.
        console.log(fixApplied === false
          ? '        FR-1 is NOT APPLIED — the RPC would still return NOT_FOUND on this null venture_id.'
          : '        FR-1 status UNKNOWN — could not reach the catalog to check. Blocking on unknown, not asserting absence.');
        console.log('        Refusing to hand-write: that is what left lying decision fields before.');
        continue;
      }
      if (!APPLY) { counts.applied++; console.log(`WOULD   ${tag}\n        fn_chairman_decide(${plan.decisionId.slice(0, 8)}, '${plan.rpcAction}')`); continue; }
      const { error: e } = await supabase.rpc('fn_chairman_decide', {
        p_decision_id: plan.decisionId, p_action: plan.rpcAction,
        p_rationale: `FR-4 apply of captured verbal decision ${cap.id}`,
      });
      if (e) { counts.blocked++; console.log(`FAILED  ${tag}\n        ${e.message}`); continue; }
      counts.applied++; console.log(`APPLIED ${tag}`);
      // QF-20260902-882: a bare update({status:'resolved'}) violates
      // chk_resolved_requires_reference / chk_feedback_terminal_resolution (a resolved row with
      // none of quick_fix_id/strategic_directive_id/resolution_sd_id needs a non-empty
      // resolution_notes) -- these captures have none of the FK references, so the bare write was
      // being REJECTED by the CHECK constraint. Route through the canonical resolver instead.
      const resolveResult = await resolveFeedback({
        supabase,
        feedbackId: cap.id,
        notes: `Chairman decision ${plan.rpcAction} via fn_chairman_decide (decision ${plan.decisionId}).`,
        resolutionType: 'chairman_decision_applied',
      });
      // SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001: resolveFeedback() is deliberately fail-soft
      // (returns {updated:false} instead of throwing), so an unchecked call here would print
      // APPLIED even when the feedback row's resolve silently failed -- a narrower recurrence of
      // the exact silent-write-loss defect class this script exists to fix.
      if (!resolveResult.updated) {
        console.log(`WARN    ${tag}\n        RPC applied, but resolving its feedback row did not: `
          + `${resolveResult.reason || resolveResult.error || 'unknown'}`);
      }
      continue;
    }

    // mark_held — a data annotation, not a resolution. The row stays pending on purpose.
    const { data: row } = await supabase
      .from('chairman_decisions').select('id, brief_data').eq('id', plan.decisionId).maybeSingle();
    if (!row) { counts.skipped++; console.log(`SKIP    ${tag}\n        decision ${plan.decisionId.slice(0, 8)} not found`); continue; }
    if (row.brief_data?.hold?.ratified === true) { counts.already++; console.log(`ALREADY ${tag}  (hold marker present — idempotent)`); continue; }
    if (!plan.unparkTrigger) {
      console.log(`WARN    ${tag}\n        no unpark trigger found in metadata.unpark_trigger or a "(trigger: ...)" clause.`);
      console.log('        The row will render "HELD until: trigger NOT RECORDED" — visible, not silent.');
    }
    const brief = {
      ...(row.brief_data || {}),
      hold: {
        ratified: true,
        ratified_by: 'chairman (verbal, captured)',
        capture_id: cap.id,
        unpark_trigger: plan.unparkTrigger,
        note: 'Row deliberately stays pending so it re-surfaces on unpark. Not a resolution.',
      },
    };
    if (!APPLY) { counts.applied++; console.log(`WOULD   ${tag}\n        mark HELD until: ${plan.unparkTrigger || 'NOT RECORDED'}`); continue; }
    const { error: e2 } = await supabase.from('chairman_decisions').update({ brief_data: brief }).eq('id', plan.decisionId);
    if (e2) { counts.blocked++; console.log(`FAILED  ${tag}\n        ${e2.message}`); continue; }
    counts.applied++; console.log(`APPLIED ${tag}  HELD until: ${plan.unparkTrigger || 'NOT RECORDED'}`);
    // QF-20260902-882: deliberately does NOT resolve the capture's feedback row. Marking held is
    // "a data annotation, not a resolution" (see the comment above this block) -- the underlying
    // decision is still pending, just annotated with when it will unpark. Resolving the capture
    // here would misreport a still-open decision as closed. The capture stays status='new' until
    // the decision is actually decided (the rpc branch above, which does resolve).
  }

  console.log(`\n${APPLY ? 'applied' : 'would apply'}: ${counts.applied}   blocked: ${counts.blocked}   `
    + `already: ${counts.already}   skipped: ${counts.skipped}`);
  if (counts.blocked > 0) {
    console.log('\nBLOCKED captures are waiting on the chairman applying '
      + 'database/chairman-gated/20260803_chairman_decide_null_safe_and_type_honest.sql.');
    console.log('Re-run this script after the ceremony; it is idempotent and re-queries the category.');
  }
}

// Only run when invoked directly, so the pure exports above stay importable by tests.
const invoked = process.argv[1] || '';
if (typeof invoked === 'string' && invoked.replace(/\\/g, '/').endsWith('apply-chairman-decision-captures.mjs')) {
  await main();
}
