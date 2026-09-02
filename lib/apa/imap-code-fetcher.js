/**
 * IMAP Clerk verification-code fetcher — SD-LEO-FIX-ALTIFYAI-UAT-FETCH-001.
 *
 * Connects to the fenced UAT Gmail account (VENTURE_UAT_GMAIL_USER /
 * VENTURE_UAT_GMAIL_APP_PASSWORD) and polls, bounded, for the newest Clerk verification
 * email addressed to a venture's plus-alias (e.g. `<baseUser>+altifyai-uat@gmail.com`),
 * extracting its 6-digit code.
 *
 * Read-only by design: opens the mailbox lock in read-only mode where the client supports
 * it, never deletes/flags/moves messages. Never logs the credential or the extracted code
 * (FENCES constraint) — every thrown error below is deliberately message-only (no raw
 * message body, no credential).
 *
 * KNOWN LIMITATION: this fetcher targets imap.gmail.com:993 specifically (Gmail app
 * passwords, plus-aliasing semantics). It is not provider-agnostic; a future venture on a
 * non-Gmail provider would need a separate/extended implementation — deliberately out of
 * this SD's scope.
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const IMAP_HOST = 'imap.gmail.com';
const IMAP_PORT = 993;
const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const SIX_DIGIT_CODE_RE = /\b\d{6}\b/g;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract exactly one 6-digit code from a message body. Throws on zero or multiple matches
 * rather than guessing which number is the code.
 * @param {string} body
 * @param {string} uidLabel — for error messages only, never logged elsewhere
 * @returns {string}
 */
export function extractSixDigitCode(body, uidLabel) {
  const matches = [...(body || '').matchAll(SIX_DIGIT_CODE_RE)].map((m) => m[0]);
  const unique = [...new Set(matches)];
  if (unique.length === 0) {
    throw new Error(`imap-code-fetcher: no 6-digit code found in message ${uidLabel}`);
  }
  if (unique.length > 1) {
    throw new Error(`imap-code-fetcher: ambiguous match — ${unique.length} distinct 6-digit sequences found in message ${uidLabel}`);
  }
  return unique[0];
}

/**
 * @param {{baseUser: string, aliasLocalPart: string}} args
 * @returns {string} the exact recipient address this fetcher matches against
 */
function buildAliasAddress({ baseUser, aliasLocalPart }) {
  const atIndex = baseUser.indexOf('@');
  if (atIndex === -1) {
    throw new Error('imap-code-fetcher: VENTURE_UAT_GMAIL_USER is not a valid email address');
  }
  const localPart = baseUser.slice(0, atIndex);
  const domain = baseUser.slice(atIndex + 1);
  return `${localPart}+${aliasLocalPart}@${domain}`.toLowerCase();
}

/**
 * One search-and-extract pass: opens a fresh IMAP session, searches INBOX for messages
 * addressed exactly to the alias address received after `sentAfter`, and if any exist,
 * parses the newest one and extracts its code. Returns null (not an error) when no
 * matching message exists yet — the caller's poll loop decides whether that's a retry or a
 * final failure.
 * @param {object} params
 * @returns {Promise<{code: string|null, messagesSeen: number}>}
 */
async function searchOnce({ user, pass, aliasAddress, sentAfter, ImapFlowImpl = ImapFlow }) {
  const client = new ImapFlowImpl({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  try {
    await client.connect();
  } catch (err) {
    // Tagged distinctly from every downstream (search/fetch/parse/extract) failure below --
    // adversarial review flagged that the original single try/catch mislabeled ALL of those
    // as "connection/authentication failed" and aborted the whole poll on any of them,
    // including a deterministic-but-recoverable extraction error (e.g. ambiguous match on
    // one message that a later, superseding message might resolve). Only a genuine
    // connect() failure should stop the poll immediately.
    err.imapConnectionFailure = true;
    throw err;
  }
  try {
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const uids = await client.search({ to: aliasAddress, since: sentAfter });
      if (!uids || uids.length === 0) {
        return { code: null, messagesSeen: 0 };
      }

      const newestUid = uids[uids.length - 1];
      let rawSource = null;
      for await (const message of client.fetch({ uid: newestUid }, { source: true }, { uid: true })) {
        rawSource = message.source;
      }
      if (!rawSource) {
        return { code: null, messagesSeen: uids.length };
      }

      const parsed = await simpleParser(rawSource);
      // Defense-in-depth for R2-c (adversarial review finding): IMAP SEARCH TO is a
      // case-insensitive SUBSTRING match per RFC 3501, not an exact-address match -- do not
      // trust the server's filtering alone for a security-sensitive alias guarantee. Re-verify
      // the actual parsed recipient list contains the exact alias address before extracting a
      // code from it.
      const recipients = (parsed.to?.value || []).map((r) => String(r.address || '').toLowerCase());
      if (!recipients.includes(aliasAddress)) {
        return { code: null, messagesSeen: uids.length };
      }
      const body = parsed.text || (parsed.html ? String(parsed.html).replace(/<[^>]+>/g, ' ') : '');
      const code = extractSixDigitCode(body, `uid=${newestUid}`);
      return { code, messagesSeen: uids.length };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Poll for a venture's newest Clerk verification code, bounded by timeoutMs. Fails loud on
 * both connection/auth failure and search timeout, distinguishing the two.
 *
 * Detailed variant: same behavior as fetchVerificationCode, but resolves the mailbox census
 * (messages seen since sentAfter) alongside the code, for callers that need to stamp it
 * (e.g. QF-20260902-512's run-row forensics).
 * @param {object} params
 * @param {string} params.aliasLocalPart — e.g. 'altifyai-uat'
 * @param {Date} [params.sentAfter] — defaults to now minus a small skew, at call time
 * @param {number} [params.timeoutMs=45000]
 * @param {number} [params.pollIntervalMs=3000]
 * @param {Function} [params.ImapFlowImpl] — injection point for tests; defaults to the real ImapFlow client
 * @returns {Promise<{code: string, messagesSeen: number}>}
 */
export async function fetchVerificationCodeDetailed({
  aliasLocalPart,
  sentAfter,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  ImapFlowImpl,
} = {}) {
  if (!aliasLocalPart) {
    throw new Error('imap-code-fetcher: aliasLocalPart is required');
  }
  const user = process.env.VENTURE_UAT_GMAIL_USER;
  const pass = process.env.VENTURE_UAT_GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('imap-code-fetcher: VENTURE_UAT_GMAIL_USER / VENTURE_UAT_GMAIL_APP_PASSWORD must both be set');
  }

  const aliasAddress = buildAliasAddress({ baseUser: user, aliasLocalPart });
  const since = sentAfter || new Date(Date.now() - 60000);
  const deadline = Date.now() + timeoutMs;

  let lastMessagesSeen = 0;
  let attempts = 0;
  let connectionError = null;
  let lastPollError = null;

  while (Date.now() < deadline) {
    attempts += 1;
    try {
      const { code, messagesSeen } = await searchOnce({ user, pass, aliasAddress, sentAfter: since, ImapFlowImpl });
      lastMessagesSeen = messagesSeen;
      lastPollError = null;
      if (code) return { code, messagesSeen: lastMessagesSeen };
    } catch (err) {
      if (err && err.imapConnectionFailure) {
        connectionError = err;
        break; // connection/auth failures are not worth retrying — fail fast, distinctly
      }
      // Non-connection failure (search/fetch/parse/extraction) on this poll attempt --
      // record it but keep polling; the newest matching message may change on the next
      // search (e.g. a later email supersedes an ambiguous/malformed one).
      lastPollError = err;
    }
    if (Date.now() + pollIntervalMs < deadline) {
      await sleep(pollIntervalMs);
    } else {
      break;
    }
  }

  if (connectionError) {
    throw new Error(`imap-code-fetcher: IMAP connection/authentication failed after ${attempts} attempt(s): ${connectionError.message}`);
  }
  const lastErrorSuffix = lastPollError ? `; last poll attempt failed while processing a matched message: ${lastPollError.message}` : '';
  throw new Error(
    `imap-code-fetcher: no verification code found for alias "${aliasLocalPart}" within ${timeoutMs}ms ` +
    `(searched since ${since.toISOString()}, ${attempts} poll attempt(s), last poll saw ${lastMessagesSeen} matching message(s))${lastErrorSuffix}`
  );
}

/**
 * @param {object} params — see fetchVerificationCodeDetailed
 * @returns {Promise<string>} the extracted 6-digit code (backward-compatible bare-string contract)
 */
export async function fetchVerificationCode(params) {
  const { code } = await fetchVerificationCodeDetailed(params);
  return code;
}

export default { fetchVerificationCode, fetchVerificationCodeDetailed, extractSixDigitCode };
