// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C FR-5 / TS-8, TS-12 — the Gmail leg child B deferred.
import { describe, it, expect } from 'vitest';
import { modifyThread, forbiddenLabel, FORBIDDEN_LABELS } from './gmail-client.mjs';

function recordingGmail(calls, { reject = null, data = { id: 't1', messages: [{}, {}] } } = {}) {
  return async (auth) => {
    calls.push(['factory', auth]);
    return { users: { threads: { modify: async (args) => { calls.push(['modify', args]); if (reject) throw reject; return { data }; } } } };
  };
}

describe('modifyThread contract (gmail-act.mjs:5-8, 66-68)', () => {
  it('maps to users.threads.modify with userId me and returns { ok:true, modified }', async () => {
    const calls = [];
    const out = await modifyThread({ threadId: 't1', addLabelIds: ['Label_7'], removeLabelIds: ['INBOX'] }, { auth: 'AUTH', gmailFactory: recordingGmail(calls) });
    expect(out).toEqual({ ok: true, modified: { id: 't1', messages: 2 } });
    expect(calls).toEqual([['factory', 'AUTH'], ['modify', { userId: 'me', id: 't1', requestBody: { addLabelIds: ['Label_7'], removeLabelIds: ['INBOX'] } }]]);
  });
  it('an API or auth failure is { ok:false, error } and never throws', async () => {
    const calls = [];
    const err = new Error('invalid_grant'); err.code = 401;
    expect(await modifyThread({ threadId: 't1', removeLabelIds: ['INBOX'] }, { auth: 'AUTH', gmailFactory: recordingGmail(calls, { reject: err }) })).toEqual({ ok: false, error: '401: invalid_grant' });
    // no injected auth and no key in env: getAuthenticatedClient refuses with a coded error, surfaced as { ok:false }
    const r = await modifyThread({ threadId: 't1', removeLabelIds: ['INBOX'] }, { env: {}, sb: { from: () => { throw new Error('must not read'); } } });
    expect(r.ok).toBe(false); expect(r.error).toMatch(/GOOGLE_CLIENT_MISSING|MICHAEL_ENCRYPTION_KEY/);
  });
  it('TS-12: TRASH and SPAM are refused before any API call (RISK 2)', async () => {
    for (const label of ['TRASH', 'SPAM', 'trash']) {
      const calls = [];
      expect(await modifyThread({ threadId: 't1', addLabelIds: [label] }, { auth: 'AUTH', gmailFactory: recordingGmail(calls) })).toEqual({ ok: false, error: 'LABEL_FORBIDDEN', label });
      expect(await modifyThread({ threadId: 't1', removeLabelIds: [label] }, { auth: 'AUTH', gmailFactory: recordingGmail(calls) })).toMatchObject({ ok: false, error: 'LABEL_FORBIDDEN' });
      expect(calls).toEqual([]);
    }
    expect(forbiddenLabel({ addLabelIds: ['INBOX'], removeLabelIds: ['Label_1'] })).toBeNull();
    expect(FORBIDDEN_LABELS).toEqual(['TRASH', 'SPAM']);
    expect(await modifyThread({}, { auth: 'AUTH' })).toEqual({ ok: false, error: 'MISSING_THREAD_ID' });
  });
});
