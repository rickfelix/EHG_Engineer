/**
 * Agent Registry - Central Coordination for LEO Protocol Sub-Agents
 *
 * Purpose: Provides unified interface for agent discovery, lookup, and metadata access
 * Database-First: Uses leo_sub_agents table as source of truth
 *
 * Usage:
 *   const registry = new AgentRegistry();
 *   await registry.initialize();
 *   const agent = registry.getAgent('VALIDATION');
 *   const planAgents = registry.getAgentsForPhase('PLAN');
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

class AgentRegistry {
  constructor() {
    this.agents = new Map();
    this.initialized = false;
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }

  /**
   * Initialize registry by loading all agents from database
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const { data: agents, error } = await this.supabase
        .from('leo_sub_agents')
        .select('*')
        .order('code');

      if (error) throw error;

      // Populate registry
      agents.forEach(agent => {
        this.agents.set(agent.code, {
          code: agent.code,
          name: agent.name,
          description: agent.description,
          category: agent.category,
          capabilities: agent.capabilities || [],
          metadata: agent.metadata || {},
          trigger_keywords: agent.trigger_keywords || [],
          execution_phases: agent.execution_phases || [],
          created_at: agent.created_at,
          updated_at: agent.updated_at,
          // Computed paths
          markdownPath: this._getMarkdownPath(agent.code),
          jsPath: this._getJsPath(agent.code),
        });
      });

      this.initialized = true;
      console.log(`✅ Agent Registry initialized with ${this.agents.size} agents`);
    } catch (error) {
      console.error('❌ Failed to initialize Agent Registry:', error.message);
      throw error;
    }
  }

  /**
   * Get agent by code
   * @param {string} code - Agent code (e.g., 'VALIDATION', 'TESTING')
   * @returns {Object|null} Agent metadata or null if not found
   */
  getAgent(code) {
    this._ensureInitialized();
    return this.agents.get(code) || null;
  }

  /**
   * Get all agents
   * @returns {Array<Object>} Array of all agent metadata
   */
  getAllAgents() {
    this._ensureInitialized();
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by phase (PLAN, EXEC, VERIFY, etc.)
   * @param {string} phase - LEO Protocol phase
   * @returns {Array<Object>} Agents that operate in this phase
   */
  getAgentsForPhase(phase) {
    this._ensureInitialized();
    return this.getAllAgents().filter(agent =>
      agent.execution_phases.includes(phase)
    );
  }

  /**
   * Get agents by category (validation, testing, deployment, etc.)
   * @param {string} category - Agent category
   * @returns {Array<Object>} Agents in this category
   */
  getAgentsByCategory(category) {
    this._ensureInitialized();
    return this.getAllAgents().filter(agent =>
      agent.category === category
    );
  }

  /**
   * Search agents by keyword
   * @param {string} keyword - Search term
   * @returns {Array<Object>} Agents matching keyword
   */
  searchByKeyword(keyword) {
    this._ensureInitialized();
    const lowerKeyword = keyword.toLowerCase();

    return this.getAllAgents().filter(agent => {
      const matchesName = agent.name.toLowerCase().includes(lowerKeyword);
      const matchesDescription = agent.description.toLowerCase().includes(lowerKeyword);
      const matchesTriggers = agent.trigger_keywords.some(trigger =>
        trigger.toLowerCase().includes(lowerKeyword)
      );
      const matchesCapabilities = agent.capabilities.some(cap =>
        cap.toLowerCase().includes(lowerKeyword)
      );

      return matchesName || matchesDescription || matchesTriggers || matchesCapabilities;
    });
  }

  /**
   * Get agents with specific capability
   * @param {string} capability - Capability to search for
   * @returns {Array<Object>} Agents with this capability
   */
  getAgentsByCapability(capability) {
    this._ensureInitialized();
    const lowerCapability = capability.toLowerCase();

    return this.getAllAgents().filter(agent =>
      agent.capabilities.some(cap =>
        cap.toLowerCase().includes(lowerCapability)
      )
    );
  }

  /**
   * Check if agent exists
   * @param {string} code - Agent code
   * @returns {boolean}
   */
  hasAgent(code) {
    this._ensureInitialized();
    return this.agents.has(code);
  }

  /**
   * Get agent statistics
   * @returns {Object} Statistics about registered agents
   */
  getStats() {
    this._ensureInitialized();

    const phases = new Set();
    const categories = new Set();
    let totalCapabilities = 0;

    this.getAllAgents().forEach(agent => {
      agent.execution_phases.forEach(phase => phases.add(phase));
      if (agent.category) categories.add(agent.category);
      totalCapabilities += agent.capabilities.length;
    });

    return {
      totalAgents: this.agents.size,
      phases: Array.from(phases).sort(),
      categories: Array.from(categories).sort(),
      totalCapabilities,
      avgCapabilitiesPerAgent: (totalCapabilities / this.agents.size).toFixed(1),
    };
  }

  /**
   * Get agents that should run in parallel for a given phase
   * @param {string} phase - LEO Protocol phase
   * @returns {Array<Object>} Agents that can run in parallel
   */
  getParallelAgentsForPhase(phase) {
    const agents = this.getAgentsForPhase(phase);

    // Filter to agents that are suitable for parallel execution
    // (based on metadata flags or patterns)
    return agents.filter(agent => {
      const metadata = agent.metadata || {};
      return metadata.supports_parallel !== false; // Default to true
    });
  }

  /**
   * Validate agent configuration
   * @param {string} code - Agent code
   * @returns {Object} Validation result
   */
  async validateAgent(code) {
    this._ensureInitialized();

    const agent = this.getAgent(code);
    if (!agent) {
      return {
        valid: false,
        errors: [`Agent '${code}' not found in registry`],
      };
    }

    const errors = [];
    const warnings = [];

    // Check required fields
    if (!agent.name) errors.push('Missing name');
    if (!agent.description) errors.push('Missing description');
    if (!agent.category) warnings.push('Missing category');
    if (!agent.capabilities || agent.capabilities.length === 0) {
      warnings.push('No capabilities defined');
    }
    if (!agent.execution_phases || agent.execution_phases.length === 0) {
      warnings.push('No execution phases defined');
    }

    // Check file existence (non-blocking)
    const fs = require('fs').promises;
    try {
      await fs.access(agent.markdownPath);
    } catch {
      warnings.push(`Markdown file not found: ${agent.markdownPath}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      agent,
    };
  }

  /**
   * Get markdown path for agent code
   * SD-CLAUDE-CODE-2.1.0-LEO-001: Added dual-path support for agent migration
   * Checks .claude/skills/ first (new location with hot-reload), falls back to .claude/agents/
   * @private
   */
  _getMarkdownPath(code) {
    const fs = require('fs');

    // Map database code to markdown filename
    const codeToFilename = {
      'VALIDATION': 'validation-agent.md',
      'TESTING': 'testing-agent.md',
      'GITHUB': 'github-agent.md',
      'DATABASE': 'database-agent.md',
      'SECURITY': 'security-agent.md',
      'DESIGN': 'design-agent.md',
      'DEPENDENCY': 'dependency-agent.md',
      'API': 'api-agent.md',
      'DOCMON': 'docmon-agent.md',
      'RETRO': 'retro-agent.md',
      'PERFORMANCE': 'performance-agent.md',
      'UAT': 'uat-agent.md',
    };

    const filename = codeToFilename[code] || `${code.toLowerCase()}-agent.md`;

    // Dual-path support: Check skills directory first (supports hot-reload)
    const skillsPath = `/mnt/c/_EHG/EHG_Engineer/.claude/skills/${filename}`;
    const agentsPath = `/mnt/c/_EHG/EHG_Engineer/.claude/agents/${filename}`;

    // Prefer skills path if file exists (migrated agents with hooks)
    if (fs.existsSync(skillsPath)) {
      return skillsPath;
    }

    // Fall back to agents path (legacy agents)
    return agentsPath;
  }

  /**
   * Get JavaScript implementation path for agent code
   * @private
   */
  _getJsPath(code) {
    // Map database code to JS filename
    const codeToFilename = {
      'VALIDATION': 'intelligent-base-sub-agent.js', // Used for validation
      'TESTING': 'testing-sub-agent.js',
      'GITHUB': 'github-review-coordinator.js',
      'DATABASE': 'database-sub-agent.js',
      'SECURITY': 'security-sub-agent.js',
      'DESIGN': 'design-sub-agent.js',
      'DEPENDENCY': 'dependency-sub-agent.js',
      'API': 'api-sub-agent.js',
      'DOCMON': 'documentation-sub-agent.js',
      'RETRO': 'base-sub-agent.js', // Generic
      'PERFORMANCE': 'performance-sub-agent.js',
      'UAT': 'uat-sub-agent.js',
    };

    const filename = codeToFilename[code] || `${code.toLowerCase()}-sub-agent.js`;
    return `/mnt/c/_EHG/EHG_Engineer/lib/agents/${filename}`;
  }

  /**
   * Ensure registry is initialized
   * @private
   */
  _ensureInitialized() {
    if (!this.initialized) {
      throw new Error('Agent Registry not initialized. Call initialize() first.');
    }
  }

  /**
   * Reload registry from database
   * @returns {Promise<void>}
   */
  async reload() {
    this.agents.clear();
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Export registry to JSON (for debugging)
   * @returns {Object}
   */
  toJSON() {
    this._ensureInitialized();

    return {
      totalAgents: this.agents.size,
      agents: Array.from(this.agents.entries()).map(([code, agent]) => ({
        code,
        name: agent.name,
        category: agent.category,
        capabilities: agent.capabilities,
        phases: agent.execution_phases,
        version: agent.metadata?.version,
      })),
      stats: this.getStats(),
    };
  }
}

// Singleton instance for convenience
let _instance = null;

/**
 * Get singleton instance of Agent Registry
 * @returns {AgentRegistry}
 */
function getRegistry() {
  if (!_instance) {
    _instance = new AgentRegistry();
  }
  return _instance;
}

/**
 * Initialize and get singleton instance
 * @returns {Promise<AgentRegistry>}
 */
async function initializeRegistry() {
  const registry = getRegistry();
  await registry.initialize();
  return registry;
}

module.exports = {
  AgentRegistry,
  getRegistry,
  initializeRegistry,
};
