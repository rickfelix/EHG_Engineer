/**
 * Batch Database Operations Utility
 * LEO Protocol v4.2.0 - Performance Enhancement
 *
 * Purpose: Execute multiple independent database queries in parallel
 * using Promise.all for improved performance
 *
 * Philosophy: "Don't wait when you don't have to."
 *
 * Benefits:
 * - Reduces total query time by running independent queries concurrently
 * - Maintains error isolation (one failure doesn't break others)
 * - Provides structured results with timing metrics
 *
 * Created: 2025-11-26 (LEO Protocol Enhancement)
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';
import dotenv from 'dotenv';

dotenv.config();

// Lazy-initialized Supabase client
let supabase = null;

async function getSupabaseClient() {
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }
  return supabase;
}

/**
 * Execute multiple database queries in parallel
 *
 * @param {Array<Object>} queries - Array of query definitions
 * @param {string} queries[].name - Identifier for this query
 * @param {string} queries[].table - Table name to query
 * @param {string} queries[].select - Select clause
 * @param {Object} queries[].filters - Filter conditions { column: value }
 * @param {Object} queries[].options - Additional options (order, limit, single)
 * @returns {Promise<Object>} Results keyed by query name
 */
export async function batchQuery(queries) {
  const client = await getSupabaseClient();
  const startTime = Date.now();

  const results = {
    success: true,
    data: {},
    errors: {},
    timing: {
      total_ms: 0,
      queries: {}
    }
  };

  // Execute all queries in parallel
  const promises = queries.map(async (query) => {
    const queryStart = Date.now();

    try {
      let queryBuilder = client
        .from(query.table)
        .select(query.select || '*');

      // Apply filters
      if (query.filters) {
        for (const [column, value] of Object.entries(query.filters)) {
          if (value !== null && value !== undefined) {
            queryBuilder = queryBuilder.eq(column, value);
          }
        }
      }

      // Apply options
      if (query.options) {
        if (query.options.order) {
          const { column, ascending = true } = query.options.order;
          queryBuilder = queryBuilder.order(column, { ascending });
        }
        if (query.options.limit) {
          queryBuilder = queryBuilder.limit(query.options.limit);
        }
        if (query.options.single) {
          queryBuilder = queryBuilder.single();
        }
        if (query.options.maybeSingle) {
          queryBuilder = queryBuilder.maybeSingle();
        }
      }

      const { data, error } = await queryBuilder;

      const queryTime = Date.now() - queryStart;
      results.timing.queries[query.name] = queryTime;

      if (error) {
        results.errors[query.name] = error.message;
        results.success = false;
        return { name: query.name, data: null, error: error.message };
      }

      results.data[query.name] = data;
      return { name: query.name, data, error: null };

    } catch (err) {
      const queryTime = Date.now() - queryStart;
      results.timing.queries[query.name] = queryTime;
      results.errors[query.name] = err.message;
      results.success = false;
      return { name: query.name, data: null, error: err.message };
    }
  });

  await Promise.all(promises);

  results.timing.total_ms = Date.now() - startTime;

  return results;
}

/**
 * Execute multiple RPC calls in parallel
 *
 * @param {Array<Object>} calls - Array of RPC call definitions
 * @param {string} calls[].name - Identifier for this call
 * @param {string} calls[].function - RPC function name
 * @param {Object} calls[].params - Parameters for the function
 * @returns {Promise<Object>} Results keyed by call name
 */
export async function batchRpc(calls) {
  const client = await getSupabaseClient();
  const startTime = Date.now();

  const results = {
    success: true,
    data: {},
    errors: {},
    timing: {
      total_ms: 0,
      calls: {}
    }
  };

  const promises = calls.map(async (call) => {
    const callStart = Date.now();

    try {
      const { data, error } = await client.rpc(call.function, call.params || {});

      const callTime = Date.now() - callStart;
      results.timing.calls[call.name] = callTime;

      if (error) {
        results.errors[call.name] = error.message;
        results.success = false;
        return { name: call.name, data: null, error: error.message };
      }

      results.data[call.name] = data;
      return { name: call.name, data, error: null };

    } catch (err) {
      const callTime = Date.now() - callStart;
      results.timing.calls[call.name] = callTime;
      results.errors[call.name] = err.message;
      results.success = false;
      return { name: call.name, data: null, error: err.message };
    }
  });

  await Promise.all(promises);

  results.timing.total_ms = Date.now() - startTime;

  return results;
}

/**
 * Execute multiple insert operations in parallel
 *
 * @param {Array<Object>} inserts - Array of insert definitions
 * @param {string} inserts[].name - Identifier for this insert
 * @param {string} inserts[].table - Table to insert into
 * @param {Object|Array} inserts[].data - Data to insert
 * @param {boolean} inserts[].returning - Whether to return inserted data
 * @returns {Promise<Object>} Results keyed by insert name
 */
export async function batchInsert(inserts) {
  const client = await getSupabaseClient();
  const startTime = Date.now();

  const results = {
    success: true,
    data: {},
    errors: {},
    timing: {
      total_ms: 0,
      inserts: {}
    }
  };

  const promises = inserts.map(async (insert) => {
    const insertStart = Date.now();

    try {
      let queryBuilder = client
        .from(insert.table)
        .insert(insert.data);

      if (insert.returning !== false) {
        queryBuilder = queryBuilder.select();
        if (!Array.isArray(insert.data)) {
          queryBuilder = queryBuilder.single();
        }
      }

      const { data, error } = await queryBuilder;

      const insertTime = Date.now() - insertStart;
      results.timing.inserts[insert.name] = insertTime;

      if (error) {
        results.errors[insert.name] = error.message;
        results.success = false;
        return { name: insert.name, data: null, error: error.message };
      }

      results.data[insert.name] = data;
      return { name: insert.name, data, error: null };

    } catch (err) {
      const insertTime = Date.now() - insertStart;
      results.timing.inserts[insert.name] = insertTime;
      results.errors[insert.name] = err.message;
      results.success = false;
      return { name: insert.name, data: null, error: err.message };
    }
  });

  await Promise.all(promises);

  results.timing.total_ms = Date.now() - startTime;

  return results;
}

/**
 * Execute multiple update operations in parallel
 *
 * @param {Array<Object>} updates - Array of update definitions
 * @param {string} updates[].name - Identifier for this update
 * @param {string} updates[].table - Table to update
 * @param {Object} updates[].data - Data to update
 * @param {Object} updates[].filters - Filter conditions { column: value }
 * @returns {Promise<Object>} Results keyed by update name
 */
export async function batchUpdate(updates) {
  const client = await getSupabaseClient();
  const startTime = Date.now();

  const results = {
    success: true,
    data: {},
    errors: {},
    timing: {
      total_ms: 0,
      updates: {}
    }
  };

  const promises = updates.map(async (update) => {
    const updateStart = Date.now();

    try {
      let queryBuilder = client
        .from(update.table)
        .update(update.data);

      // Apply filters
      if (update.filters) {
        for (const [column, value] of Object.entries(update.filters)) {
          if (value !== null && value !== undefined) {
            queryBuilder = queryBuilder.eq(column, value);
          }
        }
      }

      queryBuilder = queryBuilder.select();

      const { data, error } = await queryBuilder;

      const updateTime = Date.now() - updateStart;
      results.timing.updates[update.name] = updateTime;

      if (error) {
        results.errors[update.name] = error.message;
        results.success = false;
        return { name: update.name, data: null, error: error.message };
      }

      results.data[update.name] = data;
      return { name: update.name, data, error: null };

    } catch (err) {
      const updateTime = Date.now() - updateStart;
      results.timing.updates[update.name] = updateTime;
      results.errors[update.name] = err.message;
      results.success = false;
      return { name: update.name, data: null, error: err.message };
    }
  });

  await Promise.all(promises);

  results.timing.total_ms = Date.now() - startTime;

  return results;
}

/**
 * Helper: Gather SD-related data in parallel
 * Common pattern used by multiple sub-agents
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} All SD-related data in one call
 */
export async function gatherSDDataParallel(sdId) {
  const queries = [
    {
      name: 'sd_metadata',
      table: 'strategic_directives_v2',
      select: '*',
      filters: { id: sdId },
      options: { single: true }
    },
    {
      name: 'prd',
      table: 'product_requirements_v2',
      select: '*',
      filters: { directive_id: sdId },
      options: { maybeSingle: true }
    },
    {
      name: 'handoffs',
      table: 'sd_phase_handoffs',
      select: '*',
      filters: { sd_id: sdId },
      options: { order: { column: 'created_at', ascending: true } }
    },
    {
      name: 'sub_agent_results',
      table: 'sub_agent_execution_results',
      select: '*',
      filters: { sd_id: sdId },
      options: { order: { column: 'created_at', ascending: true } }
    },
    {
      name: 'backlog_items',
      table: 'sd_backlog_map',
      select: '*',
      filters: { sd_id: sdId },
      options: { order: { column: 'priority', ascending: false } }
    }
  ];

  const results = await batchQuery(queries);

  return {
    sd: results.data.sd_metadata || null,
    prd: results.data.prd || null,
    handoffs: results.data.handoffs || [],
    subAgentResults: results.data.sub_agent_results || [],
    backlogItems: results.data.backlog_items || [],
    timing: results.timing,
    errors: results.errors
  };
}

/**
 * Helper: Check multiple conditions in parallel
 * Useful for validation checks
 *
 * @param {string} sdId - Strategic Directive ID
 * @returns {Promise<Object>} Validation state
 */
export async function checkSDValidationState(sdId) {
  const queries = [
    {
      name: 'has_prd',
      table: 'product_requirements_v2',
      select: 'id',
      filters: { directive_id: sdId },
      options: { maybeSingle: true }
    },
    {
      name: 'has_retro',
      table: 'retrospectives',
      select: 'id, quality_score, status',
      filters: { sd_id: sdId },
      options: { maybeSingle: true }
    },
    {
      name: 'test_results',
      table: 'sub_agent_execution_results',
      select: 'verdict, confidence',
      filters: { sd_id: sdId, sub_agent_code: 'TESTING' },
      options: { order: { column: 'created_at', ascending: false }, limit: 1 }
    },
    {
      name: 'handoff_count',
      table: 'sd_phase_handoffs',
      select: 'id',
      filters: { sd_id: sdId }
    }
  ];

  const results = await batchQuery(queries);

  return {
    hasPrd: !!results.data.has_prd,
    hasRetro: !!results.data.has_retro,
    retroScore: results.data.has_retro?.quality_score || null,
    latestTestResult: results.data.test_results?.[0] || null,
    handoffCount: results.data.handoff_count?.length || 0,
    timing: results.timing
  };
}

export default {
  batchQuery,
  batchRpc,
  batchInsert,
  batchUpdate,
  gatherSDDataParallel,
  checkSDValidationState
};
