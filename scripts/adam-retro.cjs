#!/usr/bin/env node
/**
 * Adam self-improvement retro loop
 * SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-D (FR-1/2/3)
 *
 * The Adam analog of scripts/coordinator-fleet-retro.mjs. Adam sessions emit an
 * ADAM-RETRO entry per analysis session (what worked / friction in the
 * coordinator<->Adam collaboration / one improvement idea). This script:
 *   (1) CAPTURE: pulls ADAM-RETRO entries from the (ephemeral) coordination
 *       channel into the durable `feedback` table (category='adam_retro') so they
 *       survive the coordination sweep and accumulate. Deduped via metadata.retro_key.
 *   (2) SYNTHESIZE: aggregates recent adam_retro feedback over a rolling 7-day window.
 *   (3) DISTILL: surfaces the accumulated lessons for incorporation into the
 *       canonical Adam contract (CLAUDE_ADAM.md / leo_protocol_sections id=601,
 *       Child C) and the /adam skill (Child A) — it SURFACES a report (mirrors the
 *       fleet-retro/learn philosophy), it does not silently auto-edit the protocol doc.
 *
 * feedback.category is free-text (fleet_retro/coordinator_review added the same way)
 * → NO migration. Mirrors the coordinator-fleet-retro.mjs insert + dedup shape.
 *
 * Usage:
 *   node scripts/adam-retro.cjs            (capture + synthesize + distill)
 *   node scripts/adam-retro.cjs distill    (synthesize + distill only)
 */

const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');

const RETRO_RE = /ADAM[\s-]?RETRO/i;
const ADAM_RETRO_CATEGORY = 'adam_retro';

/** Pure: dedup key for an ADAM-RETRO row (mirrors fleet-retro). Exported for tests. */
function buildRetroKey(senderSession, createdAt) {
  return String(senderSession || '').slice(0, 8) + ':' + String(createdAt || '').slice(0, 16);
}

/** Pure: does a coordination row body look like an ADAM-RETRO? Exported for tests. */
function isAdamRetro(payload) {
  const body = String((payload || {}).body || (payload || {}).message || '');
  return RETRO_RE.test(body);
}

/** Pure: the durable feedback row for an ADAM-RETRO (mirrors fleet-retro shape). Exported for tests. */
function buildAdamRetroRow(sig) {
  const body = String((sig.payload || {}).body || (sig.payload || {}).message || '');
  const key = buildRetroKey(sig.sender_session, sig.created_at);
  return {
    type: 'enhancement',
    source_application: 'EHG_Engineer',
    category: ADAM_RETRO_CATEGORY,
    source_type: 'auto_capture',
    title: 'Adam retro — ' + key,
    description: body,
    status: 'new',
    severity: 'low',
    metadata: { retro_key: key, sender_session: sig.sender_session },
  };
}

async function main() {
  const distillOnly = process.argv[2] === 'distill';
  const db = createSupabaseServiceClient();
  const t = Date.now();
  let captured = 0, errs = 0;

  // ── 1) CAPTURE (skipped in distill-only mode) ──
  if (!distillOnly) {
    const since = new Date(t - 24 * 3600 * 1000).toISOString();
    const { data: sigs } = await db.from('session_coordination')
      .select('id,sender_session,payload,created_at')
      .gt('created_at', since).order('created_at', { ascending: false }).limit(150);
    const retros = (sigs || []).filter(s => isAdamRetro(s.payload));
    for (const s of retros) {
      const key = buildRetroKey(s.sender_session, s.created_at);
      const { data: ex } = await db.from('feedback').select('id')
        .eq('category', ADAM_RETRO_CATEGORY).eq('metadata->>retro_key', key).limit(1);
      if (ex && ex.length) continue; // idempotent dedup
      const { error } = await db.from('feedback').insert(buildAdamRetroRow(s));
      if (error) { errs++; if (errs === 1) console.log('  [insert note] ' + error.message); }
      else captured++;
    }
  }

  // ── 2) SYNTHESIZE: durable adam_retro over a rolling 7-day window ──
  const since7 = new Date(t - 7 * 24 * 3600 * 1000).toISOString();
  const { data: all } = await db.from('feedback').select('description,created_at')
    .eq('category', ADAM_RETRO_CATEGORY).gte('created_at', since7)
    .order('created_at', { ascending: false }).limit(50);

  console.log('[ADAM-RETRO] captured ' + captured + ' new this run'
    + (errs ? ' (' + errs + ' insert errors)' : '') + '; ' + (all || []).length + ' adam retros in last 7d.');

  // ── 3) DISTILL: surface lessons for the Adam contract (Child C) + /adam (Child A) ──
  if ((all || []).length) {
    console.log('--- recent Adam retros (distill themes; incorporate into the Adam contract) ---');
    for (const r of (all || []).slice(0, 15)) {
      console.log('  ' + (r.created_at || '').slice(5, 16) + ' | ' + String(r.description || '').replace(/\s+/g, ' ').slice(0, 170));
    }
    console.log('[DISTILL TARGET] Fold recurring lessons into the canonical Adam contract: '
      + 'leo_protocol_sections id=601 / CLAUDE_ADAM.md (Child C) + the /adam skill (Child A). '
      + 'Surface a digest to the operator/Adam; do NOT silently auto-edit the protocol doc.');
  } else {
    console.log('(no Adam retros yet — Adam emits them per analysis session via /signal, prefix "ADAM-RETRO")');
  }
}

module.exports = { buildRetroKey, isAdamRetro, buildAdamRetroRow, RETRO_RE, ADAM_RETRO_CATEGORY };

if (require.main === module) {
  main().catch(err => { console.error('UNHANDLED:', err.message || err); process.exit(1); });
}
