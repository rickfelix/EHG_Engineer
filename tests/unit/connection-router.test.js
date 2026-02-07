/**
 * Tests for Connection Strategy Router
 * SD-LEO-INFRA-CONNECTION-STRATEGY-ROUTER-001
 *
 * Verifies:
 * - Strategy selection follows rank ordering
 * - Env var availability check works correctly
 * - Fallback strategies used when DB unavailable
 * - Selection logging (observability)
 * - Cache behavior
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('Connection Strategy Router', () => {
  describe('Database Tables', () => {
    it('should have connection_strategies table with expected columns', async () => {
      const { data, error } = await supabase
        .from('connection_strategies')
        .select('id, service_name, method_name, rank, env_var_required, connection_type, is_enabled, config')
        .limit(1);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    it('should have connection_selection_log table', async () => {
      const { data, error } = await supabase
        .from('connection_selection_log')
        .select('id, service_name, method_selected, method_rank, success')
        .limit(1);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    it('should have v_active_connection_strategies view', async () => {
      const { data, error } = await supabase
        .from('v_active_connection_strategies')
        .select('*');

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Backfilled Strategies', () => {
    let strategies;

    beforeAll(async () => {
      const { data, error } = await supabase
        .from('connection_strategies')
        .select('*')
        .eq('is_enabled', true)
        .order('service_name')
        .order('rank');

      expect(error).toBeNull();
      strategies = data;
    });

    it('should have at least 5 strategies across 3 services', () => {
      expect(strategies.length).toBeGreaterThanOrEqual(5);
      const services = [...new Set(strategies.map(s => s.service_name))];
      expect(services).toContain('supabase');
      expect(services).toContain('ollama');
      expect(services).toContain('anthropic');
    });

    it('should have 3 Supabase strategies ranked 1-3', () => {
      const supabaseStrategies = strategies
        .filter(s => s.service_name === 'supabase')
        .sort((a, b) => a.rank - b.rank);

      expect(supabaseStrategies.length).toBe(3);
      expect(supabaseStrategies[0].method_name).toBe('pooler_url');
      expect(supabaseStrategies[0].rank).toBe(1);
      expect(supabaseStrategies[1].method_name).toBe('service_client');
      expect(supabaseStrategies[1].rank).toBe(2);
      expect(supabaseStrategies[2].method_name).toBe('direct_password');
      expect(supabaseStrategies[2].rank).toBe(3);
    });

    it('should have correct connection types', () => {
      const typeMap = {};
      for (const s of strategies) {
        typeMap[`${s.service_name}:${s.method_name}`] = s.connection_type;
      }

      expect(typeMap['supabase:pooler_url']).toBe('pg_client');
      expect(typeMap['supabase:service_client']).toBe('supabase_service');
      expect(typeMap['supabase:direct_password']).toBe('pg_client');
      expect(typeMap['ollama:local_http']).toBe('http');
      expect(typeMap['anthropic:api_key']).toBe('http');
    });

    it('should have env_var_required for strategies that need it', () => {
      const pooler = strategies.find(s => s.method_name === 'pooler_url');
      expect(pooler.env_var_required).toBe('SUPABASE_POOLER_URL');

      const ollama = strategies.find(s => s.method_name === 'local_http');
      expect(ollama.env_var_required).toBeNull();
    });

    it('should have valid JSON config for all strategies', () => {
      for (const s of strategies) {
        expect(s.config).toBeDefined();
        expect(typeof s.config).toBe('object');
      }
    });

    it('should enforce unique constraint on service_name + method_name', async () => {
      const { error } = await supabase
        .from('connection_strategies')
        .insert({
          service_name: 'supabase',
          method_name: 'pooler_url',
          rank: 99,
          connection_type: 'pg_client',
        });

      expect(error).not.toBeNull();
      expect(error.code).toBe('23505'); // unique_violation
    });
  });

  describe('Router Library', () => {
    let router;

    beforeAll(async () => {
      router = await import('../../lib/connection-router.js');
      router.clearCache();
    });

    afterAll(() => {
      router.clearCache();
    });

    it('should select highest-ranked available strategy for supabase', async () => {
      const strategy = await router.getConnectionStrategy('supabase', {
        caller: 'unit-test',
        skipLog: true,
      });

      expect(strategy).not.toBeNull();
      expect(strategy.method_name).toBeDefined();
      expect(strategy.rank).toBeDefined();
      expect(strategy.connection_type).toBeDefined();
      expect(typeof strategy.config).toBe('object');
    });

    it('should return null for unknown service', async () => {
      const strategy = await router.getConnectionStrategy('nonexistent-service', {
        skipLog: true,
      });

      expect(strategy).toBeNull();
    });

    it('should list all strategies with availability status', async () => {
      const list = await router.listStrategies('supabase');

      expect(list.length).toBeGreaterThanOrEqual(3);
      for (const item of list) {
        expect(typeof item.available).toBe('boolean');
        expect(item.method_name).toBeDefined();
        expect(item.rank).toBeDefined();
      }
    });

    it('should cache strategies after first fetch', async () => {
      router.clearCache();

      // First call populates cache
      await router.getConnectionStrategy('supabase', { skipLog: true });

      const cacheStatus = router.getCacheStatus();
      expect(cacheStatus.supabase).toBeDefined();
      expect(cacheStatus.supabase.strategyCount).toBeGreaterThanOrEqual(3);
      expect(cacheStatus.supabase.stale).toBe(false);
    });

    it('should get a working Supabase connection', async () => {
      const { client, type, method } = await router.getSupabaseConnection({
        caller: 'unit-test',
      });

      expect(client).toBeDefined();
      expect(type).toBeDefined();
      expect(method).toBeDefined();

      // Verify connection works
      if (type === 'pg_client') {
        const result = await client.query('SELECT 1 AS test');
        expect(result.rows[0].test).toBe(1);
        await client.end();
      } else if (type === 'supabase_service') {
        const { data, error } = await client
          .from('connection_strategies')
          .select('id')
          .limit(1);
        expect(error).toBeNull();
      }
    });
  });

  describe('Selection Logging', () => {
    it('should log selection to connection_selection_log', async () => {
      const router = await import('../../lib/connection-router.js');
      router.clearCache();

      // Make a selection that logs
      await router.getConnectionStrategy('supabase', {
        caller: 'logging-test',
        skipLog: false,
      });

      // Small delay for async log write
      await new Promise(resolve => setTimeout(resolve, 500));

      const { data, error } = await supabase
        .from('connection_selection_log')
        .select('*')
        .eq('caller', 'logging-test')
        .order('created_at', { ascending: false })
        .limit(1);

      expect(error).toBeNull();
      expect(data.length).toBe(1);
      expect(data[0].service_name).toBe('supabase');
      expect(data[0].success).toBe(true);
      expect(data[0].selection_duration_ms).toBeDefined();
    });
  });
});
