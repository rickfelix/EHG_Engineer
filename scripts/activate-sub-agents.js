#!/usr/bin/env node

/**
 * LEO Protocol v4.1.1 - Automated Sub-Agent Activation System
 * Automatically scans PRD content and activates required sub-agents
 * Generates proper handoff communications following LEO standards
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

class SubAgentActivationSystem {
  constructor() {
    // Activation triggers per LEO Protocol v4.1.1 (Updated)
    this.activationTriggers = {
      testing: {
        mandatoryKeywords: ['coverage >80%', 'e2e testing', 'visual inspection', 'playwright'],
        shouldKeywords: ['automated testing', 'test suite', 'regression testing'],
        contextKeywords: ['testing', 'validation', 'quality assurance'],
        priority: 'high',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-TESTING.md',
        tool: 'lib/agents/testing-sub-agent.js'
      },
      api: {
        mandatoryKeywords: ['REST API', 'GraphQL', 'OpenAPI', 'API documentation'],
        shouldKeywords: ['API endpoints', 'API routes', 'API validation', 'rate limiting'],
        contextKeywords: ['endpoint', 'routes', 'requests', 'responses'],
        priority: 'high',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-API.md',
        tool: 'lib/agents/api-sub-agent.js'
      },
      security: {
        mandatoryKeywords: ['authentication', 'authorization', 'PII', 'encryption', 'OWASP'],
        shouldKeywords: ['security', 'login', 'password', 'sensitive data'],
        contextKeywords: ['secure', 'protect', 'access control'],
        priority: 'critical',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-SECURITY.md',
        tool: 'lib/agents/security-sub-agent.js'
      },
      performance: {
        mandatoryKeywords: ['load time <', 'scalability', '>100 users', 'performance metrics'],
        shouldKeywords: ['optimization', 'speed', 'performance'],
        contextKeywords: ['fast', 'efficient', 'responsive'],
        priority: 'high',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-PERFORMANCE.md',
        tool: 'lib/agents/performance-sub-agent.js'
      },
      design: {
        mandatoryKeywords: ['UI/UX', 'responsive design', 'accessibility', 'WCAG'],
        shouldKeywords: ['design system', 'user interface', 'mobile-first'],
        contextKeywords: ['visual', 'layout', 'styling'],
        priority: 'medium',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-DESIGN.md',
        tool: 'lib/agents/design-sub-agent.js'
      },
      database: {
        mandatoryKeywords: ['schema', 'migration', 'database', 'query optimization'],
        shouldKeywords: ['data model', 'SQL', 'indexing'],
        contextKeywords: ['data', 'storage', 'persistence'],
        priority: 'critical',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-DATABASE.md',
        tool: 'lib/agents/database-sub-agent.js'
      },
      cost: {
        mandatoryKeywords: ['Supabase usage', 'API limits', 'cost constraints', 'free tier'],
        shouldKeywords: ['optimization', 'bandwidth', 'storage costs', 'rate limits'],
        contextKeywords: ['expensive', 'pricing', 'budget'],
        priority: 'medium',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-COST.md',
        tool: 'lib/agents/cost-sub-agent.js'
      },
      documentation: {
        mandatoryKeywords: ['README', 'API documentation', 'user guide', 'setup instructions'],
        shouldKeywords: ['documentation', 'examples', 'changelog'],
        contextKeywords: ['document', 'explain', 'guide'],
        priority: 'low',
        contextFile: 'templates/claude-md/sub-agents/CLAUDE-DOCUMENTATION.md',
        tool: 'lib/agents/documentation-sub-agent.js'
      }
    };
    
    this.handoffTemplates = {
      testing: 'templates/handoff-templates/testing-handoff.md',
      security: 'templates/handoff-templates/security-handoff.md',
      performance: 'templates/handoff-templates/performance-handoff.md',
      design: 'templates/handoff-templates/design-handoff.md',
      database: 'templates/handoff-templates/database-handoff.md'
    };
  }

  /**
   * Main activation function - scans PRD and activates sub-agents
   */
  async activateSubAgentsFromPRD(prdPath, options = {}) {
    console.log('🔍 LEO Protocol v4.1.1 - Scanning PRD for sub-agent activation...');
    console.log(`📄 PRD Path: ${prdPath}`);
    
    try {
      // Read PRD content
      const prdContent = await fs.readFile(prdPath, 'utf8');
      
      // Analyze and determine required sub-agents
      const activationResults = this.analyzeActivationRequirements(prdContent);
      
      // Generate handoff communications
      const handoffs = await this.generateHandoffCommunications(activationResults, prdPath);
      
      // Output results
      await this.outputActivationReport(activationResults, handoffs, options);
      
      return {
        activatedAgents: activationResults.activated,
        handoffFiles: handoffs,
        summary: activationResults.summary
      };
      
    } catch (error) {
      console.error('❌ Sub-agent activation failed:', error.message);
      throw error;
    }
  }

  /**
   * Analyze PRD content and determine which sub-agents to activate
   */
  analyzeActivationRequirements(prdContent) {
    console.log('🧠 Analyzing PRD content for activation triggers...');
    
    const lowerContent = prdContent.toLowerCase();
    const activationResults = {
      activated: [],
      considered: [],
      summary: {
        totalTriggers: 0,
        mandatoryActivations: 0,
        recommendedActivations: 0
      }
    };

    // Check each sub-agent type
    for (const [agentType, triggers] of Object.entries(this.activationTriggers)) {
      const analysis = this.analyzeTriggers(lowerContent, triggers);
      
      if (analysis.shouldActivate) {
        activationResults.activated.push({
          agent: agentType,
          priority: triggers.priority,
          reason: analysis.reason,
          triggeredBy: analysis.triggeredBy,
          confidence: analysis.confidence
        });
        
        if (analysis.isMandatory) {
          activationResults.summary.mandatoryActivations++;
        } else {
          activationResults.summary.recommendedActivations++;
        }
      } else {
        activationResults.considered.push({
          agent: agentType,
          reason: 'No activation triggers found',
          checkedKeywords: triggers.mandatoryKeywords.concat(triggers.shouldKeywords)
        });
      }
      
      activationResults.summary.totalTriggers += analysis.triggerCount;
    }

    console.log(`✅ Analysis complete: ${activationResults.activated.length} agents activated`);
    return activationResults;
  }

  /**
   * Analyze triggers for a specific sub-agent
   */
  analyzeTriggers(content, triggers) {
    let triggerCount = 0;
    let mandatoryMatches = 0;
    let shouldMatches = 0;
    let contextMatches = 0;
    const foundTriggers = [];

    // Check mandatory keywords (MUST activate if found)
    for (const keyword of triggers.mandatoryKeywords) {
      if (content.includes(keyword.toLowerCase())) {
        mandatoryMatches++;
        triggerCount++;
        foundTriggers.push({ type: 'mandatory', keyword });
      }
    }

    // Check should keywords (SHOULD activate if found)
    for (const keyword of triggers.shouldKeywords) {
      if (content.includes(keyword.toLowerCase())) {
        shouldMatches++;
        triggerCount++;
        foundTriggers.push({ type: 'should', keyword });
      }
    }

    // Check context keywords (provides context for activation)
    for (const keyword of triggers.contextKeywords) {
      if (content.includes(keyword.toLowerCase())) {
        contextMatches++;
        foundTriggers.push({ type: 'context', keyword });
      }
    }

    // Determine activation decision
    const isMandatory = mandatoryMatches > 0;
    const isRecommended = shouldMatches > 0 || (contextMatches >= 2);
    const shouldActivate = isMandatory || isRecommended;

    // Calculate confidence
    let confidence = 0;
    if (mandatoryMatches > 0) confidence += 50;
    confidence += shouldMatches * 20;
    confidence += contextMatches * 5;
    confidence = Math.min(confidence, 100);

    return {
      shouldActivate,
      isMandatory,
      confidence,
      triggerCount,
      reason: this.generateActivationReason(mandatoryMatches, shouldMatches, contextMatches),
      triggeredBy: foundTriggers
    };
  }

  /**
   * Generate activation reason text
   */
  generateActivationReason(mandatory, should, context) {
    if (mandatory > 0) {
      return `MANDATORY: ${mandatory} critical trigger(s) found`;
    }
    if (should > 0) {
      return `RECOMMENDED: ${should} trigger(s) found`;
    }
    if (context >= 2) {
      return `CONTEXTUAL: ${context} related keywords suggest activation`;
    }
    return 'No sufficient triggers found';
  }

  /**
   * Generate handoff communications for activated sub-agents
   */
  async generateHandoffCommunications(activationResults, prdPath) {
    console.log('📝 Generating handoff communications...');
    
    const handoffs = [];
    const timestamp = new Date().toISOString();
    const prdId = path.basename(prdPath, '.md').toUpperCase();

    for (const activation of activationResults.activated) {
      try {
        // Load handoff template
        const templatePath = this.handoffTemplates[activation.agent];
        let template = await fs.readFile(templatePath, 'utf8');
        
        // Populate template with activation-specific data
        template = this.populateHandoffTemplate(template, {
          prdId,
          timestamp,
          activation,
          prdPath
        });
        
        // Save handoff communication
        const handoffDir = 'handoffs/sub-agents';
        await fs.mkdir(handoffDir, { recursive: true });
        
        const handoffFile = `${handoffDir}/${prdId}-${activation.agent}-handoff.md`;
        await fs.writeFile(handoffFile, template);
        
        handoffs.push({
          agent: activation.agent,
          file: handoffFile,
          priority: activation.priority,
          reason: activation.reason,
          contextFile: this.activationTriggers[activation.agent].contextFile,
          tool: this.activationTriggers[activation.agent].tool
        });
        
        console.log(`✅ Generated ${activation.agent} handoff: ${handoffFile}`);
        
      } catch (error) {
        console.error(`❌ Failed to generate ${activation.agent} handoff:`, error.message);
      }
    }

    return handoffs;
  }

  /**
   * Populate handoff template with specific data
   */
  populateHandoffTemplate(template, data) {
    const { prdId, timestamp, activation, prdPath: _prdPath } = data;
    
    // Standard replacements
    template = template.replace(/\[ISO Date\]/g, timestamp);
    template = template.replace(/\[PRD-ID\]/g, prdId);
    template = template.replace(/\[Specific trigger phrase from PRD\]/g, 
      activation.triggeredBy.map(t => t.keyword).join(', '));
    
    // Priority-based replacements
    const priority = activation.confidence > 80 ? 'Critical' :
                    activation.confidence > 60 ? 'High' :
                    activation.confidence > 40 ? 'Medium' : 'Low';
    template = template.replace(/\[Critical\/High\/Medium\/Low\]/g, priority);
    
    // Agent-specific activation reason
    template = template.replace(/\[coverage >80% \| e2e testing \| visual inspection \| automated testing\]/g, 
      activation.reason);
    
    return template;
  }

  /**
   * Output activation report
   */
  async outputActivationReport(activationResults, handoffs, options) {
    const report = {
      timestamp: new Date().toISOString(),
      protocol: 'LEO v4.1.1',
      summary: activationResults.summary,
      activatedAgents: activationResults.activated,
      handoffFiles: handoffs,
      considereredButNotActivated: activationResults.considered
    };

    // Console output
    console.log('\n🎯 Sub-Agent Activation Report:');
    console.log('='.repeat(50));
    console.log(`📊 Total Agents Activated: ${activationResults.activated.length}`);
    console.log(`⚡ Mandatory Activations: ${activationResults.summary.mandatoryActivations}`);
    console.log(`💡 Recommended Activations: ${activationResults.summary.recommendedActivations}`);
    
    if (activationResults.activated.length > 0) {
      console.log('\n✅ Activated Sub-Agents:');
      for (const activation of activationResults.activated) {
        const icon = activation.priority === 'critical' ? '🔴' : 
                    activation.priority === 'high' ? '🟡' : '🟢';
        console.log(`   ${icon} ${activation.agent.toUpperCase()}: ${activation.reason}`);
        const agentConfig = this.activationTriggers[activation.agent];
        if (agentConfig) {
          console.log(`      Context: ${agentConfig.contextFile}`);
          console.log(`      Tool: ${agentConfig.tool}`);
        }
      }
      
      console.log('\n📋 Handoff Files Generated:');
      for (const handoff of handoffs) {
        console.log(`   📄 ${handoff.file}`);
      }
    }

    // Save detailed report if requested
    if (options.saveReport) {
      const reportFile = 'reports/sub-agent-activation-report.json';
      await fs.mkdir('reports', { recursive: true });
      await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
      console.log(`\n💾 Detailed report saved: ${reportFile}`);
    }

    return report;
  }

  /**
   * Command line interface
   */
  static async runCLI() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      console.log('Usage: node scripts/activate-sub-agents.js <prd-path> [options]');
      console.log('Options:');
      console.log('  --save-report    Save detailed JSON report');
      console.log('  --help          Show this help');
      process.exit(1);
    }

    if (args[0] === '--help') {
      console.log('LEO Protocol v4.1.1 - Sub-Agent Activation System');
      console.log('');
      console.log('Automatically scans PRD content and activates required sub-agents');
      console.log('following LEO Protocol standards for handoff communications.');
      console.log('');
      console.log('Usage: node scripts/activate-sub-agents.js <prd-path> [options]');
      console.log('');
      console.log('Arguments:');
      console.log('  prd-path        Path to PRD file to analyze');
      console.log('');
      console.log('Options:');
      console.log('  --save-report   Save detailed JSON report to reports/');
      console.log('  --help          Show this help message');
      console.log('');
      console.log('Example:');
      console.log('  node scripts/activate-sub-agents.js docs/prds/PRD-001.md --save-report');
      process.exit(0);
    }

    const prdPath = args[0];
    const options = {
      saveReport: args.includes('--save-report')
    };

    const system = new SubAgentActivationSystem();
    
    try {
      const results = await system.activateSubAgentsFromPRD(prdPath, options);
      
      console.log('\n🎉 Sub-agent activation completed successfully!');
      console.log(`📋 ${results.activatedAgents.length} sub-agents ready for work`);
      
      // Exit with appropriate code
      process.exit(0);
      
    } catch (error) {
      console.error('\n💥 Sub-agent activation failed:', error.message);
      process.exit(1);
    }
  }
}

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  SubAgentActivationSystem.runCLI();
}

export default SubAgentActivationSystem;