#!/usr/bin/env node
/**
 * ONE-OFF — SD-LEO-INFRA-RATIFICATION-ENCODE-VERIFICATION-001 (FR-4). Delete this file after a
 * single successful --apply run against production, per this repo's one-off convention.
 *
 * For every currently-ENCODED chairman_ratifications row (encoded_at IS NOT NULL), resolve a
 * commit pin using the row's OWN historical encoded_at (unlike a live encode, a legacy row already
 * has one) and record a `legacy_backfill_audit` verdict into the new
 * chairman_ratification_verifications sibling table (FR-3) — never a fabricated pin, never an
 * UPDATE to the frozen parent row. Idempotent: rows already covered by a prior run (detected via
 * an application-level pre-check against the table's own partial unique index, never relied on as
 * a race-safe guarantee for THIS single-operator one-off) are skipped, not re-inserted.
 *
 * PREREQUISITE: database/chairman-gated/20260911_chairman_ratification_verifications.sql must be
 * APPLIED (chairman ceremony) before this can do anything — this script probes for the table and
 * refuses to proceed with a clear message if it is not yet present, rather than silently no-op'ing.
 *
 * Usage:
 *   node scripts/one-off/backfill-ratification-verification-audit-20260911.mjs            (dry-run)
 *   node scripts/one-off/backfill-ratification-verification-audit-20260911.mjs --apply
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { getRepoRoot } from '../../lib/repo-paths.js';
import { normalizeEncodedRef } from '../../lib/chairman/ratification-writer.mjs';
import { resolveEncodeCommit, readContractAtCommit } from '../../lib/chairman/pinned-contract-read.mjs';
import {
  recordVerificationAttempt, chairmanRatificationVerificationsTableExists,
} from '../../lib/chairman/ratification-verification-store.mjs';

const PRODUCER = 'scripts/one-off/backfill-ratification-verification-audit-20260911.mjs';

/** Pure: resolve a section_id ref's target_file from the manifest, or null if unresolvable. */
export function resolveTargetFile(ref, repoRoot, deps = {}) {
  const _readFileSync = deps.readFileSync || readFileSync;
  if (!ref || ref.type !== 'section_id') return null;
  let manifest;
  try {
    manifest = JSON.parse(_readFileSync(join(repoRoot, 'claude-generation-manifest.json'), 'utf8'));
  } catch { return null; }
  const meta = manifest.section_digests && manifest.section_digests.meta && manifest.section_digests.meta[ref.section_id];
  return (meta && meta.target_file) || null;
}

/**
 * Classify one legacy encoded row: resolve its pin (using its OWN historical encoded_at, not
 * "now" — the key difference from the live-encode path), then check the row's own marker_text
 * against the content at that pin.
 * @returns {Promise<object>} fields shaped for recordVerificationAttempt (minus the id fields)
 */
export async function classifyLegacyRow(row, { repoRoot, deps = {} } = {}) {
  const _resolveEncodeCommit = deps.resolveEncodeCommit || resolveEncodeCommit;
  const _readContractAtCommit = deps.readContractAtCommit || readContractAtCommit;

  const ref = normalizeEncodedRef(row.encoded_ref);
  if (!ref || ref.type !== 'section_id') {
    return { outcome: 'not_applicable', pinTier: null, commitSha: null, targetFile: null, reason: 'not_applicable_for_ref_type' };
  }
  const targetFile = resolveTargetFile(ref, repoRoot, deps);
  if (!targetFile) {
    return { outcome: 'unverifiable_infrastructure', pinTier: null, commitSha: null, targetFile: null, reason: 'unknown_section' };
  }

  const pin = await _resolveEncodeCommit(
    { encoded_ref: ref, encoded_at: row.encoded_at },
    { repoRoot, relPath: targetFile }
  );
  if (!pin.commit) {
    return { outcome: 'no_commit_pin', pinTier: pin.tier, commitSha: null, targetFile, reason: 'no_commit_pin' };
  }

  let content;
  try {
    content = await _readContractAtCommit(pin.commit, targetFile, { repoRoot });
  } catch (err) {
    return { outcome: 'unverifiable_infrastructure', pinTier: pin.tier, commitSha: pin.commit, targetFile, reason: `unreadable_at_pin: ${err.message}` };
  }

  const marker = typeof row.marker_text === 'string' ? row.marker_text : '';
  if (!marker || !content.includes(marker)) {
    return { outcome: 'marker_absent', pinTier: pin.tier, commitSha: pin.commit, targetFile, reason: 'marker_absent_at_pin', content };
  }
  return { outcome: 'verified', pinTier: pin.tier, commitSha: pin.commit, targetFile, content };
}

/**
 * @param {object} supabase
 * @param {{repoRoot?:string, apply?:boolean, deps?:object, logger?:Console}} opts
 * @returns {Promise<{ranAt:boolean, total:number, alreadyAudited:number, inserted:number, skipped:number, results:object[]}>}
 */
export async function runBackfill(supabase, { repoRoot = getRepoRoot(), apply = false, deps = {}, logger = console } = {}) {
  const tableExists = await chairmanRatificationVerificationsTableExists(supabase);
  if (!tableExists) {
    logger.error(`${PRODUCER}: chairman_ratification_verifications does not exist yet — apply database/chairman-gated/20260911_chairman_ratification_verifications.sql (chairman ceremony) before running this backfill. Refusing to proceed.`);
    return { ranAt: false, total: 0, alreadyAudited: 0, inserted: 0, skipped: 0, results: [] };
  }

  const { data: rows, error } = await supabase
    .from('chairman_ratifications')
    .select('id, encoded_at, encoded_ref, marker_text')
    .not('encoded_at', 'is', null);
  if (error) throw new Error(`runBackfill: could not read chairman_ratifications — ${error.message}`);

  const { data: already, error: alreadyErr } = await supabase
    .from('chairman_ratification_verifications')
    .select('target_ratification_id')
    .eq('attempt_kind', 'legacy_backfill_audit');
  if (alreadyErr) throw new Error(`runBackfill: could not read prior backfill coverage — ${alreadyErr.message}`);
  const alreadySet = new Set((already || []).map((r) => r.target_ratification_id));

  const results = [];
  let inserted = 0;
  let skipped = 0;
  for (const row of rows || []) {
    if (alreadySet.has(row.id)) { skipped += 1; continue; }
    const verdict = await classifyLegacyRow(row, { repoRoot, deps });
    logger.log(`${apply ? '[APPLY]' : '[DRY-RUN]'} ${row.id}: outcome=${verdict.outcome} pin_tier=${verdict.pinTier || 'null'} commit=${verdict.commitSha || 'null'}`);
    if (!apply) { results.push({ id: row.id, ...verdict }); continue; }
    // SECURITY (EXEC-TO-PLAN, evidence f4ae9adf) S3: .indexOf can return -1 (marker genuinely
    // absent at the pin) — crv_marker_offset_nonneg rejects a negative offset outright, which
    // silently dropped exactly the marker_absent audit rows this backfill exists to surface.
    // S4: `detail` must never carry the raw rendered file — strip `content`, matching the same
    // rule the live encode path enforces on itself (ratification-writer.mjs).
    const rawOffset = verdict.content && typeof row.marker_text === 'string' ? verdict.content.indexOf(row.marker_text) : -1;
    const { content: _rawContentOmittedFromDetail, ...detailForRecord } = verdict;
    const rec = await recordVerificationAttempt(supabase, {
      targetRatificationId: row.id, attemptKind: 'legacy_backfill_audit', outcome: verdict.outcome,
      encodedAtPersisted: true, pinTier: verdict.pinTier, commitSha: verdict.commitSha,
      targetFile: verdict.targetFile, contentRead: verdict.content || null,
      markerOffset: rawOffset >= 0 ? rawOffset : null,
      attemptedEncodedRef: row.encoded_ref || {}, attemptedMarkerText: row.marker_text || '(none)',
      reason: verdict.reason || null, producer: PRODUCER, detail: detailForRecord,
    });
    if (rec.recorded) inserted += 1;
    results.push({ id: row.id, ...verdict, recorded: rec.recorded, recordReason: rec.reason });
  }

  logger.log(`${PRODUCER}: ${(rows || []).length} encoded rows, ${skipped} already audited, ${inserted} ${apply ? 'inserted' : 'would-insert (dry-run)'}.`);
  return { ranAt: true, total: (rows || []).length, alreadyAudited: skipped, inserted, skipped, results };
}

if (isMainModule(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key);
  runBackfill(supabase, { apply }).then(({ ranAt }) => { process.exitCode = ranAt ? 0 : 1; })
    .catch((err) => { console.error(`${PRODUCER} fatal:`, err.message); process.exitCode = 2; });
}
