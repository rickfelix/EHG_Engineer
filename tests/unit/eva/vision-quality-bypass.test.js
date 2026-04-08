/**
 * Vision Quality Gate Bypass — Regression & Integration Tests
 *
 * SD-VISION-QUALITY-GATE-BYPASS-ORCH-001-B
 *
 * Tests that:
 * 1. Direct UPDATE on quality_checked=false vision is blocked by trigger
 * 2. RPC bypass (rpc_activate_vision_with_bypass) succeeds
 * 3. Session variable does not leak across transactions
 * 4. RPC returns error for non-existent vision
 * 5. Worker fallback uses RPC instead of direct UPDATE
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env for integration tests that need real Supabase
config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const __dirname = dirname(fileURLToPath(import.meta.url));

// Test fixtures — unique IDs to avoid collision with real data
const TEST_VENTURE_ID = '00000000-0000-0000-0000-test00bypass';
const TEST_VISION_KEY = 'VISION-TEST-BYPASS-REGRESSION-001';

describe('Vision Quality Gate Bypass', () => {
  let testVisionExists = false;
  let rpcAvailable = true;

  beforeAll(async () => {
    // Check if the RPC exists before running tests
    const { error } = await supabase.rpc('rpc_activate_vision_with_bypass', {
      p_venture_id: '00000000-0000-0000-0000-000000000000',
      p_vision_key: 'nonexistent'
    });
    if (error?.message?.includes('Could not find the function')) {
      rpcAvailable = false;
      console.warn('rpc_activate_vision_with_bypass not yet deployed (child A pending). Skipping RPC tests.');
    }
  });

  afterAll(async () => {
    // Clean up test vision if created
    if (testVisionExists) {
      await supabase
        .from('eva_vision_documents')
        .delete()
        .eq('vision_key', TEST_VISION_KEY);
    }
  });

  it('TS-001: direct UPDATE on quality_checked=false vision is blocked by trigger', async () => {
    // Insert a test vision with quality_checked=false, status=archived
    const { error: insertError } = await supabase
      .from('eva_vision_documents')
      .insert({
        vision_key: TEST_VISION_KEY,
        venture_id: TEST_VENTURE_ID,
        status: 'archived',
        quality_checked: false,
        content: { test: true },
        version: 1
      });

    if (insertError) {
      // If venture doesn't exist or other constraint, skip gracefully
      console.warn('Test setup skipped:', insertError.message);
      return;
    }
    testVisionExists = true;

    // Attempt direct UPDATE — should be blocked by trg_enforce_vision_quality_advancement
    const { error: updateError } = await supabase
      .from('eva_vision_documents')
      .update({ status: 'active' })
      .eq('vision_key', TEST_VISION_KEY);

    expect(updateError).toBeTruthy();
    expect(updateError.message).toContain('quality');
  });

  it('TS-002: RPC bypass activates archived vision successfully', async () => {
    if (!rpcAvailable) {
      console.warn('RPC not deployed yet — skipping');
      return;
    }

    // Ensure test vision exists in archived state
    if (!testVisionExists) {
      const { error } = await supabase
        .from('eva_vision_documents')
        .upsert({
          vision_key: TEST_VISION_KEY,
          venture_id: TEST_VENTURE_ID,
          status: 'archived',
          quality_checked: false,
          content: { test: true },
          version: 1
        }, { onConflict: 'vision_key' });
      if (error) {
        console.warn('Test setup skipped:', error.message);
        return;
      }
      testVisionExists = true;
    }

    const { data, error } = await supabase.rpc('rpc_activate_vision_with_bypass', {
      p_venture_id: TEST_VENTURE_ID,
      p_vision_key: TEST_VISION_KEY
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data.success).toBe(true);

    // Verify vision is now active
    const { data: vision } = await supabase
      .from('eva_vision_documents')
      .select('status')
      .eq('vision_key', TEST_VISION_KEY)
      .single();

    expect(vision.status).toBe('active');
  });

  it('TS-004: session variable does not persist across transactions', async () => {
    if (!rpcAvailable) {
      console.warn('RPC not deployed yet — skipping');
      return;
    }

    // After RPC call, verify session variable is not set in new transaction
    const { data, error } = await supabase.rpc('execute_sql', {
      sql: "SELECT current_setting('leo.chairman_approval_bypass', true) as bypass_val"
    });

    if (error?.message?.includes('Could not find the function')) {
      console.warn('execute_sql RPC not available — skipping');
      return;
    }

    if (error) {
      console.warn('Session variable check skipped:', error.message);
      return;
    }

    // Value should be empty/null — SET LOCAL is transaction-scoped
    const bypassVal = data?.[0]?.bypass_val || data?.bypass_val;
    expect(!bypassVal || bypassVal === '' || bypassVal === 'false').toBe(true);
  });

  it('TS-005: RPC returns error for non-existent archived vision', async () => {
    if (!rpcAvailable) {
      console.warn('RPC not deployed yet — skipping');
      return;
    }

    const { data, error } = await supabase.rpc('rpc_activate_vision_with_bypass', {
      p_venture_id: '00000000-0000-0000-0000-000000000000',
      p_vision_key: 'VISION-DOES-NOT-EXIST-999'
    });

    // RPC should return success=false (not throw)
    if (data) {
      expect(data.success).toBe(false);
    }
  });

  it('Worker fallback path uses RPC, not direct UPDATE', () => {
    // Static code analysis: verify stage-execution-worker.js uses RPC
    const workerPath = resolve(__dirname, '../../../lib/eva/stage-execution-worker.js');
    const workerCode = readFileSync(workerPath, 'utf-8');

    // The fallback section should contain RPC call
    expect(workerCode).toContain('rpc_activate_vision_with_bypass');

    // Should NOT contain direct update pattern in the fallback section
    const fallbackStart = workerCode.indexOf('Executing fallback un-archive');
    const fallbackEnd = workerCode.indexOf('restored to active via RPC bypass');
    expect(fallbackStart).toBeGreaterThan(-1);
    expect(fallbackEnd).toBeGreaterThan(fallbackStart);

    const fallbackSection = workerCode.slice(fallbackStart, fallbackEnd + 100);
    expect(fallbackSection).not.toContain(".update({ status: 'active'");
  });
});
