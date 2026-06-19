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
 *   2. detect chronic, NOT-yet-covered classes (pure ci-recurrence-detector)
 *   3. cap per-run + per-day (anti-spam)
 *   4. per class: source ONE DRAFT corrective SD via the canonical leo-create-sd.js --from-feedback,
 *      tag metadata.sourced_by='ci-autotriage', and LINK the whole class to that SD
 *      (strategic_directive_id + resolution_sd_id, status='in_progress' — NOT resolved;
 *      mirrors the safe sd-from-feedback.js linkage so a still-failing class is never mislabeled).
 *
 * Default DRY-RUN (like the sibling clockwork scripts). Pass --apply to write.
 * Gate: CI_AUTOTRIAGE_LOOP_ENABLE !== 'true' → [SKIP] exit 0.
 */
require('dotenv/config');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const THRESHOLD = Number((args.find((a) => a.startsWith('--threshold=')) || '').split('=')[1]) || undefined;
const PER_RUN_CAP = Number((args.find((a) => a.startsWith('--per-run=')) || '').split('=')[1]) || undefined;
const PER_DAY_CAP = Number((args.find((a) => a.startsWith('--per-day=')) || '').split('=')[1]) || undefined;
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function log(...a) { console.log('[ci-autotriage-loop]', ...a); }

async function main() {
  // FR-6: flag-gated, default OFF. Fail-soft no-op when disabled.
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
  const { data: rows, error } = await db
    .from('feedback')
    .select('id,status,error_hash,resolution_type,strategic_directive_id,resolution_sd_id,occurrence_count,created_at,error_message,metadata')
    .eq('category', 'ci_failure')
    .in('status', ['new', 'triaged', 'in_progress']);
  if (error) { log('fetch failed (fail-soft):', error.message); return; }
  log(`open ci_failure rows: ${rows ? rows.length : 0}`);

  // 2. detect chronic, uncovered classes.
  const threshold = THRESHOLD || DEFAULT_THRESHOLD;
  const candidates = detectChronicClasses(rows || [], { threshold });
  log(`chronic uncovered classes (threshold ${threshold}): ${candidates.length}`);

  // 3. anti-spam caps: per-run + remaining per-day budget (count today's ci-autotriage SDs).
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  let sourcedToday = 0;
  try {
    const { count } = await db
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .eq('metadata->>sourced_by', 'ci-autotriage')
      .gte('created_at', since.toISOString());
    sourcedToday = count || 0;
  } catch (e) { log('per-day count failed (fail-soft, assume 0):', e.message); }
  const capped = applyCaps(candidates, {
    perRunCap: PER_RUN_CAP || DEFAULT_PER_RUN_CAP,
    sourcedToday,
    perDayCap: PER_DAY_CAP || DEFAULT_PER_DAY_CAP,
  });
  log(`sourcing this run: ${capped.length} (sourcedToday=${sourcedToday})${APPLY ? '' : ' [DRY-RUN]'}`);

  // 4. per candidate, fail-soft: source a DRAFT SD + link the class.
  for (const c of capped) {
    try {
      log(`class ${c.classSignature} (${c.workflow_name || '?'}, x${c.occurrenceTotal}) rep=${c.representativeId}`);
      if (!APPLY) { log('  [DRY-RUN] would source a DRAFT corrective SD via --from-feedback + link the class'); continue; }
      const sdKey = sourceDraftSd(c.representativeId);
      if (!sdKey) { log('  could not source/parse SD key — skipping (fail-soft)'); continue; }
      log(`  sourced DRAFT ${sdKey}`);
      await tagSourcedBy(db, sdKey, c.classSignature);
      await linkClass(db, c.rowIds, sdKey);
      log(`  linked ${c.rowIds.length} class row(s) → ${sdKey} (status in_progress, not resolved)`);
    } catch (e) {
      log(`  class ${c.classSignature} failed (fail-soft):`, e.message);
    }
  }
}

/** Source a DRAFT corrective SD via the canonical CLI (never a hand-rolled insert). Returns the SD key or null. */
function sourceDraftSd(feedbackId) {
  const out = execFileSync('node', ['scripts/leo-create-sd.js', '--from-feedback', feedbackId, '--type', 'infrastructure'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, SD_CREATE_VIA_SKILL: '1' },
  });
  const m = out.match(/SD[- ]?Created:?\s*(SD-[A-Z0-9-]+)/i) || out.match(/\b(SD-[A-Z0-9][A-Z0-9-]+)\b/);
  return m ? m[1] : null;
}

async function tagSourcedBy(db, sdKey, classSignature) {
  const { data: sd } = await db.from('strategic_directives_v2').select('id,metadata').eq('sd_key', sdKey).maybeSingle();
  if (!sd) return;
  const md = sd.metadata || {};
  md.sourced_by = 'ci-autotriage';
  md.ci_class_signature = classSignature;
  await db.from('strategic_directives_v2').update({ metadata: md }).eq('id', sd.id);
}

/** Link every still-open row in the class to the corrective SD — status stays in_progress (NOT resolved). */
async function linkClass(db, rowIds, sdKey) {
  await db
    .from('feedback')
    .update({ strategic_directive_id: sdKey, resolution_sd_id: sdKey, status: 'in_progress' })
    .in('id', rowIds)
    .neq('status', 'resolved');
}

main().then(() => process.exit(0)).catch((e) => { console.error('[ci-autotriage-loop] fatal (fail-soft):', e.message); process.exit(0); });
