// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C FR-5 / TS-8, TS-12 — the Gmail leg child B deferred.
// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D FR-2 / TS-16 — the read legs (metadata only, never a body).
import { describe, it, expect } from 'vitest';
import { modifyThread, forbiddenLabel, FORBIDDEN_LABELS, listThreads, getThreadMeta, listLabels, headerValue, META_HEADERS, META_FIELDS, THREADS_MAX_RESULTS } from './gmail-client.mjs';

function recordingGmail(calls, { reject = null, data = { id: 't1', messages: [{}, {}] } } = {}) {
  return async (auth) => {
    calls.push(['factory', auth]);
    const call = (name) => async (args) => { calls.push([name, args]); if (reject) throw reject; return { data }; };
    return { users: { threads: { modify: call('modify'), list: call('threads.list'), get: call('threads.get') }, labels: { list: call('labels.list') } } };
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

describe('read legs (child D FR-2, TS-16)', () => {
  it('listThreads maps q and a bounded maxResults (never above 200) and flags truncation', async () => {
    const calls = [];
    const data = { threads: [{ id: 'a', historyId: '1' }, { id: 'b' }] };
    const r = await listThreads({ q: 'in:inbox newer_than:1d', maxResults: 500 }, { auth: 'AUTH', gmailFactory: recordingGmail(calls, { data }) });
    expect(r).toEqual({ ok: true, threads: [{ id: 'a', historyId: '1' }, { id: 'b', historyId: null }], truncated: false, q: 'in:inbox newer_than:1d' });
    expect(calls[1]).toEqual(['threads.list', { userId: 'me', q: 'in:inbox newer_than:1d', maxResults: THREADS_MAX_RESULTS }]);
    const two = await listThreads({ q: 'x', maxResults: 2 }, { auth: 'AUTH', gmailFactory: recordingGmail([], { data }) });
    expect(two.truncated).toBe(true);
    const neg = [];
    const none = await listThreads({ q: 'x', maxResults: -5 }, { auth: 'AUTH', gmailFactory: recordingGmail(neg, { data: { threads: [] } }) });
    expect(neg[1][1].maxResults).toBe(THREADS_MAX_RESULTS);
    expect(none.truncated).toBe(false);
    for (const dflt of [null, 0, true, NaN, 1.5, '200abc']) {
      const c = [];
      await listThreads({ q: 'x', maxResults: dflt }, { auth: 'AUTH', gmailFactory: recordingGmail(c, { data: { threads: [] } }) });
      expect(c[1][1].maxResults).toBe(THREADS_MAX_RESULTS);
    }
    const one = [];
    await listThreads({ q: 'x', maxResults: '7' }, { auth: 'AUTH', gmailFactory: recordingGmail(one, { data: { threads: [] } }) });
    expect(one[1][1].maxResults).toBe(7);
    expect(await listThreads({}, { auth: 'AUTH' })).toEqual({ ok: false, error: 'MISSING_QUERY' });
  });
  it('getThreadMeta requests format metadata with exactly the four headers and never a body; reads the last message', async () => {
    const calls = [];
    const data = { id: 't9', messages: [
      { id: 'm1', labelIds: ['INBOX'], payload: { headers: [{ name: 'From', value: 'old@x.com' }] } },
      { id: 'm2', labelIds: ['INBOX', 'CATEGORY_UPDATES'], payload: { headers: [{ name: 'from', value: 'Alerts <alerts@exelon.com>' }, { name: 'Subject', value: 'Digest' }, { name: 'List-Id', value: '<d.exelon.com>' }, { name: 'Date', value: 'Sun, 06 Sep 2026' }] } },
    ] };
    const r = await getThreadMeta({ threadId: 't9' }, { auth: 'AUTH', gmailFactory: recordingGmail(calls, { data }) });
    expect(calls[1]).toEqual(['threads.get', { userId: 'me', id: 't9', format: 'metadata', metadataHeaders: ['From', 'Subject', 'List-Id', 'Date'], fields: META_FIELDS }]);
    expect(META_FIELDS).not.toMatch(/snippet|body/);
    expect(META_HEADERS).toEqual(['From', 'Subject', 'List-Id', 'Date']);
    expect(JSON.stringify(calls[1][1])).not.toMatch(/full|raw|body/i);
    expect(r).toEqual({ ok: true, meta: { threadId: 't9', from: 'Alerts <alerts@exelon.com>', subject: 'Digest', listId: '<d.exelon.com>', date: 'Sun, 06 Sep 2026', labelIds: ['INBOX', 'CATEGORY_UPDATES'], messageCount: 2, lastMessageId: 'm2' } });
    expect(headerValue([{ name: 'X', value: '1' }], 'x')).toBe('1');
    expect(headerValue(null, 'x')).toBe(null);
    expect(await getThreadMeta({}, { auth: 'AUTH' })).toEqual({ ok: false, error: 'MISSING_THREAD_ID' });
  });
  it('listLabels maps labels.list; a rejecting factory is { ok:false, error } on every read leg', async () => {
    const calls = [];
    const r = await listLabels({ auth: 'AUTH', gmailFactory: recordingGmail(calls, { data: { labels: [{ id: 'L1', name: 'Newsletters', type: 'user' }] } }) });
    expect(r).toEqual({ ok: true, labels: [{ id: 'L1', name: 'Newsletters', type: 'user' }] });
    expect(calls[1]).toEqual(['labels.list', { userId: 'me' }]);
    const err = new Error('rate limited'); err.code = 429;
    const rejecting = recordingGmail([], { reject: err });
    expect(await listThreads({ q: 'x' }, { auth: 'AUTH', gmailFactory: rejecting })).toEqual({ ok: false, error: '429: rate limited' });
    expect(await getThreadMeta({ threadId: 't' }, { auth: 'AUTH', gmailFactory: rejecting })).toEqual({ ok: false, error: '429: rate limited' });
    expect(await listLabels({ auth: 'AUTH', gmailFactory: rejecting })).toEqual({ ok: false, error: '429: rate limited' });
  });
});
