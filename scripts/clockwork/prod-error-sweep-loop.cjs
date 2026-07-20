#!/usr/bin/env node
/**
 * prod-error-sweep-loop — the missing LAST MILE of the production-breakage pipeline.
 * SD-LEO-INFRA-PROD-ERROR-SWEEP-LOOP-001.
 *
 * The breakage-detector family writes recurring breakage signals into system_alerts (each row
 * carrying metadata.break_class), but nothing turns a recurring spike into actionable work. This
 * loop closes that gap: it reads system_alerts over a window, groups by (break_class, source),
 * and for each recurring UNCOVERED class sources ONE DRAFT corrective SD — WITHOUT ever editing
 * code, merging, or RESOLVING the alert (CONST-002; diagnosis happens when a worker picks the
 * DRAFT SD up, NOT here). Same boundary and doctrine as scripts/clockwork/ci-autotriage-loop.cjs.
 *
 * Flow each tick (fail-soft, flag-gated default OFF):
 *   1. fetch UNRESOLVED system_alerts in the window (resolved_at IS NULL, created_at >= now-window)
 *   2. fetch the open production_error BRIDGE feedback rows + strip DEAD links (a bridge row linked
 *      only to a cancelled/archived SD is treated as uncovered so a stale link can't immortalize a
 *      recurring class) -> compute the covered class-key set
 *   3. detect chronic, NOT-yet-covered (break_class, source) classes (pure detector; only the FROZEN
 *      break-class taxonomy denominator is considered)
 *   4. cap per-run + per-day (anti-spam)
 *   5. per class: insert a durable BRIDGE feedback row (category='production_error') carrying the
 *      alert context, source ONE DRAFT corrective SD via the canonical leo-create-sd.js
 *      --from-feedback (read the SD key back from feedback.strategic_directive_id — authoritative,
 *      NOT scraped from stdout), and tag metadata.sourced_by='prod-error-sweep' + break_class.
 *      The system_alerts rows are NEVER touched (never resolved).
 *
 * Default DRY-RUN (like the sibling clockwork scripts). Pass --apply to write.
 * Gate: PROD_ERROR_SWEEP_LOOP_ENABLE !== 'true' -> [SKIP] exit 0.
 */
require('dotenv/config');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { BREAK_CLASSES } = require('../../lib/coordinator/break-class-taxonomy.cjs');

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the unresolved-alerts window and
// open bridge-row pool both feed chronic-class detection; a capped read would silently hide
// recurring classes past row 1000 with no error.
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
const WINDOW_HOURS = Number((args.find((a) => a.startsWith('--window-hours=')) || '').split('=')[1]) || undefined;
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const TERMINAL_SD_STATUSES = ['cancelled', 'archived', 'superseded', 'rejected'];
const BRIDGE_CATEGORY = 'production_error';

function log(...a) { console.log('[prod-error-sweep]', ...a); }

async function main() {
  // flag-gated, default OFF. Fail-soft no-op when disabled.
  if (process.env.PROD_ERROR_SWEEP_LOOP_ENABLE !== 'true') {
    log('[SKIP] disabled (set PROD_ERROR_SWEEP_LOOP_ENABLE=true to enable)');
    return;
  }
  const db = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { detectRecurringClasses, applyCaps, handledClassKeys, DEFAULT_THRESHOLD, DEFAULT_PER_RUN_CAP, DEFAULT_PER_DAY_CAP, DEFAULT_WINDOW_HOURS } =
    await import('../lib/prod-error-recurrence-detector.mjs');
  const { isCovered } = await import('../lib/ci-recurrence-detector.mjs');

  // 1. unresolved system_alerts in the window. We only READ here — alerts are never resolved.
  const windowHours = WINDOW_HOURS || DEFAULT_WINDOW_HOURS;
  const windowStart = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
  let alerts;
  try {
    alerts = await fapPaginate(() => db
      .from('system_alerts')
      .select('id,alert_type,severity,title,message,source_service,metadata,resolved_at,created_at')
      .is('resolved_at', null)
      .gte('created_at', windowStart)
      .order('id', { ascending: true }));
  } catch (e) { log('[ALERT] system_alerts fetch failed (fail-soft):', e.message); return; }
  log(`unresolved alerts in last ${windowHours}h: ${alerts.length}`);

  // 2. open production_error bridge rows -> strip dead links -> HANDLED class-key set
  //    (covered by an open SD OR already surfaced as a new/triaged inbox row awaiting human triage).
  const bridgeRows = await fetchOpenBridgeRows(db);
  await stripDeadLinks(db, bridgeRows);
  const handledKeys = handledClassKeys(bridgeRows, isCovered);
  if (handledKeys.size) log(`handled class keys (open SD or surfaced inbox row): ${handledKeys.size}`);

  // 3. detect chronic, un-handled (break_class, source) classes within the frozen taxonomy.
  const threshold = THRESHOLD || DEFAULT_THRESHOLD;
  const candidates = detectRecurringClasses(alerts, { threshold, legalClasses: BREAK_CLASSES, coveredKeys: handledKeys });
  log(`chronic uncovered classes (threshold ${threshold}): ${candidates.length}`);

  // 4. anti-spam caps: per-run + remaining per-day budget (count today's prod-error-sweep SDs).
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  let sourcedToday = 0;
  try {
    const { count } = await db
      .from('strategic_directives_v2')
      .select('id', { count: 'exact', head: true })
      .eq('metadata->>sourced_by', 'prod-error-sweep')
      .gte('created_at', since.toISOString());
    sourcedToday = count || 0;
  } catch (e) { log('[ALERT] per-day count failed (fail-soft, assume 0):', e.message); }
  const capped = applyCaps(candidates, {
    perRunCap: PER_RUN_CAP || DEFAULT_PER_RUN_CAP,
    sourcedToday,
    perDayCap: PER_DAY_CAP || DEFAULT_PER_DAY_CAP,
  });
  log(`sourcing this run: ${capped.length} (sourcedToday=${sourcedToday})${APPLY ? '' : ' [DRY-RUN]'}`);

  // 5. per candidate, fail-soft: bridge -> source a DRAFT SD -> tag. Alerts are never resolved.
  for (const c of capped) {
    try {
      log(`class ${c.classKey} (sev=${c.severity || '?'}, x${c.occurrenceTotal}) sample="${(c.sampleTitle || '').slice(0, 60)}"`);
      if (!APPLY) { log('  [DRY-RUN] would bridge + source a DRAFT corrective SD via --from-feedback (alert NOT resolved)'); continue; }
      const bridgeId = await insertBridgeRow(db, c);
      if (!bridgeId) { log('  [ALERT] bridge-row insert failed — skipping (fail-soft)'); continue; }
      const sdKey = await sourceDraftSd(db, bridgeId);
      if (!sdKey) {
        // SD creation was blocked (e.g. a creation guardrail that needs a human review the loop
        // must NOT self-attest) or otherwise failed. Leave the bridge row 'new' in the inbox as the
        // durable surfaced record + annotate it so a human knows to triage/escalate it manually.
        await markBridgeNeedsEscalation(db, bridgeId);
        log('  no NEW SD linked (creation guardrail or duplicate-guard) — bridge row left in inbox for human triage (fail-soft)');
        continue;
      }
      log(`  sourced DRAFT ${sdKey} (bridge ${bridgeId})`);
      const tagged = await tagSourcedBy(db, sdKey, c);
      if (!tagged) log(`  [ALERT] could not tag ${sdKey} sourced_by=prod-error-sweep — per-day accounting may undercount`);
    } catch (e) {
      log(`  [ALERT] class ${c.classKey} failed (fail-soft):`, e.message);
    }
  }
}

/** Open production_error bridge rows (the durable triage records this loop links coverage on). */
async function fetchOpenBridgeRows(db) {
  try {
    return await fapPaginate(() => db
      .from('feedback')
      .select('id,status,strategic_directive_id,resolution_sd_id,metadata')
      .eq('category', BRIDGE_CATEGORY)
      .in('status', ['new', 'triaged', 'in_progress'])
      .order('id', { ascending: true }));
  } catch (e) { log('[ALERT] bridge-row fetch failed (fail-soft, treat all uncovered):', e.message); return []; }
}

/**
 * Treat bridge rows linked ONLY to a terminal (cancelled/archived/...) SD as uncovered, by clearing
 * their in-memory link fields. Prevents a dead link from immortalizing a recurring class. Verbatim
 * mirror of the ci-autotriage stripDeadLinks contract.
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
 * Insert the durable BRIDGE feedback row carrying the alert context. This is the analog of a
 * ci_failure feedback row: a durable triage record the canonical --from-feedback path can source
 * from, and the row coverage/idempotency is tracked on. Returns the new row id, or null on failure.
 */
async function insertBridgeRow(db, c) {
  const description = [
    `Recurring production breakage detected by the prod-error-sweep loop.`,
    ``,
    `Break class: ${c.breakClass}`,
    `Source: ${c.source || 'unknown'}`,
    `Occurrences in window: ${c.occurrenceTotal}`,
    `Sample alert: ${c.sampleTitle || '(no title)'}`,
    c.sampleMessage ? `Sample message: ${c.sampleMessage}` : '',
    ``,
    `Diagnose and remediate the recurring ${c.breakClass} breakage from ${c.source || 'the source service'}. ` +
    `This DRAFT corrective SD was sourced WITHOUT auto-fixing or auto-resolving the alerts (CONST-002).`,
  ].filter((l) => l !== '').join('\n');
  try {
    const { data, error } = await db
      .from('feedback')
      .insert({
        category: BRIDGE_CATEGORY,
        source_application: 'EHG_Engineer',
        source_type: 'error_capture',
        type: 'issue',
        status: 'new',
        priority: c.severity === 'critical' ? 'high' : 'medium',
        title: `Recurring ${c.breakClass} breakage from ${c.source || 'unknown'} (x${c.occurrenceTotal})`,
        description,
        metadata: {
          sourced_by: 'prod-error-sweep',
          break_class: c.breakClass,
          alert_source: c.source,
          alert_ids: c.alertIds,
          occurrence_total: c.occurrenceTotal,
        },
      })
      .select('id')
      .single();
    if (error) { log('  [ALERT] bridge insert error:', error.message); return null; }
    return data.id;
  } catch (e) { log('  [ALERT] bridge insert threw:', e.message); return null; }
}

/**
 * Source a DRAFT corrective SD via the canonical CLI (never a hand-rolled insert), then read the
 * created SD key back from feedback.strategic_directive_id (the authoritative value
 * createFromFeedback writes) rather than scraping stdout. Returns the NEW SD key, or null when the
 * spawn created nothing new (e.g. the --from-feedback duplicate guard fired).
 */
async function sourceDraftSd(db, feedbackId) {
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
  const { data: after } = await db.from('feedback').select('strategic_directive_id').eq('id', feedbackId).maybeSingle();
  const afterLink = after ? after.strategic_directive_id : null;
  if (afterLink && afterLink !== beforeLink) return afterLink;
  return null; // duplicate-guard hit or no link written — do not tag a pre-existing/foreign SD
}

/**
 * Annotate a bridge row whose SD creation was blocked/failed so it is an honest durable record:
 * it stays status='new' (a handled inbox item — see handledClassKeys) and carries an explicit
 * needs_human_escalation marker. Best-effort, fail-soft.
 */
async function markBridgeNeedsEscalation(db, bridgeId) {
  try {
    const { data: row } = await db.from('feedback').select('id,metadata').eq('id', bridgeId).maybeSingle();
    if (!row) return;
    const md = row.metadata || {};
    md.sourcing_status = 'needs_human_escalation';
    await db.from('feedback').update({ metadata: md }).eq('id', row.id);
  } catch { /* fail-soft: the row already sits in the inbox as the surfaced record */ }
}

async function tagSourcedBy(db, sdKey, c) {
  try {
    const { data: sd } = await db.from('strategic_directives_v2').select('id,metadata').eq('id', sdKey).maybeSingle();
    if (!sd) return false;
    const md = sd.metadata || {};
    md.sourced_by = 'prod-error-sweep';
    md.break_class = c.breakClass;
    md.alert_source = c.source;
    md.alert_class_key = c.classKey;
    const { error } = await db.from('strategic_directives_v2').update({ metadata: md }).eq('id', sd.id);
    return !error;
  } catch { return false; }
}

main().then(() => process.exit(0)).catch((e) => { console.error('[prod-error-sweep] [ALERT] fatal (fail-soft):', e.message); process.exit(0); });
