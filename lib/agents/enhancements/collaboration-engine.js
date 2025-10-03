import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

#!/usr/bin/env node

/**
 * LEO Protocol v4.1 - Agent Collaboration Engine
 * Orchestrates intelligent collaboration between all agents and sub-agents
 * Implements personality-driven decision making and tool usage patterns
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

class AgentCollaborationEngine {
  constructor() {
    this.agents = new Map();
    this.personas = new Map();
    this.activeCollaborations = new Map();
    this.communicationLog = [];
    this.decisionHistory = [];
    this.loaded = false;
  }
  
  /**
   * Initialize and load personas
   */
  async initialize() {
    if (!this.loaded) {
      await this.loadPersonas();
      this.loaded = true;
    }
  }

  /**
   * Load all agent personas from JSON files
   */
  async loadPersonas() {
    const personaDir = path.join(__dirname, '../personas');
    const subAgentDir = path.join(personaDir, 'sub-agents');
    
    try {
      // Load main agent personas
      const mainAgents = ['lead-agent.json', 'plan-agent.json', 'exec-agent.json'];
      for (const file of mainAgents) {
        const persona = JSON.parse(await fs.readFile(path.join(personaDir, file), 'utf8'));
        this.personas.set(persona.agent, persona);
      }
      
      // Load sub-agent personas
      const subAgentFiles = await fs.readdir(subAgentDir);
      for (const file of subAgentFiles) {
        if (file.endsWith('.json')) {
          const persona = JSON.parse(await fs.readFile(path.join(subAgentDir, file), 'utf8'));
          this.personas.set(persona.agent, persona);
        }
      }
      
      console.log(`✅ Loaded ${this.personas.size} agent personas`);
    } catch (error) {
      console.error('Failed to load personas:', error);
    }
  }

  /**
   * Create an agent instance with personality
   */
  createAgent(agentType, context = {}) {
    const persona = this.personas.get(agentType);
    if (!persona) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }
    
    const agent = {
      id: `${agentType}-${Date.now()}`,
      type: agentType,
      persona: persona,
      context: context,
      state: 'idle',
      memory: [],
      toolUsageHistory: [],
      collaborators: new Set(),
      metrics: {
        decisionsMade: 0,
        tasksCompleted: 0,
        collaborations: 0,
        successRate: 100
      }
    };
    
    this.agents.set(agent.id, agent);
    this.greetAgent(agent);
    
    return agent;
  }

  /**
   * Agent greeting based on personality
   */
  greetAgent(agent) {
    const greeting = this.generateGreeting(agent);
    console.log(`\n${this.getAgentEmoji(agent.type)} ${greeting}\n`);
    this.logCommunication(agent.id, 'system', greeting);
  }

  /**
   * Generate personality-driven greeting
   */
  generateGreeting(agent) {
    const persona = agent.persona;
    const style = persona.behavioral_patterns?.communication?.style || 'standard';
    const catchphrase = this.selectCatchphrase(agent);
    
    const greetings = {
      'LEAD': `${persona.title} online. ${catchphrase} Ready to drive strategic value.`,
      'PLAN': `${persona.title} initialized. ${catchphrase} Architecture mode engaged.`,
      'EXEC': `${persona.title} ready. ${catchphrase} Let's ship quality code.`,
      'TESTING': `${persona.title} activated. ${catchphrase} Preparing to break things constructively.`,
      'SECURITY': `${persona.title} engaged. ${catchphrase} Scanning for vulnerabilities.`,
      'PERFORMANCE': `${persona.title} online. ${catchphrase} Every millisecond counts.`,
      'DESIGN': `${persona.title} ready. ${catchphrase} Creating delightful, accessible experiences. UI/UX mode activated.`,
      'DATABASE': `${persona.title} initialized. ${catchphrase} Data integrity is paramount.`
    };
    
    return greetings[agent.type] || `${agent.type} agent ready for collaboration.`;
  }

  /**
   * Select a catchphrase based on context
   */
  selectCatchphrase(agent) {
    const catchphrases = agent.persona.catchphrases || [];
    if (catchphrases.length === 0) return '';
    
    // Select based on context or randomly
    const index = Math.floor(Math.random() * catchphrases.length);
    return catchphrases[index];
  }

  /**
   * Orchestrate collaboration between agents
   */
  async orchestrateCollaboration(leaderId, collaboratorIds, task) {
    const leader = this.agents.get(leaderId);
    if (!leader) throw new Error(`Leader agent ${leaderId} not found`);
    
    const collaboration = {
      id: `collab-${Date.now()}`,
      leader: leaderId,
      collaborators: collaboratorIds,
      task: task,
      status: 'active',
      decisions: [],
      communications: [],
      startTime: Date.now()
    };
    
    this.activeCollaborations.set(collaboration.id, collaboration);
    
    // Leader initiates collaboration
    const leaderDecision = await this.makeDecision(leader, task);
    collaboration.decisions.push(leaderDecision);
    
    // Collaborators respond based on personality
    for (const collaboratorId of collaboratorIds) {
      const collaborator = this.agents.get(collaboratorId);
      if (collaborator) {
        const response = await this.generateCollaboratorResponse(collaborator, leaderDecision);
        collaboration.communications.push(response);
        
        // Update collaboration metrics
        leader.metrics.collaborations++;
        collaborator.metrics.collaborations++;
      }
    }
    
    return collaboration;
  }

  /**
   * Agent makes a decision based on personality and context
   */
  async makeDecision(agent, task) {
    const persona = agent.persona;
    const decisionFramework = persona.behavioral_patterns?.decision_making?.framework;
    const criteria = persona.behavioral_patterns?.decision_making?.criteria || [];
    
    const decision = {
      agentId: agent.id,
      agentType: agent.type,
      task: task,
      timestamp: Date.now(),
      reasoning: [],
      toolChain: [],
      confidence: 0,
      recommendation: ''
    };
    
    // Apply decision criteria based on personality
    for (const criterion of criteria) {
      const evaluation = this.evaluateCriterion(agent, task, criterion);
      decision.reasoning.push(evaluation);
      decision.confidence += evaluation.score;
    }
    
    // Normalize confidence
    decision.confidence = Math.min(100, decision.confidence / criteria.length);
    
    // Select appropriate tool chain
    decision.toolChain = this.selectToolChain(agent, task);
    
    // Generate recommendation
    decision.recommendation = this.generateRecommendation(agent, decision);
    
    // Update metrics
    agent.metrics.decisionsMade++;
    this.decisionHistory.push(decision);
    
    return decision;
  }

  /**
   * Evaluate a decision criterion
   */
  evaluateCriterion(agent, task, criterion) {
    // Simulate criterion evaluation based on agent personality
    const score = Math.random() * 100; // In real implementation, this would be sophisticated
    
    return {
      criterion: criterion,
      score: score,
      rationale: `${criterion} evaluated with ${agent.type} perspective`
    };
  }

  /**
   * Select optimal tool chain based on agent personality and task
   */
  selectToolChain(agent, task) {
    const toolPatterns = agent.persona.tool_usage_patterns;
    if (!toolPatterns) return [];
    
    // Find matching tool chain for task type
    const chains = toolPatterns.tool_chains || [];
    
    // Simple matching - in reality would be more sophisticated
    const taskKeywords = task.toLowerCase().split(' ');
    
    for (const chain of chains) {
      const purposeKeywords = chain.purpose.toLowerCase().split(' ');
      const hasMatch = taskKeywords.some(keyword => 
        purposeKeywords.includes(keyword)
      );
      
      if (hasMatch) {
        return chain.sequence;
      }
    }
    
    // Default to primary tools
    return Object.keys(toolPatterns.primary_tools || {});
  }

  /**
   * Generate recommendation based on decision
   */
  generateRecommendation(agent, decision) {
    const persona = agent.persona;
    const confidence = decision.confidence;
    
    if (confidence > 80) {
      return `${persona.title} strongly recommends: Proceed with ${decision.toolChain.join(' → ')}`;
    } else if (confidence > 60) {
      return `${persona.title} suggests: Consider ${decision.toolChain[0]} first, then evaluate`;
    } else {
      return `${persona.title} advises: Further analysis needed before proceeding`;
    }
  }

  /**
   * Generate collaborator response based on personality
   */
  async generateCollaboratorResponse(collaborator, leaderDecision) {
    const persona = collaborator.persona;
    const interactionRules = persona.interaction_rules || {};
    
    // Determine tone based on relationship
    const leaderType = this.agents.get(leaderDecision.agentId).type;
    const relationshipRules = interactionRules[`with_${leaderType}`] || {};
    
    const response = {
      from: collaborator.id,
      to: leaderDecision.agentId,
      type: collaborator.type,
      tone: relationshipRules.tone || 'professional',
      content: '',
      suggestions: [],
      concerns: [],
      timestamp: Date.now()
    };
    
    // Generate response content based on personality
    response.content = this.generateResponseContent(collaborator, leaderDecision, relationshipRules);
    
    // Add suggestions if confidence is low
    if (leaderDecision.confidence < 70) {
      response.suggestions = this.generateSuggestions(collaborator, leaderDecision);
    }
    
    // Add concerns based on red flags
    response.concerns = this.identifyConcerns(collaborator, leaderDecision);
    
    this.logCommunication(collaborator.id, leaderDecision.agentId, response);
    
    return response;
  }

  /**
   * Generate response content
   */
  generateResponseContent(collaborator, decision, rules) {
    const templates = collaborator.persona.behavioral_patterns?.communication?.templates || {};
    const catchphrase = this.selectCatchphrase(collaborator);
    
    let content = '';
    
    if (decision.confidence > 80) {
      content = templates.approval || `Acknowledged. ${catchphrase}`;
    } else {
      content = templates.analysis || `Analyzing proposal. ${catchphrase}`;
    }
    
    // Add personality flavor
    if (rules.expectations) {
      content += ` Ensuring ${rules.expectations}.`;
    }
    
    return content;
  }

  /**
   * Generate suggestions based on expertise
   */
  generateSuggestions(agent, decision) {
    const suggestions = [];
    const expertise = agent.persona.backstory?.specialties || [];
    
    // Generate suggestions based on agent expertise
    for (const specialty of expertise) {
      if (decision.task.toLowerCase().includes(specialty.toLowerCase())) {
        suggestions.push({
          specialty: specialty,
          suggestion: `Consider ${specialty} best practices`,
          priority: 'high'
        });
      }
    }
    
    return suggestions;
  }

  /**
   * Identify concerns based on red flags
   */
  identifyConcerns(agent, decision) {
    const concerns = [];
    const redFlags = agent.persona.behavioral_patterns?.decision_making?.red_flags || [];
    
    // Check for red flags
    for (const flag of redFlags) {
      // Simple keyword matching - would be more sophisticated in reality
      if (decision.task.toLowerCase().includes(flag.toLowerCase())) {
        concerns.push({
          flag: flag,
          severity: 'high',
          mitigation: `Address ${flag} before proceeding`
        });
      }
    }
    
    return concerns;
  }

  /**
   * Log communication between agents
   */
  logCommunication(from, to, message) {
    this.communicationLog.push({
      from: from,
      to: to,
      message: message,
      timestamp: Date.now()
    });
  }

  /**
   * Get emoji for agent type
   */
  getAgentEmoji(agentType) {
    const emojis = {
      'LEAD': '👔',
      'PLAN': '📐',
      'EXEC': '⚡',
      'TESTING': '🧪',
      'SECURITY': '🔒',
      'PERFORMANCE': '🚀',
      'DESIGN': '🎨',
      'DATABASE': '🗄️'
    };
    
    return emojis[agentType] || '🤖';
  }

  /**
   * Generate collaboration report
   */
  generateCollaborationReport(collaborationId) {
    const collaboration = this.activeCollaborations.get(collaborationId);
    if (!collaboration) return null;
    
    const duration = Date.now() - collaboration.startTime;
    const leader = this.agents.get(collaboration.leader);
    
    return {
      id: collaboration.id,
      duration: duration,
      leader: {
        type: leader.type,
        title: leader.persona.title
      },
      collaborators: collaboration.collaborators.map(id => {
        const agent = this.agents.get(id);
        return {
          type: agent.type,
          title: agent.persona.title
        };
      }),
      decisions: collaboration.decisions.length,
      communications: collaboration.communications.length,
      averageConfidence: collaboration.decisions.reduce((sum, d) => sum + d.confidence, 0) / collaboration.decisions.length,
      status: collaboration.status
    };
  }

  /**
   * Simulate agent learning from interactions
   */
  learn(agentId, outcome) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Update success rate based on outcome
    const currentRate = agent.metrics.successRate;
    const weight = 0.1; // Learning rate

    agent.metrics.successRate = currentRate * (1 - weight) + (outcome.success ? 100 : 0) * weight;

    // Store in memory for future reference
    agent.memory.push({
      task: outcome.task,
      success: outcome.success,
      toolsUsed: outcome.toolsUsed,
      timestamp: Date.now()
    });

    // Limit memory size
    if (agent.memory.length > 100) {
      agent.memory.shift();
    }
  }

  /**
   * Trigger Design sub-agent for UI/UX analysis
   * Ensures all features have proper UI/UX coverage
   */
  async triggerDesignAnalysis(task, context = {}) {
    const design = this.createAgent('DESIGN', {
      ...context,
      task: task,
      mode: this.detectDesignMode(task)
    });

    const analysis = {
      agent_id: design.id,
      task: task,
      mode: design.context.mode,
      ui_checklist: {},
      ux_checklist: {},
      recommendations: [],
      backend_detected: false,
      ui_required: false,
      timestamp: Date.now()
    };

    // Detect if this is a backend feature needing UI
    const backendPatterns = [
      /api[\/\s]+endpoint/i,
      /database[\/\s]+(table|model)/i,
      /new[\/\s]+route/i,
      /backend[\/\s]+feature/i
    ];

    analysis.backend_detected = backendPatterns.some(pattern => pattern.test(task));

    if (analysis.backend_detected) {
      analysis.ui_required = true;
      analysis.recommendations.push({
        priority: 'CRITICAL',
        message: 'Backend feature detected - UI/UX specifications required',
        action: 'Run Design sub-agent in integrated mode'
      });
    }

    // Determine which mode to run
    if (analysis.mode === 'integrated' || analysis.backend_detected) {
      analysis.recommendations.push({
        priority: 'HIGH',
        message: 'Run both UI and UX analysis',
        action: 'Execute integrated mode workflow'
      });
    }

    return analysis;
  }

  /**
   * Detect which Design sub-agent mode to use based on task
   */
  detectDesignMode(task) {
    const taskLower = task.toLowerCase();

    // Check for UI keywords
    const uiKeywords = ['component', 'visual', 'css', 'style', 'button', 'form', 'ui', 'interface'];
    const hasUI = uiKeywords.some(keyword => taskLower.includes(keyword));

    // Check for UX keywords
    const uxKeywords = ['user flow', 'navigation', 'journey', 'interaction', 'accessibility', 'ux'];
    const hasUX = uxKeywords.some(keyword => taskLower.includes(keyword));

    // Check for backend keywords
    const backendKeywords = ['backend', 'api', 'database', 'endpoint', 'service'];
    const hasBackend = backendKeywords.some(keyword => taskLower.includes(keyword));

    // Determine mode
    if (hasBackend || (hasUI && hasUX)) {
      return 'integrated';
    } else if (hasUI) {
      return 'ui_mode';
    } else if (hasUX) {
      return 'ux_mode';
    } else {
      // Default to integrated for features
      return 'integrated';
    }
  }

  /**
   * Create Design handoff for EXEC phase
   */
  async createDesignHandoff(designAnalysis) {
    return {
      handoff_type: 'DESIGN_TO_EXEC',
      sections: {
        ui_specifications: designAnalysis.ui_checklist,
        ux_specifications: designAnalysis.ux_checklist,
        accessibility_requirements: designAnalysis.recommendations.filter(r => r.message.includes('accessibility')),
        design_system_compliance: 'Required',
        implementation_notes: designAnalysis.recommendations
      },
      validation_rules: [
        'UI checklist 100% complete',
        'UX checklist 100% complete',
        'Accessibility verified',
        'Design system compliant'
      ],
      timestamp: Date.now()
    };
  }
}

// Export for use in other modules
export default AgentCollaborationEngine;

// Demo/Test execution
if (import.meta.url === `file://${process.argv[1]}`) {
  async function demo() {
    console.log('🚀 LEO Protocol v4.1 - Agent Collaboration Engine Demo\n');
    
    const engine = new AgentCollaborationEngine();
    
    // Initialize and load personas
    await engine.initialize();
    
    // Create agent instances
    const lead = engine.createAgent('LEAD', { project: 'Dashboard Optimization' });
    const plan = engine.createAgent('PLAN', { technical: true });
    const exec = engine.createAgent('EXEC', { implementation: true });
    const testing = engine.createAgent('TESTING', { coverage: 90 });
    
    // Simulate collaboration
    console.log('\n📋 Initiating Strategic Planning Collaboration...\n');
    
    const collaboration = await engine.orchestrateCollaboration(
      lead.id,
      [plan.id, exec.id, testing.id],
      'Implement real-time dashboard with 99.9% uptime requirement'
    );
    
    // Generate report
    const report = engine.generateCollaborationReport(collaboration.id);
    
    console.log('\n📊 Collaboration Report:');
    console.log('═'.repeat(50));
    console.log(`Duration: ${report.duration}ms`);
    console.log(`Leader: ${report.leader.title}`);
    console.log(`Collaborators: ${report.collaborators.length}`);
    console.log(`Average Confidence: ${report.averageConfidence.toFixed(1)}%`);
    console.log(`Decisions Made: ${report.decisions}`);
    console.log(`Communications: ${report.communications}`);
    console.log('═'.repeat(50));
    
    // Simulate learning
    engine.learn(exec.id, {
      task: 'Implementation',
      success: true,
      toolsUsed: ['MultiEdit', 'Bash', 'Testing']
    });
    
    console.log(`\n✅ EXEC Agent Success Rate: ${exec.metrics.successRate.toFixed(1)}%`);
  }
  
  demo().catch(console.error);
}