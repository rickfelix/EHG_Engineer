#!/usr/bin/env node
/**
 * ci-autotriage-loop — the missing MIDDLE of the CI-triage pipeline.
 * SD-LEO-INFRA-CI-FAILURE-AUTOTRIAGE-LOOP-001.
 *
 * Turns recurring CI failures into traceably-linked DRAFT corrective SDs WITHOUT
 * ever editing code or merging (CONST-002 — corrective work flows through the normal
 * gated SD/QF pipeline; diagnosis happens when a worker picks the DRAFT SD up, NOT here).
 *
 * Flow each tick (fail-soft, flag-gated default OFF):
 *   1. fetch OPEN ci_failure rows (feedback category='ci_failure', status in new/triaged/in_progress
 *      — self-healed rows auto-resolve-recovered closed are status='resolved' and excluded)
 *   2. strip DEAD links (rows linked only to a cancelled/archived SD are treated as uncovered so a
 *      stale link can't immortalize a recurring class)
 *   3. detect chronic, NOT-yet-covered classes (pure ci-recurrence-detector)
 *   4. cap per-run + per-day (anti-spam)
 *   5. per class: source ONE DRAFT corrective SD via the canonical leo-create-sd.js --from-feedback,
 *      read the created SD key back from the DB (authoritative — NOT scraped from stdout),
 *      tag metadata.sourced_by='ci-autotriage', and LINK the whole class to that SD
 *      (strategic_directive_id + resolution_sd_id, status='in_progress' — NOT resolved).
 *
 * Default DRY-RUN (like the sibling clockwork scripts). Pass --apply to write.
 * Gate: CI_AUTOTRIAGE_LOOP_ENABLE !== 'true' → [SKIP] exit 0.
 */
require('dotenv/config');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the open ci_failure pool feeds
// chronic-class detection + linking; a read silently capped at the PostgREST 1000-row max would
// hide recurring classes past row 1000 with no error, so the loop would stop sourcing corrective
// SDs for them.
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../../lib/db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const THRESHOLD = Number((args.find((a) => a.startsWith('--threshold=')) || '').split('=')[1]) || undefined;
const PER_RUN_CAP = Number((args.find((a) => a.startsWith('--per-run=')) || '').split('=')[1]) || undefined;
const PER_DAY_CAP = Number((args.find((a) => a.startsWith('--per-day=')) || '').split('=')[1]) || undefined;
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TERMINAL_SD_STATUSES = ['cancelled', 'archived', 'superseded', 'rejected'];

function log(...a) { console.log('[ci-autotriage-loop]', ...a); }

async function main() {
  // flag-gated, default OFF. Fail-soft no-op when disabled.
  if (process.env.CI_AUTOTRIAGE_LOOP_ENABLE !== 'true') {
    log('[SKIP] disabled (set CI_AUTOTRIAGE_LOOP_ENABLE=true to enable)');
    return;
  }
  const db = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { detectChronicClasses, applyCaps, DEFAULT_THRESHOLD, DEFAULT_PER_RUN_CAP, DEFAULT_PER_DAY_CAP } =
    await import('../lib/ci-recurrence-detector.mjs');

  // 1. open ci_failure rows (resolved/self-healed rows are status='resolved' → excluded here).
  let rows;
  try {
    rows = await fapPaginate(() => db
      .from('feedback')
      .select('id,status,error_hash,resolution_type,strategic_directive_id,resolution_sd_id,occurrence_count,created_at,error_message,metadata')
      .eq('category', 'ci_failure')
      .in('status', ['new', 'triaged', 'in_progress'])
      .order('id', { ascending: true }));
  } catch (e) { log('[ALERT] fetch failed (fail-soft):', e.message); return; }
  log(`open ci_failure rows: ${rows.length}`);

  // 2. strip DEAD links: a row whose only corrective link points at a terminal (cancelled/archived)
  //    SD is treated as UNCOVERED so a stale link can't permanently suppress a still-recurring class.
  await stripDeadLinks(db, rows);

  // 3. detect chronic, uncovered classes.
  const threshold = THRESHOLD || DEFAULT_THRESHOLD;
  const candidates = detectChronicClasses(rows, { threshold });
  log(`chronic uncovered classes (threshold ${threshold}): ${candidates.length}`);

  // 4. anti-spam caps: per-run + remaining per-day budget (count today's ci-autotriage SDs).
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  let sourcedToday = 0;
  try {
    const { count } = await db
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .eq('metadata->>sourced_by', 'ci-autotriage')
      .gte('created_at', since.toISOString());
    sourcedToday = count || 0;
  } catch (e) { log('[ALERT] per-day count failed (fail-soft, assume 0):', e.message); }
  const capped = applyCaps(candidates, {
    perRunCap: PER_RUN_CAP || DEFAULT_PER_RUN_CAP,
    sourcedToday,
    perDayCap: PER_DAY_CAP || DEFAULT_PER_DAY_CAP,
  });
  log(`sourcing this run: ${capped.length} (sourcedToday=${sourcedToday})${APPLY ? '' : ' [DRY-RUN]'}`);

  // 5. per candidate, fail-soft: source a DRAFT SD + link the class.
  for (const c of capped) {
    try {
      log(`class ${c.classSignature} (${c.workflow_name || '?'}, x${c.occurrenceTotal}) rep=${c.representativeId}`);
      if (!APPLY) { log('  [DRY-RUN] would source a DRAFT corrective SD via --from-feedback + link the class'); continue; }
      const sdKey = await sourceDraftSd(db, c.representativeId);
      if (!sdKey) { log('  no NEW SD linked (duplicate-guard or create failed) — skipping (fail-soft)'); continue; }
      log(`  sourced DRAFT ${sdKey}`);
      const tagged = await tagSourcedBy(db, sdKey, c.classSignature);
      if (!tagged) log(`  [ALERT] could not tag ${sdKey} sourced_by=ci-autotriage — per-day accounting may undercount`);
      await linkClass(db, c.rowIds, sdKey);
      log(`  linked ${c.rowIds.length} class row(s) → ${sdKey} (status in_progress, not resolved)`);
    } catch (e) {
      log(`  [ALERT] class ${c.classSignature} failed (fail-soft):`, e.message);
    }
  }
}

/**
 * Treat rows linked ONLY to a terminal (cancelled/archived/...) SD as uncovered, by clearing their
 * in-memory link fields before detection. Prevents a dead link from immortalizing a recurring class.
 */
async function stripDeadLinks(db, rows) {
  const keys = [...new Set(rows.map((r) => r.strategic_directive_id || r.resolution_sd_id).filter(Boolean))];
  if (!keys.length) return;
  const statusByKey = {};
  try {
    const { data } = await db.from('strategic_directives_v2').select('id,status').in('id', keys);
    for (const sd of data || []) statusByKey[sd.id] = sd.status;
  } catch (e) { log('[ALERT] dead-link status lookup failed (fail-soft, keep links):', e.message); return; }
  let stripped = 0;
  for (const r of rows) {
    const link = r.strategic_directive_id || r.resolution_sd_id;
    if (link && TERMINAL_SD_STATUSES.includes(statusByKey[link])) {
      r.strategic_directive_id = null;
      r.resolution_sd_id = null;
      stripped++;
    }
  }
  if (stripped) log(`stripped ${stripped} dead (terminal-SD) link(s) so stale links don't suppress recurring classes`);
}

/**
 * Source a DRAFT corrective SD via the canonical CLI (never a hand-rolled insert), then read the
 * created SD key back from the DB (feedback.strategic_directive_id — the authoritative value
 * createFromFeedback writes) rather than scraping stdout. Returns the NEW SD key, or null when the
 * spawn created nothing new (e.g. the --from-feedback duplicate guard fired) — never a foreign key.
 */
async function sourceDraftSd(db, feedbackId) {
  // pre-read the rep row's link (the detector should have excluded covered classes, so expect null).
  const { data: before } = await db.from('feedback').select('strategic_directive_id').eq('id', feedbackId).maybeSingle();
  const beforeLink = before ? before.strategic_directive_id : null;
  try {
    execFileSync('node', ['scripts/leo-create-sd.js', '--from-feedback', feedbackId, '--type', 'infrastructure'], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, SD_CREATE_VIA_SKILL: '1' },
    });
  } catch (e) {
    log('  [ALERT] leo-create-sd --from-feedback failed:', (e.message || '').split('\n')[0]);
    return null;
  }
  // authoritative: re-read the link createFromFeedback wrote; only accept a NEW, changed value.
  const { data: after } = await db.from('feedback').select('strategic_directive_id').eq('id', feedbackId).maybeSingle();
  const afterLink = after ? after.strategic_directive_id : null;
  if (afterLink && afterLink !== beforeLink) return afterLink;
  return null; // duplicate-guard hit or no link written — do not tag/relink a pre-existing/foreign SD
}

async function tagSourcedBy(db, sdKey, classSignature) {
  try {
    const { data: sd } = await db.from('strategic_directives_v2').select('id,metadata').eq('id', sdKey).maybeSingle();
    if (!sd) return false;
    const md = sd.metadata || {};
    md.sourced_by = 'ci-autotriage';
    md.ci_class_signature = classSignature;
    const { error } = await db.from('strategic_directives_v2').update({ metadata: md }).eq('id', sd.id);
    return !error;
  } catch { return false; }
}

/** Link every still-open row in the class to the corrective SD — status stays in_progress (NOT resolved). */
async function linkClass(db, rowIds, sdKey) {
  await db
    .from('feedback')
    .update({ strategic_directive_id: sdKey, resolution_sd_id: sdKey, status: 'in_progress' })
    .in('id', rowIds)
    .neq('status', 'resolved');
}

main().then(() => process.exit(0)).catch((e) => { console.error('[ci-autotriage-loop] [ALERT] fatal (fail-soft):', e.message); process.exit(0); });
