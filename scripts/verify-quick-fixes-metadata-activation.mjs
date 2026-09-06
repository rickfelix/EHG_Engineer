#!/usr/bin/env node
/**
 * Activation-invariant verification for quick_fixes.metadata (SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F).
 *
 * quick_fixes.metadata is a chairman-gated column (database/chairman-gated/
 * 20260906_add_quick_fixes_metadata_column.sql) -- not yet applied in production. This script
 * verifies the activation invariant for the stampClaim()/mergeQfMetadataKeys() chain built by
 * sibling SD -E, WITHOUT ever applying that migration itself (a worker cannot self-authorize the
 * chairman's 3-factor apply ceremony).
 *
 * RUNBOOK (chairman/coordinator, immediately after the migration is applied):
 *   node scripts/verify-quick-fixes-metadata-activation.mjs
 *   -- ACTIVATED means the chain writes and reads back a real pick_reason-bearing claim_history
 *      entry: the migration + chain are genuinely live. REGRESSED means the column exists but the
 *      chain itself is broken -- a real defect, file it. INDETERMINATE means a connection/
 *      environmental problem prevented a real answer -- retry, do not treat as a code defect.
 *      NOT_YET_APPLIED means the migration has not landed yet (nothing to verify).
 *
 * Design (TESTING-agent evidence 65c242f0-9c7c-4d4e-b5ba-af330a915e1a, prospective review):
 *  - Four exit states because two failure MODES are not the same claim: REGRESSED asserts a
 *    definite chain defect; INDETERMINATE means the probe could not get a definite answer at all
 *    (connect_failed / unclassified error) and must never be reported as if it were REGRESSED.
 *  - The schema-presence probe uses a raw pg client (createDatabaseClient), never
 *    supabase-js/PostgREST -- PostgREST's schema cache can still report a stale 42703
 *    immediately after the column is added, exactly when this runbook is run.
 *  - stampClaim()'s QF branch (lib/fleet/claim-stamp.cjs) collapses mergeQfMetadataKeys's
 *    {merged, reason} into a bare entry-or-null return. This script passes stampClaim() a
 *    wrapper as opts.mergeQfMetadataFn that delegates to the real mergeQfMetadataKeys and
 *    captures the full {merged, reason} result in a closure variable, so both stampClaim()'s
 *    return AND the underlying reason discriminator come from one real call.
 *  - Core logic is exported as resolveActivationState({ dbClientFactory, mergeQfMetadataFn,
 *    stampClaimFn }) so unit tests can inject fakes for ACTIVATED/REGRESSED/INDETERMINATE
 *    without touching live schema or a real DB connection at all -- scripts/lib/
 *    supabase-connection.js exposes only the ehg/engineer projects, both live production
 *    databases with no staging equivalent, so no live test may safely simulate the column
 *    existing (ADD COLUMN would either BE the gated migration, or require a destructive DROP).
 *  - The live probe's scratch QF is born already CLAIMED (non-null claiming_session_id) and
 *    non-'open' from the very first insert, so it can never satisfy lib/fleet/belt-depth.cjs's
 *    auto-start predicate (status='open' AND pr_url IS NULL AND commit_sha IS NULL AND
 *    claiming_session_id IS NULL) even transiently, and its id matches /^QF-/ so stampClaim()'s
 *    QF_ID_RE auto-detect routes it correctly (an id that didn't match would silently fall
 *    through to the SD branch instead, invalidating the whole probe with no visible error).
 */
import { createRequire } from 'node:module';
import { createDatabaseClient } from './lib/supabase-connection.js';
import { mergeQfMetadataKeys as realMergeQfMetadataKeys } from '../lib/fleet/qf-metadata-merge.mjs';
import { isMainModule } from '../lib/utils/is-main-module.js';

const { stampClaim } = createRequire(import.meta.url)('../lib/fleet/claim-stamp.cjs');

export const EXIT_CODES = { NOT_YET_APPLIED: 0, ACTIVATED: 0, REGRESSED: 1, INDETERMINATE: 2 };

/** Real dbClientFactory: raw pg client against the 'engineer' project (never supabase-js/PostgREST). */
async function defaultDbClientFactory() {
  return createDatabaseClient('engineer', { verify: false });
}

/**
 * Probes whether quick_fixes.metadata exists, via a raw pg SELECT (never PostgREST -- its
 * schema cache can report a stale 42703 immediately after the column is actually added).
 * @returns {Promise<{present: boolean} | {present: false, indeterminate: true, error: string}>}
 */
export async function probeColumnPresent(dbClientFactory) {
  let client;
  try {
    client = await dbClientFactory();
  } catch (err) {
    return { present: false, indeterminate: true, error: err && err.message };
  }
  try {
    await client.query('SELECT metadata FROM quick_fixes LIMIT 0');
    return { present: true };
  } catch (err) {
    if (err && err.code === '42703') return { present: false };
    return { present: false, indeterminate: true, error: err && err.message };
  } finally {
    try { await client.end(); } catch { /* best-effort close */ }
  }
}

/**
 * Core, injectable classification logic. No live DB access required when fakes are injected.
 * @param {object} deps
 * @param {() => Promise<object>} [deps.dbClientFactory] - resolves a raw pg client (real: 'engineer' project).
 * @param {(qfId: string, sessionId: string, entry: object) => Promise<{merged: boolean, reason?: string}>} [deps.mergeQfMetadataFn] - real: lib/fleet/qf-metadata-merge.mjs's mergeQfMetadataKeys.
 * @param {Function} [deps.stampClaimFn] - real: lib/fleet/claim-stamp.cjs's stampClaim.
 * @param {() => string} [deps.scratchIdFn] - generates the scratch QF id (must match /^QF-/).
 * @param {(qfId: string, sessionId: string) => Promise<void>} [deps.insertScratchQfFn] - creates the scratch row, already claimed + non-open.
 * @param {(qfId: string, sessionId: string) => Promise<void>} [deps.deleteScratchQfFn] - deletes the scratch row (called in finally).
 * @returns {Promise<{state: 'NOT_YET_APPLIED'|'ACTIVATED'|'REGRESSED'|'INDETERMINATE', exitCode: number, detail: string}>}
 */
export async function resolveActivationState(deps = {}) {
  const dbClientFactory = deps.dbClientFactory || defaultDbClientFactory;
  const mergeQfMetadataFn = deps.mergeQfMetadataFn || realMergeQfMetadataKeys;
  const stampClaimFn = deps.stampClaimFn || stampClaim;
  const scratchIdFn = deps.scratchIdFn || (() => `QF-VERIFYACT-${process.pid}-${Date.now().toString(36)}`.toUpperCase());
  const insertScratchQfFn = deps.insertScratchQfFn || null;
  const deleteScratchQfFn = deps.deleteScratchQfFn || null;

  const probe = await probeColumnPresent(dbClientFactory);
  if (probe.indeterminate) {
    return { state: 'INDETERMINATE', exitCode: EXIT_CODES.INDETERMINATE, detail: `schema probe failed: ${probe.error} (environmental/transient, not a code defect)` };
  }
  if (!probe.present) {
    return { state: 'NOT_YET_APPLIED', exitCode: EXIT_CODES.NOT_YET_APPLIED, detail: 'quick_fixes.metadata does not exist yet (chairman-gated migration unapplied). Zero writes made.' };
  }

  // Column present: drive a real (or injected) self-claim through stampClaim(), wrapping
  // mergeQfMetadataFn to capture BOTH the entry-or-null return and the {merged, reason}
  // discriminator stampClaim()'s own return value discards.
  const qfId = scratchIdFn();
  const sessionId = `verify-activation-probe-${process.pid}-${Date.now().toString(36)}`;
  let capturedResult = null;
  const wrappedMergeFn = async (id, sess, entry) => {
    capturedResult = await mergeQfMetadataFn(id, sess, entry);
    return capturedResult;
  };

  let result;
  try {
    if (insertScratchQfFn) {
      try {
        await insertScratchQfFn(qfId, sessionId);
      } catch (err) {
        // TESTING-AGENT FINDING (evidence a9bac2fa, BLOCKING, now resolved): the prior
        // insert call never checked its own error and let a failed insert fall through
        // silently, so the CAS-guarded UPDATE that followed matched 0 rows and got
        // misclassified as REGRESSED ("a real defect in the chain") -- an insert failure
        // is an environmental/setup problem, never a chain defect.
        result = { state: 'INDETERMINATE', exitCode: EXIT_CODES.INDETERMINATE, detail: `scratch QF insert failed: ${err && err.message} -- environmental/setup problem, not a code defect.` };
        return result;
      }
    }
    const entry = await stampClaimFn({}, qfId, sessionId, 'verify-activation-probe', null, { mergeQfMetadataFn: wrappedMergeFn });

    if (entry && capturedResult && capturedResult.merged) {
      const hasPickReason = Object.prototype.hasOwnProperty.call(entry, 'pick_reason');
      result = hasPickReason
        ? { state: 'ACTIVATED', exitCode: EXIT_CODES.ACTIVATED, detail: `real pick_reason-bearing claim_history entry written and returned for ${qfId}.` }
        : { state: 'REGRESSED', exitCode: EXIT_CODES.REGRESSED, detail: 'merge reported success but the returned entry has no pick_reason -- a real defect in the write path.' };
      return result;
    }

    const reason = capturedResult && capturedResult.reason;
    if (reason === 'connect_failed' || !reason) {
      result = { state: 'INDETERMINATE', exitCode: EXIT_CODES.INDETERMINATE, detail: `merge could not reach a definite answer (reason=${reason || 'unknown'}) -- environmental/transient, not a code defect.` };
      return result;
    }
    // column_absent should be impossible here (we just confirmed presence) -- if it still
    // occurs, that itself is a real (if surprising) defect: treat as REGRESSED, not swallowed.
    result = { state: 'REGRESSED', exitCode: EXIT_CODES.REGRESSED, detail: `merge returned a definite failure reason=${reason} -- a real defect in the chain.` };
    return result;
  } finally {
    // SECURITY FINDING SEC-F2 (evidence d0d0aaa7, now resolved): supabase-js .delete()
    // resolves with {error} instead of throwing, so a bare empty catch here could never
    // surface a server-side cleanup refusal (RLS/constraint) -- an orphaned production row
    // must never be silent. realDeleteScratchQf now throws on {error}, and that failure is
    // surfaced in result.detail (the verdict/state/exitCode are left unchanged: cleanup
    // failing does not itself mean the chain is broken).
    if (deleteScratchQfFn) {
      try {
        await deleteScratchQfFn(qfId, sessionId);
      } catch (err) {
        if (result) result.detail += ` [CLEANUP FAILED: scratch row ${qfId} may be orphaned -- ${err && err.message}]`;
      }
    }
  }
}

/**
 * The real scratch-row payload: born claimed + non-open (never belt-auto-startable, per
 * lib/fleet/belt-depth.cjs's auto-start predicate: status='open' AND pr_url IS NULL AND
 * commit_sha IS NULL AND claiming_session_id IS NULL). Exported so a unit test can assert the
 * ACTUAL payload shape, not just what a test double happens to receive.
 * TESTING-AGENT FINDING (evidence a9bac2fa, BLOCKING, now resolved): target_application is
 * required by the live trg_quick_fixes_validate_target_application trigger (RAISE EXCEPTION on
 * NULL) -- its prior absence made every real insert fail.
 */
export function buildScratchQfInsertPayload(qfId, sessionId) {
  return {
    id: qfId,
    title: 'ACTIVATION PROBE (SD-LEO-INFRA-PRIORITY-RECORD-ONE-001-F): safe to delete',
    type: 'bug',
    severity: 'low',
    description: 'Scratch QF created by scripts/verify-quick-fixes-metadata-activation.mjs',
    status: 'in_progress',
    claiming_session_id: sessionId,
    target_application: 'EHG_Engineer',
  };
}

async function realInsertScratchQf(supabase, qfId, sessionId) {
  const { error } = await supabase.from('quick_fixes').insert(buildScratchQfInsertPayload(qfId, sessionId));
  if (error) throw new Error(`insert failed: ${error.message}`);
}
async function realDeleteScratchQf(supabase, qfId) {
  const { error } = await supabase.from('quick_fixes').delete().eq('id', qfId);
  if (error) throw new Error(`delete failed: ${error.message}`);
}

async function run() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const result = await resolveActivationState({
    insertScratchQfFn: (qfId, sessionId) => realInsertScratchQf(supabase, qfId, sessionId),
    deleteScratchQfFn: (qfId) => realDeleteScratchQf(supabase, qfId),
  });
  console.log(`${result.state}: ${result.detail}`);
  process.exitCode = result.exitCode;
}

if (isMainModule(import.meta.url)) {
  run().catch((e) => {
    console.error(`verify-quick-fixes-metadata-activation: ${e.message}`);
    process.exitCode = EXIT_CODES.INDETERMINATE;
  });
}
