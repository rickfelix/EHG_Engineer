#!/usr/bin/env node
/**
 * seal-eval-set.mjs — per-class sealed eval-set writer CLI
 * (SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-B FR-1).
 *
 * DRY-RUN BY DEFAULT: prints the corpus plan (per-case content_hash, real vs
 * synthetic, known-bad) and writes nothing. --apply seals: one feedback row per
 * case (category per class) + a system_events mirror row, both carrying the full
 * case payload and its canonical sha256 content_hash.
 *
 * Idempotent by content hash: cases whose hash is already sealed at the class
 * category are skipped, so a second --apply reports 0 new rows.
 *
 * feedback_type note: the feedback CHECK constraint allows only
 * (sentry_error|user_bug|user_feature_request|user_usability|user_other|
 * venture_error). None describe a sealed eval case; 'user_other' is the honest
 * nearest fit (the prior golden-task rows' 'sentry_error' was a cargo-cult
 * NOT-NULL filler — deliberately not copied). Widening the CHECK is chairman-
 * gated DDL, out of this SD's scope.
 *
 * Run (from the SHARED ROOT — DB scripts doctrine):
 *   node scripts/eval/seal-eval-set.mjs --class closure_predicates [--apply]
 *   node scripts/eval/seal-eval-set.mjs --class leo_protocol_sections [--apply]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { EVAL_SET_CLASSES, EVAL_SET_CORPORA } from '../../lib/eval/eval-set-fixtures.mjs';
import { evalCaseHash, computeFloorBookkeeping } from '../../lib/eval/eval-set-loader.mjs';
import { isMissingTableError } from './migrate-sealed-baselines.mjs';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

export async function sealEvalSet({ supabase, artifactClass, apply = false, sealedBy = 'seal-eval-set.mjs', log = console.log }) {
  const cls = EVAL_SET_CLASSES[artifactClass];
  const corpus = EVAL_SET_CORPORA[artifactClass];
  if (!cls || !corpus) throw new Error(`seal-eval-set: unknown artifact class "${artifactClass}"`);

  const planned = corpus.map((c) => ({ evalCase: c, content_hash: evalCaseHash(c) }));
  const bookkeeping = computeFloorBookkeeping(corpus);

  log(`Class ${artifactClass}: ${planned.length} case(s) — real=${bookkeeping.real_count} synthetic=${bookkeeping.synthetic_count} known_bad_present=${bookkeeping.known_bad_present} floor_met=${bookkeeping.floor_met}${bookkeeping.experimental ? ' (EXPERIMENTAL — floor unmet)' : ''}`);
  for (const p of planned) {
    log(`  ${p.evalCase.case_id}  ${p.evalCase.synthetic ? 'SYNTHETIC' : 'real'}${p.evalCase.known_bad ? ' known-bad' : ''}  ${p.content_hash}`);
  }

  if (!apply) {
    log('Dry-run (default) — nothing written. Re-run with --apply to seal.');
    return { applied: false, planned: planned.length, sealed: 0, skipped: 0, bookkeeping };
  }

  // SELF-REFERENCE GUARD (SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-C FR-4): the
  // eval-set is itself a governed artifact — once the chairman ceremony applies
  // governed_change_proposals, sealing requires a staged proposal for this class.
  // Pre-ceremony (table absent) this warns and proceeds: refusing would deadlock
  // legitimate re-seals before the ceremony has even begun.
  const guardProbe = await supabase
    .from('governed_change_proposals')
    .select('id, status, proposed_diff')
    .eq('artifact_class', artifactClass)
    .limit(10);
  if (guardProbe.error) {
    if (isMissingTableError(guardProbe.error)) {
      log('SELF-REFERENCE GUARD: governed_change_proposals not applied (ceremony pending) — warn-and-proceed.');
    } else {
      // FAIL CLOSED (SECURITY M2): once the table can exist, a permissions/transient
      // probe failure must not silently bypass a governed-artifact guard.
      throw new Error(`seal-eval-set: SELF-REFERENCE GUARD probe failed (${guardProbe.error.message}) — refusing to seal (fail-closed; only a missing table warn-and-proceeds)`);
    }
  } else {
    // CONTENT BINDING (SECURITY M1): a staged proposal authorizes only the seals it
    // NAMES — its proposed_diff must reference at least one content hash being
    // sealed. A stale/unrelated staged row for the class no longer authorizes
    // arbitrary future seals.
    const active = (guardProbe.data || []).filter((p) => ['staged', 'shadow_run', 'packet_attached'].includes(p.status));
    const bound = active.find((p) => planned.some(({ content_hash }) => String(p.proposed_diff || '').includes(content_hash)));
    if (!bound) {
      throw new Error(`seal-eval-set: SELF-REFERENCE GUARD — no staged governed_change_proposals row for artifact_class=${artifactClass} references the content hashes being sealed; corpus mutations require a staged proposal naming this change (child C FR-4)`);
    }
    log(`SELF-REFERENCE GUARD: staged proposal ${bound.id} (${bound.status}) content-binds this seal.`);
  }

  const existing = await supabase
    .from('feedback')
    .select('id, metadata')
    .eq('category', cls.category);
  if (existing.error) {
    if (isMissingTableError(existing.error)) {
      log('CEREMONY_PENDING: feedback table unavailable — nothing sealed.');
      return { applied: false, ceremonyPending: true, planned: planned.length, sealed: 0, skipped: 0, bookkeeping };
    }
    throw new Error(`seal-eval-set: existing-seal read failed: ${existing.error.message}`);
  }
  const sealedHashes = new Set((existing.data || []).map((r) => r.metadata?.content_hash).filter(Boolean));

  let sealed = 0;
  let skipped = 0;
  const mirroredThisRun = new Set();
  const sealedAt = new Date().toISOString();
  for (const { evalCase, content_hash } of planned) {
    if (sealedHashes.has(content_hash)) { skipped++; continue; }
    const metadata = {
      record_kind: 'eval_case',
      artifact_class: artifactClass,
      case_id: evalCase.case_id,
      content_hash,
      synthetic: evalCase.synthetic === true,
      known_bad: evalCase.known_bad === true,
      case: evalCase,
      sealed_by: sealedBy,
      sealed_at: sealedAt,
    };
    const ins = await supabase.from('feedback').insert({
      category: cls.category,
      type: 'enhancement',
      feedback_type: 'user_other',
      source_application: 'EHG_Engineer',
      source_type: 'manual_feedback',
      status: 'new',
      severity: 'low',
      title: `[SEALED EVAL CASE] ${artifactClass} ${evalCase.case_id}`,
      description: `Sealed eval-set case ${evalCase.case_id} (${evalCase.synthetic ? 'synthetic' : 'real'}${evalCase.known_bad ? ', known-bad' : ''}) for artifact class ${artifactClass}. content_hash=${content_hash}`,
      metadata,
    }).select('id');
    if (ins.error) throw new Error(`seal-eval-set: insert failed for ${evalCase.case_id}: ${ins.error.message}`);

    const feedbackId = ins.data?.[0]?.id || null;
    const mirror = await supabase.from('system_events').insert({
      event_type: cls.eventType,
      actor_type: 'agent',
      // Explicit per-case key — system_events.idempotency_key is UNIQUE varchar(100);
      // omitting it lets a trigger default (<event_type>:global:<unix-sec>) collide
      // within a same-second batch, and over-long keys fail 22001 (both observed live).
      // evalseal:<case_id>:<hash16> stays under 100 chars and is globally unique.
      idempotency_key: `evalseal:${evalCase.case_id}:${content_hash.slice(0, 16)}`,
      payload: { ...metadata, mirrored_from_feedback_id: feedbackId },
    });
    if (mirror.error) log(`  WARN: system_events mirror failed for ${evalCase.case_id} (feedback seal succeeded): ${mirror.error.message}`);
    else mirroredThisRun.add(`evalseal:${evalCase.case_id}:${content_hash.slice(0, 16)}`);
    sealed++;
  }

  // Mirror reconciliation: a prior run may have sealed feedback rows but lost mirror
  // rows (the idempotency_key collision above). Insert any missing mirrors so --apply
  // converges both stores; the per-case key makes this idempotent too.
  const mirrorRead = await supabase
    .from('system_events')
    .select('idempotency_key')
    .eq('event_type', cls.eventType);
  if (mirrorRead.error) {
    log(`  WARN: mirror reconciliation skipped — system_events read failed: ${mirrorRead.error.message}`);
  }
  if (!mirrorRead.error) {
    const have = new Set([...(mirrorRead.data || []).map((r) => r.idempotency_key), ...mirroredThisRun]);
    let repaired = 0;
    for (const { evalCase, content_hash } of planned) {
      const key = `evalseal:${evalCase.case_id}:${content_hash.slice(0, 16)}`;
      if (have.has(key)) continue;
      const repair = await supabase.from('system_events').insert({
        event_type: cls.eventType,
        actor_type: 'agent',
        idempotency_key: key,
        payload: {
          record_kind: 'eval_case', artifact_class: artifactClass, case_id: evalCase.case_id,
          content_hash, synthetic: evalCase.synthetic === true, known_bad: evalCase.known_bad === true,
          case: evalCase, sealed_by: sealedBy, sealed_at: sealedAt, mirrored_from_feedback_id: null,
        },
      });
      if (!repair.error) repaired++;
      else log(`  WARN: mirror repair failed for ${evalCase.case_id}: ${repair.error.message}`);
    }
    if (repaired) log(`Mirror reconciliation: inserted ${repaired} missing system_events mirror(s).`);
  }

  log(`Sealed ${sealed} new case(s), skipped ${skipped} already-sealed (idempotent).`);
  return { applied: true, planned: planned.length, sealed, skipped, bookkeeping };
}

// CLI entry — guarded so tests can import sealEvalSet without executing.
const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (invokedDirectly) {
  const artifactClass = argValue('--class');
  const apply = process.argv.includes('--apply') && !process.argv.includes('--dry-run');
  if (!artifactClass) {
    console.error('Usage: node scripts/eval/seal-eval-set.mjs --class <closure_predicates|leo_protocol_sections> [--apply]');
    process.exit(1);
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  sealEvalSet({ supabase, artifactClass, apply })
    .then((r) => { if (r.ceremonyPending) process.exitCode = 2; })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
