/**
 * SD-ARCH-HOTSPOT-LEO-CREATE-001: /inbox feedback source adapter — createFromFeedback moved
 * VERBATIM from scripts/leo-create-sd.js. Sanctioned change only: former hard-exit sites
 * return {ok:false, error, exitCode} (exit 1) / {ok:true, done:true} (exit 0); the CLI maps
 * them back to the historical exit codes.
 */
import { supabase } from '../context.js';
import { generateSDKey } from '../../../scripts/modules/sd-key-generator.js';
import { runTriageGate } from '../../../scripts/modules/triage-gate.js';
import { checkFeedbackPremiseLiveness, logForceLivenessOverride } from '../../eva/feedback-premise-adapter.js';
import { resolveVenturePrefix, mapPriority, createSDOrThrow as createSD } from '../pipeline.js';

/**
 * Create SD from /inbox feedback item
 */
export async function createFromFeedback(feedbackId, options = {}) {
  // QF-20260509-LEO-CREATE-FLAGS (closes 8a640d32 sibling-parity gap):
  // honor --migration-reviewed / --security-reviewed in --from-feedback path
  // (mirrors --from-plan / --child handling). Without this, the GR-MIGRATION-REVIEW
  // / GR-SECURITY-BASELINE guardrails block SD creation from feedback rows whose
  // description mentions migration or schema even with the flags set.
  const { migrationReviewed = false, securityReviewed = false } = options;
  console.log(`\n📋 Creating SD from feedback: ${feedbackId}`);

  // Fetch feedback item (support full or partial UUID)
  let feedback;
  // Try exact match first (full UUID)
  const { data: exactMatch } = await supabase
    .from('feedback')
    .select('*')
    .eq('id', feedbackId)
    .maybeSingle();

  if (exactMatch) {
    feedback = exactMatch;
  } else {
    // Partial UUID: validate format then use text cast via RPC
    if (!/^[0-9a-f-]+$/i.test(feedbackId)) {
      console.error('Invalid feedback ID format (must be UUID hex characters):', feedbackId);
      return { ok: false, error: `Invalid feedback ID format: ${feedbackId}`, exitCode: 1 };
    }
    const { data: partialResult } = await supabase
      .rpc('exec_sql', { sql_text: `SELECT id FROM feedback WHERE id::text LIKE '${feedbackId}%' LIMIT 1` });
    const partialId = partialResult?.[0]?.result?.[0]?.id;
    if (partialId) {
      const { data } = await supabase.from('feedback').select('*').eq('id', partialId).single();
      feedback = data;
    }
  }

  if (!feedback) {
    console.error('Feedback not found:', feedbackId);
    return { ok: false, error: `Feedback not found: ${feedbackId}`, exitCode: 1 };
  }

  // GAP-008: Check if feedback already has a linked SD (duplicate guard)
  if (feedback.strategic_directive_id || feedback.resolution_sd_id) {
    const linkedId = feedback.strategic_directive_id || feedback.resolution_sd_id;
    console.log(`\n⚠️  Feedback already linked to SD: ${linkedId}`);
    console.log('   Skipping SD creation to prevent duplicates.\n');
    return { ok: true, done: true, exitCode: 0, message: `Feedback already linked to SD: ${linkedId}` };
  }

  // SD-FDBK-ENH-UAT-AGENT-FEEDBACK-001 FR-1: liveness re-check (b6594220 class). Fails OPEN.
  if (!options.forceLiveness) {
    try {
      const verdict = await checkFeedbackPremiseLiveness(feedback, { supabase });
      if (verdict.status === 'STALE') {
        console.log(`\n⚠️  [STALE_PREMISE] feedback ${feedback.id} already fixed:`);
        for (const e of verdict.evidence || []) console.log(`     ${e}`);
        console.log('   Skipping SD creation. Override (audited): --force-liveness "<reason>"\n');
        return { sdKey: null, feedbackId: feedback.id, action: 'skipped-stale-premise', verdict };
      }
    } catch (e) {
      console.warn(`\n⚠️  [LIVENESS_CHECK_DEGRADED] failed-open (${e?.message || e})`);
    }
  } else {
    await logForceLivenessOverride({ supabase, entityId: feedback.id, reason: options.forceLiveness });
    console.warn(`\n⚠️  [FORCE_LIVENESS] skipping premise re-check: ${options.forceLiveness}`);
  }

  // Map feedback type to SD type. --type flag (options.typeOverride) wins
  // when supplied (mirrors --from-plan / --child override semantics).
  const typeMap = { issue: 'fix', enhancement: 'enhancement', bug: 'bugfix' };
  const type = options.typeOverride || typeMap[feedback.type] || 'feature';
  // --title override (options.titleOverride) wins over feedback.title for the SD.
  const sdTitle = options.titleOverride || feedback.title;

  // Triage Gate: soft recommendation for feedback-sourced items
  try {
    const triageResult = await runTriageGate({
      title: sdTitle,
      description: feedback.description || sdTitle,
      type,
      source: 'feedback'
    }, supabase);
    if (triageResult.tier <= 2) {
      console.log(`   ℹ️  Triage suggests Quick Fix (Tier ${triageResult.tier}, ~${triageResult.estimatedLoc} LOC). Consider QF workflow for smaller scope.`);
    }
  } catch { /* non-fatal */ }

  // Resolve venture context (SD-LEO-INFRA-SD-NAMESPACING-001)
  const venturePrefix = await resolveVenturePrefix(null, type);

  // Generate key
  const sdKey = await generateSDKey({
    source: 'FEEDBACK',
    type,
    title: sdTitle,
    venturePrefix
  });

  // Create SD
  const sd = await createSD({
    sdKey,
    title: sdTitle,
    description: feedback.description || sdTitle,
    type,
    priority: mapPriority(feedback.priority),
    rationale: `Created from feedback item. Source: ${feedback.source_type || 'manual'}`,
    metadata: {
      source: 'feedback',
      source_id: feedback.id,
      feedback_type: feedback.type,
      feedback_priority: feedback.priority,
      // QF-20260509-LEO-CREATE-FLAGS: propagate guardrail review flags
      ...(migrationReviewed ? { migration_reviewed: true } : {}),
      ...(securityReviewed ? { security_reviewed: true } : {})
    }
  });

  // GAP-001: Set strategic_directive_id FK on feedback (not just metadata)
  // GAP-009: Update feedback status to in_progress with proper linkage
  await supabase
    .from('feedback')
    .update({
      status: 'in_progress',
      strategic_directive_id: sd.id
    })
    .eq('id', feedback.id);

  return sd;
}

/**
 * Registry adapter surface: toDraft(input, deps).
 * input: the feedback id (string) or { feedbackId, options }.
 */
export async function toDraft(input, _deps = {}) {
  if (input && typeof input === 'object') {
    return createFromFeedback(input.feedbackId ?? input.id, input.options ?? {});
  }
  return createFromFeedback(input);
}
