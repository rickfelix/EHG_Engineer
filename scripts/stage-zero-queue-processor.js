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

// ── Stale Claim Recovery ───────────────────────────────────────────

async function releaseStaleClaims(supabase) {
  const staleThreshold = new Date(Date.now() - STALE_CLAIM_MIN * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('stage_zero_requests')
    .update({ status: 'pending', claimed_by_session: null, claimed_at: null })
    .in('status', ['claimed', 'in_progress'])
    .lt('claimed_at', staleThreshold)
    .select('id');

  if (error) {
    log.warn('Failed to release stale claims:', error.message);
    return 0;
  }
  if (data?.length > 0) {
    log.info(`Released ${data.length} stale claim(s) older than ${STALE_CLAIM_MIN}min`);
  }
  return data?.length || 0;
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
          candidateCount: request.metadata?.candidate_count || 5,
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

async function checkForDuplicate(supabase, request) {
  const path = request.metadata?.path || 'blueprint_browse';

  // Only dedup blueprint_browse with an explicit blueprint_id
  if (path !== 'blueprint_browse' || !request.blueprint_id) return null;

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

// ── Process a Single Request ───────────────────────────────────────

async function processRequest(supabase, request) {
  log.info(`Processing request ${request.id} | path=${request.metadata?.path || 'blueprint_browse'} | priority=${request.priority}`);

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
      executeStageZero({ ...params, options: { ...params.options, deadline } }, { supabase, logger: log }),
      EXECUTION_TIMEOUT_MS
    );

    // Store success
    await updateStatus(supabase, request.id, {
      status: 'completed',
      result,
      completed_at: new Date().toISOString(),
    });

    log.info(`Completed request ${request.id} | decision=${result.decision} | duration=${result.duration_ms}ms`);
    return true;
  } catch (err) {
    // Store failure
    await updateStatus(supabase, request.id, {
      status: 'failed',
      error_message: err.message,
      error_details: { stack: err.stack, name: err.name },
      completed_at: new Date().toISOString(),
    });

    log.error(`Failed request ${request.id}:`, err.message);
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

export { pollOnce, processRequest, mapRequestToParams, releaseStaleClaims };
