/**
 * Dynamic Agent Creator - Runtime Agent Creation
 * SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001, Phase 5
 *
 * Enables leader agents to create new specialist agents at runtime
 * by inserting into leo_sub_agents. The prompt compiler then generates
 * .md files entirely from DB (no .partial needed).
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { main as runCompiler } from '../../scripts/generate-agent-md-from-db.js';

dotenv.config();

// Default teammate tools — dynamic agents can't have leader tools
const TEAMMATE_TOOLS = ['Bash', 'Read', 'Write', 'SendMessage', 'TaskUpdate', 'TaskList', 'TaskGet'];

/**
 * Create a new specialist agent dynamically from DB.
 *
 * @param {Object} options
 * @param {string} options.code - Unique agent code (e.g., 'REDIS_SPECIALIST')
 * @param {string} options.name - Human-readable name
 * @param {string} options.description - Agent description for frontmatter
 * @param {string} options.instructions - Full agent identity text (replaces .partial body)
 * @param {string[]} [options.capabilities] - List of capabilities
 * @param {string} [options.teamRole='teammate'] - Role (only 'teammate' allowed for dynamic agents)
 * @param {string} [options.modelTier='opus'] - Model tier
 * @param {string[]} [options.categoryMappings] - Issue pattern categories
 * @returns {Promise<{agentCode: string, agentName: string, compiled: boolean, existing: boolean}>}
 */
export async function createDynamicAgent({
  code,
  name,
  description,
  instructions,
  capabilities = [],
  teamRole = 'teammate',
  modelTier = 'opus',
  categoryMappings = [],
}) {
  if (!code || !name || !description || !instructions) {
    throw new Error('Required fields: code, name, description, instructions');
  }

  // Safeguard: dynamic agents can only be teammates
  if (teamRole !== 'teammate') {
    console.warn('   ⚠️  Dynamic agents can only be teammates, forcing team_role=\'teammate\'');
    teamRole = 'teammate';
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Normalize code to uppercase with underscores
  const normalizedCode = code.toUpperCase().replace(/-/g, '_');
  const agentName = normalizedCode.toLowerCase().replace(/_/g, '-') + '-agent';

  // Check for existing agent with same code
  const { data: existing } = await supabase
    .from('leo_sub_agents')
    .select('code, name')
    .eq('code', normalizedCode)
    .single();

  if (existing) {
    console.log(`   ℹ️  Agent ${normalizedCode} already exists: ${existing.name}`);
    return { agentCode: normalizedCode, agentName, compiled: false, existing: true };
  }

  // Insert new agent
  const { error } = await supabase
    .from('leo_sub_agents')
    .insert([{
      id: `dynamic-${normalizedCode.toLowerCase()}-${Date.now()}`,
      code: normalizedCode,
      name,
      description,
      instructions,
      capabilities,
      model_tier: modelTier,
      allowed_tools: TEAMMATE_TOOLS,
      team_role: 'teammate',
      category_mappings: categoryMappings,
      activation_type: 'manual',
      active: true,
      metadata: { dynamic: true, created_at: new Date().toISOString() },
    }]);

  if (error) {
    throw new Error(`Failed to create agent ${normalizedCode}: ${error.message}`);
  }

  console.log(`   ✅ Agent ${normalizedCode} created in database`);

  // Trigger incremental compilation to generate .md from DB instructions
  let compiled = false;
  try {
    // Override argv to run compiler without --incremental (force regeneration)
    const origArgv = process.argv;
    process.argv = [process.argv[0], process.argv[1]];
    await runCompiler();
    process.argv = origArgv;
    compiled = true;
    console.log(`   ✅ Agent ${agentName}.md generated from DB instructions`);
  } catch (err) {
    console.warn(`   ⚠️  Compilation failed (agent still usable via DB): ${err.message}`);
  }

  return { agentCode: normalizedCode, agentName, compiled, existing: false };
}
