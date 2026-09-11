#!/usr/bin/env node
// scripts/michael/oracle-extract.mjs — v1.1 feeder (host Task Scheduler, 06:00-06:30 ET).
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-J. Spec §5 v1.1: "oracle-extract ... Drive read
// through the chairman grant -> host venue".
//
// Reads a JSON file (a bare array or {items:[...]}, each item {content, tags?}) from the
// configured Drive folder (drive.readonly, parents-checked via lib/michael/google-clients.mjs) and
// writes it to michael_oracle_history for today's ET date. The source represents THAT DAY's
// complete oracle extract, so a re-fire is a full delete-then-insert for today's et_date -- never
// an accretion, so there is no fragile per-entry dedupe to get wrong (matches the shipped
// michael_calendar_day precedent's own "today's read replaces today's rows" posture).
//
// DRY-RUN BY DEFAULT; --apply writes. assertHostVenue runs FIRST, before the feeder harness is
// ever entered, exactly like scripts/michael/tasks-classifier.mjs (PLAN-TO-EXEC TESTING finding
// E3) -- calling it inside run() would convert a GHA misfire into a 'failed' run row that inflates
// the chairman-facing quiet-tick gauge instead of a clean, unrecorded refusal.
//
// Usage: node scripts/michael/oracle-extract.mjs [--apply] [--et-date YYYY-MM-DD] [--json]
import 'dotenv/config';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, writeRows, refusal, emit } from '../../lib/michael/db.mjs';
import { runFeeder, exitCodeFor, gracefulExit } from '../../lib/michael/feeder.mjs';
import { assertHostVenue } from '../../lib/integrations/google/chairman-oauth.js';
import { listDriveFiles, readDriveFileText } from '../../lib/michael/google-clients.mjs';
import { resolveConstants } from '../../lib/michael/constants.mjs';

export const FEEDER = 'oracle-extract';
export const ORACLE_FILE = 'oracle-entries.json';

/** Pure: a code-shaped error field for the run row (mirrors tasks-classifier.mjs's errCode). */
export function errCode(error) {
  const head = String(error || '').split(':')[0].trim();
  return /^[A-Z][A-Z0-9_]{1,40}$|^\d{3}$/.test(head) ? head : 'API_ERROR';
}

/** Pure: the entries of oracle-entries.json -- a bare array or {items:[...]}; each needs non-empty content. */
export function parseEntries(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return null; }
  const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.items) ? parsed.items : null);
  if (!list) return null;
  return list
    .filter((x) => x && typeof x.content === 'string' && x.content.trim().length > 0)
    .map((x) => ({ content: x.content.trim(), tags: Array.isArray(x.tags) ? x.tags.map(String) : [] }));
}

/** The feeder. deps: { sb, argv, now, auth, drive (factory), env }. Never throws. */
export async function runOracleExtract({ sb, argv = [], now = new Date(), auth, drive, env = process.env } = {}) {
  const a = parseArgs(argv);
  const apply = a.apply === true;
  const etDateOverride = a['et-date'] !== undefined ? String(a['et-date']) : undefined;
  if (etDateOverride !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(etDateOverride)) return refusal('ET_DATE_INVALID', '--et-date must be YYYY-MM-DD');
  try { assertHostVenue(env); } catch (e) { return refusal(e.code || 'HOST_VENUE_REQUIRED', e.message); }
  const consts = resolveConstants(['MICHAEL_ORACLE_DRIVE_FOLDER_ID'], env);
  if (!consts.ok) return refusal(consts.refusal, consts.message, { variable: consts.variable });
  const folderId = consts.values.MICHAEL_ORACLE_DRIVE_FOLDER_ID;
  const gdeps = { auth, driveFactory: drive, sb, env };

  return runFeeder({
    feeder: FEEDER,
    etDateOverride,
    dryRun: !apply,
    run: async ({ etDate }) => {
      const counts = { dry_run: !apply, entries: 0, replaced: 0 };

      const files = await listDriveFiles({ folderId }, gdeps);
      if (!files.ok) return { status: 'failed', counts: { ...counts, error_code: errCode(files.error), phase: 'drive' } };
      const file = files.files.find((f) => f.name === ORACLE_FILE);
      if (!file) return { status: 'skipped', counts: { ...counts, reason: 'file_missing' } };
      counts.file_modified = file.modifiedTime || null;

      const text = await readDriveFileText({ fileId: file.id, folderId }, gdeps);
      if (!text.ok) return { status: 'failed', counts: { ...counts, error_code: errCode(text.error), phase: 'read' } };
      const entries = parseEntries(text.text);
      if (!entries) return { status: 'failed', counts: { ...counts, error_code: 'FILE_UNPARSEABLE', phase: 'parse' } };
      counts.entries = entries.length;

      if (!apply) return { status: 'ok', counts, preview: { rows: entries.map((e, i) => ({ et_date: etDate, seq: i + 1, content: e.content, tags: e.tags })) } };

      const del = await writeRows(sb, 'michael_oracle_history', (t) => t.delete().eq('et_date', etDate));
      if (!del.ok) return { status: 'failed', counts: { ...counts, error_code: 'DELETE_FAILED', phase: 'replace' } };
      if (entries.length) {
        const rows = entries.map((e, i) => ({ et_date: etDate, seq: i + 1, content: e.content, tags: e.tags }));
        const ins = await writeRows(sb, 'michael_oracle_history', (t) => t.insert(rows));
        if (!ins.ok) return { status: 'failed', counts: { ...counts, error_code: 'INSERT_FAILED', phase: 'replace' } };
      }
      counts.replaced = entries.length;
      return { status: 'ok', counts };
    },
  }, { sb, env, now });
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runOracleExtract({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  await gracefulExit(exitCodeFor(r));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:oracle-extract] fatal ${e && e.code ? e.code : ''}`); process.exitCode = 2; });
}
