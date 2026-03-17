/**
 * Integration tests for EVA Exit Readiness API
 * SD: SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-A
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

// We'll test the database layer directly since the tables are the core deliverable
let testVentureId;
let testAssetId;
let testProfileId;

describe('Venture Exit Readiness Foundation', () => {
  beforeAll(async () => {
    // Find an existing venture to use as test parent
    const { data } = await supabase
      .from('ventures')
      .select('id')
      .limit(1)
      .single();
    testVentureId = data?.id;
    expect(testVentureId).toBeTruthy();
  });

  afterAll(async () => {
    // Cleanup test data
    if (testAssetId) {
      await supabase.from('venture_asset_registry').delete().eq('id', testAssetId);
    }
    if (testProfileId) {
      await supabase.from('venture_exit_profiles').delete().eq('id', testProfileId);
    }
  });

  describe('venture_asset_registry', () => {
    it('should create an asset', async () => {
      const { data, error } = await supabase
        .from('venture_asset_registry')
        .insert({
          venture_id: testVentureId,
          asset_name: 'Test Patent - Exit Readiness',
          asset_type: 'patent',
          description: 'Test asset for integration test',
          provenance: { origin: 'test', created_for: 'integration-test' }
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.asset_name).toBe('Test Patent - Exit Readiness');
      expect(data.asset_type).toBe('patent');
      expect(data.provenance.origin).toBe('test');
      testAssetId = data.id;
    });

    it('should read assets for a venture', async () => {
      const { data, error } = await supabase
        .from('venture_asset_registry')
        .select('*')
        .eq('venture_id', testVentureId);

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(1);
    });

    it('should update an asset', async () => {
      const { data, error } = await supabase
        .from('venture_asset_registry')
        .update({ description: 'Updated description', updated_at: new Date().toISOString() })
        .eq('id', testAssetId)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.description).toBe('Updated description');
    });

    it('should reject invalid asset_type', async () => {
      const { error } = await supabase
        .from('venture_asset_registry')
        .insert({
          venture_id: testVentureId,
          asset_name: 'Bad Asset',
          asset_type: 'invalid_type'
        });

      expect(error).toBeTruthy();
    });

    it('should delete an asset', async () => {
      // Create a temp asset to delete
      const { data: temp } = await supabase
        .from('venture_asset_registry')
        .insert({
          venture_id: testVentureId,
          asset_name: 'To Delete',
          asset_type: 'other'
        })
        .select()
        .single();

      const { error } = await supabase
        .from('venture_asset_registry')
        .delete()
        .eq('id', temp.id);

      expect(error).toBeNull();

      // Verify it's gone
      const { data: check } = await supabase
        .from('venture_asset_registry')
        .select('id')
        .eq('id', temp.id);

      expect(check).toHaveLength(0);
    });
  });

  describe('venture_exit_profiles', () => {
    it('should create an exit profile', async () => {
      const { data, error } = await supabase
        .from('venture_exit_profiles')
        .insert({
          venture_id: testVentureId,
          exit_model: 'full_acquisition',
          version: 1,
          notes: 'Initial exit strategy',
          target_buyer_type: 'strategic',
          is_current: true
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.exit_model).toBe('full_acquisition');
      expect(data.version).toBe(1);
      expect(data.is_current).toBe(true);
      testProfileId = data.id;
    });

    it('should support version history', async () => {
      // Mark previous as not current
      await supabase
        .from('venture_exit_profiles')
        .update({ is_current: false })
        .eq('id', testProfileId);

      // Create new version
      const { data, error } = await supabase
        .from('venture_exit_profiles')
        .insert({
          venture_id: testVentureId,
          exit_model: 'licensing',
          version: 2,
          notes: 'Changed strategy to licensing',
          is_current: true
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data.version).toBe(2);

      // Query full history
      const { data: history } = await supabase
        .from('venture_exit_profiles')
        .select('*')
        .eq('venture_id', testVentureId)
        .order('version', { ascending: true });

      expect(history.length).toBeGreaterThanOrEqual(2);

      // Clean up v2
      await supabase.from('venture_exit_profiles').delete().eq('id', data.id);
      // Restore v1 as current
      await supabase
        .from('venture_exit_profiles')
        .update({ is_current: true })
        .eq('id', testProfileId);
    });

    it('should reject invalid exit_model', async () => {
      const { error } = await supabase
        .from('venture_exit_profiles')
        .insert({
          venture_id: testVentureId,
          exit_model: 'invalid_model',
          version: 99
        });

      expect(error).toBeTruthy();
    });
  });

  describe('pipeline_mode extension', () => {
    it('should accept exit_prep pipeline mode', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ pipeline_mode: 'exit_prep' })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    it('should accept divesting pipeline mode', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ pipeline_mode: 'divesting' })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    it('should accept sold pipeline mode', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ pipeline_mode: 'sold' })
        .eq('id', testVentureId);

      expect(error).toBeNull();
    });

    it('should reject invalid pipeline mode', async () => {
      const { error } = await supabase
        .from('ventures')
        .update({ pipeline_mode: 'invalid_mode' })
        .eq('id', testVentureId);

      expect(error).toBeTruthy();
    });

    afterAll(async () => {
      // Reset pipeline_mode back to default
      await supabase
        .from('ventures')
        .update({ pipeline_mode: 'building' })
        .eq('id', testVentureId);
    });
  });
});
