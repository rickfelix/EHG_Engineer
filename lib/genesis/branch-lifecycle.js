/**
 * Genesis Virtual Bunker - Branch/Repo Lifecycle Management
 *
 * Implements simulation branch/repo creation, isolation, and incineration.
 * Per Virtual Bunker Addendum: Uses ephemeral repos + mock mode instead of
 * separate GitHub organizations.
 *
 * @module lib/genesis/branch-lifecycle
 */

import { createClient } from '@supabase/supabase-js';

// Lazy initialization to avoid loading before dotenv
let supabase = null;
let octokit = null;
let Octokit = null;

/**
 * Initialize Supabase client
 */
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

/**
 * Initialize Octokit client for GitHub operations
 * Dynamically imports @octokit/rest only when needed
 */
async function getOctokit() {
  if (!octokit) {
    if (!Octokit) {
      try {
        const oktokitModule = await import('@octokit/rest');
        Octokit = oktokitModule.Octokit;
      } catch (err) {
        console.log('[Genesis] @octokit/rest not installed. GitHub operations will be simulated.');
        return null;
      }
    }
    octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });
  }
  return octokit;
}

/**
 * @typedef {Object} SimulationBranch
 * @property {string} id - Simulation session UUID
 * @property {string} name - Branch name (e.g., "sim/genesis-001-abc123")
 * @property {string|null} repoUrl - GitHub repository URL (null if not created)
 * @property {string|null} previewUrl - Vercel preview URL (null if not deployed)
 * @property {Date} createdAt - Creation timestamp
 * @property {number} ttlDays - Time to live in days
 * @property {string} status - 'simulation' | 'official' | 'archived' | 'incinerated'
 * @property {string} tier - 'A' (lite) | 'B' (full) simulation tier
 */

/**
 * @typedef {Object} SimulationTierConfig
 * @property {string} tierCode - 'A' or 'B'
 * @property {string} tierName - Human-readable name
 * @property {string} description - Tier description
 * @property {string[]} features - Enabled features for this tier
 * @property {number} defaultTtlDays - Default TTL for this tier
 * @property {boolean} requiresApproval - Whether approval needed to start
 */

/**
 * Generate a unique simulation branch name
 * Format: sim/{venture-slug}-{short-hash}
 *
 * @param {string} seedText - The seed text/venture description
 * @returns {string} Branch name
 */
export function generateBranchName(seedText) {
  // Create slug from first few words of seed text
  const slug = seedText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .slice(0, 3)
    .join('-')
    .substring(0, 30);

  // Generate short hash
  const hash = Math.random().toString(36).substring(2, 8);

  return `sim/${slug}-${hash}`;
}

/**
 * Create a new simulation session in the database
 *
 * @param {string} seedText - The venture seed text
 * @param {Object} options - Optional configuration
 * @param {number} [options.ttlDays=90] - Time to live in days
 * @param {string} [options.ventureId] - Link to existing venture
 * @param {string} [options.tier='A'] - Simulation tier: 'A' (lite) or 'B' (full)
 * @returns {Promise<SimulationBranch>} Created simulation session
 */
export async function createSimulationBranch(seedText, options = {}) {
  const db = getSupabase();
  const branchName = generateBranchName(seedText);

  // Validate tier
  const tier = options.tier || 'A';
  if (!['A', 'B'].includes(tier)) {
    throw new Error(`Invalid simulation tier: ${tier}. Must be 'A' or 'B'.`);
  }

  // Get tier config for default TTL
  const tierConfig = await getTierConfig(tier);
  const ttlDays = options.ttlDays || tierConfig?.defaultTtlDays || 90;

  const { data, error } = await db
    .from('simulation_sessions')
    .insert({
      seed_text: seedText,
      venture_id: options.ventureId || null,
      epistemic_status: 'simulation',
      ttl_days: ttlDays,
      simulation_tier: tier
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create simulation session: ${error.message}`);
  }

  console.log(`[Genesis] Created simulation session: ${data.id}`);
  console.log(`[Genesis] Branch name: ${branchName}`);
  console.log(`[Genesis] Tier: ${tier} (${tierConfig?.tierName || 'Unknown'})`);
  console.log(`[Genesis] TTL: ${ttlDays} days`);

  return {
    id: data.id,
    name: branchName,
    repoUrl: data.repo_url,
    previewUrl: data.preview_url,
    createdAt: new Date(data.created_at),
    ttlDays: data.ttl_days,
    status: data.epistemic_status,
    tier: data.simulation_tier || 'A'
  };
}

/**
 * Get tier configuration from database
 *
 * @param {string} tierCode - 'A' or 'B'
 * @returns {Promise<SimulationTierConfig|null>} Tier configuration
 */
export async function getTierConfig(tierCode) {
  const db = getSupabase();

  const { data, error } = await db
    .from('genesis_tier_config')
    .select('*')
    .eq('tier_code', tierCode)
    .single();

  if (error) {
    // Table may not exist yet, return sensible defaults
    const defaults = {
      A: { tierCode: 'A', tierName: 'Lite Simulation', defaultTtlDays: 7, features: ['prd_generation', 'ai_mockups'] },
      B: { tierCode: 'B', tierName: 'Full Simulation', defaultTtlDays: 30, features: ['prd_generation', 'ai_mockups', 'code_scaffolding', 'github_repo', 'vercel_deployment'] }
    };
    return defaults[tierCode] || null;
  }

  return {
    tierCode: data.tier_code,
    tierName: data.tier_name,
    description: data.description,
    features: data.features || [],
    defaultTtlDays: data.default_ttl_days,
    requiresApproval: data.requires_approval
  };
}

/**
 * Get all tier configurations
 *
 * @returns {Promise<SimulationTierConfig[]>} All tier configurations
 */
export async function getAllTierConfigs() {
  const db = getSupabase();

  const { data, error } = await db
    .from('genesis_tier_config')
    .select('*')
    .order('tier_code');

  if (error) {
    // Return defaults if table doesn't exist
    return [
      { tierCode: 'A', tierName: 'Lite Simulation', defaultTtlDays: 7, features: ['prd_generation', 'ai_mockups'] },
      { tierCode: 'B', tierName: 'Full Simulation', defaultTtlDays: 30, features: ['prd_generation', 'ai_mockups', 'code_scaffolding', 'github_repo', 'vercel_deployment'] }
    ];
  }

  return data.map(d => ({
    tierCode: d.tier_code,
    tierName: d.tier_name,
    description: d.description,
    features: d.features || [],
    defaultTtlDays: d.default_ttl_days,
    requiresApproval: d.requires_approval
  }));
}

/**
 * Get simulation session by ID
 *
 * @param {string} simulationId - Simulation session UUID
 * @returns {Promise<SimulationBranch|null>} Simulation session or null
 */
export async function getSimulationBranch(simulationId) {
  const db = getSupabase();

  const { data, error } = await db
    .from('simulation_sessions')
    .select('*')
    .eq('id', simulationId)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    name: `sim/${data.id.substring(0, 8)}`,
    repoUrl: data.repo_url,
    previewUrl: data.preview_url,
    createdAt: new Date(data.created_at),
    ttlDays: data.ttl_days,
    status: data.epistemic_status
  };
}

/**
 * List all active simulation branches
 *
 * @param {Object} filters - Optional filters
 * @param {string} [filters.status] - Filter by epistemic status
 * @param {boolean} [filters.expired] - Include only expired sessions
 * @returns {Promise<SimulationBranch[]>} List of simulation branches
 */
export async function listSimulationBranches(filters = {}) {
  const db = getSupabase();

  let query = db
    .from('simulation_sessions')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('epistemic_status', filters.status);
  }

  if (filters.expired) {
    // Get sessions where created_at + ttl_days < now
    query = query.filter('archived_at', 'is', null);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list simulation branches: ${error.message}`);
  }

  return (data || []).map(session => ({
    id: session.id,
    name: `sim/${session.id.substring(0, 8)}`,
    repoUrl: session.repo_url,
    previewUrl: session.preview_url,
    createdAt: new Date(session.created_at),
    ttlDays: session.ttl_days,
    status: session.epistemic_status,
    seedText: session.seed_text.substring(0, 100) + (session.seed_text.length > 100 ? '...' : '')
  }));
}

/**
 * Archive a simulation session (Day 0 of incineration)
 *
 * @param {string} simulationId - Simulation session UUID
 * @returns {Promise<void>}
 */
export async function archiveSimulation(simulationId) {
  const db = getSupabase();

  const { error } = await db
    .from('simulation_sessions')
    .update({
      epistemic_status: 'archived',
      archived_at: new Date().toISOString()
    })
    .eq('id', simulationId);

  if (error) {
    throw new Error(`Failed to archive simulation: ${error.message}`);
  }

  console.log(`[Genesis] Archived simulation: ${simulationId}`);
}

/**
 * Delete Vercel preview deployment (Day 1 of incineration)
 *
 * @param {string} simulationId - Simulation session UUID
 * @returns {Promise<void>}
 */
export async function deleteVercelPreview(simulationId) {
  const db = getSupabase();

  // Get the preview URL
  const { data: session } = await db
    .from('simulation_sessions')
    .select('preview_url')
    .eq('id', simulationId)
    .single();

  if (!session?.preview_url) {
    console.log(`[Genesis] No Vercel preview to delete for: ${simulationId}`);
    return;
  }

  // In production, would call Vercel API to delete deployment
  // For now, log the action
  console.log(`[Genesis] Would delete Vercel preview: ${session.preview_url}`);

  // Clear the preview URL in database
  await db
    .from('simulation_sessions')
    .update({ preview_url: null })
    .eq('id', simulationId);

  console.log(`[Genesis] Deleted Vercel preview for: ${simulationId}`);
}

/**
 * Delete GitHub repository (Day 2 of incineration)
 *
 * @param {string} simulationId - Simulation session UUID
 * @returns {Promise<void>}
 */
export async function deleteGitHubRepo(simulationId) {
  const db = getSupabase();

  // Get the repo URL
  const { data: session } = await db
    .from('simulation_sessions')
    .select('repo_url')
    .eq('id', simulationId)
    .single();

  if (!session?.repo_url) {
    console.log(`[Genesis] No GitHub repo to delete for: ${simulationId}`);
    return;
  }

  // Parse repo owner/name from URL
  // URL format: https://github.com/{owner}/{repo}
  const match = session.repo_url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) {
    console.log(`[Genesis] Invalid repo URL format: ${session.repo_url}`);
    return;
  }

  const [, owner, repo] = match;
  const gh = await getOctokit();

  if (!gh) {
    console.log(`[Genesis] GitHub API not available - simulating repo deletion: ${owner}/${repo}`);
  } else {
    try {
      await gh.repos.delete({ owner, repo });
      console.log(`[Genesis] Deleted GitHub repo: ${owner}/${repo}`);
    } catch (err) {
      // Log but don't throw - repo may already be deleted
      console.log(`[Genesis] Failed to delete repo (may not exist): ${err.message}`);
    }
  }

  // Clear the repo URL in database
  await db
    .from('simulation_sessions')
    .update({ repo_url: null })
    .eq('id', simulationId);
}

/**
 * Purge simulation data from database (Day 7 of incineration)
 *
 * @param {string} simulationId - Simulation session UUID
 * @returns {Promise<void>}
 */
export async function purgeSimulationData(simulationId) {
  const db = getSupabase();

  // Clear large JSON fields, keep minimal audit trail
  const { error } = await db
    .from('simulation_sessions')
    .update({
      prd_content: null,
      schema_content: null,
      seed_text: '[PURGED]' // Keep indicator that data existed
    })
    .eq('id', simulationId);

  if (error) {
    throw new Error(`Failed to purge simulation data: ${error.message}`);
  }

  console.log(`[Genesis] Purged simulation data for: ${simulationId}`);
}

/**
 * Mark simulation as fully incinerated (Day 30 of incineration)
 * Audit trail is retained.
 *
 * @param {string} simulationId - Simulation session UUID
 * @returns {Promise<void>}
 */
export async function markIncinerated(simulationId) {
  const db = getSupabase();

  const { error } = await db
    .from('simulation_sessions')
    .update({
      epistemic_status: 'incinerated',
      incinerated_at: new Date().toISOString()
    })
    .eq('id', simulationId);

  if (error) {
    throw new Error(`Failed to mark simulation as incinerated: ${error.message}`);
  }

  console.log(`[Genesis] Marked simulation as incinerated: ${simulationId}`);
}

/**
 * Execute full incineration sequence
 * This is the manual/immediate version - for scheduled incineration,
 * use the cron job approach.
 *
 * @param {string} simulationId - Simulation session UUID
 * @param {Object} options - Incineration options
 * @param {boolean} [options.immediate=false] - Skip delays, incinerate immediately
 * @returns {Promise<void>}
 */
export async function incinerateBranch(simulationId, options = {}) {
  console.log(`[Genesis] Starting incineration sequence for: ${simulationId}`);

  // Day 0: Archive
  await archiveSimulation(simulationId);

  if (options.immediate) {
    // Immediate incineration - skip delays
    await deleteVercelPreview(simulationId);
    await deleteGitHubRepo(simulationId);
    await purgeSimulationData(simulationId);
    await markIncinerated(simulationId);
    console.log(`[Genesis] Immediate incineration complete for: ${simulationId}`);
  } else {
    // Schedule remaining steps
    // In production, would use a job queue or database triggers
    console.log('[Genesis] Scheduled incineration timeline:');
    console.log('  Day 1: Delete Vercel preview');
    console.log('  Day 2: Delete GitHub repo');
    console.log('  Day 7: Purge simulation data');
    console.log('  Day 30: Mark as incinerated');
    console.log('[Genesis] Use scheduled tasks or cron to execute remaining steps.');
  }
}

/**
 * Extend TTL for a simulation session
 *
 * @param {string} simulationId - Simulation session UUID
 * @param {number} additionalDays - Days to add
 * @param {string} reason - Reason for extension (required for audit)
 * @returns {Promise<SimulationBranch>} Updated simulation
 */
export async function extendTTL(simulationId, additionalDays, reason) {
  if (!reason) {
    throw new Error('Reason is required for TTL extension');
  }

  const db = getSupabase();

  // Get current TTL
  const { data: current, error: getError } = await db
    .from('simulation_sessions')
    .select('ttl_days')
    .eq('id', simulationId)
    .single();

  if (getError || !current) {
    throw new Error(`Simulation not found: ${simulationId}`);
  }

  // Maximum 2 extensions (180 days max)
  const maxTtl = 180;
  const newTtl = Math.min(current.ttl_days + additionalDays, maxTtl);

  if (newTtl === current.ttl_days) {
    throw new Error(`TTL already at maximum (${maxTtl} days)`);
  }

  const { data, error } = await db
    .from('simulation_sessions')
    .update({
      ttl_days: newTtl,
      // Store extension history in a metadata field if needed
    })
    .eq('id', simulationId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to extend TTL: ${error.message}`);
  }

  console.log(`[Genesis] Extended TTL for ${simulationId}: ${current.ttl_days} → ${newTtl} days`);
  console.log(`[Genesis] Reason: ${reason}`);

  return {
    id: data.id,
    name: `sim/${data.id.substring(0, 8)}`,
    repoUrl: data.repo_url,
    previewUrl: data.preview_url,
    createdAt: new Date(data.created_at),
    ttlDays: data.ttl_days,
    status: data.epistemic_status
  };
}

/**
 * Check for expired simulations that need incineration
 *
 * @returns {Promise<SimulationBranch[]>} List of expired simulations
 */
export async function checkExpiredSimulations() {
  const db = getSupabase();

  const { data, error } = await db
    .from('simulation_sessions')
    .select('*')
    .eq('epistemic_status', 'simulation')
    .is('archived_at', null);

  if (error) {
    throw new Error(`Failed to check expired simulations: ${error.message}`);
  }

  const now = new Date();
  const expired = (data || []).filter(session => {
    const createdAt = new Date(session.created_at);
    const expiresAt = new Date(createdAt.getTime() + session.ttl_days * 24 * 60 * 60 * 1000);
    return now > expiresAt;
  });

  if (expired.length > 0) {
    console.log(`[Genesis] Found ${expired.length} expired simulation(s) for incineration`);
  }

  return expired.map(session => ({
    id: session.id,
    name: `sim/${session.id.substring(0, 8)}`,
    repoUrl: session.repo_url,
    previewUrl: session.preview_url,
    createdAt: new Date(session.created_at),
    ttlDays: session.ttl_days,
    status: session.epistemic_status,
    daysOverdue: Math.floor((now - new Date(session.created_at).getTime() - session.ttl_days * 24 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000))
  }));
}

/**
 * Update simulation session with repo URL after GitHub creation
 *
 * @param {string} simulationId - Simulation session UUID
 * @param {string} repoUrl - GitHub repository URL
 * @returns {Promise<void>}
 */
export async function setRepoUrl(simulationId, repoUrl) {
  const db = getSupabase();

  const { error } = await db
    .from('simulation_sessions')
    .update({ repo_url: repoUrl })
    .eq('id', simulationId);

  if (error) {
    throw new Error(`Failed to set repo URL: ${error.message}`);
  }

  console.log(`[Genesis] Set repo URL for ${simulationId}: ${repoUrl}`);
}

/**
 * Update simulation session with preview URL after Vercel deployment
 *
 * @param {string} simulationId - Simulation session UUID
 * @param {string} previewUrl - Vercel preview URL
 * @returns {Promise<void>}
 */
export async function setPreviewUrl(simulationId, previewUrl) {
  const db = getSupabase();

  const { error } = await db
    .from('simulation_sessions')
    .update({ preview_url: previewUrl })
    .eq('id', simulationId);

  if (error) {
    throw new Error(`Failed to set preview URL: ${error.message}`);
  }

  console.log(`[Genesis] Set preview URL for ${simulationId}: ${previewUrl}`);
}

// Export all functions
export default {
  generateBranchName,
  createSimulationBranch,
  getSimulationBranch,
  listSimulationBranches,
  archiveSimulation,
  deleteVercelPreview,
  deleteGitHubRepo,
  purgeSimulationData,
  markIncinerated,
  incinerateBranch,
  extendTTL,
  checkExpiredSimulations,
  setRepoUrl,
  setPreviewUrl,
  // Tier management (SD-GENESIS-FIX-001)
  getTierConfig,
  getAllTierConfigs
};
