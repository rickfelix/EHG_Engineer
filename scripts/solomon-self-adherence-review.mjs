#!/usr/bin/env node
// solomon-self-adherence-review — Solomon audits its OWN role-contract adherence.
//
// SD: SD-LEO-INFRA-SOLOMON-CONSULT-001E-C (Phase E3). Mirrors the adam-self-adherence-review
// pattern: probe the durable role-contract duties (from CLAUDE_SOLOMON.md), compare them against the
// armed SOLOMON_LOOPS, and emit a propose-only remediation summary when a duty has drifted out of the
// tooling. Solomon never builds the fix (propose, never execute) — it surfaces the drift for the
// coordinator. Fail-open: always exits 0; a hiccup never blocks the tick.

import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SOLOMON_LOOPS, ROLE_CONTEXT_DOC, missingDurableDuties } from './solomon-startup-check.mjs';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001 FR-2: the 12h self-adherence review previously wrote
// NOTHING to the DB — its self-scoring was dormant/invisible. We persist each review cycle to the
// EXISTING feedback table (no new chairman-gated table), mirroring the sibling solomon_self_assessment
// writer convention (category-scoped, review_key-idempotent, service-role client).
const SELF_ADHERENCE_CATEGORY = 'solomon_self_adherence';

/**
 * Pure: build the self-adherence verdict. Reads CLAUDE_SOLOMON.md (if present) and reports which
 * durable contract duties have drifted out of SOLOMON_LOOPS. Returns { ok, drifted:[], note }.
 * ok=true means parity holds (or the contract isn't seeded yet — a skip, not a failure). Exported.
 */
export function buildSelfAdherenceVerdict(repoRoot = REPO_ROOT) {
  let md = null;
  try { md = readFileSync(resolve(repoRoot, ROLE_CONTEXT_DOC), 'utf8'); } catch { md = null; }
  if (!md) {
    return { ok: true, drifted: [], note: `${ROLE_CONTEXT_DOC} not present yet (Phase E-B seeds it) — parity check skipped (fail-open).` };
  }
  const drifted = missingDurableDuties(md, SOLOMON_LOOPS);
  if (drifted.length === 0) return { ok: true, drifted: [], note: 'all durable Solomon role-contract duties are present in SOLOMON_LOOPS.' };
  return {
    ok: false,
    drifted,
    note: `CONTRACT DRIFT: ${drifted.length} durable duty(ies) declared in ${ROLE_CONTEXT_DOC} but absent from SOLOMON_LOOPS: ${drifted.join(', ')}. PROPOSE-ONLY remediation: add them to SOLOMON_LOOPS (scripts/solomon-startup-check.mjs) — Solomon surfaces the drift, the coordinator routes the fix (Solomon never builds).`,
  };
}

export function renderReport(repoRoot = REPO_ROOT) {
  const v = buildSelfAdherenceVerdict(repoRoot);
  const head = '═══ SOLOMON SELF-ADHERENCE AUDIT ═══\n  ';
  return head + (v.ok ? `✅ ${v.note}` : `⚠️ ${v.note}`);
}

/**
 * Deterministic per-cycle review key. The self-adherence cron fires every 12 hours, so two
 * UTC slots/day (am/pm) dedupe a re-run WITHIN the same cadence window without suppressing the next
 * legitimate cycle. Pure.
 */
export function selfAdherenceReviewKey(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const slot = now.getUTCHours() < 12 ? 'am' : 'pm';
  return `solomon-self-adherence:${day}:${slot}`;
}

/**
 * FR-2 — persist ONE Solomon self-adherence review cycle to the DB. Writes a feedback row (mirrors
 * the sibling solomon_self_assessment writer: category-scoped, review_key-idempotent, service-role).
 * A parity-holds cycle records a benign AUDIT row (type='enhancement', status='resolved'); a DRIFT
 * cycle records a PROPOSE-ONLY remediation (type='issue', status='new') for the coordinator —
 * Solomon surfaces the drift, never builds the fix (CONST-002). FAIL-SOFT: any error returns null and
 * NEVER throws, so the review can never block a Solomon tick. Returns the feedback row id (or the
 * existing row's id when the cycle was already recorded), else null.
 * @param {object} supabase service-role client
 * @param {{ok:boolean, drifted:string[], note:string}} verdict
 * @param {{ reviewKey?: string, sessionId?: string|null, now?: Date }} [opts]
 */
export async function persistSelfAdherenceReview(supabase, verdict, { reviewKey, sessionId = null, now = new Date() } = {}) {
  const key = reviewKey || selfAdherenceReviewKey(now);
  try {
    // Idempotent on review_key — a re-run within the same 12h slot must not double-write.
    const { data: existing } = await supabase
      .from('feedback')
      .select('id')
      .eq('category', SELF_ADHERENCE_CATEGORY)
      .filter('metadata->>review_key', 'eq', key)
      .limit(1);
    if (existing && existing.length) return existing[0].id;

    const drift = !!(verdict && verdict.ok === false);
    const drifted = (verdict && Array.isArray(verdict.drifted)) ? verdict.drifted : [];
    const note = (verdict && verdict.note) || 'no verdict';
    const row = {
      type: drift ? 'issue' : 'enhancement',
      source_application: 'EHG_Engineer',
      source_type: 'auto_capture',
      category: SELF_ADHERENCE_CATEGORY,
      status: drift ? 'new' : 'resolved',
      severity: drift ? 'medium' : 'low',
      title: drift
        ? `Solomon self-adherence DRIFT: ${drifted.join(', ')}`
        : 'Solomon self-adherence — parity holds',
      description: note,
      metadata: {
        review_key: key,
        ok: !!(verdict && verdict.ok),
        drifted,
        session_id: sessionId,
        sd: 'SD-LEO-INFRA-ROLE-MEASUREMENT-INTEGRITY-001',
      },
    };
    // A parity-holds cycle is a self-resolved AUDIT record (not an open queue item): status='resolved'
    // requires a non-empty resolution_notes per the feedback chk_feedback_terminal_resolution CHECK.
    if (!drift) row.resolution_notes = `Self-adherence parity holds (auto-audit). ${note}`;
    const { data, error } = await supabase
      .from('feedback')
      .insert(row)
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  } catch (err) {
    console.warn(`[solomon-self-adherence] persist failed (non-blocking): ${err?.message || String(err)}`);
    return null;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const verdict = (() => { try { return buildSelfAdherenceVerdict(); } catch { return { ok: true, drifted: [], note: 'verdict unavailable (fail-open)' }; } })();
  try { console.log(renderReport()); } catch (err) { console.log('solomon-self-adherence-review fail-open:', err?.message || String(err)); }
  // FR-2: persist the cycle (unless --dry-run). Fail-open — a persistence hiccup never blocks the tick.
  if (!dryRun) {
    try {
      const supabase = createSupabaseServiceClient();
      const id = await persistSelfAdherenceReview(supabase, verdict, { sessionId: process.env.CLAUDE_SESSION_ID || null });
      console.log(id ? `  self-adherence cycle persisted → feedback ${id}` : '  self-adherence cycle NOT persisted (fail-soft)');
    } catch (err) {
      console.log('  solomon-self-adherence persist fail-open:', err?.message || String(err));
    }
  }
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  main();
}
