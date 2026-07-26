/**
 * Destructive-action confirmation gate.
 * SD-LEO-INFRA-DESTRUCTIVE-ACTION-SAFETY-001 FR-1.
 *
 * WHY THIS EXISTS: three routes in server/routes/ventures.js loop the same irreversible
 * deleteVentureFully helper — /master-reset, /:id/full-delete and /bulk-full-delete.
 * deleteVentureFully drops GitHub repos and rewrites applications/registry.json, and
 * there is no undo, so a single authenticated POST could destroy the whole portfolio.
 * bulk-full-delete accepts an arbitrary ids[] array, which makes it equivalent to
 * master-reset at n = every venture.
 *
 * WHAT THIS IS NOT — and this section is deliberately blunt, because an overstated safety
 * comment is the exact defect this SD exists to eliminate. The original carve-out survived
 * undetected because a comment asserted a check that did not exist.
 *
 * NOT A CSRF CONTROL. requireAuth (server/middleware/auth.js) accepts only non-ambient
 * credentials — x-internal-api-key and Authorization: Bearer — there is zero cookie usage
 * in the server, and an HTML form cannot set custom headers, so cross-origin forgery
 * already fails with a 401.
 *
 * NOT A CONTROL AGAINST A LEAKED CREDENTIAL. An earlier draft of this comment claimed it
 * was. It is not, for two independent reasons:
 *   - The 428 preview HANDS the caller a valid token. Anyone who can make the first
 *     request can make the second. Two scripted calls defeat it.
 *   - resolveConfirmSecret falls back to INTERNAL_API_KEY — the very credential requireAuth
 *     accepts — so a holder of that key can also FORGE a token offline. The key that
 *     authenticates is the key that signs.
 * Set DESTRUCTIVE_CONFIRM_SECRET to a distinct value to break that second equivalence. It
 * still does not make this a credential control, because of the first reason.
 *
 * WHAT IT ACTUALLY BUYS, which is worth having on its own: an operator cannot destroy the
 * portfolio by ACCIDENT — no misfired curl, no stale script, no fat-fingered client, no
 * replayed request against a target set that has since changed. It converts a
 * one-request-and-it-is-gone endpoint into a deliberate two-step act with a recorded
 * intent and a staleness check. That is IRREVERSIBILITY mitigation, not authorization.
 *
 * TOKEN LIFECYCLE (PRD TR-3 requires this be specified, not left implicit):
 *   - STATELESS. The token is an HMAC over (operation, sorted target ids, issuedAt).
 *     A server-side Map was rejected: this server can run multi-process, and a token
 *     store that lives in one process would refuse a valid confirmation handled by
 *     another — failing closed, but unpredictably and invisibly.
 *   - BOUND TO THE TARGET SET. Re-using a token against a different id set changes the
 *     HMAC input, so it will not verify.
 *   - EXPIRES after TOKEN_TTL_MS (5 min).
 *   - REPLAY: not separately tracked. AN EARLIER VERSION OF THIS COMMENT JUSTIFIED THAT BY
 *     CLAIMING expected_count MUST EQUAL THE LIVE COUNT, SO A REPLAY AFTER EXECUTION WOULD
 *     BE REFUSED. THAT IS TRUE FOR ONLY ONE OF THE THREE ROUTES, and asserting it generally
 *     was the same defect this SD exists to eliminate — a comment describing a check that
 *     does not exist for the path in question.
 *       * /master-reset: targetIds come from a LIVE query (ventures.js), so the staleness
 *         check is real. A replay after execution is genuinely refused.
 *       * /:id/full-delete and /bulk-full-delete: targetIds come from the REQUEST
 *         (req.params.id / req.body.ids), so `expected_count !== targetIds.length` compares
 *         the caller's number against the caller's own array length. It is true regardless
 *         of database state. THE STALENESS CHECK IS VACUOUS ON THESE TWO ROUTES, and a
 *         replay inside the TTL is unconditionally accepted — including on bulk-full-delete,
 *         which is equivalent in effect to a master reset at n = every venture.
 *     Exploit value is low (the replayer must already be authenticated, and a re-run against
 *     already-deleted ventures is close to a no-op), but the claim had to be corrected.
 *     THE FIX, tracked and not yet applied: resolve submitted ids against the live table in
 *     bulk-full-delete and use the RETURNED ROWS as targetIds. That makes the target set
 *     server-derived, makes the staleness check real, refuses replay-after-execution, and
 *     stops non-UUID ids reaching both the HMAC and the audit row.
 */

import crypto from 'node:crypto';

export const CONFIRM_ACK_PHRASE = 'DELETE PERMANENTLY';
export const TOKEN_TTL_MS = 5 * 60 * 1000;

/** Refusal codes are stable strings so callers can branch on them, not on prose. */
export const CODES = {
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  CONFIRMATION_UNAVAILABLE: 'CONFIRMATION_UNAVAILABLE',
  ACK_INVALID: 'ACK_INVALID',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  COUNT_MISMATCH: 'COUNT_MISMATCH',
  TARGET_IDS_INVALID: 'TARGET_IDS_INVALID',
};

export function resolveConfirmSecret(env = process.env) {
  return env.DESTRUCTIVE_CONFIRM_SECRET || env.INTERNAL_API_KEY || null;
}

function canonical(operation, targetIds) {
  // LENGTH-PREFIXED, not comma-joined. A plain `join(',')` is not injective: a token minted
  // for the single id 'aaa,bbb' would verify against the two ids ['aaa','bbb'], because both
  // canonicalise to the same string. bulk-full-delete does not UUID-validate its ids, so that
  // collision is reachable. No privilege escalation follows from it, but it contradicts the
  // bound-to-target-set property this function exists to provide, and a claimed invariant that
  // does not hold is worse than none.
  // REJECT non-strings rather than String()-coercing them. Length-prefixing fixed the
  // join(',') collision at THIS level, but coercion reintroduced it one level up via
  // Array.prototype.toString: a token minted for [['a','b']] canonicalised identically to
  // one for ['a,b'], and [{a:1}] identically to [{b:2}] (both '[object Object]'). bulk ids
  // are not UUID-validated, so those shapes are reachable. None are valid venture ids and
  // no escalation follows — but the bound-to-target-set property is the whole point of this
  // function, and a claimed invariant that does not hold is worse than none.
  const ids = [...targetIds];
  if (!ids.every(id => typeof id === 'string')) {
    throw new TypeError('[destructive-confirmation] target ids must be strings; refusing to canonicalise a coerced value.');
  }
  return `${operation}:${ids.length}:${ids.sort().map(id => `${id.length}:${id}`).join('')}`;
}

export function issueToken({ operation, targetIds, issuedAtMs, secret }) {
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${canonical(operation, targetIds)}:${issuedAtMs}`)
    .digest('hex');
  return `${issuedAtMs}.${sig}`;
}

function tokenMatches({ token, operation, targetIds, secret, nowMs }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return CODES.TOKEN_INVALID;
  const issuedAtMs = Number(parts[0]);
  if (!Number.isFinite(issuedAtMs)) return CODES.TOKEN_INVALID;
  if (nowMs - issuedAtMs > TOKEN_TTL_MS || issuedAtMs > nowMs) return CODES.TOKEN_EXPIRED;

  const expected = issueToken({ operation, targetIds, issuedAtMs, secret });
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  // timingSafeEqual throws on length mismatch, so compare length first.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return CODES.TOKEN_INVALID;
  return null;
}

/**
 * Decide whether an irreversible operation may proceed.
 *
 * FAIL-CLOSED (PRD FR-4): every path that is not an affirmative, verified confirmation
 * returns ok:false. Refusing to delete can never cause data loss, so refusal is the
 * safe direction for an irreversible operation; that is why a missing secret refuses
 * rather than waving the request through. The blast radius is bounded to THIS
 * operation — nothing here can affect unrelated venture routes.
 *
 * There is deliberately NO environment variable that bypasses this gate (PRD FR-4).
 *
 * @returns {{ok: true} | {ok: false, status: number, body: object}}
 */
export function evaluateConfirmation({ body: rawBody, operation, targetIds, env = process.env, nowMs = Date.now() }) {
  // `body = {}` as a DEFAULT PARAMETER does not cover an explicit null — only undefined —
  // so a JSON `null` body threw here rather than refusing. Normalise instead.
  const body = (rawBody && typeof rawBody === 'object') ? rawBody : {};
  // Refuse non-string ids HERE rather than letting canonical() throw, so the caller gets a
  // clean 400 instead of a 500. bulk-full-delete does not UUID-validate req.body.ids, so
  // objects and nested arrays are reachable inputs.
  if (!Array.isArray(targetIds) || !targetIds.every(id => typeof id === 'string')) {
    return {
      ok: false,
      status: 400,
      body: { success: false, code: CODES.TARGET_IDS_INVALID, error: 'Target ids must be an array of strings.' },
    };
  }

  const secret = resolveConfirmSecret(env);
  const expectedCount = targetIds.length;

  if (!secret) {
    // Fail CLOSED. No secret means we cannot verify intent, so we refuse rather than
    // execute an irreversible teardown on an unverifiable request.
    return {
      ok: false,
      status: 503,
      body: {
        success: false,
        code: CODES.CONFIRMATION_UNAVAILABLE,
        error: 'Destructive-action confirmation is not configured on this server; refusing.',
      },
    };
  }

  const preview = () => ({
    ok: false,
    status: 428,
    body: {
      success: false,
      code: CODES.CONFIRMATION_REQUIRED,
      operation,
      expected_count: expectedCount,
      target_ids: targetIds,
      confirmation_token: issueToken({ operation, targetIds, issuedAtMs: nowMs, secret }),
      acknowledgement_required: CONFIRM_ACK_PHRASE,
      expires_in_ms: TOKEN_TTL_MS,
      message:
        `This operation irreversibly deletes ${expectedCount} venture(s) and cannot be undone. ` +
        `Re-send with confirmation_token, acknowledgement "${CONFIRM_ACK_PHRASE}", and expected_count.`,
    },
  });

  if (body.confirmation_token === undefined && body.acknowledgement === undefined) return preview();

  if (body.acknowledgement !== CONFIRM_ACK_PHRASE) {
    return { ok: false, status: 400, body: { success: false, code: CODES.ACK_INVALID, error: `acknowledgement must be exactly "${CONFIRM_ACK_PHRASE}".` } };
  }

  const tokenFailure = tokenMatches({ token: body.confirmation_token, operation, targetIds, secret, nowMs });
  if (tokenFailure) {
    return { ok: false, status: 400, body: { success: false, code: tokenFailure, error: 'confirmation_token is not valid for this target set.' } };
  }

  // Staleness: the operator confirmed against a snapshot. If the live target set has
  // changed since, their intent no longer describes what would happen — refuse.
  if (Number(body.expected_count) !== expectedCount) {
    return {
      ok: false,
      status: 409,
      body: { success: false, code: CODES.COUNT_MISMATCH, error: `expected_count ${body.expected_count} no longer matches the live count ${expectedCount}.`, expected_count: expectedCount },
    };
  }

  return { ok: true };
}
