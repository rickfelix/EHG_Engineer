/**
 * Layer 1 — Schema migration tests (6 tests)
 *
 * Verifies the security_audit_events table structure matches the migration:
 *   1. Table exists with 19 columns
 *   2. CHECK constraint on event_type whitelist (4 values)
 *   3. CHECK constraint on severity whitelist (4 values)
 *   4. CHECK constraint on taxonomy_class whitelist for fail_closed_error
 *   5. integrity_hash CHECK length=64 enforced
 *   6. Composite PK (id, occurred_at) exists
 *
 * SCHEMA OBSERVATION (recorded for follow-up):
 *   chk_sae_taxonomy correctly rejects non-whitelisted taxonomy_class values
 *   (e.g. 'BOGUS') for event_type='fail_closed_error', but a NULL
 *   taxonomy_class is *accepted* due to PG's CHECK-passes-on-NULL semantics
 *   (NULL IN (..) → NULL → CHECK passes). Defense-in-depth lives in the
 *   application validator (validateAuditEvent in audit-events-emitter.js
 *   throws when taxonomy_class is not in the whitelist), so the runtime
 *   contract holds. Schema-only enforcement of the NULL case would require
 *   adding `AND taxonomy_class IS NOT NULL` to the predicate or splitting
 *   into two constraints. Tracked under the SD post-launch retention SD.
 *
 * SD-LEO-INFRA-DEDICATED-SECURITY-AUDIT-001
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createServiceClient, HAS_REAL_DB, uniqueSourceAgent, validPayloadFor } from './_helpers.js';
import crypto from 'node:crypto';

describe.skipIf(!HAS_REAL_DB)('Layer 1: security_audit_events schema migration', () => {
  let supabase;

  beforeAll(() => {
    supabase = createServiceClient();
  });

  it('1.1 — table exists with 19 columns', async () => {
    // Query information_schema for column count
    const { data, error } = await supabase
      .from('security_audit_events')
      .select('id, event_type, severity, taxonomy_class, venture_id, venture_name_input, venture_name_normalized, colliding_with_venture_id, source_agent, source_module_path, correlation_id, session_id, sd_id, occurred_at, detected_at, event_payload, integrity_hash, pat_pattern_id, created_at')
      .limit(1);

    // We requested all 19 columns by name; if any is missing, supabase returns an error.
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('1.2 — CHECK constraint chk_sae_event_type rejects invalid event_type', async () => {
    // Use a value that fits varchar(64) but isn't in the whitelist.
    const { error } = await supabase
      .from('security_audit_events')
      .insert({
        event_type: 'bogus_evt',
        severity: 'info',
        source_agent: uniqueSourceAgent('layer1-evtype'),
        occurred_at: new Date().toISOString(),
        event_payload: {},
        integrity_hash: '0'.repeat(64)
      });

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
    expect(error.message?.toLowerCase()).toContain('chk_sae_event_type');
  });

  it('1.3 — CHECK constraint chk_sae_severity rejects invalid severity', async () => {
    // Use a value that fits varchar(16) but isn't in the whitelist.
    // Original failing test used 'NOT_A_REAL_SEVERITY' (19 chars) which hit
    // the varchar(16) length cap before the CHECK constraint. 'invalid' (7)
    // exercises the CHECK directly.
    const { error } = await supabase
      .from('security_audit_events')
      .insert({
        event_type: 'nfkd_collision',
        severity: 'invalid',
        source_agent: uniqueSourceAgent('layer1-sev'),
        occurred_at: new Date().toISOString(),
        event_payload: validPayloadFor('nfkd_collision'),
        integrity_hash: '0'.repeat(64)
      });

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
    expect(error.message?.toLowerCase()).toContain('chk_sae_severity');
  });

  it('1.4 — CHECK constraint chk_sae_taxonomy rejects invalid taxonomy_class for fail_closed_error', async () => {
    // The migration enforces taxonomy_class IN ('permanent','transient') ONLY
    // for non-NULL values; NULL is accepted (PG CHECK semantics — see schema
    // observation in file header). The application validator
    // (validateAuditEvent) is the runtime defense for the NULL case.
    //
    // This schema-level test exercises the constraint directly with a
    // non-NULL invalid value ('bogus'), which IS rejected.
    const { error } = await supabase
      .from('security_audit_events')
      .insert({
        event_type: 'fail_closed_error',
        severity: 'critical',
        taxonomy_class: 'bogus',
        source_agent: uniqueSourceAgent('layer1-tax'),
        occurred_at: new Date().toISOString(),
        event_payload: validPayloadFor('fail_closed_error'),
        integrity_hash: '0'.repeat(64)
      });

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
    expect(error.message?.toLowerCase()).toContain('chk_sae_taxonomy');
  });

  it('1.5 — CHECK constraint chk_sae_integrity_hash enforces length=64', async () => {
    // Hash with length != 64 must fail.
    const { error } = await supabase
      .from('security_audit_events')
      .insert({
        event_type: 'nfkd_collision',
        severity: 'info',
        source_agent: uniqueSourceAgent('layer1-hashlen'),
        occurred_at: new Date().toISOString(),
        event_payload: validPayloadFor('nfkd_collision'),
        integrity_hash: 'short_hash_not_64_chars'
      });

    expect(error).not.toBeNull();
    expect(error.code).toBe('23514');
    expect(error.message?.toLowerCase()).toContain('chk_sae_integrity_hash');
  });

  it('1.6 — composite PK (id, occurred_at) exists and uniqueness is enforced', async () => {
    // Insert one row, then attempt to insert with the same (id, occurred_at) again.
    const sourceAgent = uniqueSourceAgent('layer1-pk');
    const occurredAt = new Date().toISOString();
    const explicitId = crypto.randomUUID();
    const validHash = crypto.createHash('sha256').update('test').digest('hex'); // 64 chars

    const { data: insertOne, error: errOne } = await supabase
      .from('security_audit_events')
      .insert({
        id: explicitId,
        event_type: 'nfkd_collision',
        severity: 'info',
        source_agent: sourceAgent,
        occurred_at: occurredAt,
        event_payload: validPayloadFor('nfkd_collision'),
        integrity_hash: validHash
      })
      .select('id, occurred_at')
      .single();

    expect(errOne).toBeNull();
    expect(insertOne?.id).toBe(explicitId);

    // Now collide on PK
    const { error: errDup } = await supabase
      .from('security_audit_events')
      .insert({
        id: explicitId,
        event_type: 'nfkd_collision',
        severity: 'info',
        source_agent: sourceAgent,
        occurred_at: occurredAt,
        event_payload: validPayloadFor('nfkd_collision'),
        integrity_hash: validHash
      });

    expect(errDup).not.toBeNull();
    // Either 23505 (unique_violation) or message contains 'duplicate'/'pk'
    expect(
      errDup.code === '23505' ||
      errDup.message?.toLowerCase().includes('duplicate') ||
      errDup.message?.toLowerCase().includes('pk_security_audit_events') ||
      errDup.message?.toLowerCase().includes('unique')
    ).toBe(true);
  });
});
