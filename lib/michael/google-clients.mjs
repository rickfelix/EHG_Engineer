// lib/michael/google-clients.mjs — the Calendar and Drive legs on the chairman grant.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D (FR-2, TR-3).
//
// Import-time pure: no env read, no client, no network until a function is called; googleapis is
// lazy-imported inside the default factories so a feeder can be imported on a host without it. Every
// function takes an injected `auth` or resolves one through getAuthenticatedClient (host venue is
// enforced there; feeders ALSO call assertHostVenue themselves, TR-3), never throws, and never logs a
// token. Scopes are calendar.readonly and drive.readonly: nothing here can write.
//
// readDriveFileText checks the file's parents against the configured tasks folder before returning
// content (SECURITY a3587993 F-10): drive.readonly is a whole-Drive read scope, so an arbitrary fileId
// must not be able to pull any document into michael_staged_items.
import { getAuthenticatedClient } from '../integrations/google/chairman-oauth.js';

export const CALENDAR_MAX_RESULTS = 250;
export const DRIVE_MAX_RESULTS = 100;
export const DRIVE_FILE_FIELDS = 'id,name,parents,mimeType,modifiedTime';

async function defaultCalendarFactory(auth) {
  const { google } = await import('googleapis');
  return google.calendar({ version: 'v3', auth });
}

async function defaultDriveFactory(auth) {
  const { google } = await import('googleapis');
  return google.drive({ version: 'v3', auth });
}

function failure(e) {
  const code = e && e.code ? `${e.code}: ` : '';
  return { ok: false, error: `${code}${(e && e.message) || String(e)}` };
}

async function resolveAuth({ auth, sb, enc, env }) {
  return auth || getAuthenticatedClient({ sb, enc, env });
}

/**
 * Events on one calendar between timeMin and timeMax (ISO strings), expanded to single instances in
 * start order. Returns { ok:true, events:[...] } (Google event objects as returned) or { ok:false, error }.
 */
export async function listCalendarEvents({ calendarId, timeMin, timeMax } = {}, { auth, calendarFactory = defaultCalendarFactory, sb, enc, env = process.env } = {}) {
  if (!calendarId) return { ok: false, error: 'MISSING_CALENDAR_ID' };
  if (!timeMin || !timeMax) return { ok: false, error: 'MISSING_TIME_RANGE' };
  try {
    const calendar = await calendarFactory(await resolveAuth({ auth, sb, enc, env }));
    const { data } = await calendar.events.list({ calendarId: String(calendarId), timeMin: String(timeMin), timeMax: String(timeMax), singleEvents: true, orderBy: 'startTime', maxResults: CALENDAR_MAX_RESULTS });
    const events = data && Array.isArray(data.items) ? data.items : [];
    // One page only by design; a nextPageToken means the day overflowed 250 and the feeder must say so.
    return { ok: true, events, calendarId: String(calendarId), truncated: Boolean(data && data.nextPageToken) };
  } catch (e) {
    return failure(e);
  }
}

/** Pure: a Drive query string literal — backslash escaped BEFORE the quote (Google's grammar; adversarial review of PR 8366). */
export function driveLiteral(v) {
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Pure: the Drive query for files in a folder, optionally by exact name. */
export function driveQuery({ folderId, name }) {
  const parts = [`${driveLiteral(folderId)} in parents`, 'trashed = false'];
  if (name) parts.push(`name = ${driveLiteral(name)}`);
  return parts.join(' and ');
}

/** Files inside one folder (optionally by name). Returns { ok:true, files:[{ id, name, parents, mimeType, modifiedTime }] } or { ok:false, error }. */
export async function listDriveFiles({ folderId, name } = {}, { auth, driveFactory = defaultDriveFactory, sb, enc, env = process.env } = {}) {
  if (!folderId) return { ok: false, error: 'MISSING_FOLDER_ID' };
  try {
    const drive = await driveFactory(await resolveAuth({ auth, sb, enc, env }));
    const { data } = await drive.files.list({ q: driveQuery({ folderId, name }), fields: `files(${DRIVE_FILE_FIELDS})`, pageSize: DRIVE_MAX_RESULTS, spaces: 'drive' });
    return { ok: true, files: data && Array.isArray(data.files) ? data.files : [], truncated: Boolean(data && data.nextPageToken) };
  } catch (e) {
    return failure(e);
  }
}

/**
 * The text content of one file, only if its parents include `folderId` (metadata read first, then
 * alt=media). Returns { ok:true, text, file:{ id, name, modifiedTime } } or { ok:false, error }.
 */
export async function readDriveFileText({ fileId, folderId } = {}, { auth, driveFactory = defaultDriveFactory, sb, enc, env = process.env } = {}) {
  if (!fileId) return { ok: false, error: 'MISSING_FILE_ID' };
  if (!folderId) return { ok: false, error: 'MISSING_FOLDER_ID' };
  try {
    const drive = await driveFactory(await resolveAuth({ auth, sb, enc, env }));
    const meta = await drive.files.get({ fileId: String(fileId), fields: DRIVE_FILE_FIELDS });
    const parents = meta && meta.data && Array.isArray(meta.data.parents) ? meta.data.parents : [];
    if (!parents.includes(String(folderId))) return { ok: false, error: 'FILE_OUTSIDE_CONFIGURED_FOLDER', fileId: String(fileId) };
    const res = await drive.files.get({ fileId: String(fileId), alt: 'media' }, { responseType: 'text' });
    const text = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
    return { ok: true, text, file: { id: meta.data.id || String(fileId), name: meta.data.name || null, modifiedTime: meta.data.modifiedTime || null } };
  } catch (e) {
    return failure(e);
  }
}

export default { listCalendarEvents, listDriveFiles, readDriveFileText, driveQuery, driveLiteral };
