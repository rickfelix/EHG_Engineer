/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: quick-fix escalation source adapter — createFromQF moved
 * VERBATIM from scripts/leo-create-sd.js. Sanctioned change only: former hard-exit sites
 * return {ok:false, error, exitCode} (exit 1) / {ok:true, done:true} (exit 0); the CLI maps
 * them back to the historical exit codes. The exhausted-retry recovery throw is unchanged.
 */
import { supabase } from '../context.js';
import { generateSDKey } from '../../../scripts/modules/sd-key-generator.js';
import { withRetry } from '../../eva/stage-zero/data-pollers/retry.js';
import { resolveVenturePrefix, createSDOrThrow as createSD } from '../pipeline.js';
import { classifyPlanLinkage } from '../plan-linkage-classifier.js';

/**
 * Create SD from open quick-fix (QF-* row).
 * Used when sd:next escalates a QF to Tier 3 (risk-keyword or LOC threshold).
 * Mirrors createFromFeedback contract; updates the source quick_fixes row with
 * status='escalated' + escalated_to_sd_id so the queue stops recommending it.
 */
export async function createFromQF(qfId, opts = {}) {
  console.log(`\n📋 Creating SD from quick-fix: ${qfId}`);

  if (!qfId) {
    console.error('❌ Missing QF-ID. Usage: node scripts/leo-create-sd.js --from-qf <QF-ID>');
    // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
    return { ok: false, error: 'Missing QF-ID. Usage: node scripts/leo-create-sd.js --from-qf <QF-ID>', exitCode: 1 };
  }

  const { data: qf, error } = await supabase
    .from('quick_fixes')
    .select('*')
    .eq('id', qfId)
    .maybeSingle();

  if (error || !qf) {
    console.error('Quick-fix not found:', qfId, error?.message || '');
    // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(1) — the CLI maps this to exit 1.
    return { ok: false, error: `Quick-fix not found: ${qfId} ${error?.message || ''}`.trim(), exitCode: 1 };
  }

  // Duplicate guard: already escalated or already shipped
  if (qf.escalated_to_sd_id) {
    console.log(`\n⚠️  Quick-fix already escalated to SD: ${qf.escalated_to_sd_id}\n`);
    // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(0) — done-result maps to exit 0.
    return { ok: true, done: true, exitCode: 0, message: `Quick-fix already escalated to SD: ${qf.escalated_to_sd_id}` };
  }
  if (qf.status === 'completed') {
    console.log(`\n⚠️  Quick-fix is already completed (status=${qf.status}). Refusing to escalate.\n`);
    // SD-ARCH-HOTSPOT-LEO-CREATE-001: was a hard exit(0) — done-result maps to exit 0.
    return { ok: true, done: true, exitCode: 0, message: `Quick-fix is already completed (status=${qf.status}). Refusing to escalate.` };
  }

  // Map QF type → SD type. Unknown QF types fall through to 'fix'.
  const typeMap = { bug: 'fix', polish: 'enhancement', documentation: 'documentation', enhancement: 'enhancement' };
  const type = typeMap[qf.type] || 'fix';

  // Map QF severity → SD priority (1:1 enum overlap).
  const priority = ['critical', 'high', 'medium', 'low'].includes(qf.severity) ? qf.severity : 'medium';

  const venturePrefix = await resolveVenturePrefix(null, type);
  const sdKey = await generateSDKey({ source: 'LEO', type, title: qf.title, venturePrefix });

  const sd = await createSD({
    sdKey,
    title: qf.title,
    description: qf.description || qf.title,
    type,
    priority,
    rationale: `Escalated from quick-fix ${qf.id} (Tier 3 routing). Original LOC estimate: ${qf.estimated_loc ?? 'n/a'}.`,
    metadata: {
      source: 'quick_fix',
      source_qf_id: qf.id,
      escalated_from_qf: qf.id,
      qf_type: qf.type,
      qf_severity: qf.severity,
      qf_estimated_loc: qf.estimated_loc,
      qf_target_application: qf.target_application,
      // SD-LEO-INFRA-ESCALATION-CONTINUITY-AUTO-001 (FR-2): branch-continuity seed.
      // The QF worker's fix is committed on branch qf/<qf-id>; recording it here lets
      // sd-start.js base the escalated SD's worktree off that local branch instead of
      // origin/main (resolve-sd-workdir.js::createWorktree), so the committed work is
      // resumed rather than rebuilt. Deterministic branch NAME — no git access at
      // DB-creation time; a missing local ref later falls back to origin/main.
      escalated_from_branch: `qf/${qf.id}`,
      ...(opts.securityReviewed ? { security_reviewed: true } : {}),
      ...(opts.migrationReviewed ? { migration_reviewed: true } : {}),
      // SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-1): tag-at-the-door linkage stamp
      plan_linkage: classifyPlanLinkage({ sdKey })
    }
  });

  // Retire the QF so it stops being independently claimable now that the SD is the
  // canonical track. supabase-js does not throw on a write error, so the wrapped fn
  // must throw explicitly for withRetry's catch to see it. A transient failure here
  // (after the SD already exists) would otherwise leave the QF silently claimable
  // alongside an unlinked SD — fail loud with recovery instructions instead.
  try {
    await withRetry(async () => {
      const { error: updErr } = await supabase
        .from('quick_fixes')
        .update({
          status: 'escalated',
          escalated_to_sd_id: sd.id,
          escalation_reason: `Escalated to ${sdKey} via leo-create-sd.js --from-qf`,
          claiming_session_id: null
        })
        .eq('id', qf.id);
      if (updErr) throw new Error(updErr.message);
    }, { maxRetries: 2, baseDelayMs: 250, timeoutMs: 5000, label: `retire QF ${qf.id}` });

    console.log(`   ✓ Quick-fix ${qf.id} → status='escalated', escalated_to_sd_id=${sd.id}`);
  } catch (updErr) {
    throw new Error(
      `SD ${sdKey} (${sd.id}) was created, but retiring quick-fix ${qf.id} failed after 3 attempts: ${updErr.message}\n` +
      'The QF is still claimable and NOT linked back to the SD. Manual recovery — run:\n' +
      `  UPDATE quick_fixes SET status='escalated', escalated_to_sd_id='${sd.id}', escalation_reason='Escalated to ${sdKey} via leo-create-sd.js --from-qf (manual recovery)', claiming_session_id=NULL WHERE id='${qf.id}';`
    );
  }

  // SD-LEO-INFRA-ESCALATION-CONTINUITY-AUTO-001 (FR-1): born-claim the escalated SD
  // for the QF worker's own session. Without this the SD enters the free sd:next pool
  // unclaimed and a second same-host session can self-claim it within seconds (witnessed
  // 11s race on QF-20260712-254), rebuilding the fix off main. Claiming MUST go through
  // the claim_sd RPC (the canonical claude_sessions unique-index lock), never a bare
  // write to the SD's mirror claim column (which does not close the race and is pinned
  // against by leo-create-sd-claim-pin). Guards: only born-claim when the captured QF
  // session is (a) non-null,
  // (b) live (claude_sessions status active/idle), and (c) STILL on this QF (sd_key === qf.id)
  // — so a session that has since moved to other work never has an unrelated claim yanked
  // by claim_sd's release-others behaviour. Fail-soft: a rejected/failed born-claim leaves
  // the SD unclaimed (today's no-regression behaviour), never throws — the SD already exists.
  const qfSession = qf.claiming_session_id; // captured BEFORE retirement nulled the column
  if (qfSession) {
    try {
      const { data: sess, error: sessErr } = await supabase
        .from('claude_sessions')
        .select('session_id, status, sd_key')
        .eq('session_id', qfSession)
        .in('status', ['active', 'idle'])
        .maybeSingle();

      // The claimed-work pointer on claude_sessions is `sd_key` (claim_sd migrated
      // sd_id -> sd_key); for a QF worker it holds the QF key, which is quick_fixes.id.
      // Surface a lookup error rather than silently no-op'ing, so a future schema drift
      // cannot invisibly disable the born-claim (the defect a `sd_id` typo would cause).
      if (sessErr) {
        console.warn(`   ⚠️  born-claim of ${sdKey} skipped — claude_sessions lookup failed (SD left unclaimed): ${sessErr.message}`);
      } else if (sess && sess.sd_key === qf.id) {
        const { data: claimRes, error: claimErr } = await supabase.rpc('claim_sd', {
          p_sd_id: sdKey,
          p_session_id: qfSession,
          p_track: 'STANDALONE'
        });
        if (claimErr || (claimRes && claimRes.success === false)) {
          console.warn(`   ⚠️  born-claim of ${sdKey} for QF worker ${qfSession} did not take (SD left unclaimed): ${claimErr?.message || claimRes?.error || 'unknown'}`);
        } else {
          console.log(`   ✓ ${sdKey} born-claimed for QF worker session ${qfSession}`);
        }
      }
    } catch (claimEx) {
      // Never fail the escalation on a born-claim hiccup — unclaimed is the safe fallback.
      console.warn(`   ⚠️  born-claim of ${sdKey} threw (SD left unclaimed): ${claimEx.message}`);
    }
  }

  return sd;
}

/**
 * Registry adapter surface: toDraft(input, deps).
 * input: the QF id (string) or { qfId, opts }.
 */
export async function toDraft(input, _deps = {}) {
  if (input && typeof input === 'object') {
    return createFromQF(input.qfId ?? input.id, input.opts ?? input.options ?? {});
  }
  return createFromQF(input);
}
