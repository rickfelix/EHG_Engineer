/**
 * Vision Quality Gate — BEFORE INSERT coverage + NULL-safe chairman_approved guard
 *
 * SD-LEO-INFRA-REAL-VENTURE-VISION-ENRICH-UNDERPRODUCTION-S19-001-C (FR-1, FR-2, FR-4, TS-1..TS-4)
 *
 * Mirrors the live-DB integration convention established by
 * tests/unit/eva/vision-quality-bypass.test.js: real INSERT/UPDATE against eva_vision_documents,
 * unique test vision_keys, cleanup in afterAll, gated on a real (non-synthetic) Supabase connection.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// venture_id is nullable on eva_vision_documents (confirmed via DATABASE sub-agent live dry-run) —
// use NULL rather than a fabricated venture UUID to avoid a foreign-key/format dependency.
const TEST_VENTURE_ID = null;

const HAS_REAL_DB = process.env.SUPABASE_URL
  && !process.env.SUPABASE_URL.includes('test.invalid.local')
  && process.env.SUPABASE_SERVICE_ROLE_KEY
  && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('test-service-role-key-not-real');

const testVisionKeys = [];

describe.skipIf(!HAS_REAL_DB)('Vision Quality Gate — INSERT coverage (FR-1/FR-2)', () => {
  afterAll(async () => {
    if (testVisionKeys.length > 0) {
      await supabase.from('eva_vision_documents').delete().in('vision_key', testVisionKeys);
    }
  });

  it('TS-1: INSERT chairman_approved=true, quality_checked=false is rejected', async () => {
    const visionKey = 'VISION-TEST-INSERT-COVERAGE-TS1';
    testVisionKeys.push(visionKey);
    const { error } = await supabase.from('eva_vision_documents').insert({
      vision_key: visionKey,
      venture_id: TEST_VENTURE_ID,
      level: 'L2',
      status: 'draft',
      chairman_approved: true,
      quality_checked: false,
      content: { test: true },
      version: 1,
    });
    expect(error).toBeTruthy();
    expect(error.message).toContain('quality');
  });

  it('TS-2: INSERT status=active, quality_checked=false is rejected', async () => {
    const visionKey = 'VISION-TEST-INSERT-COVERAGE-TS2';
    testVisionKeys.push(visionKey);
    const { error } = await supabase.from('eva_vision_documents').insert({
      vision_key: visionKey,
      venture_id: TEST_VENTURE_ID,
      level: 'L2',
      status: 'active',
      quality_checked: false,
      content: { test: true },
      extracted_dimensions: { test: true },
      version: 1,
    });
    expect(error).toBeTruthy();
  });

  it('normal draft INSERT (status=draft, chairman_approved=false) still succeeds unchanged', async () => {
    const visionKey = 'VISION-TEST-INSERT-COVERAGE-DRAFT-OK';
    testVisionKeys.push(visionKey);
    const { error } = await supabase.from('eva_vision_documents').insert({
      vision_key: visionKey,
      venture_id: TEST_VENTURE_ID,
      level: 'L2',
      status: 'draft',
      chairman_approved: false,
      quality_checked: false,
      content: { test: true },
      version: 1,
    });
    expect(error).toBeNull();
  });

  it('TS-4: INSERT with leo.chairman_approval_bypass session var succeeds (escape hatch intact on INSERT path)', async () => {
    const visionKey = 'VISION-TEST-INSERT-COVERAGE-BYPASS';
    testVisionKeys.push(visionKey);
    const { error } = await supabase.rpc('execute_sql', {
      sql: `
        SET LOCAL leo.chairman_approval_bypass = 'true';
        INSERT INTO eva_vision_documents (vision_key, venture_id, level, status, chairman_approved, quality_checked, content, version)
        VALUES ('${visionKey}', NULL, 'L2', 'draft', true, false, '{"test":true}'::jsonb, 1);
      `,
    });
    // execute_sql is an optional debug RPC not present in every environment (confirmed absent in
    // this session's live check) — mirrors vision-quality-bypass.test.js's graceful-skip convention
    // rather than failing the suite on an unrelated RPC's availability.
    if (error?.message?.includes('Could not find the function')) {
      console.warn('execute_sql RPC not available — skipping bypass-path INSERT test');
      return;
    }
    expect(error).toBeNull();
  });

  it('TS-3 (regression): UPDATE chairman_approved false -> true on quality_checked=false is still rejected', async () => {
    // eva_vision_documents.chairman_approved is NOT NULL DEFAULT false (confirmed via DATABASE
    // sub-agent live dry-run) — a genuinely-NULL OLD.chairman_approved is therefore not reachable via
    // normal INSERT/UPDATE on this table today; FR-2's COALESCE(OLD.chairman_approved, false) guard
    // is defensive hardening for that case (verified directly against a rolled-back savepoint by the
    // DATABASE sub-agent, not re-proven here). This test instead locks in that the pre-existing,
    // live-reachable false->true rejection has NOT regressed after the CREATE OR REPLACE FUNCTION.
    const visionKey = 'VISION-TEST-INSERT-COVERAGE-TS3';
    testVisionKeys.push(visionKey);
    const { error: insertError } = await supabase.from('eva_vision_documents').insert({
      vision_key: visionKey,
      venture_id: TEST_VENTURE_ID,
      level: 'L2',
      status: 'draft',
      chairman_approved: false,
      quality_checked: false,
      content: { test: true },
      version: 1,
    });
    expect(insertError).toBeNull();

    const { error: updateError } = await supabase
      .from('eva_vision_documents')
      .update({ chairman_approved: true })
      .eq('vision_key', visionKey);
    expect(updateError).toBeTruthy();
    expect(updateError.message).toContain('quality');
  });
});
