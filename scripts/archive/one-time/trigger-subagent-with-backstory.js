#!/usr/bin/env node

/**
 * Sub-Agent Trigger System with Backstory Access
 * ===============================================
 * Demonstrates how to retrieve and use sub-agent metadata/backstory
 * when triggering sub-agents, ensuring they behave according to their
 * defined expertise and character.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://dedlbzhpgkmetvhbkyzq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

class SubAgentTriggerSystem {
  constructor() {
    this.activeSubAgents = new Map();
  }

  /**
   * Check if any sub-agents should be triggered based on context
   */
  async checkTriggers(context) {
    console.log('🔍 Checking sub-agent triggers for context...\n');
    
    // Extract keywords from context
    const keywords = this.extractKeywords(context);
    console.log('📝 Detected keywords:', keywords);
    
    // Query database for matching triggers
    const { data: triggers } = await supabase
      .from('leo_sub_agent_triggers')
      .select('sub_agent_id, trigger_phrase, trigger_type')
      .in('trigger_phrase', keywords)
      .eq('active', true);
    
    if (!triggers || triggers.length === 0) {
      console.log('No sub-agents triggered.');
      return [];
    }
    
    // Get unique sub-agents that should be triggered
    const subAgentIds = [...new Set(triggers.map(t => t.sub_agent_id))];
    console.log(`\n✅ Triggered ${subAgentIds.length} sub-agents:`, subAgentIds);
    
    return subAgentIds;
  }

  /**
   * Retrieve sub-agent with full metadata/backstory
   */
  async getSubAgentWithBackstory(subAgentId) {
    const { data, error } = await supabase
      .from('leo_sub_agents')
      .select('*')
      .eq('id', subAgentId)
      .single();
    
    if (error) {
      console.error(`Error retrieving sub-agent ${subAgentId}:`, error);
      return null;
    }
    
    return data;
  }

  /**
   * Activate a sub-agent with its full context and backstory
   */
  async activateSubAgent(subAgentId, context) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 ACTIVATING SUB-AGENT: ${subAgentId}`);
    console.log('='.repeat(60));
    
    // Retrieve sub-agent with metadata
    const subAgent = await this.getSubAgentWithBackstory(subAgentId);
    
    if (!subAgent) {
      console.error(`Sub-agent ${subAgentId} not found!`);
      return;
    }
    
    // Display sub-agent identity
    console.log('\n📋 IDENTITY');
    console.log(`Name: ${subAgent.name}`);
    console.log(`Code: ${subAgent.code}`);
    console.log(`Priority: ${subAgent.priority}`);
    console.log(`Description: ${subAgent.description}`);
    
    // Display backstory if available
    if (subAgent.metadata?.backstory) {
      const backstory = subAgent.metadata.backstory;
      
      console.log('\n📖 BACKSTORY');
      console.log(`Summary: ${backstory.summary || 'N/A'}`);
      
      if (backstory.full_story) {
        console.log(`\nFull Story:\n${backstory.full_story.substring(0, 300)}...`);
      }
      
      if (backstory.achievements && backstory.achievements.length > 0) {
        console.log('\n🏆 ACHIEVEMENTS:');
        backstory.achievements.slice(0, 3).forEach((achievement, i) => {
          console.log(`   ${i + 1}. ${achievement}`);
        });
      }
      
      if (backstory.mantras && backstory.mantras.length > 0) {
        console.log('\n💭 GUIDING MANTRAS:');
        backstory.mantras.slice(0, 3).forEach((mantra, i) => {
          console.log(`   ${i + 1}. "${mantra}"`);
        });
      }
    }
    
    // Display expertise level and inspiration
    if (subAgent.metadata?.expertise_level) {
      console.log(`\n⭐ Expertise Level: ${subAgent.metadata.expertise_level}`);
    }
    
    if (subAgent.metadata?.inspiration_sources) {
      console.log(`🎓 Inspired by: ${subAgent.metadata.inspiration_sources.join(', ')}`);
    }
    
    // Generate behavior instructions based on backstory
    const behaviorInstructions = this.generateBehaviorInstructions(subAgent);
    
    console.log('\n🎭 BEHAVIORAL INSTRUCTIONS FOR AI AGENT:');
    console.log(behaviorInstructions);
    
    // Simulate sub-agent execution
    console.log('\n🔧 EXECUTING SUB-AGENT TASK...');
    console.log(`Context: ${context.substring(0, 100)}...`);
    
    // In real implementation, this would:
    // 1. Load the sub-agent's script from subAgent.script_path
    // 2. Pass the behavior instructions and context
    // 3. Execute the sub-agent with its full personality
    
    console.log(`\n✅ Sub-agent ${subAgent.name} execution complete!`);
    console.log('='.repeat(60));
    
    return subAgent;
  }

  /**
   * Generate behavior instructions based on backstory
   */
  generateBehaviorInstructions(subAgent) {
    const instructions = [];
    
    instructions.push(`You are the ${subAgent.name}.`);
    
    if (subAgent.metadata?.backstory?.summary) {
      instructions.push(`Your identity: ${subAgent.metadata.backstory.summary}`);
    }
    
    if (subAgent.metadata?.backstory?.mantras) {
      instructions.push('\nYour guiding principles:');
      subAgent.metadata.backstory.mantras.forEach(mantra => {
        instructions.push(`• ${mantra}`);
      });
    }
    
    if (subAgent.metadata?.expertise_level) {
      instructions.push(`\nYou operate at a ${subAgent.metadata.expertise_level} level.`);
    }
    
    if (subAgent.capabilities && subAgent.capabilities.length > 0) {
      instructions.push('\nYour capabilities include:');
      subAgent.capabilities.slice(0, 5).forEach(cap => {
        instructions.push(`• ${cap}`);
      });
    }
    
    instructions.push('\nApproach every task with the expertise and perspective defined by your backstory.');
    
    return instructions.join('\n');
  }

  /**
   * Extract keywords from context
   */
  extractKeywords(context) {
    const commonTriggers = [
      'error', 'failed', 'bug', 'security', 'performance',
      'database', 'testing', 'design', 'cost', 'optimization',
      'authentication', 'crash', 'memory leak', 'slow'
    ];
    
    const contextLower = context.toLowerCase();
    return commonTriggers.filter(trigger => contextLower.includes(trigger));
  }
}

// Example usage
async function demonstrateTriggerSystem() {
  const triggerSystem = new SubAgentTriggerSystem();
  
  // Test scenario 1: Error context (should trigger Debugging Sub-Agent)
  console.log('📋 TEST SCENARIO 1: Error Context');
  console.log('='.repeat(60));
  
  const errorContext = `
    The application is throwing an error when users try to submit feedback.
    The error message says "Failed to submit feedback" and there seems to be
    a database schema mismatch causing the issue.
  `;
  
  const triggeredAgents = await triggerSystem.checkTriggers(errorContext);
  
  for (const agentId of triggeredAgents) {
    await triggerSystem.activateSubAgent(agentId, errorContext);
  }
  
  // Test scenario 2: Security context
  console.log('\n\n📋 TEST SCENARIO 2: Security Context');
  console.log('='.repeat(60));
  
  const securityContext = `
    We need to implement authentication for the new API endpoints.
    Make sure to follow OWASP guidelines and prevent SQL injection attacks.
  `;
  
  const securityAgents = await triggerSystem.checkTriggers(securityContext);
  
  for (const agentId of securityAgents) {
    await triggerSystem.activateSubAgent(agentId, securityContext);
  }
}

// Run the demonstration
console.log('🎯 SUB-AGENT TRIGGER SYSTEM WITH BACKSTORY ACCESS');
console.log('='.repeat(60));
console.log('This demonstrates how sub-agents access their metadata/backstory');
console.log('when triggered, ensuring they behave according to their defined');
console.log('expertise and character.\n');

demonstrateTriggerSystem().catch(console.error);