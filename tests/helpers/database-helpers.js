/**
 * Database Test Helpers - Supabase integration for E2E tests
 *
 * Part of Phase 1 Testing Framework Enhancements (B1.1)
 * Provides database utilities for test data setup and teardown
 */

import { createClient } from '@supabase/supabase-js';

// Lazy-loaded Supabase client
let supabaseClient = null;
let connectionValidated = false;

/**
 * Get or create Supabase client for integration tests
 *
 * PAT-SUPABASE-KEY-001: Uses service role key with fallback to anon key
 * - Service role is preferred for integration tests (needs insert/delete)
 * - Handles both NEXT_PUBLIC_ and non-prefixed env vars
 * - Validates connection on first use
 *
 * @returns {SupabaseClient}
 */
export function getSupabaseClient() {
  if (!supabaseClient) {
    // Support both env var naming conventions
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

    // Prefer service role key for integration tests (needed for insert/delete operations)
    // Falls back to anon key if service role not available
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
                        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                        process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase credentials not found. Set one of:\n' +
        '  - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (recommended for tests)\n' +
        '  - NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY\n' +
        '  - SUPABASE_URL + SUPABASE_ANON_KEY'
      );
    }

    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }

  return supabaseClient;
}

/**
 * Get Supabase client with connection validation
 * Use this in test setup to fail fast if database is unreachable
 *
 * @returns {Promise<SupabaseClient>}
 * @throws {Error} If connection fails
 */
export async function getValidatedSupabaseClient() {
  const client = getSupabaseClient();

  if (!connectionValidated) {
    const { error } = await client.from('strategic_directives_v2').select('id').limit(1);
    if (error) {
      // Reset client so next attempt can try fresh
      supabaseClient = null;
      throw new Error(
        `Database connection failed: ${error.message}\n` +
        `Hint: ${error.hint || 'Check API keys in .env file - they may have been rotated'}`
      );
    }
    connectionValidated = true;
  }

  return client;
}

/**
 * Reset the cached Supabase client (useful for tests that need fresh connection)
 */
export function resetSupabaseClient() {
  supabaseClient = null;
  connectionValidated = false;
}

/**
 * Create test strategic directive
 * @param {Object} data - Directive data
 * @returns {Promise<Object>} Created directive
 */
export async function createTestDirective(data = {}) {
  const supabase = getSupabaseClient();

  const directive = {
    title: data.title || `Test Directive ${Date.now()}`,
    description: data.description || 'Test description',
    status: data.status || 'draft',
    priority: data.priority || 'medium',
    phase: data.phase || 'LEAD',
    ...data,
  };

  const { data: created, error } = await supabase
    .from('strategic_directives_v2')
    .insert([directive])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test directive: ${error.message}`);
  }

  return created;
}

/**
 * Create test user story
 * @param {string} directiveId - Strategic directive ID
 * @param {Object} data - Story data
 * @returns {Promise<Object>} Created story
 */
export async function createTestUserStory(directiveId, data = {}) {
  const supabase = getSupabaseClient();

  const story = {
    strategic_directive_id: directiveId,
    title: data.title || `Test Story ${Date.now()}`,
    description: data.description || 'Test story description',
    acceptance_criteria: data.acceptance_criteria || 'Test acceptance criteria',
    story_points: data.story_points || 3,
    priority: data.priority || 'medium',
    status: data.status || 'pending',
    ...data,
  };

  const { data: created, error } = await supabase
    .from('user_stories')
    .insert([story])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test user story: ${error.message}`);
  }

  return created;
}

/**
 * Create test PRD
 * @param {string} directiveId - Strategic directive ID
 * @param {Object} data - PRD data
 * @returns {Promise<Object>} Created PRD
 */
export async function createTestPRD(directiveId, data = {}) {
  const supabase = getSupabaseClient();

  const prd = {
    strategic_directive_id: directiveId,
    title: data.title || `Test PRD ${Date.now()}`,
    overview: data.overview || 'Test PRD overview',
    objectives: data.objectives || ['Test objective 1', 'Test objective 2'],
    technical_requirements: data.technical_requirements || { test: true },
    success_criteria: data.success_criteria || ['Test criteria'],
    ...data,
  };

  const { data: created, error } = await supabase
    .from('product_requirements_v2')
    .insert([prd])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test PRD: ${error.message}`);
  }

  return created;
}

/**
 * Delete test directive and all related data
 * @param {string} directiveId - Directive ID to delete
 */
export async function deleteTestDirective(directiveId) {
  const supabase = getSupabaseClient();

  // Delete in order (respecting foreign key constraints)
  await supabase.from('deliverables').delete().eq('strategic_directive_id', directiveId);
  await supabase.from('user_stories').delete().eq('strategic_directive_id', directiveId);
  await supabase.from('product_requirements_v2').delete().eq('strategic_directive_id', directiveId);
  await supabase.from('strategic_directives_v2').delete().eq('id', directiveId);
}

/**
 * Clean up all test data (use with caution!)
 * @param {string} prefix - Prefix to identify test data (default: 'Test')
 */
export async function cleanupTestData(prefix = 'Test') {
  const supabase = getSupabaseClient();

  // Find and delete all directives with test prefix
  const { data: testDirectives } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .ilike('title', `${prefix}%`);

  if (testDirectives && testDirectives.length > 0) {
    for (const directive of testDirectives) {
      await deleteTestDirective(directive.id);
    }
  }
}

/**
 * Get directive with all related data
 * @param {string} directiveId - Directive ID
 * @returns {Promise<Object>} Directive with PRD, user stories, and deliverables
 */
export async function getDirectiveWithRelations(directiveId) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select(`
      *,
      prd:product_requirements_v2(*),
      user_stories(*),
      deliverables(*)
    `)
    .eq('id', directiveId)
    .single();

  if (error) {
    throw new Error(`Failed to get directive: ${error.message}`);
  }

  return data;
}

/**
 * Update directive status
 * @param {string} directiveId - Directive ID
 * @param {string} status - New status
 */
export async function updateDirectiveStatus(directiveId, status) {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('strategic_directives_v2')
    .update({ status })
    .eq('id', directiveId);

  if (error) {
    throw new Error(`Failed to update directive status: ${error.message}`);
  }
}

/**
 * Create test handoff
 * @param {string} directiveId - Directive ID
 * @param {Object} data - Handoff data
 * @returns {Promise<Object>} Created handoff
 */
export async function createTestHandoff(directiveId, data = {}) {
  const supabase = getSupabaseClient();

  const handoff = {
    strategic_directive_id: directiveId,
    from_phase: data.from_phase || 'LEAD',
    to_phase: data.to_phase || 'PLAN',
    status: data.status || 'pending',
    handoff_type: data.handoff_type || 'PLAN',
    checklist_passed: data.checklist_passed || false,
    ...data,
  };

  const { data: created, error } = await supabase
    .from('handoffs')
    .insert([handoff])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test handoff: ${error.message}`);
  }

  return created;
}

/**
 * Wait for database condition
 * @param {Function} condition - Async condition function
 * @param {Object} options - Wait options
 */
export async function waitForDatabaseCondition(condition, options = {}) {
  const { timeout = 10000, interval = 500 } = options;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Database condition not met within timeout');
}

/**
 * Create test venture
 * @param {Object} data - Venture data
 * @returns {Promise<Object>} Created venture
 */
export async function createTestVenture(data = {}) {
  const supabase = getSupabaseClient();

  const venture = {
    name: data.name || `Test Venture ${Date.now()}`,
    description: data.description || 'Test venture description',
    status: data.status || 'draft',
    stage: data.stage || 'ideation',
    ...data,
  };

  const { data: created, error } = await supabase
    .from('ventures')
    .insert([venture])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create test venture: ${error.message}`);
  }

  return created;
}

/**
 * Delete test venture
 * @param {string} ventureId - Venture ID to delete
 */
export async function deleteTestVenture(ventureId) {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('ventures')
    .delete()
    .eq('id', ventureId);

  if (error) {
    throw new Error(`Failed to delete test venture: ${error.message}`);
  }
}

/**
 * Get test database statistics
 * @returns {Promise<Object>} Database stats
 */
export async function getTestDatabaseStats() {
  const supabase = getSupabaseClient();

  const [directives, stories, prds, ventures] = await Promise.all([
    supabase.from('strategic_directives_v2').select('id', { count: 'exact', head: true }),
    supabase.from('user_stories').select('id', { count: 'exact', head: true }),
    supabase.from('product_requirements_v2').select('id', { count: 'exact', head: true }),
    supabase.from('ventures').select('id', { count: 'exact', head: true }),
  ]);

  return {
    directives: directives.count || 0,
    userStories: stories.count || 0,
    prds: prds.count || 0,
    ventures: ventures.count || 0,
  };
}
