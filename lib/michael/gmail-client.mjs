// lib/michael/gmail-client.mjs — the Gmail API leg scripts/michael/gmail-act.mjs (child B) lazily imports.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C (FR-5). Contract fixed by child B:
//   modifyThread({ threadId, addLabelIds, removeLabelIds }) -> { ok, modified } | { ok:false, error }
// Import-time pure: no env read, no client, no network until modifyThread is called (gmail-act's loader
// re-throws anything that is not module-not-found, so an import-time throw would become exit 1).
// Destructive labels are refused before any API call (RISK 2): the child D ceiling bounds volume,
// this bounds damage — TRASH and SPAM never pass through to threads.modify.
import { getAuthenticatedClient } from '../integrations/google/chairman-oauth.js';

export const FORBIDDEN_LABELS = Object.freeze(['TRASH', 'SPAM']);

/** Pure: the first forbidden label id in either list, or null. */
export function forbiddenLabel({ addLabelIds = [], removeLabelIds = [] } = {}) {
  return [...addLabelIds, ...removeLabelIds].find((l) => FORBIDDEN_LABELS.includes(String(l).toUpperCase())) || null;
}

async function defaultGmailFactory(auth) {
  const { google } = await import('googleapis');
  return google.gmail({ version: 'v1', auth });
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
    const client = auth || await getAuthenticatedClient({ sb, enc, env });
    const gmail = await gmailFactory(client);
    const { data } = await gmail.users.threads.modify({ userId: 'me', id: String(threadId), requestBody: { addLabelIds, removeLabelIds } });
    return { ok: true, modified: { id: (data && data.id) || String(threadId), messages: data && Array.isArray(data.messages) ? data.messages.length : null } };
  } catch (e) {
    const code = e && e.code ? `${e.code}: ` : '';
    return { ok: false, error: `${code}${(e && e.message) || String(e)}` };
  }
}

export default { modifyThread, forbiddenLabel, FORBIDDEN_LABELS };
