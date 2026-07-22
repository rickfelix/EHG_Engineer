/**
 * drive-doc-client.js — SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-C (FR-1, FR-2).
 *
 * Headless Google Drive/Docs client (service-account) that writes a PRIVATE Doc into the
 * chairman-owned Drive folder for the 5:45 daily brief. FAILS CLOSED if GOOGLE_SERVICE_ACCOUNT_JSON
 * is absent — there is NO unauthenticated / interactive-OAuth fallback (same posture as launch-mode
 * refusing to run simulated).
 *
 * Credential model (Option A, chairman-provisioned 2026-07-21, Adam advisory 32694579): the SA
 * WRITES INTO a chairman-owned folder; the folder + docs stay chairman-owned. The SA has
 * folder-scoped Editor only (least-privilege). GOOGLE_SERVICE_ACCOUNT_JSON is a WRITE-ONLY GitHub
 * Actions repo secret, so env is the only place it can be verified — cron/CI holds it, not the
 * build session (which performs ZERO live Drive writes; tests mock googleapis).
 */
import { google } from 'googleapis';

// Stamped from chairman provisioning (SD metadata).
export const CHAIRMAN_FOLDER_ID = '1_Ui4ckZLtIUi3Sm9W_y41eEDHEnNIwDP';
export const SA_CLIENT_EMAIL = 'ehg-daily-brief-writer@gen-lang-client-0269820571.iam.gserviceaccount.com';
// Least-privilege: only create/manage files the app owns in the shared folder + edit docs.
export const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/documents'];
export const SECRET_ENV = 'GOOGLE_SERVICE_ACCOUNT_JSON';

export class MissingCredentialError extends Error {
  constructor(detail) {
    super(`${SECRET_ENV} missing — failing closed (no unauthenticated fallback)${detail ? ` [${detail}]` : ''}`);
    this.name = 'MissingCredentialError';
    this.failClosed = true;
  }
}

/**
 * Parse + validate the service-account JSON from env. Throws MissingCredentialError (fail-closed)
 * if the secret is absent, unparseable, or missing required fields. Never logs the key material.
 * @param {Record<string,*>} [env]
 * @returns {{client_email:string, private_key:string}}
 */
export function loadServiceAccount(env = process.env) {
  const raw = env ? env[SECRET_ENV] : undefined;
  if (raw === undefined || raw === null || String(raw).trim() === '') throw new MissingCredentialError();
  let creds;
  try { creds = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { throw new MissingCredentialError('unparseable JSON'); }
  if (!creds || !creds.client_email || !creds.private_key) throw new MissingCredentialError('missing client_email/private_key');
  return creds;
}

/** Build a least-privilege JWT auth client from the service-account creds. */
export function buildAuth(creds, { googleLib = google } = {}) {
  return new googleLib.auth.JWT({ email: creds.client_email, key: creds.private_key, scopes: SCOPES });
}

/**
 * Create a PRIVATE Doc titled `title` (with optional `body` text) inside the chairman-owned folder.
 * Fails closed if the secret is absent. Targets ONLY the stamped folder_id (least-privilege).
 * @param {{title:string, body?:string}} doc
 * @param {{ env?:Record<string,*>, googleLib?:object, folderId?:string }} [opts]
 * @returns {Promise<{docId:string, webViewLink:string}>}
 */
export async function createBriefDoc({ title, body } = {}, { env = process.env, googleLib = google, folderId = CHAIRMAN_FOLDER_ID } = {}) {
  const creds = loadServiceAccount(env); // fail-closed BEFORE any API call
  const auth = buildAuth(creds, { googleLib });
  const drive = googleLib.drive({ version: 'v3', auth });

  // Create the Doc directly under the chairman-owned folder (drive.file scope — least-privilege).
  const created = await drive.files.create({
    requestBody: { name: title, mimeType: 'application/vnd.google-apps.document', parents: [folderId] },
    fields: 'id, webViewLink',
  });
  const docId = created && created.data && created.data.id;
  if (!docId) throw new Error('drive.files.create returned no document id');

  if (body !== undefined && body !== null && String(body).trim() !== '') {
    const docs = googleLib.docs({ version: 'v1', auth });
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests: [{ insertText: { location: { index: 1 }, text: String(body) } }] },
    });
  }
  return { docId, webViewLink: created.data.webViewLink };
}
