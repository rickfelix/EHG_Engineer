#!/usr/bin/env node

/**
 * Sub-Agent Context Distillation System
 * Implements focused communication between sub-agents
 * Part of LEO Protocol v4.2.0 - Enhanced Sub-Agent System
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import crypto from 'crypto';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * SubAgentSummary - Manages context distillation between agents
 */
export class SubAgentSummary {
  constructor(agentCode, sdId = null, prdId = null) {
    this.agentCode = agentCode;
    this.sdId = sdId;
    this.prdId = prdId;
    this.keyFindings = [];
    this.criticalFlags = [];
    this.warnings = [];
    this.recommendations = new Map(); // agent -> recommendations
    this.confidence = 0;
    this.metadata = {};
    this.startTime = Date.now();
  }

  /**
   * Add a key finding (max 5 will be included in summary)
   */
  addFinding(finding, importance = 5) {
    this.keyFindings.push({
      finding,
      importance,
      timestamp: new Date().toISOString()
    });

    // Keep sorted by importance
    this.keyFindings.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Add a critical flag that must be addressed
   */
  addCriticalFlag(flag, context = null) {
    this.criticalFlags.push({
      flag,
      context,
      agent: this.agentCode
    });
  }

  /**
   * Add a warning (non-critical but important)
   */
  addWarning(warning) {
    this.warnings.push(warning);
  }

  /**
   * Add recommendation for specific agent
   */
  addRecommendation(targetAgent, recommendation) {
    if (!this.recommendations.has(targetAgent)) {
      this.recommendations.set(targetAgent, []);
    }
    this.recommendations.get(targetAgent).push(recommendation);
  }

  /**
   * Set confidence score (0-1)
   */
  setConfidence(score) {
    this.confidence = Math.min(1, Math.max(0, score));
  }

  /**
   * Generate distilled handoff for next agent
   */
  generateHandoff(toAgent = null) {
    const executionTime = Date.now() - this.startTime;

    // Get top 5 findings
    const topFindings = this.keyFindings
      .slice(0, 5)
      .map(f => f.finding);

    // Get recommendations for target agent
    const targetRecommendations = toAgent ?
      this.recommendations.get(toAgent) || [] :
      Array.from(this.recommendations.values()).flat();

    return {
      from: this.agentCode,
      to: toAgent,
      summary: {
        findings: topFindings,
        totalFindings: this.keyFindings.length,
        metadata: this.metadata
      },
      criticalFlags: this.criticalFlags.map(f => f.flag),
      warnings: this.warnings.slice(0, 10), // Limit warnings
      recommendations: targetRecommendations,
      confidence: this.confidence,
      executionTimeMs: executionTime
    };
  }

  /**
   * Save handoff to database
   */
  async saveHandoff(toAgent = null, phase = null) {
    const handoff = this.generateHandoff(toAgent);

    try {
      const { data, error } = await supabase
        .from('leo_subagent_handoffs')
        .insert({
          from_agent: this.agentCode,
          to_agent: toAgent,
          sd_id: this.sdId,
          prd_id: this.prdId,
          phase,
          summary: handoff.summary,
          critical_flags: handoff.criticalFlags,
          warnings: handoff.warnings,
          recommendations: handoff.recommendations,
          confidence_score: handoff.confidence,
          execution_time_ms: handoff.executionTimeMs
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Handoff saved: ${this.agentCode} → ${toAgent || 'ALL'}`);
      return data;
    } catch (error) {
      console.error(`❌ Failed to save handoff: ${error.message}`);
      return null;
    }
  }

  /**
   * Retrieve relevant context from previous agents
   */
  async getContextFromAgents(fromAgents = [], maxAge = 3600) {
    try {
      const cutoffTime = new Date(Date.now() - maxAge * 1000).toISOString();

      let query = supabase
        .from('leo_subagent_handoffs')
        .select('*')
        .or(`sd_id.eq.${this.sdId},prd_id.eq.${this.prdId}`)
        .gte('created_at', cutoffTime)
        .order('created_at', { ascending: false });

      if (fromAgents.length > 0) {
        query = query.in('from_agent', fromAgents);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Process and merge context
      const mergedContext = {
        allFindings: [],
        criticalFlags: new Set(),
        warnings: [],
        recommendations: []
      };

      for (const handoff of data || []) {
        // Add findings with source
        if (handoff.summary?.findings) {
          mergedContext.allFindings.push(...handoff.summary.findings.map(f => ({
            finding: f,
            source: handoff.from_agent,
            confidence: handoff.confidence_score
          })));
        }

        // Merge critical flags (deduplicate)
        if (handoff.critical_flags) {
          handoff.critical_flags.forEach(f => mergedContext.criticalFlags.add(f));
        }

        // Collect warnings
        if (handoff.warnings) {
          mergedContext.warnings.push(...handoff.warnings);
        }

        // Collect recommendations for this agent
        if (handoff.recommendations && handoff.to_agent === this.agentCode) {
          mergedContext.recommendations.push(...handoff.recommendations);
        }
      }

      return {
        findings: mergedContext.allFindings.slice(0, 10), // Top 10
        criticalFlags: Array.from(mergedContext.criticalFlags),
        warnings: mergedContext.warnings.slice(0, 5), // Top 5
        recommendations: mergedContext.recommendations,
        sourceAgents: [...new Set(data?.map(d => d.from_agent) || [])]
      };

    } catch (error) {
      console.error(`❌ Failed to get context: ${error.message}`);
      return null;
    }
  }

  /**
   * Query knowledge base for relevant insights
   */
  async queryKnowledgeBase(tags = [], limit = 5) {
    try {
      let query = supabase
        .from('agent_knowledge_base')
        .select('*')
        .eq('is_active', true)
        .order('confidence', { ascending: false })
        .order('usage_count', { ascending: false })
        .limit(limit);

      // Filter by agent if specified
      if (this.agentCode) {
        query = query.eq('agent_code', this.agentCode);
      }

      // Filter by tags if provided
      if (tags.length > 0) {
        query = query.contains('tags', tags);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Update usage count for retrieved knowledge
      if (data && data.length > 0) {
        const ids = data.map(k => k.id);
        await supabase.rpc('increment_knowledge_usage', { knowledge_ids: ids });
      }

      return data || [];

    } catch (error) {
      console.error(`❌ Failed to query knowledge base: ${error.message}`);
      return [];
    }
  }

  /**
   * Add knowledge to the shared knowledge base
   */
  async addToKnowledgeBase(title, content, knowledgeType = 'finding', tags = []) {
    try {
      const { data, error } = await supabase
        .from('agent_knowledge_base')
        .insert({
          agent_code: this.agentCode,
          knowledge_type: knowledgeType,
          title,
          content,
          tags,
          confidence: this.confidence,
          related_sd_ids: this.sdId ? [this.sdId] : [],
          related_prd_ids: this.prdId ? [this.prdId] : []
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Added to knowledge base: ${title}`);
      return data;

    } catch (error) {
      console.error(`❌ Failed to add to knowledge base: ${error.message}`);
      return null;
    }
  }

  /**
   * Broadcast an event to other agents
   */
  async broadcastEvent(eventType, action, payload, targetAgents = null) {
    try {
      const eventId = `evt_${crypto.randomBytes(8).toString('hex')}`;

      const { data, error } = await supabase
        .from('agent_events')
        .insert({
          event_id: eventId,
          agent_code: this.agentCode,
          sd_id: this.sdId,
          prd_id: this.prdId,
          event_type: eventType,
          action,
          payload: {
            ...payload,
            confidence: this.confidence,
            criticalFlags: this.criticalFlags
          },
          target_agents: targetAgents,
          priority: this.criticalFlags.length > 0 ? 'HIGH' : 'MEDIUM'
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`📢 Event broadcast: ${eventType} - ${action}`);
      return data;

    } catch (error) {
      console.error(`❌ Failed to broadcast event: ${error.message}`);
      return null;
    }
  }

  /**
   * Get recent events from other agents
   */
  async getRecentEvents(fromAgents = [], maxAge = 600) {
    try {
      const cutoffTime = new Date(Date.now() - maxAge * 1000).toISOString();

      let query = supabase
        .from('agent_events')
        .select('*')
        .or(`sd_id.eq.${this.sdId},prd_id.eq.${this.prdId}`)
        .gte('timestamp', cutoffTime)
        .order('timestamp', { ascending: false });

      if (fromAgents.length > 0) {
        query = query.in('agent_code', fromAgents);
      }

      // Also get events targeted at this agent
      query = query.or(`target_agents.cs.{${this.agentCode}}`);

      const { data, error } = await query;

      if (error) throw error;

      return data || [];

    } catch (error) {
      console.error(`❌ Failed to get events: ${error.message}`);
      return [];
    }
  }

  /**
   * Cache expensive operation result
   */
  async cacheResult(operationType, result, ttlSeconds = 3600) {
    try {
      const cacheKey = crypto
        .createHash('sha256')
        .update(`${this.agentCode}:${operationType}:${this.sdId}:${this.prdId}`)
        .digest('hex');

      const { data, error } = await supabase
        .from('agent_execution_cache')
        .upsert({
          cache_key: cacheKey,
          agent_code: this.agentCode,
          operation_type: operationType,
          result,
          ttl_seconds: ttlSeconds,
          metadata: {
            sd_id: this.sdId,
            prd_id: this.prdId
          }
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`💾 Cached result for: ${operationType}`);
      return data;

    } catch (error) {
      console.error(`❌ Failed to cache result: ${error.message}`);
      return null;
    }
  }

  /**
   * Get cached result if available
   */
  async getCachedResult(operationType) {
    try {
      const cacheKey = crypto
        .createHash('sha256')
        .update(`${this.agentCode}:${operationType}:${this.sdId}:${this.prdId}`)
        .digest('hex');

      const { data, error } = await supabase
        .from('agent_execution_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .eq('invalidated', false)
        .gte('expires_at', new Date().toISOString())
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No cache hit
          return null;
        }
        throw error;
      }

      // Update hit count
      await supabase
        .from('agent_execution_cache')
        .update({
          hit_count: data.hit_count + 1,
          last_accessed: new Date().toISOString()
        })
        .eq('id', data.id);

      console.log(`✅ Cache hit for: ${operationType}`);
      return data.result;

    } catch (error) {
      console.error(`❌ Failed to get cached result: ${error.message}`);
      return null;
    }
  }
}

/**
 * ContextDistillationManager - Manages overall context flow
 */
export class ContextDistillationManager {
  constructor() {
    this.summaries = new Map();
  }

  /**
   * Create a new summary for an agent
   */
  createSummary(agentCode, sdId, prdId) {
    const summary = new SubAgentSummary(agentCode, sdId, prdId);
    this.summaries.set(agentCode, summary);
    return summary;
  }

  /**
   * Get summary for an agent
   */
  getSummary(agentCode) {
    return this.summaries.get(agentCode);
  }

  /**
   * Orchestrate handoff between agents
   */
  async orchestrateHandoff(fromAgent, toAgent, phase) {
    const summary = this.summaries.get(fromAgent);
    if (!summary) {
      console.error(`No summary found for agent: ${fromAgent}`);
      return null;
    }

    // Save handoff
    const handoff = await summary.saveHandoff(toAgent, phase);

    // Broadcast completion event
    await summary.broadcastEvent(
      'HANDOFF_CREATED',
      `${fromAgent} completed, handing off to ${toAgent}`,
      {
        from: fromAgent,
        to: toAgent,
        phase,
        handoffId: handoff?.id
      },
      [toAgent]
    );

    return handoff;
  }

  /**
   * Get consolidated context for an agent
   */
  async getConsolidatedContext(forAgent, sdId, prdId) {
    const summary = this.createSummary(forAgent, sdId, prdId);

    // Get handoffs from previous agents
    const previousContext = await summary.getContextFromAgents();

    // Get recent events
    const recentEvents = await summary.getRecentEvents();

    // Get relevant knowledge
    const knowledge = await summary.queryKnowledgeBase();

    return {
      agent: forAgent,
      previousContext,
      recentEvents,
      knowledge,
      recommendations: previousContext?.recommendations || []
    };
  }
}

// Export for use in other modules
export default { SubAgentSummary, ContextDistillationManager };