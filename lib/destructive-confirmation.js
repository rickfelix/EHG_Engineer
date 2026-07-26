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
 * WHAT THIS IS NOT: this is NOT a CSRF control and must never be described as one.
 * requireAuth (server/middleware/auth.js) accepts only non-ambient credentials —
 * x-internal-api-key and Authorization: Bearer — there is zero cookie usage in the
 * server, and an HTML form cannot set custom headers, so cross-origin forgery already
 * fails with a 401. The exposure being closed here is IRREVERSIBILITY: an authenticated
 * operator, or anyone holding a leaked token, gets no second step today.
 *
 * TOKEN LIFECYCLE (PRD TR-3 requires this be specified, not left implicit):
 *   - STATELESS. The token is an HMAC over (operation, sorted target ids, issuedAt).
 *     A server-side Map was rejected: this server can run multi-process, and a token
 *     store that lives in one process would refuse a valid confirmation handled by
 *     another — failing closed, but unpredictably and invisibly.
 *   - BOUND TO THE TARGET SET. Re-using a token against a different id set changes the
 *     HMAC input, so it will not verify.
 *   - EXPIRES after TOKEN_TTL_MS (5 min).
 *   - REPLAY: not separately tracked, and it does not need to be for THIS operation
 *     class. Execution requires expected_count to equal the live count at execution
 *     time, and a successful teardown changes that count — so a replayed token against
 *     an already-executed target set is refused by the staleness check. State that
 *     limit explicitly rather than implying single-use we do not enforce: a token
 *     replayed inside the TTL against a target set that has NOT changed WOULD pass,
 *     which is the operator re-submitting an identical, still-accurate confirmation.
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
};

export function resolveConfirmSecret(env = process.env) {
  return env.DESTRUCTIVE_CONFIRM_SECRET || env.INTERNAL_API_KEY || null;
}

function canonical(operation, targetIds) {
  return `${operation}:${[...targetIds].map(String).sort().join(',')}`;
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
export function evaluateConfirmation({ body = {}, operation, targetIds, env = process.env, nowMs = Date.now() }) {
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
