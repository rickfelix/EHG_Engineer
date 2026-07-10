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
      ...(opts.securityReviewed ? { security_reviewed: true } : {}),
      ...(opts.migrationReviewed ? { migration_reviewed: true } : {})
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
