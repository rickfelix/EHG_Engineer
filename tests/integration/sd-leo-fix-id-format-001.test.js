/**
 * Integration Test: SD-LEO-FIX-ID-FORMAT-001
 *
 * Validates the foreign key constraint fix for sub_agent_execution_results.sd_id
 *
 * Test Scenarios:
 * 1. FK constraint exists and is enforced
 * 2. No orphaned sd_id values exist
 * 3. Existing operations (handoff.js, sub-agent execution) still work
 */

import { describe, it, expect } from '@jest/globals';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('SD-LEO-FIX-ID-FORMAT-001: Foreign Key Constraint Validation', () => {

  it('1. FK constraint enforcement: reject invalid sd_id', async () => {
    const { error } = await supabase
      .from('sub_agent_execution_results')
      .insert({
        sub_agent_code: 'TESTING',
        sub_agent_name: 'QA Engineering Director',
        sd_id: 'SD-INVALID-NONEXISTENT-999',
        verdict: 'PASS',
        confidence: 100,
        detailed_analysis: 'Test invalid FK rejection'
      });

    expect(error).toBeTruthy();
    expect(error.message).toMatch(/violates foreign key constraint|not present in table/i);
  });

  it('2. No orphaned sd_id values exist (all NULL or valid FK)', async () => {
    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .select('id, sd_id')
      .not('sd_id', 'is', null);

    expect(error).toBeNull();

    // All non-null sd_id values should reference valid SDs
    if (data && data.length > 0) {
      const sdIds = [...new Set(data.map(r => r.sd_id))];

      const { data: validSDs, error: sdError } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .in('id', sdIds);

      expect(sdError).toBeNull();
      expect(validSDs).toBeTruthy();

      const validSdIdSet = new Set(validSDs.map(sd => sd.id));
      const orphanedRecords = data.filter(r => !validSdIdSet.has(r.sd_id));

      expect(orphanedRecords.length).toBe(0);

      if (orphanedRecords.length > 0) {
        console.error('Found orphaned records:', orphanedRecords);
      }
    }
  });

  it('3. FK constraint allows NULL sd_id (backward compatibility)', async () => {
    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .insert({
        sub_agent_code: 'TESTING',
        sub_agent_name: 'QA Engineering Director',
        sd_id: null,
        verdict: 'PASS',
        confidence: 100,
        detailed_analysis: 'Test NULL sd_id compatibility'
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data.sd_id).toBeNull();

    // Clean up test record
    if (data) {
      await supabase
        .from('sub_agent_execution_results')
        .delete()
        .eq('id', data.id);
    }
  });

  it('4. FK constraint accepts valid sd_id', async () => {
    // First, get a real SD ID from the database
    const { data: sampleSD, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .limit(1)
      .single();

    expect(sdError).toBeNull();
    expect(sampleSD).toBeTruthy();

    if (!sampleSD) {
      console.warn('No SDs in database to test with');
      return;
    }

    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .insert({
        sub_agent_code: 'TESTING',
        sub_agent_name: 'QA Engineering Director',
        sd_id: sampleSD.id,
        verdict: 'PASS',
        confidence: 95,
        detailed_analysis: 'Test valid FK acceptance'
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data.sd_id).toBe(sampleSD.id);

    // Clean up test record
    if (data) {
      await supabase
        .from('sub_agent_execution_results')
        .delete()
        .eq('id', data.id);
    }
  });

  it('5. Migration cleanup was successful (verified count)', async () => {
    // This test documents that the migration cleaned up 2,418 orphaned records
    // We verify that the count is now 0

    const { data: allRecords, error } = await supabase
      .from('sub_agent_execution_results')
      .select('id, sd_id', { count: 'exact' });

    expect(error).toBeNull();

    if (allRecords && allRecords.length > 0) {
      const recordsWithSdId = allRecords.filter(r => r.sd_id !== null);

      if (recordsWithSdId.length > 0) {
        const sdIds = [...new Set(recordsWithSdId.map(r => r.sd_id))];

        const { data: validSDs, error: sdError } = await supabase
          .from('strategic_directives_v2')
          .select('id')
          .in('id', sdIds);

        expect(sdError).toBeNull();

        const validSdIdSet = new Set(validSDs.map(sd => sd.id));
        const stillOrphaned = recordsWithSdId.filter(r => !validSdIdSet.has(r.sd_id));

        expect(stillOrphaned.length).toBe(0);
        console.log('✅ Verified 0 orphaned records (down from 2,418 pre-migration)');
      }
    }
  });

  it('6. Sub-agent execution still works after FK constraint', async () => {
    // Get a valid SD to test with
    const { data: sampleSD, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .limit(1)
      .single();

    expect(sdError).toBeNull();
    expect(sampleSD).toBeTruthy();

    if (!sampleSD) {
      console.warn('No SDs in database to test with');
      return;
    }

    // Simulate a sub-agent execution result being stored
    const { data: insertedResult, error: insertError } = await supabase
      .from('sub_agent_execution_results')
      .insert({
        sub_agent_code: 'DATABASE',
        sub_agent_name: 'Database Agent',
        sd_id: sampleSD.id,
        verdict: 'PASS',
        confidence: 95,
        detailed_analysis: 'FK constraint validation test - sub-agent execution simulation',
        metadata: {
          test_type: 'integration',
          timestamp: new Date().toISOString()
        }
      })
      .select()
      .single();

    expect(insertError).toBeNull();
    expect(insertedResult).toBeTruthy();
    expect(insertedResult.sd_id).toBe(sampleSD.id);

    // Verify we can query it back
    const { data: queriedResult, error: queryError } = await supabase
      .from('sub_agent_execution_results')
      .select('*')
      .eq('id', insertedResult.id)
      .single();

    expect(queryError).toBeNull();
    expect(queriedResult).toBeTruthy();
    expect(queriedResult.sd_id).toBe(sampleSD.id);

    // Clean up test record
    await supabase
      .from('sub_agent_execution_results')
      .delete()
      .eq('id', insertedResult.id);
  });
});
