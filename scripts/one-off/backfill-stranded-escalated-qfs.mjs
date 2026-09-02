/**
 * Backfill stranded escalated quick_fixes rows (status='escalated' AND
 * escalated_to_sd_id IS NULL) -- SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001 (FR-6, TS-8).
 *
 * These rows exist because the Tier-3 keyword classifier used to write status='escalated'
 * as a promise an SD would follow, with nothing atomically fulfilling that promise. FR-2
 * closed the writer-side bug (classify-quick-fix.js, verification.js, markPromoted() now
 * write status='open'+routing_tier=3 instead); this script drains the rows the old bug
 * already produced.
 *
 * ROUTING_TIER CORRECTION (found while authoring this script, live data 2026-09-02): the
 * PRD's original text said the backfill "transitions each to status='open' (keeping its
 * existing routing_tier=3)", assuming every stranded row is a Tier-3-classifier casualty.
 * Reading the one currently-live stranded row (QF-20260713-970) disproved that: it has
 * routing_tier=1 -- it was escalated for an unrelated reason (a chairman-gated DDL
 * precondition), not by the Tier-3 classifier bug. Forcing routing_tier=3 on it would
 * fabricate a classification the row's own history does not support and would wrongly make
 * it isNeedsSdRow-true (excluded from self-claim) when it never went through Tier-3 routing.
 * FIX: this script NEVER writes routing_tier -- it is omitted from every patch, so each
 * row's existing routing_tier (whatever it is: 3, null, or anything else) is preserved
 * exactly as-is. A row that genuinely was Tier-3-classifier-escalated already carries
 * routing_tier=3 from mint time (the classifier sets it there, not here); this script's job
 * is narrowly to flip status escalated->open with disposition, not to re-derive tier.
 *
 * Usage:
 *   node scripts/one-off/backfill-stranded-escalated-qfs.mjs             (dry-run, default)
 *   node scripts/one-off/backfill-stranded-escalated-qfs.mjs --dry-run   (explicit dry-run)
 *   node scripts/one-off/backfill-stranded-escalated-qfs.mjs --live      (writes; refuses
 *     unless FR-3's stale-sweep fix and FR-4's JS-side mirror fix are detected present in
 *     the running code -- see assertFixesPresent below. Does NOT check whether the FR-4 SQL
 *     trigger migration has been applied to prod; that requires the separate chairman
 *     ceremony and cannot be verified from application code -- accepted, documented gap.)
 *
 * Every run (dry-run AND live) writes a manifest to
 * scripts/one-off/output/<timestamp>-backfill-manifest.json recording each target row's
 * FULL pre-backfill state (so a revert is a scripted re-application of the 'before'
 * snapshot) and the patch this script proposes/applied.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { setQuickFixStatus } = require('../../lib/quick-fix/status-writer.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const LIVE = process.argv.includes('--live');
const SCRIPT_IDENTITY = 'script: backfill-stranded-escalated-qfs.mjs (SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001)';
const DISPOSITION_REASON_CODE = 'requeued_needs_sd_no_link';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/**
 * --live refuses unless FR-3 (stale-sweep fence) and FR-4 (qf-link-resolution.mjs JS mirror)
 * are detected present in the running code -- a stranded row drained to 'open'+routing_tier=3
 * that immediately gets swept back to 'closed' by fetchPastFenceCandidates, or silently
 * auto-cancelled by qf-link-resolution.mjs, would be worse than leaving it stranded. This is
 * a static source check (both files import + call the canonical isNeedsSdRow predicate), NOT
 * a live DB probe -- confirmed sufficient because both fixes are structural code changes, not
 * runtime state.
 */
export function assertFixesPresent() {
  const missing = [];

  const sweepPath = path.join(REPO_ROOT, 'scripts', 'coordinator-stale-qf-disposition-sweep.mjs');
  const sweepSrc = readFileSync(sweepPath, 'utf8');
  const sweepImportsPredicate = /import\s*\{[^}]*isNeedsSdRow[^}]*\}\s*from\s*['"].*status-writer\.cjs['"]/.test(sweepSrc);
  const fenceStart = sweepSrc.indexOf('function fetchPastFenceCandidates');
  const fenceUsesPredicate = fenceStart >= 0 && sweepSrc.slice(fenceStart, fenceStart + 2000).includes('isNeedsSdRow(');
  if (!sweepImportsPredicate || !fenceUsesPredicate) {
    missing.push('FR-3: coordinator-stale-qf-disposition-sweep.mjs fetchPastFenceCandidates does not import+apply isNeedsSdRow');
  }

  const linkPath = path.join(REPO_ROOT, 'scripts', 'qf-link-resolution.mjs');
  const linkSrc = readFileSync(linkPath, 'utf8');
  const linkImportsPredicate = /import\s*\{[^}]*isNeedsSdRow[^}]*\}\s*from\s*['"].*status-writer\.cjs['"]/.test(linkSrc);
  const linkUsesPredicate = linkSrc.includes('isNeedsSdRow(qf)');
  if (!linkImportsPredicate || !linkUsesPredicate) {
    missing.push('FR-4: qf-link-resolution.mjs does not import+apply isNeedsSdRow');
  }

  return { ok: missing.length === 0, missing };
}

export async function main() {
  if (LIVE) {
    const check = assertFixesPresent();
    if (!check.ok) {
      console.error('REFUSED: --live requires FR-3 and FR-4 fixes to be present in the running code:');
      for (const m of check.missing) console.error('  -', m);
      process.exit(1);
    }
  }

  const { data: targets, error } = await supabase
    .from('quick_fixes')
    .select('*')
    .eq('status', 'escalated')
    .is('escalated_to_sd_id', null);

  if (error) {
    console.error('QUERY FAILED:', error.message);
    process.exit(1);
  }

  console.log(`Stranded rows (status='escalated' AND escalated_to_sd_id IS NULL): ${(targets || []).length}\n`);

  const now = new Date().toISOString();
  const manifestEntries = [];
  let succeeded = 0;
  const failures = [];

  for (const row of targets || []) {
    const patch = {
      status: 'open',
      disposition_reason_code: DISPOSITION_REASON_CODE,
      disposed_by: SCRIPT_IDENTITY,
      disposed_at: now,
    };

    manifestEntries.push({
      id: row.id,
      before: row, // full pre-backfill row -- preserves any prior disposition fields verbatim
      patch,
    });

    console.log(`${LIVE ? 'LIVE' : 'PLAN'} ${row.id} (routing_tier=${row.routing_tier ?? 'null'}) -> status=open, disposition_reason_code=${DISPOSITION_REASON_CODE}`);

    if (!LIVE) continue;

    try {
      await setQuickFixStatus(supabase, row.id, patch);
      succeeded++;
    } catch (e) {
      failures.push(`${row.id}: ${e.code || 'ERROR'} -- ${e.message}`);
    }
  }

  const outDir = path.join(__dirname, 'output');
  mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, `${now.replace(/[:.]/g, '-')}-backfill-manifest.json`);
  writeFileSync(manifestPath, JSON.stringify({ mode: LIVE ? 'live' : 'dry-run', generated_at: now, entries: manifestEntries }, null, 2));
  console.log(`\nManifest written: ${path.relative(REPO_ROOT, manifestPath)}`);

  if (LIVE) {
    console.log(`\nsucceeded: ${succeeded}/${manifestEntries.length}`);
    if (failures.length) {
      console.error(`FAILURES (${failures.length}):`);
      for (const f of failures) console.error('  -', f);
      process.exit(1);
    }
  } else {
    console.log('\nDRY RUN -- re-run with --live to write (requires FR-3/FR-4 fixes present).');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
