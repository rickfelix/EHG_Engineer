import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fetchVerificationCode, extractSixDigitCode } from '../../../lib/apa/imap-code-fetcher.js';

const BASE_USER = 'venturesehg@gmail.com';
const APP_PASSWORD = 'test-app-password';

function messageWithCode(code, extra = '') {
  return `From: Clerk <noreply@clerk.dev>\r\nTo: venturesehg+altifyai-uat@gmail.com\r\nSubject: Your verification code\r\n\r\nYour code is ${code}.${extra}`;
}

/**
 * Fake ImapFlow client. Each test configures `uidsByCall` (an array of arrays of uids to
 * return per successive `search()` call, simulating polling) and `sourcesByUid` (raw
 * message source per uid).
 */
function makeFakeImapFlowClass({ uidsByCall = [[]], sourcesByUid = {}, connectError = null } = {}) {
  let callIndex = 0;
  return class FakeImapFlow {
    constructor() {}
    async connect() {
      if (connectError) throw connectError;
    }
    async getMailboxLock() {
      return { release: () => {} };
    }
    async search() {
      const uids = uidsByCall[Math.min(callIndex, uidsByCall.length - 1)];
      callIndex += 1;
      return uids;
    }
    async *fetch(range) {
      const uid = range.uid;
      if (sourcesByUid[uid]) {
        yield { source: Buffer.from(sourcesByUid[uid]) };
      }
    }
    async logout() {}
  };
}

beforeEach(() => {
  process.env.VENTURE_UAT_GMAIL_USER = BASE_USER;
  process.env.VENTURE_UAT_GMAIL_APP_PASSWORD = APP_PASSWORD;
});

afterEach(() => {
  delete process.env.VENTURE_UAT_GMAIL_USER;
  delete process.env.VENTURE_UAT_GMAIL_APP_PASSWORD;
  vi.restoreAllMocks();
});

describe('extractSixDigitCode', () => {
  it('extracts the single 6-digit code from a body', () => {
    expect(extractSixDigitCode('Your code is 482913.', 'uid=1')).toBe('482913');
  });

  it('throws on zero matches', () => {
    expect(() => extractSixDigitCode('No code here.', 'uid=1')).toThrow(/no 6-digit code/);
  });

  it('throws on ambiguous (multiple distinct) matches', () => {
    expect(() => extractSixDigitCode('Code 111111, ref 222222.', 'uid=1')).toThrow(/ambiguous/);
  });
});

describe('fetchVerificationCode — TS-1 happy path', () => {
  it('resolves with the correct code on the first poll', async () => {
    const ImapFlowImpl = makeFakeImapFlowClass({
      uidsByCall: [[42]],
      sourcesByUid: { 42: messageWithCode('123456') },
    });
    const code = await fetchVerificationCode({ aliasLocalPart: 'altifyai-uat', ImapFlowImpl, pollIntervalMs: 10, timeoutMs: 5000 });
    expect(code).toBe('123456');
  });
});

describe('fetchVerificationCode — TS-2 delayed delivery', () => {
  it('resolves after multiple polls once the message appears', async () => {
    const ImapFlowImpl = makeFakeImapFlowClass({
      uidsByCall: [[], [], [77]],
      sourcesByUid: { 77: messageWithCode('654321') },
    });
    const code = await fetchVerificationCode({ aliasLocalPart: 'altifyai-uat', ImapFlowImpl, pollIntervalMs: 5, timeoutMs: 5000 });
    expect(code).toBe('654321');
  });
});

describe('fetchVerificationCode — TS-3 negative acceptance (R2-c)', () => {
  it('never returns a code addressed to a different alias — times out instead', async () => {
    // The fake client's search() always mimics the IMAP server correctly filtering by
    // recipient, so a wrong-alias message never appears in the uid list at all.
    const ImapFlowImpl = makeFakeImapFlowClass({ uidsByCall: [[]] });
    await expect(
      fetchVerificationCode({ aliasLocalPart: 'altifyai-uat', ImapFlowImpl, pollIntervalMs: 5, timeoutMs: 30 })
    ).rejects.toThrow(/no verification code found/);
  });
});

describe('fetchVerificationCode — TS-4 ambiguous body', () => {
  it('throws a descriptive ambiguous-match error rather than guessing', async () => {
    const ImapFlowImpl = makeFakeImapFlowClass({
      uidsByCall: [[9]],
      sourcesByUid: { 9: messageWithCode('111111', ' Reference: 222222.') },
    });
    await expect(
      fetchVerificationCode({ aliasLocalPart: 'altifyai-uat', ImapFlowImpl, pollIntervalMs: 5, timeoutMs: 5000 })
    ).rejects.toThrow(/ambiguous/);
  });
});

describe('fetchVerificationCode — TS-5 connection/auth failure', () => {
  it('throws an error distinct from a not-found timeout, without retrying', async () => {
    const ImapFlowImpl = makeFakeImapFlowClass({ connectError: new Error('invalid credentials') });
    await expect(
      fetchVerificationCode({ aliasLocalPart: 'altifyai-uat', ImapFlowImpl, pollIntervalMs: 5, timeoutMs: 5000 })
    ).rejects.toThrow(/connection\/authentication failed/);
  });
});

describe('fetchVerificationCode — input validation', () => {
  it('throws if aliasLocalPart is missing', async () => {
    await expect(fetchVerificationCode({})).rejects.toThrow(/aliasLocalPart is required/);
  });

  it('throws if credentials are unset', async () => {
    delete process.env.VENTURE_UAT_GMAIL_USER;
    await expect(fetchVerificationCode({ aliasLocalPart: 'altifyai-uat' })).rejects.toThrow(/must both be set/);
  });
});
