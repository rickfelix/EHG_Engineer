#!/usr/bin/env node

/**
 * Stage Zero Work Queue Processor
 *
 * Polls the stage_zero_requests table for pending items submitted by the
 * Explore Opportunities UI, claims them, executes the appropriate Stage 0
 * path via executeStageZero(), and writes results back to the database.
 *
 * Usage:
 *   node scripts/stage-zero-queue-processor.js          # Continuous polling
 *   node scripts/stage-zero-queue-processor.js --once    # Single pass then exit
 *
 * Environment:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   STAGE_ZERO_POLL_INTERVAL_SECONDS  (default: 30)
 *   STAGE_ZERO_STALE_CLAIM_MINUTES    (default: 30)
 *   STAGE_ZERO_EXECUTION_TIMEOUT_MS   (default: 300000 = 5 min)
 *
 * SD: SD-MAN-INFRA-STAGE-ZERO-WORK-001
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { executeStageZero } from '../lib/eva/stage-zero/stage-zero-orchestrator.js';
import { randomUUID } from 'crypto';

// ── Configuration ──────────────────────────────────────────────────

const POLL_INTERVAL_S = parseInt(process.env.STAGE_ZERO_POLL_INTERVAL_SECONDS || '30', 10);
const STALE_CLAIM_MIN = parseInt(process.env.STAGE_ZERO_STALE_CLAIM_MINUTES || '30', 10);
const EXECUTION_TIMEOUT_MS = parseInt(process.env.STAGE_ZERO_EXECUTION_TIMEOUT_MS || '300000', 10);
// SD-LEO-FIX-FIX-STAGE-QUEUE-001: bound stale-claim re-processing so a request that keeps
// stalling/failing without producing a venture is failed-terminal instead of looping forever.
const MAX_ATTEMPTS = parseInt(process.env.STAGE_ZERO_MAX_ATTEMPTS || '3', 10);
// SD-LEO-FIX-FIX-STAGE-QUEUE-001: narrow same-user window for conservative discovery_mode dedup.
const DISCOVERY_DEDUP_MIN = parseInt(process.env.STAGE_ZERO_DISCOVERY_DEDUP_MINUTES || '10', 10);
const ONCE_MODE = process.argv.includes('--once');
const SESSION_ID = `sz-processor-${randomUUID().slice(0, 8)}`;

// ── Supabase Client (service role) ─────────────────────────────────

function createServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables');
  }
  return createClient(url, key);
}

// ── Logging ────────────────────────────────────────────────────────

const log = {
  log: (...args) => console.log(`[${new Date().toISOString()}] [SZ-PROC]`, ...args),
  info: (...args) => console.log(`[${new Date().toISOString()}] [SZ-PROC]`, ...args),
  warn: (...args) => console.warn(`[${new Date().toISOString()}] [SZ-PROC] WARN:`, ...args),
  error: (...args) => console.error(`[${new Date().toISOString()}] [SZ-PROC] ERROR:`, ...args),
};

// ── Request → Venture Linkage (idempotency core) ───────────────────

// SD-LEO-FIX-FIX-STAGE-QUEUE-001: Determine whether a request already produced a venture.
// The request's own venture_id is only written in the SAME terminal update as status='completed',
// so a process death between venture creation and that write leaves venture_id NULL. To stay
// idempotent across that window we ALSO check the durable back-reference stamped into the venture
// (metadata.stage_zero.stage_zero_request_id). Returns { id, source } or null. Fails OPEN (returns
// null) on lookup error so a transient read failure never blocks legitimate processing.
async function findVentureForRequest(supabase, request) {
  if (request.venture_id) {
    return { id: request.venture_id, source: 'request.venture_id' };
  }

  const { data, error } = await supabase
    .from('ventures')
    .select('id')
    .eq('metadata->stage_zero->>stage_zero_request_id', request.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    log.warn(`Venture-link lookup failed for request ${request.id}:`, error.message);
    return null; // fail-open
  }
  return data ? { id: data.id, source: 'venture.metadata.stage_zero_request_id' } : null;
}

// ── Stale Claim Recovery ───────────────────────────────────────────

// SD-LEO-FIX-FIX-STAGE-QUEUE-001: Venture-aware stale-claim sweep. The previous version blindly
// reset every stale claimed/in_progress row to 'pending' with no check for an already-created
// venture — so a request whose venture was created (but whose 'completed' write was lost to a
// process death) got re-queued and re-synthesized into ANOTHER venture (the 131-duplicate runaway).
// Now each stale row is classified:
//   (a) venture already exists → move terminal 'completed' + backfill venture_id (NEVER re-pend);
//   (b) no venture, attempts < cap → re-pend with processing_attempts incremented;
//   (c) no venture, attempts >= cap → fail-terminal (bounded retry, no infinite loop).
async function releaseStaleClaims(supabase) {
  const staleThreshold = new Date(Date.now() - STALE_CLAIM_MIN * 60 * 1000).toISOString();

  const { data: staleRows, error } = await supabase
    .from('stage_zero_requests')
    .select('id, venture_id, processing_attempts, metadata')
    .in('status', ['claimed', 'in_progress'])
    .lt('claimed_at', staleThreshold);

  if (error) {
    log.warn('Failed to fetch stale claims:', error.message);
    return 0;
  }
  if (!staleRows || staleRows.length === 0) return 0;

  let repended = 0, completed = 0, failed = 0;

  for (const row of staleRows) {
    // (a) Already produced a venture — record it, never re-synthesize.
    const venture = await findVentureForRequest(supabase, row);
    if (venture) {
      await updateStatus(supabase, row.id, {
        status: 'completed',
        venture_id: venture.id,
        claimed_by_session: null,
        completed_at: new Date().toISOString(),
      });
      completed++;
      continue;
    }

    // (b)/(c) No venture — bounded retry.
    const attempts = (row.processing_attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await updateStatus(supabase, row.id, {
        status: 'failed',
        processing_attempts: attempts,
        claimed_by_session: null,
        error_message: `Exceeded STAGE_ZERO_MAX_ATTEMPTS (${MAX_ATTEMPTS}) without producing a venture`,
        error_details: { error_type: 'attempt_cap_exceeded', attempts },
        completed_at: new Date().toISOString(),
      });
      failed++;
    } else {
      await updateStatus(supabase, row.id, {
        status: 'pending',
        processing_attempts: attempts,
        claimed_by_session: null,
        claimed_at: null,
      });
      repended++;
    }
  }

  if (repended || completed || failed) {
    log.info(`Stale-claim sweep (>${STALE_CLAIM_MIN}min): ${repended} re-pended, ${completed} completed (venture existed), ${failed} failed-terminal (>=${MAX_ATTEMPTS} attempts)`);
  }
  return repended;
}

// ── Poll for Next Pending Request ──────────────────────────────────

async function fetchNextPending(supabase) {
  const { data, error } = await supabase
    .from('stage_zero_requests')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.error('Failed to fetch pending request:', error.message);
    return null;
  }
  return data;
}

// ── Atomic Claim ───────────────────────────────────────────────────

async function claimRequest(supabase, requestId) {
  const { data, error } = await supabase
    .from('stage_zero_requests')
    .update({
      status: 'claimed',
      claimed_by_session: SESSION_ID,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')  // Optimistic concurrency — only if still pending
    .select('*')
    .maybeSingle();

  if (error) {
    log.warn(`Failed to claim request ${requestId}:`, error.message);
    return null;
  }
  return data; // null if another session claimed first
}

// ── Map Request to executeStageZero Parameters ─────────────────────

function mapRequestToParams(request) {
  const path = request.metadata?.path || 'blueprint_browse';

  switch (path) {
    case 'blueprint_browse':
      return {
        path: 'blueprint_browse',
        pathParams: {
          blueprintId: request.blueprint_id,
          customizations: request.metadata?.customizations || {},
        },
        options: { nonInteractive: true },
      };

    case 'competitor_teardown':
      return {
        path: 'competitor_teardown',
        pathParams: {
          urls: request.metadata?.urls || [],
        },
        options: { nonInteractive: true },
      };

    case 'discovery_mode':
      return {
        path: 'discovery_mode',
        pathParams: {
          strategy: request.metadata?.strategy || 'trend_scanner',
          // SD-LEO-FIX-FIX-STAGE-QUEUE-001: the Explore UI writes metadata.candidateCount
          // (camelCase); read both casings so the value is not silently dropped to the default.
          candidateCount: request.metadata?.candidate_count ?? request.metadata?.candidateCount ?? 5,
          constraints: request.metadata?.constraints || {},
        },
        options: { nonInteractive: true },
      };

    default:
      throw new Error(`Unknown Stage Zero path: "${path}". Expected: blueprint_browse, competitor_teardown, or discovery_mode`);
  }
}

// ── Update Request Status ──────────────────────────────────────────

async function updateStatus(supabase, requestId, updates) {
  const { error } = await supabase
    .from('stage_zero_requests')
    .update(updates)
    .eq('id', requestId);

  if (error) {
    log.error(`Failed to update request ${requestId}:`, error.message);
  }
}

// ── Execute with Timeout ───────────────────────────────────────────

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Stage Zero execution timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ── Deduplication ─────────────────────────────────────────────────

// SD-LEO-FIX-FIX-STAGE-QUEUE-001: normalized dedup key for discovery_mode requests.
// Reads candidate count from both casings (see mapRequestToParams) so the key is stable.
function discoveryDedupKey(metadata = {}) {
  const strategy = metadata.strategy || 'trend_scanner';
  const candidateCount = metadata.candidate_count ?? metadata.candidateCount ?? 5;
  const constraints = JSON.stringify(metadata.constraints || {});
  return `${strategy}::${candidateCount}::${constraints}`;
}

// SD-LEO-FIX-FIX-STAGE-QUEUE-001: conservative discovery_mode dedup. Discovery is intentionally
// stochastic, so we never collapse independent requests; we only suppress an accidental
// re-submission — an identical request (same requester + same strategy/constraints/candidateCount)
// that already completed within DISCOVERY_DEDUP_MIN. Same-requester scoped; never copies one user's
// result onto another's request.
async function findRecentDiscoveryDuplicate(supabase, request) {
  if (!request.requested_by) return null; // cannot scope safely without a requester
  const since = new Date(Date.now() - DISCOVERY_DEDUP_MIN * 60 * 1000).toISOString();
  const key = discoveryDedupKey(request.metadata);

  const { data, error } = await supabase
    .from('stage_zero_requests')
    .select('id, result, metadata')
    .eq('status', 'completed')
    .eq('requested_by', request.requested_by)
    .gt('completed_at', since)
    .neq('id', request.id)
    .order('completed_at', { ascending: false })
    .limit(10);

  if (error || !data) return null;
  const match = data.find(r =>
    (r.metadata?.path || 'blueprint_browse') === 'discovery_mode' &&
    discoveryDedupKey(r.metadata) === key &&
    r.result
  );
  return match || null;
}

async function checkForDuplicate(supabase, request) {
  const path = request.metadata?.path || 'blueprint_browse';

  // blueprint_browse: dedup against a recent completed run for the same blueprint (unchanged).
  if (path === 'blueprint_browse' && request.blueprint_id) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour lookback

    const { data, error } = await supabase
      .from('stage_zero_requests')
      .select('id, result')
      .eq('status', 'completed')
      .eq('blueprint_id', request.blueprint_id)
      .gt('completed_at', since)
      .neq('id', request.id)
      .limit(1)
      .maybeSingle();

    if (error || !data?.result) return null;
    return data;
  }

  // discovery_mode: conservative same-user accidental-resubmit suppression.
  if (path === 'discovery_mode') {
    return await findRecentDiscoveryDuplicate(supabase, request);
  }

  return null;
}

// ── Process a Single Request ───────────────────────────────────────

async function processRequest(supabase, request) {
  log.info(`Processing request ${request.id} | path=${request.metadata?.path || 'blueprint_browse'} | priority=${request.priority}`);

  // SD-LEO-FIX-FIX-STAGE-QUEUE-001: idempotency guard. If this exact request already produced a
  // venture (its own venture_id, OR a venture stamped with this request id), do NOT re-synthesize —
  // record the terminal status and backfill the link. This closes the re-claim-after-death loop
  // that generated 131 duplicate ventures.
  const existingVenture = await findVentureForRequest(supabase, request);
  if (existingVenture) {
    log.info(`Idempotent skip: request ${request.id} already linked to venture ${existingVenture.id} (${existingVenture.source}); completing without re-synthesis`);
    await updateStatus(supabase, request.id, {
      status: 'completed',
      venture_id: existingVenture.id,
      completed_at: new Date().toISOString(),
    });
    return true;
  }

  // Check for duplicate completed request before doing expensive work
  const duplicate = await checkForDuplicate(supabase, request);
  if (duplicate) {
    log.info(`Dedup hit: request ${request.id} matches completed ${duplicate.id}, copying result`);
    await updateStatus(supabase, request.id, {
      status: 'completed',
      result: duplicate.result,
      completed_at: new Date().toISOString(),
    });
    return true;
  }

  // Mark as in_progress
  await updateStatus(supabase, request.id, {
    status: 'in_progress',
    started_at: new Date().toISOString(),
  });

  try {
    const params = mapRequestToParams(request);
    const deadline = Date.now() + EXECUTION_TIMEOUT_MS;

    const result = await withTimeout(
      // SD-LEO-FIX-FIX-STAGE-QUEUE-001: thread requestId so persistVentureBrief stamps the
      // durable request→venture back-reference (metadata.stage_zero.stage_zero_request_id).
      executeStageZero({ ...params, options: { ...params.options, deadline } }, { supabase, logger: log, requestId: request.id }),
      EXECUTION_TIMEOUT_MS
    );

    // FR-4e (SD-LEO-ENH-TREND-SCANNER-SCORING-001): surface prompt_version in the
    // top-level result payload so dashboard consumers and the closed-loop RPC
    // can read it without nested metadata traversal. Null for non-versioned strategies.
    const promptVersion = result?.brief?.metadata?.prompt_version
      ?? result?.brief?.prompt_version
      ?? null;

    // Store success. Backfill venture_id when the run synthesized a venture so the
    // discovery <-> venture link is reliable (previously always null) — lets the UI
    // "Recent Discoveries" link and dismiss-self-clean target the right venture.
    await updateStatus(supabase, request.id, {
      status: 'completed',
      result: { ...result, prompt_version: promptVersion },
      prompt_version: promptVersion,
      venture_id: result?.record_type === 'venture' ? (result.record_id ?? null) : null,
      completed_at: new Date().toISOString(),
    });

    log.info(`Completed request ${request.id} | decision=${result.decision} | duration=${result.duration_ms}ms`);
    return true;
  } catch (err) {
    // Store failure — map thrown typed errors to error_details.error_type so
    // dashboards can distinguish parse_failure / empty_response / undercount / timeout / other.
    // Error class carries .errorType (set by LLMEmptyResponseError, LLMParseError, LLMUndercountError).
    let errorType = err && typeof err.errorType === 'string' ? err.errorType : null;
    if (!errorType) {
      const name = err?.name || '';
      const msg = err?.message || '';
      if (name === 'TimeoutError' || /timed?\s*out|timeout/i.test(msg)) errorType = 'timeout';
      else errorType = 'other';
    }

    await updateStatus(supabase, request.id, {
      status: 'failed',
      error_message: err.message,
      error_details: {
        stack: err.stack,
        name: err.name,
        error_type: errorType,
        ...(err?.strategyName ? { strategy_name: err.strategyName } : {}),
        ...(err?.promptVersion ? { prompt_version: err.promptVersion } : {}),
        ...(err?.expected != null ? { expected: err.expected } : {}),
        ...(err?.actual != null ? { actual: err.actual } : {}),
      },
      completed_at: new Date().toISOString(),
    });

    log.error(`Failed request ${request.id} [error_type=${errorType}]:`, err.message);
    return false;
  }
}

// ── Main Poll Loop ─────────────────────────────────────────────────

let running = true;

async function pollOnce(supabase) {
  // Release stale claims first
  await releaseStaleClaims(supabase);

  // Fetch next pending
  const request = await fetchNextPending(supabase);
  if (!request) return false;

  // Attempt to claim
  const claimed = await claimRequest(supabase, request.id);
  if (!claimed) {
    log.info(`Request ${request.id} was claimed by another session`);
    return false;
  }

  // Process
  await processRequest(supabase, claimed);
  return true;
}

async function main() {
  log.info(`Stage Zero Queue Processor starting | session=${SESSION_ID} | mode=${ONCE_MODE ? 'single' : 'continuous'} | poll=${POLL_INTERVAL_S}s`);

  const supabase = createServiceClient();

  if (ONCE_MODE) {
    const processed = await pollOnce(supabase);
    log.info(processed ? 'Processed one request, exiting.' : 'No pending requests, exiting.');
    return;
  }

  // Continuous poll loop
  while (running) {
    try {
      const processed = await pollOnce(supabase);
      if (processed) {
        // Immediately check for more work
        continue;
      }
    } catch (err) {
      log.error('Poll loop error:', err.message);
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_S * 1000));
  }

  log.info('Processor shutting down gracefully.');
}

// ── Graceful Shutdown ──────────────────────────────────────────────

function shutdown(signal) {
  log.info(`Received ${signal}, finishing current work...`);
  running = false;
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Entry Point (Windows-compatible) ───────────────────────────────
import { isMainModule } from '../lib/utils/is-main-module.js';

if (isMainModule(import.meta.url)) {
  main().catch(err => {
    log.error('Fatal:', err.message);
    process.exit(1);
  });
}

export { pollOnce, processRequest, mapRequestToParams, releaseStaleClaims, findVentureForRequest, checkForDuplicate };
