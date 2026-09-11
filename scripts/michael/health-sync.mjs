#!/usr/bin/env node
// scripts/michael/health-sync.mjs — v1.1 feeder (host Task Scheduler, 06:00-06:30 ET).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J. Spec §5 v1.1: "health-sync ... Drive read
// through the chairman grant -> host venue" (replaces data/health-*.json).
//
// Reads a JSON metrics OBJECT (e.g. {steps, sleep_hours, weight_lbs, ...} -- no fixed schema, the
// spec gives no column detail so michael_health_daily.metrics is a raw jsonb object) from the
// configured Drive folder and upserts it as ONE row for today's ET date, keyed on the table's own
// (et_date) unique index -- a same-day re-fire naturally replaces, never duplicates.
//
// DRY-RUN BY DEFAULT; --apply writes. assertHostVenue runs FIRST, before the feeder harness is
// ever entered (same posture as tasks-classifier.mjs / oracle-extract.mjs).
//
// Usage: node scripts/michael/health-sync.mjs [--apply] [--et-date YYYY-MM-DD] [--json]
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, writeRows, refusal, emit } from '../../lib/michael/db.mjs';
import { runFeeder, exitCodeFor, gracefulExit } from '../../lib/michael/feeder.mjs';
import { assertHostVenue } from '../../lib/integrations/google/chairman-oauth.js';
import { listDriveFiles, readDriveFileText } from '../../lib/michael/google-clients.mjs';
import { resolveConstants } from '../../lib/michael/constants.mjs';

export const FEEDER = 'health-sync';
export const HEALTH_FILE = 'health-daily.json';

/** Pure: a code-shaped error field for the run row (mirrors tasks-classifier.mjs's errCode). */
export function errCode(error) {
  const head = String(error || '').split(':')[0].trim();
  return /^[A-Z][A-Z0-9_]{1,40}$|^\d{3}$/.test(head) ? head : 'API_ERROR';
}

/** Pure: health-daily.json must be a JSON OBJECT (matches the metrics jsonb-object CHECK). */
export function parseMetrics(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed;
}

/** The feeder. deps: { sb, argv, now, auth, drive (factory), env }. Never throws. */
export async function runHealthSync({ sb, argv = [], now = new Date(), auth, drive, env = process.env } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  const etDateOverride = a['et-date'] !== undefined ? String(a['et-date']) : undefined;
  if (etDateOverride !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(etDateOverride)) return refusal('ET_DATE_INVALID', '--et-date must be YYYY-MM-DD');
  try { assertHostVenue(env); } catch (e) { return refusal(e.code || 'HOST_VENUE_REQUIRED', e.message); }
  const consts = resolveConstants(['MICHAEL_HEALTH_DRIVE_FOLDER_ID'], env);
  if (!consts.ok) return refusal(consts.refusal, consts.message, { variable: consts.variable });
  const folderId = consts.values.MICHAEL_HEALTH_DRIVE_FOLDER_ID;
  const gdeps = { auth, driveFactory: drive, sb, env };

  return runFeeder({
    feeder: FEEDER,
    etDateOverride,
    dryRun: !apply,
    run: async ({ etDate }) => {
      const counts = { dry_run: !apply, metric_keys: 0, upserted: 0 };

      const files = await listDriveFiles({ folderId }, gdeps);
      if (!files.ok) return { status: 'failed', counts: { ...counts, error_code: errCode(files.error), phase: 'drive' } };
      const file = files.files.find((f) => f.name === HEALTH_FILE);
      if (!file) return { status: 'skipped', counts: { ...counts, reason: 'file_missing' } };
      counts.file_modified = file.modifiedTime || null;

      const text = await readDriveFileText({ fileId: file.id, folderId }, gdeps);
      if (!text.ok) return { status: 'failed', counts: { ...counts, error_code: errCode(text.error), phase: 'read' } };
      const metrics = parseMetrics(text.text);
      if (!metrics) return { status: 'failed', counts: { ...counts, error_code: 'FILE_UNPARSEABLE', phase: 'parse' } };
      counts.metric_keys = Object.keys(metrics).length;

      if (!apply) return { status: 'ok', counts, preview: { row: { et_date: etDate, metrics } } };

      const up = await writeRows(sb, 'michael_health_daily', (t) => t.upsert({ et_date: etDate, metrics }, { onConflict: 'et_date' }));
      if (!up.ok) return { status: 'failed', counts: { ...counts, error_code: 'UPSERT_FAILED', phase: 'write' } };
      counts.upserted = 1;
      return { status: 'ok', counts };
    },
  }, { sb, env, now });
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runHealthSync({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  await gracefulExit(exitCodeFor(r));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:health-sync] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
