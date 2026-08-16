#!/usr/bin/env node
/**
 * Canonical writer for the pre-PLAN critique override.
 * SD: SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-1, SECURITY MEDIUM-2)
 *
 * The override columns (plan_critiques.override_reason/override_by) existed since the
 * table's creation as "Phase 2 reserved" — with NO writer anywhere in the repo, the
 * documented remediation silently meant "hand-write a service-role UPDATE". This CLI is
 * the canonical, greppable writer: it targets the MOST RECENT blocking critique for the
 * SD, stamps who/why, verifies the write by read-back, and prints exactly which findings
 * the override excuses.
 *
 * BINDING (SECURITY MEDIUM-1, evidence e77d1c4b; predicate updated by SD-LEO-INFRA-PRE-PLAN-
 * CRITIQUE-PRD-TRUNCATION-001 FR-4/FR-5, SEC-HIGH-1): the gate honors an override only when the
 * SAME content_hash (SHA-256 of the FULL, pre-truncation PRD+arch content + requested model +
 * the critique budget constants — NOT just the truncated text sent to the LLM, closed after
 * SEC-HIGH-1's re-verification) reappears on a later run — not a findings-fingerprint match.
 * content-identity binds across the realistic minutes-to-days gap between a block and a human
 * running this CLI; a fingerprint match could not, since the LLM's findings composition is
 * non-deterministic even on unchanged input. A later critique over DIFFERENT PRD/arch content
 * re-blocks and needs a fresh override on ITS row.
 *
 * HONEST RESIDUAL: override_by is stamped provenance, not authentication — anyone holding
 * the service-role key can write anything here. The value of this path over a raw UPDATE
 * is a single auditable verb with a read-back, not identity proof.
 *
 * Usage: node scripts/critique-override.js <SD-KEY> --by "<who>" --reason "<why>"
 */

import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const sdKey = args.find((a) => !a.startsWith('--'));
  const byIdx = args.indexOf('--by');
  const reasonIdx = args.indexOf('--reason');
  return {
    sdKey,
    by: byIdx >= 0 ? args[byIdx + 1] : null,
    reason: reasonIdx >= 0 ? args[reasonIdx + 1] : null,
  };
}

async function main() {
  const { sdKey, by, reason } = parseArgs();
  if (!sdKey || !by?.trim() || !reason?.trim()) {
    console.error('Usage: node scripts/critique-override.js <SD-KEY> --by "<who>" --reason "<why>"');
    process.exit(1);
  }

  const supabase = createSupabaseServiceClient();

  const { data: sd, error: sdErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key')
    .eq('sd_key', sdKey)
    .single();
  if (sdErr || !sd) {
    console.error(`SD not found: ${sdKey}${sdErr ? ` (${sdErr.message})` : ''}`);
    process.exit(1);
  }

  const { data: rows, error: critErr } = await supabase
    .from('plan_critiques')
    // content_hash is TR-3's staged column, not yet live in some environments.
    .select('id, findings, content_hash, override_reason, override_by, created_at') // schema-lint-disable-line
    .eq('sd_id', sd.id)
    .eq('overall_severity', 'block')
    .order('created_at', { ascending: false })
    .limit(1);
  if (critErr || !rows || rows.length === 0) {
    console.error(`No blocking critique found for ${sdKey}${critErr ? ` (${critErr.message})` : ''} — nothing to override.`);
    process.exit(1);
  }
  const target = rows[0];
  if (target.override_reason && target.override_by) {
    console.error(`Critique ${target.id} already carries an override by ${target.override_by}. Not overwriting an existing audit record.`);
    process.exit(1);
  }

  const { error: updErr } = await supabase
    .from('plan_critiques')
    .update({ override_reason: reason.trim(), override_by: by.trim() })
    .eq('id', target.id);
  if (updErr) {
    console.error(`Override write failed: ${updErr.message}`);
    process.exit(1);
  }

  // A success return is not persistence — read it back.
  const { data: check, error: checkErr } = await supabase
    .from('plan_critiques')
    .select('id, override_reason, override_by')
    .eq('id', target.id)
    .single();
  if (checkErr || !check?.override_reason || !check?.override_by) {
    console.error(`Read-back FAILED — override may not have persisted${checkErr ? `: ${checkErr.message}` : ''}`);
    process.exit(1);
  }

  const findings = Array.isArray(target.findings) ? target.findings : [];
  console.log(`✅ Override recorded on critique ${target.id} (${sdKey})`);
  console.log(`   by: ${check.override_by}`);
  console.log(`   reason: ${check.override_reason}`);
  console.log(`   content_hash: ${target.content_hash || '(none — pre-migration or could-not-check row; this override cannot bind to any future run)'}`);
  console.log(`   Binds to this EXACT reviewed content — it excuses ANY findings this same PRD/arch text produces for the 14-day lookback, not only these ${findings.length} finding(s) shown below:`);
  for (const f of findings.slice(0, 10)) {
    console.log(`     [${String(f.severity || 'note').toUpperCase()}] ${(f.message || '').substring(0, 120)}`);
  }
  console.log('   A later critique over DIFFERENT PRD/arch content (a different content_hash) re-blocks and needs a fresh override.');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
