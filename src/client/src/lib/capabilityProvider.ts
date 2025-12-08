/**
 * CapabilityProvider - Unified interface for EHG platform capabilities
 * SD: SD-EHG-CAPABILITIES-001
 *
 * Aggregates CrewAI agents, tools, and crews for capability discovery
 * Used by Blueprint Generation for capability matching
 */

import { supabase } from './supabase';

export type CapabilityType = 'agent' | 'tool' | 'crew' | 'api_endpoint' | 'service';

export interface Capability {
  capability_id: string;
  capability_key: string;
  capability_name: string;
  capability_type: CapabilityType;
  capability_role: string;
  description: string;
  status: string;
  implementation_tools: string[] | null;
  implementation_model: string | null;
  compatible_stages: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface CapabilitySearchOptions {
  type?: CapabilityType;
  status?: string;
  query?: string;
  limit?: number;
}

/**
 * CapabilityProvider - Service for querying EHG platform capabilities
 */
export const CapabilityProvider = {
  /**
   * Get all capabilities, optionally filtered by type
   */
  async getAllCapabilities(options: CapabilitySearchOptions = {}): Promise<Capability[]> {
    const { type, status = 'active', limit = 100 } = options;

    const capabilities: Capability[] = [];

    // Query agents
    if (!type || type === 'agent') {
      const { data: agents } = await supabase
        .from('crewai_agents')
        .select('id, agent_key, name, role, goal, backstory, status, tools, llm_model, compatible_stages, created_at, updated_at')
        .eq('status', status)
        .limit(limit);

      if (agents) {
        capabilities.push(...agents.map(a => ({
          capability_id: a.id,
          capability_key: a.agent_key,
          capability_name: a.name,
          capability_type: 'agent' as CapabilityType,
          capability_role: a.role || 'N/A',
          description: a.goal || a.backstory || 'No description',
          status: a.status,
          implementation_tools: a.tools,
          implementation_model: a.llm_model,
          compatible_stages: a.compatible_stages,
          created_at: a.created_at,
          updated_at: a.updated_at
        })));
      }
    }

    // Query tools
    if (!type || type === 'tool') {
      const { data: tools } = await supabase
        .from('agent_tools')
        .select('id, tool_name, tool_type, description, status, created_at, updated_at')
        .eq('status', status)
        .limit(limit);

      if (tools) {
        capabilities.push(...tools.map(t => ({
          capability_id: t.id,
          capability_key: t.tool_name,
          capability_name: t.tool_name,
          capability_type: 'tool' as CapabilityType,
          capability_role: t.tool_type || 'N/A',
          description: t.description || 'No description',
          status: t.status,
          implementation_tools: null,
          implementation_model: null,
          compatible_stages: null,
          created_at: t.created_at,
          updated_at: t.updated_at
        })));
      }
    }

    // Query crews
    if (!type || type === 'crew') {
      const { data: crews } = await supabase
        .from('crewai_crews')
        .select('id, crew_key, crew_name, process_type, description, status, manager_llm, compatible_stages, created_at, updated_at')
        .eq('status', status)
        .limit(limit);

      if (crews) {
        capabilities.push(...crews.map(c => ({
          capability_id: c.id,
          capability_key: c.crew_key,
          capability_name: c.crew_name,
          capability_type: 'crew' as CapabilityType,
          capability_role: c.process_type || 'N/A',
          description: c.description || 'No description',
          status: c.status,
          implementation_tools: null,
          implementation_model: c.manager_llm,
          compatible_stages: c.compatible_stages,
          created_at: c.created_at,
          updated_at: c.updated_at
        })));
      }
    }

    return capabilities;
  },

  /**
   * Get capabilities filtered by type
   */
  async getCapabilitiesByType(type: CapabilityType): Promise<Capability[]> {
    return this.getAllCapabilities({ type });
  },

  /**
   * Search capabilities by name or description
   */
  async searchCapabilities(query: string): Promise<Capability[]> {
    const allCapabilities = await this.getAllCapabilities();
    const lowerQuery = query.toLowerCase();

    return allCapabilities.filter(cap =>
      cap.capability_name.toLowerCase().includes(lowerQuery) ||
      cap.description.toLowerCase().includes(lowerQuery) ||
      cap.capability_key.toLowerCase().includes(lowerQuery)
    );
  },

  /**
   * Get capability counts by type
   */
  async getCapabilityCounts(): Promise<Record<CapabilityType, number>> {
    const { count: agentCount } = await supabase
      .from('crewai_agents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: toolCount } = await supabase
      .from('agent_tools')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    const { count: crewCount } = await supabase
      .from('crewai_crews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    return {
      agent: agentCount || 0,
      tool: toolCount || 0,
      crew: crewCount || 0,
      api_endpoint: 0,
      service: 0
    };
  },

  /**
   * Get a single capability by ID
   */
  async getCapabilityById(id: string, type?: CapabilityType): Promise<Capability | null> {
    const capabilities = await this.getAllCapabilities({ type });
    return capabilities.find(c => c.capability_id === id) || null;
  }
};

export default CapabilityProvider;
