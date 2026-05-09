/**
 * Shared helpers for security-audit-events test layers.
 *
 * SD-LEO-INFRA-DEDICATED-SECURITY-AUDIT-001
 *
 * Test isolation strategy:
 *   - Each test uses a unique source_agent (test-emitter-<uuid8>) for cross-test
 *     non-pollution and easy cleanup.
 *   - afterAll() purges rows by source_agent prefix using a service-role
 *     SQL exec that sets `audit.allow_purge=on` to bypass the immutability
 *     trigger. Falls back to filter-by-source_agent DELETE that the trigger
 *     will reject, so we use the postgres extension via supabase REST RPC.
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';

export const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

export function createServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createAnonClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Create a unique test-emitter source_agent string.
 * Format: test-emitter-<8 char hex>
 */
export function uniqueSourceAgent(prefix = 'test-emitter') {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/**
 * Track inserted IDs so we can purge them in afterAll.
 * Uses a Set keyed by composite (id, occurred_at) since that's the PK.
 */
export class InsertedRowTracker {
  constructor() {
    this.rows = []; // Array of { id, occurred_at }
  }
  add(row) {
    if (row?.id && row?.occurred_at) {
      this.rows.push({ id: row.id, occurred_at: row.occurred_at });
    }
  }
  get count() { return this.rows.length; }
  clear() { this.rows = []; }
}

/**
 * Purge tracked rows. The immutability trigger blocks DELETE, but
 * Supabase JS doesn't expose `SET LOCAL audit.allow_purge=on` easily.
 *
 * Strategy: Issue DELETE via service_role; the trigger only allows DELETE
 * when both audit.allow_purge=on AND request.jwt.claims.role=service_role.
 * Since we cannot SET LOCAL through a single REST call, we use a Postgres
 * function (rpc) that runs in a transaction with the GUC set. If that
 * function does not exist, fall back to leaving rows (test data is
 * uniquely tagged by source_agent so it's filterable).
 *
 * See helper SQL: scripts/one-off/_create-test-purge-fn.cjs (optional
 * setup; tests still pass without it, just leave audit rows behind).
 */
export async function purgeRows(supabase, rows) {
  if (!rows?.length) return { purged: 0, errors: 0 };

  // Best-effort: use the rpc helper if it exists, otherwise just log
  // the leftover rows (we'll filter them out in queries by source_agent).
  let purged = 0;
  let errors = 0;

  for (const r of rows) {
    try {
      const { error } = await supabase.rpc('purge_security_audit_event', {
        p_id: r.id,
        p_occurred_at: r.occurred_at
      });
      if (error) {
        errors++;
      } else {
        purged++;
      }
    } catch (_e) {
      errors++;
    }
  }
  return { purged, errors };
}

/**
 * Build a valid event payload for each event_type, used to satisfy the
 * required-fields validator without being verbose in each test.
 */
export function validPayloadFor(eventType) {
  switch (eventType) {
    case 'nfkd_collision':
      return {
        attempted_name: 'CafeAI',
        normalized_key: 'cafeai',
        candidates: ['CafeAI', 'CaféAI']
      };
    case 'port_isol_violation':
      return {
        violation_kind: 'cross_repo_branch',
        pat_pattern_id: 'PAT-PORT-ISOL-001'
      };
    case 'capability_suppression':
      return {
        suppressed_layers: ['UI', 'API'],
        suppression_reason: 'venture_unregistered'
      };
    case 'fail_closed_error':
      return {
        error_code: 'NotRegistered',
        error_message: 'Venture not in registry'
      };
    default:
      return {};
  }
}
