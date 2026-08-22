#!/usr/bin/env node
/**
 * One-time sweep — SD-LEO-INFRA-VENTURE-STATUS-LANGUAGE-001 (FR-4).
 *
 * Scans existing chairman_decisions rows with a non-null venture_id whose free-text prose
 * (brief_data.title / brief_data.recommendation / summary / recommendation) asserts a
 * build-status word (built/deployed/live) contradicted by the venture's CURRENT measured
 * build status, and stamps each with a correction — NEVER a silent delete or edit of the
 * original prose.
 *
 * The correction lands at brief_data.venture_status_correction, a NAMESPACED sub-key (never
 * spread at brief_data root), matching this codebase's existing convention for additive
 * brief_data annotations (see the ratification precheck-packet precedent in
 * lib/chairman/decision-layman.mjs). Original title/recommendation/summary are read-only here.
 *
 * Usage:
 *   node scripts/one-off/annotate-stale-venture-status-prose.mjs [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { deriveVentureBuildStatus } from '../../lib/governance/venture-build-status.mjs';
import { ventureStatusContradictionNote } from '../../lib/chairman/decision-layman.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const DRY = process.argv.includes('--dry-run');
const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function briefOf(row) {
  const b = row?.brief_data;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b) || {}; } catch { return {}; } }
  return typeof b === 'object' ? b : {};
}

async function main() {
  const { data: rows, error } = await db
    .from('chairman_decisions')
    .select('id, venture_id, decision_type, summary, recommendation, brief_data, status')
    .not('venture_id', 'is', null);
  if (error) {
    console.error('[annotate-stale-venture-status-prose] read failed:', error.message);
    process.exit(1);
  }

  const ventureIds = [...new Set((rows || []).map((r) => r.venture_id))];
  console.log(`[annotate-stale-venture-status-prose] ${rows?.length ?? 0} decision row(s) across ${ventureIds.length} venture(s)`);

  let venturesById = new Map();
  let routedIds = new Set();
  if (ventureIds.length) {
    const { data: vrows, error: vErr } = await db.from('ventures')
      .select('id, workflow_status, workflow_started_at, deployment_url, repo_url, launch_mode')
      .in('id', ventureIds);
    if (vErr) { console.error('[annotate-stale-venture-status-prose] ventures read failed:', vErr.message); process.exit(1); }
    venturesById = new Map((vrows || []).map((v) => [v.id, v]));
    const { data: deps } = await db.from('venture_deployments').select('venture_id').in('venture_id', ventureIds).eq('status', 'routed');
    routedIds = new Set((deps || []).map((d) => d.venture_id));
  }

  let flagged = 0;
  let skippedAlreadyAnnotated = 0;
  for (const row of rows || []) {
    const bd = briefOf(row);
    if (bd.venture_status_correction) { skippedAlreadyAnnotated++; continue; } // idempotent re-run

    const ventureRow = venturesById.get(row.venture_id);
    const buildStatus = deriveVentureBuildStatus(ventureRow, { hasRoutedDeployment: routedIds.has(row.venture_id) });
    const proseText = [bd.title, bd.recommendation, row.summary, row.recommendation].filter(Boolean).join(' ');
    const note = ventureStatusContradictionNote({ venture_build_status: buildStatus }, proseText);
    if (!note) continue;

    flagged++;
    console.log(`  [FLAG] decision ${row.id} (venture ${row.venture_id}): ${note}`);
    if (DRY) continue;

    const newBriefData = { ...bd, venture_status_correction: { status: buildStatus.status, measured_at: buildStatus.measured_at, note } };
    const { error: updErr } = await db.from('chairman_decisions').update({ brief_data: newBriefData }).eq('id', row.id);
    if (updErr) console.error(`  [FAIL] could not annotate decision ${row.id}: ${updErr.message}`);
  }

  console.log(`[annotate-stale-venture-status-prose] ${flagged} row(s) ${DRY ? 'would be' : ''} flagged, ${skippedAlreadyAnnotated} already annotated (skipped, idempotent)${DRY ? ' [DRY RUN -- no writes]' : ''}`);
}

// SD-FDBK-ENH-578-SCRIPTS-ONE-001: guard against a bare import()/require() executing main()
// against live prod (the same defect class as the 2026-08-21 solomon_advice_outcome_ledger
// incident). Behavior when run directly is unchanged.
if (isMainModule(import.meta.url)) {
  main();
}
