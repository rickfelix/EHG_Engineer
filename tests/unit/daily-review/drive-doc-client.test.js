// SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-C (FR-1, FR-2, FR-5) — headless Drive/Docs client.
// googleapis is fully MOCKED — no live Drive write occurs from the test/build environment.
import { describe, it, expect } from 'vitest';
import {
  loadServiceAccount, buildAuth, createBriefDoc, MissingCredentialError,
  CHAIRMAN_FOLDER_ID, SCOPES, SECRET_ENV,
} from '../../../lib/daily-review/drive-doc-client.js';

const VALID_SA = JSON.stringify({ client_email: 'sa@proj.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nX\n-----END PRIVATE KEY-----\n' });

// A googleapis-shaped mock that records calls instead of hitting the network.
function makeMockGoogle() {
  const calls = { jwt: null, filesCreate: null, batchUpdate: null };
  const googleLib = {
    auth: { JWT: class { constructor(opts) { this.opts = opts; calls.jwt = opts; } } },
    drive: () => ({ files: { create: async (args) => { calls.filesCreate = args; return { data: { id: 'doc123', webViewLink: 'https://docs.google.com/document/d/doc123/edit' } }; } } }),
    docs: () => ({ documents: { batchUpdate: async (args) => { calls.batchUpdate = args; return { data: {} }; } } }),
  };
  return { googleLib, calls };
}

describe('loadServiceAccount — fail-closed (FR-1)', () => {
  it('throws MissingCredentialError when the secret is absent', () => {
    expect(() => loadServiceAccount({})).toThrow(MissingCredentialError);
    expect(() => loadServiceAccount({ [SECRET_ENV]: '' })).toThrow(MissingCredentialError);
  });
  it('throws MissingCredentialError on unparseable JSON or missing fields', () => {
    expect(() => loadServiceAccount({ [SECRET_ENV]: 'not-json' })).toThrow(MissingCredentialError);
    expect(() => loadServiceAccount({ [SECRET_ENV]: JSON.stringify({ client_email: 'x' }) })).toThrow(MissingCredentialError);
  });
  it('returns creds for a valid service-account JSON', () => {
    const c = loadServiceAccount({ [SECRET_ENV]: VALID_SA });
    expect(c.client_email).toMatch(/gserviceaccount\.com$/);
    expect(c.private_key).toContain('PRIVATE KEY');
  });
});

describe('buildAuth — least-privilege scopes (FR-2)', () => {
  it('constructs a JWT auth client with drive.file + documents scopes only', () => {
    const { googleLib, calls } = makeMockGoogle();
    buildAuth({ client_email: 'a@b', private_key: 'k' }, { googleLib });
    expect(calls.jwt.scopes).toEqual(SCOPES);
    expect(SCOPES).toContain('https://www.googleapis.com/auth/drive.file');
    expect(SCOPES).not.toContain('https://www.googleapis.com/auth/drive'); // no broad drive scope
  });
});

describe('createBriefDoc — write to the chairman-owned folder (FR-2)', () => {
  it('creates the Doc under the stamped folder_id and returns id + webViewLink', async () => {
    const { googleLib, calls } = makeMockGoogle();
    const out = await createBriefDoc({ title: 'EHG Daily Brief', body: 'hello' }, { env: { [SECRET_ENV]: VALID_SA }, googleLib });
    expect(out).toEqual({ docId: 'doc123', webViewLink: 'https://docs.google.com/document/d/doc123/edit' });
    expect(calls.filesCreate.requestBody.parents).toEqual([CHAIRMAN_FOLDER_ID]);
    expect(calls.filesCreate.requestBody.mimeType).toBe('application/vnd.google-apps.document');
    expect(calls.batchUpdate.documentId).toBe('doc123'); // body inserted
  });

  it('skips the docs batchUpdate when there is no body', async () => {
    const { googleLib, calls } = makeMockGoogle();
    await createBriefDoc({ title: 'Empty' }, { env: { [SECRET_ENV]: VALID_SA }, googleLib });
    expect(calls.filesCreate).not.toBeNull();
    expect(calls.batchUpdate).toBeNull();
  });

  it('FAILS CLOSED (no API call) when the secret is absent', async () => {
    const { googleLib, calls } = makeMockGoogle();
    await expect(createBriefDoc({ title: 'x' }, { env: {}, googleLib })).rejects.toThrow(MissingCredentialError);
    expect(calls.filesCreate).toBeNull(); // no unauthenticated Drive call was attempted
  });
});
