/**
 * SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A: single shared implementation of the
 * "throw on schema drift" wrap, consumed by BOTH client-factory representations
 * -- lib/supabase-client.js (ESM, ~849 importers) and lib/supabase-client.cjs
 * (CJS, ~97 importers). VAL-A-2 (LEAD validation-agent, this SD): hardening only
 * one representation leaves the majority (or, depending on direction, a large
 * minority) of callers unprotected -- "the shared factory" is two files, not one.
 * A single module here, required/imported by both, keeps them from drifting
 * apart the way the two representations already had (lib/supabase-client.cjs's
 * own header claims to be a "re-export" of the .js file but is actually an
 * independent createClient() call site).
 *
 * PREMISE CORRECTED MID-BUILD (Coordinator premise correction 88bc8895, Solomon
 * post-restart audit c96dcda8, 2026-09-03): a missing COLUMN (42703) already
 * surfaces as a PostgREST error today -- rejecting on it is a REGRESSION GUARD,
 * not new coverage. THE SHAPE THAT WAS GENUINELY SILENT, which this module now
 * also covers: a head+count probe against a MISSING RELATION resolves with
 * error:null, count:null, HTTP 204 -- a SUCCESS shape indistinguishable from "0
 * rows" without also checking count. lib/db/safe-query.mjs (safeCount) already
 * documents and covers this for opt-in callers; this module brings the SAME
 * discriminant to the factory seam so it applies to every caller by default,
 * per success criterion #3 ("the shared client factory is the enforcement point
 * rather than an opt-in primitive").
 */

const SCHEMA_DRIFT_ERROR_CODES = new Set(['PGRST205', '42703']);

function isSchemaDriftError(error) {
  return Boolean(error) && SCHEMA_DRIFT_ERROR_CODES.has(error.code);
}

function buildSchemaDriftError(error) {
  const err = new Error(
    `Supabase schema drift detected (${error.code}): ${error.message} -- `
    + 'the client factory throws instead of returning an empty result '
    + '(SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A)'
  );
  err.code = error.code;
  err.cause = error;
  return err;
}

/**
 * Mirrors lib/db/fetch-all-paginated.mjs::renderCount's definition of an
 * unmeasurable count EXACTLY (a finite number is measured; anything else,
 * including null, is not) -- reimplemented rather than imported because that
 * module is ESM-only and this one must stay require()-able SYNCHRONOUSLY from
 * lib/supabase-client.cjs, whose ~97 importers call createSupabaseServiceClient()
 * as a plain sync function. Parity with renderCount is pinned by
 * tests/unit/client-factory-schema-drift-throw.test.js so the two definitions
 * cannot drift apart silently.
 */
function isCountUnavailable(count) {
  return !(typeof count === 'number' && Number.isFinite(count));
}

function buildCountUnavailableError() {
  const err = new Error(
    'Supabase schema drift detected (count unmeasurable): a count-mode query resolved with '
    + 'count=null and no error -- the ONLY signature of a missing relation under a head+count '
    + 'probe (see lib/db/safe-query.mjs safeCount). The client factory throws instead of '
    + 'returning a success-shaped null (SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-A).'
  );
  err.code = 'COUNT_UNMEASURABLE';
  return err;
}

/**
 * Recursively re-wrap the return value of every method call on a PostgREST
 * builder chain (.select().eq().single(), etc.) so that whichever call in the
 * chain is finally awaited/then'd:
 *   - a resolved {error} matching a schema-drift code (PGRST205/42703) rejects
 *     instead of resolving normally (regression guard -- these already error);
 *   - a resolved {error: null, count: null} on a query that explicitly
 *     requested a count rejects too -- the genuinely silent shape a
 *     throw-on-error-code check alone cannot see.
 * Intermediate builder objects (e.g. the result of .from()) are not thenable
 * themselves -- only wrapping every subsequent call's result, not just the
 * first, keeps the interception (and the count-requested tracking below)
 * alive down the whole chain regardless of depth.
 *
 * @param {*} value the builder / thenable to wrap
 * @param {{countRequested: boolean}} [ctx] threaded through every call in one
 *   chain so `.then()` knows whether count was ever explicitly requested
 *   earlier in the SAME chain (e.g. by `.select(cols, {count:'exact'})`).
 *   Freshly created per `.from()`/`.rpc()`/`.schema()` call by
 *   withSchemaDriftDetection below -- never shared across independent queries.
 */
function wrapSchemaDriftDetection(value, ctx = { countRequested: false }) {
  if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
    return value;
  }
  return new Proxy(value, {
    get(target, prop, receiver) {
      if (prop === 'then' && typeof target.then === 'function') {
        // NOTE: onFulfilled/onRejected here are the Promise machinery's OWN internal
        // resolve/reject callbacks (per the thenable-resolution procedure), not ours to
        // wrap-and-return-a-promise-from -- the caller awaiting this proxy is watching
        // for one of THESE two to be CALLED, not for whatever `target.then(...)` returns.
        // A `throw` inside the fulfillment handler below would only reject an unobserved
        // inner promise and leave the real awaiter hanging forever, so drift is signalled
        // by calling onRejected(err) directly instead.
        return (onFulfilled, onRejected) =>
          target.then((result) => {
            const reject = (err) => (typeof onRejected === 'function' ? onRejected(err) : Promise.reject(err));
            if (result && isSchemaDriftError(result.error)) {
              return reject(buildSchemaDriftError(result.error));
            }
            if (result && !result.error && ctx.countRequested && isCountUnavailable(result.count)) {
              return reject(buildCountUnavailableError());
            }
            return typeof onFulfilled === 'function' ? onFulfilled(result) : result;
          }, onRejected);
      }
      const propValue = Reflect.get(target, prop, receiver);
      if (typeof propValue === 'function') {
        return (...args) => {
          // .select(columns, { count: 'exact' | 'planned' | 'estimated', head? }) is the shape
          // that puts a count on the eventual result -- mark it on THIS chain's shared ctx so
          // the terminal `.then()` above (which may be several more calls / re-wraps deeper)
          // knows to apply the count===null discriminant.
          if (prop === 'select' && args[1] && typeof args[1] === 'object' && args[1].count) {
            ctx.countRequested = true;
          }
          return wrapSchemaDriftDetection(propValue.apply(target, args), ctx);
        };
      }
      return propValue;
    },
  });
}

/**
 * Wrap a Supabase client so `.from()`, `.rpc()`, and `.schema()` calls route
 * through wrapSchemaDriftDetection -- see there for how the rejection is
 * applied down the whole builder chain. A fresh ctx per call keeps independent
 * queries (even against the same client) from leaking count-requested state
 * into each other.
 */
function withSchemaDriftDetection(client) {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'from' || prop === 'rpc' || prop === 'schema') {
        const fn = Reflect.get(target, prop, receiver);
        return (...args) => wrapSchemaDriftDetection(fn.apply(target, args), { countRequested: false });
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

module.exports = {
  SCHEMA_DRIFT_ERROR_CODES,
  isSchemaDriftError,
  buildSchemaDriftError,
  isCountUnavailable,
  buildCountUnavailableError,
  wrapSchemaDriftDetection,
  withSchemaDriftDetection,
};
