// lib/michael/gmail-client.mjs — the Gmail API leg scripts/michael/gmail-act.mjs (child B) lazily imports.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C (FR-5). Contract fixed by child B:
//   modifyThread({ threadId, addLabelIds, removeLabelIds }) -> { ok, modified } | { ok:false, error }
// Child D (FR-2) adds the READ legs gmail-triage uses: listThreads, getThreadMeta (format=metadata with
// exactly four headers, never a body), listLabels.
// Import-time pure: no env read, no client, no network until a function is called (gmail-act's loader
// re-throws anything that is not module-not-found, so an import-time throw would become exit 1).
// Destructive labels are refused before any API call (RISK 2): the child D ceiling bounds volume,
// this bounds damage — TRASH and SPAM never pass through to threads.modify.
import { getAuthenticatedClient } from '../integrations/google/chairman-oauth.js';

export const FORBIDDEN_LABELS = Object.freeze(['TRASH', 'SPAM']);
/** The only headers gmail-triage ever fetches (TR-4: no body, no address beyond From). */
export const META_HEADERS = Object.freeze(['From', 'Subject', 'List-Id', 'Date']);
export const THREADS_MAX_RESULTS = 200;
/** Response mask for threads.get: no snippet (body preview) ever crosses the wire. */
export const META_FIELDS = 'id,messages(id,labelIds,payload/headers)';

/** Pure: the first forbidden label id in either list, or null. */
export function forbiddenLabel({ addLabelIds = [], removeLabelIds = [] } = {}) {
  return [...addLabelIds, ...removeLabelIds].find((l) => FORBIDDEN_LABELS.includes(String(l).toUpperCase())) || null;
}

async function defaultGmailFactory(auth) {
  const { google } = await import('googleapis');
  return google.gmail({ version: 'v1', auth });
}

function failure(e) {
  const code = e && e.code ? `${e.code}: ` : '';
  return { ok: false, error: `${code}${(e && e.message) || String(e)}` };
}

async function gmailFor({ auth, gmailFactory, sb, enc, env }) {
  const client = auth || await getAuthenticatedClient({ sb, enc, env });
  return gmailFactory(client);
}

/**
 * Label / archive / unarchive one thread through the chairman grant. Never throws.
 * deps (tests): { auth, gmailFactory, sb, enc, env }.
 */
export async function modifyThread({ threadId, addLabelIds = [], removeLabelIds = [] } = {}, { auth, gmailFactory = defaultGmailFactory, sb, enc, env = process.env } = {}) {
  if (!threadId) return { ok: false, error: 'MISSING_THREAD_ID' };
  const forbidden = forbiddenLabel({ addLabelIds, removeLabelIds });
  if (forbidden) return { ok: false, error: 'LABEL_FORBIDDEN', label: forbidden };
  try {
    const gmail = await gmailFor({ auth, gmailFactory, sb, enc, env });
    const { data } = await gmail.users.threads.modify({ userId: 'me', id: String(threadId), requestBody: { addLabelIds, removeLabelIds } });
    return { ok: true, modified: { id: (data && data.id) || String(threadId), messages: data && Array.isArray(data.messages) ? data.messages.length : null } };
  } catch (e) {
    return failure(e);
  }
}

/** Thread ids matching a Gmail search, bounded by maxResults (default 200, never more). Returns { ok:true, threads:[{ id, historyId }] }. */
export async function listThreads({ q, maxResults = THREADS_MAX_RESULTS } = {}, { auth, gmailFactory = defaultGmailFactory, sb, enc, env = process.env } = {}) {
  if (!q) return { ok: false, error: 'MISSING_QUERY' };
  const requested = Number.isInteger(Number(maxResults)) ? Number(maxResults) : THREADS_MAX_RESULTS;
  const bound = Math.min(Math.max(requested, 1), THREADS_MAX_RESULTS);
  try {
    const gmail = await gmailFor({ auth, gmailFactory, sb, enc, env });
    const { data } = await gmail.users.threads.list({ userId: 'me', q: String(q), maxResults: bound });
    const threads = data && Array.isArray(data.threads) ? data.threads.map((t) => ({ id: t.id, historyId: t.historyId ?? null })) : [];
    return { ok: true, threads, truncated: threads.length > 0 && threads.length >= bound, q: String(q) };
  } catch (e) {
    return failure(e);
  }
}

/** Pure: header value by name (case-insensitive) from a Gmail message payload. */
export function headerValue(headers, name) {
  const h = (Array.isArray(headers) ? headers : []).find((x) => x && String(x.name).toLowerCase() === name.toLowerCase());
  return h ? String(h.value) : null;
}

/**
 * Metadata of one thread: from / subject / listId / date of the LAST message, the thread's labelIds,
 * message count and last message id. format=metadata with META_HEADERS only — no body is ever requested.
 * Returns { ok:true, meta } or { ok:false, error }.
 */
export async function getThreadMeta({ threadId } = {}, { auth, gmailFactory = defaultGmailFactory, sb, enc, env = process.env } = {}) {
  if (!threadId) return { ok: false, error: 'MISSING_THREAD_ID' };
  try {
    const gmail = await gmailFor({ auth, gmailFactory, sb, enc, env });
    const { data } = await gmail.users.threads.get({ userId: 'me', id: String(threadId), format: 'metadata', metadataHeaders: [...META_HEADERS], fields: META_FIELDS });
    const messages = data && Array.isArray(data.messages) ? data.messages : [];
    const last = messages[messages.length - 1] || null;
    const headers = last && last.payload ? last.payload.headers : [];
    const labelIds = [...new Set(messages.flatMap((m) => (Array.isArray(m.labelIds) ? m.labelIds : [])))];
    return {
      ok: true,
      meta: {
        threadId: (data && data.id) || String(threadId),
        from: headerValue(headers, 'From'),
        subject: headerValue(headers, 'Subject'),
        listId: headerValue(headers, 'List-Id'),
        date: headerValue(headers, 'Date'),
        labelIds,
        messageCount: messages.length,
        lastMessageId: last ? last.id ?? null : null,
      },
    };
  } catch (e) {
    return failure(e);
  }
}

/** All labels on the account. Returns { ok:true, labels:[{ id, name, type }] } or { ok:false, error }. */
export async function listLabels({ auth, gmailFactory = defaultGmailFactory, sb, enc, env = process.env } = {}) {
  try {
    const gmail = await gmailFor({ auth, gmailFactory, sb, enc, env });
    const { data } = await gmail.users.labels.list({ userId: 'me' });
    const labels = data && Array.isArray(data.labels) ? data.labels.map((l) => ({ id: l.id, name: l.name, type: l.type ?? null })) : [];
    return { ok: true, labels };
  } catch (e) {
    return failure(e);
  }
}

export default { modifyThread, forbiddenLabel, FORBIDDEN_LABELS, listThreads, getThreadMeta, listLabels, headerValue, META_HEADERS, META_FIELDS };
