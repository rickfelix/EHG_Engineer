#!/usr/bin/env node

/**
 * Sub-Agent Enforcement System for LEO Protocol
 * Automatically detects and enforces ALL sub-agent requirements
 */

import { createClient } from '@supabase/supabase-js';
import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

class SubAgentEnforcementSystem {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    // Define ALL sub-agent triggers based on LEO Protocol
    this.subAgentTriggers = {
      'Testing': {
        description: 'Quality assurance and test verification',
        mandatory: ['PLAN_VERIFICATION'],
        triggers: [
          { condition: 'hasTests', description: 'Tests files exist' },
          { condition: 'hasE2E', description: 'End-to-end tests present' },
          { condition: 'coverageRequired', description: 'Coverage >80% specified' },
          { condition: 'phase:verification', description: 'In verification phase' }
        ]
      },
      
      'Security': {
        description: 'Security analysis and vulnerability assessment',
        mandatory: [],
        triggers: [
          { condition: 'hasAuth', description: 'Authentication/authorization present' },
          { condition: 'hasAPI', description: 'API endpoints exposed' },
          { condition: 'hasTokens', description: 'Token generation/management' },
          { condition: 'hasSensitiveData', description: 'Handles user/financial data' },
          { condition: 'hasEncryption', description: 'Encryption mentioned' },
          { condition: 'mentionsSecurity', description: 'Security explicitly mentioned' }
        ]
      },
      
      'Performance': {
        description: 'Performance optimization and benchmarking',
        mandatory: [],
        triggers: [
          { condition: 'hasLatencyRequirements', description: 'Latency targets defined' },
          { condition: 'hasThroughputRequirements', description: 'Throughput targets defined' },
          { condition: 'hasScalabilityRequirements', description: 'Scalability mentioned' },
          { condition: 'hasMetrics', description: 'Performance metrics specified' },
          { condition: 'hasCaching', description: 'Caching strategy needed' },
          { condition: 'hasOptimization', description: 'Optimization mentioned' }
        ]
      },
      
      'Database': {
        description: 'Database design and optimization',
        mandatory: [],
        triggers: [
          { condition: 'hasSchemaChanges', description: 'Database schema modified' },
          { condition: 'hasMigrations', description: 'Migration files present' },
          { condition: 'hasIndexes', description: 'Index optimization needed' },
          { condition: 'hasRLS', description: 'Row Level Security policies' },
          { condition: 'hasBackup', description: 'Backup strategy needed' },
          { condition: 'hasReplication', description: 'Replication mentioned' }
        ]
      },
      
      'Design': {
        description: 'UI/UX design and user experience',
        mandatory: [],
        triggers: [
          { condition: 'hasUIComponents', description: '2+ UI components' },
          { condition: 'hasUXRequirements', description: 'UX requirements specified' },
          { condition: 'hasAccessibility', description: 'Accessibility mentioned' },
          { condition: 'hasResponsive', description: 'Responsive design needed' },
          { condition: 'hasDesignSystem', description: 'Design system referenced' },
          { condition: 'hasMockups', description: 'Mockups/wireframes mentioned' }
        ]
      },
      
      'Integration': {
        description: 'Third-party integrations and APIs',
        mandatory: [],
        triggers: [
          { condition: 'hasExternalAPIs', description: 'External API calls' },
          { condition: 'hasWebhooks', description: 'Webhooks implementation' },
          { condition: 'hasOAuth', description: 'OAuth integration' },
          { condition: 'hasPayments', description: 'Payment processing' },
          { condition: 'hasMessaging', description: 'Messaging service integration' },
          { condition: 'hasCloudServices', description: 'Cloud service integration' }
        ]
      },
      
      'DevOps': {
        description: 'Deployment and infrastructure',
        mandatory: [],
        triggers: [
          { condition: 'hasCI', description: 'CI/CD pipeline needed' },
          { condition: 'hasContainers', description: 'Containerization mentioned' },
          { condition: 'hasKubernetes', description: 'Kubernetes deployment' },
          { condition: 'hasMonitoring', description: 'Monitoring setup needed' },
          { condition: 'hasLogging', description: 'Centralized logging needed' },
          { condition: 'hasInfrastructure', description: 'Infrastructure as code' }
        ]
      },
      
      'Documentation': {
        description: 'Technical and user documentation',
        mandatory: ['LEAD_APPROVAL'],
        triggers: [
          { condition: 'hasAPIDoc', description: 'API documentation needed' },
          { condition: 'hasUserGuide', description: 'User guide required' },
          { condition: 'hasArchitectureDoc', description: 'Architecture documentation' },
          { condition: 'hasRunbook', description: 'Runbook/playbook needed' },
          { condition: 'hasChangelog', description: 'Changelog maintenance' }
        ]
      },
      
      'Compliance': {
        description: 'Regulatory and compliance checks',
        mandatory: [],
        triggers: [
          { condition: 'hasGDPR', description: 'GDPR compliance needed' },
          { condition: 'hasHIPAA', description: 'HIPAA compliance needed' },
          { condition: 'hasPCI', description: 'PCI compliance needed' },
          { condition: 'hasSOC2', description: 'SOC2 compliance needed' },
          { condition: 'hasDataPrivacy', description: 'Data privacy requirements' },
          { condition: 'hasAuditLog', description: 'Audit logging required' }
        ]
      },
      
      'Analytics': {
        description: 'Analytics and business intelligence',
        mandatory: [],
        triggers: [
          { condition: 'hasMetricsTracking', description: 'Metrics tracking needed' },
          { condition: 'hasAnalyticsPlatform', description: 'Analytics platform integration' },
          { condition: 'hasReporting', description: 'Reporting requirements' },
          { condition: 'hasDashboards', description: 'Dashboard requirements' },
          { condition: 'hasKPIs', description: 'KPI tracking needed' }
        ]
      }
    };
  }

  /**
   * Analyze context to detect required sub-agents
   */
  async analyzeContext(sdId, phase) {
    console.log('🔍 Analyzing context for sub-agent requirements...\n');
    
    const context = await this.gatherContext(sdId);
    const requiredSubAgents = [];
    const detectedTriggers = {};
    
    // Check each sub-agent's triggers
    for (const [agentName, agentConfig] of Object.entries(this.subAgentTriggers)) {
      const triggers = [];
      
      // Check mandatory phases
      if (agentConfig.mandatory.includes(phase)) {
        triggers.push({
          condition: 'mandatory_phase',
          description: `Mandatory for ${phase}`,
          matched: true
        });
      }
      
      // Check condition triggers
      for (const trigger of agentConfig.triggers) {
        const matched = await this.evaluateTrigger(trigger.condition, context);
        if (matched) {
          triggers.push({
            ...trigger,
            matched: true
          });
        }
      }
      
      if (triggers.length > 0) {
        requiredSubAgents.push(agentName);
        detectedTriggers[agentName] = triggers;
      }
    }
    
    return {
      requiredSubAgents,
      detectedTriggers,
      context
    };
  }

  /**
   * Gather context from SD, PRD, and codebase
   */
  async gatherContext(sdId) {
    const context = {
      sdId,
      files: [],
      content: '',
      features: new Set()
    };
    
    // Get SD from database
    const { data: sd } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();
    
    if (sd) {
      context.content += `${sd.title} ${sd.description} ${JSON.stringify(sd.objectives)}`;
    }
    
    // Get PRD from database
    const { data: prds } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('directive_id', sdId);
    
    if (prds && prds.length > 0) {
      const prd = prds[0];
      context.content += ` ${prd.title} ${prd.executive_summary} ${JSON.stringify(prd.acceptance_criteria)}`;
    }
    
    // Scan for specific file patterns
    const scanPaths = [
      'tests/',
      'src/',
      'supabase/',
      'migrations/',
      '.github/workflows/'
    ];
    
    for (const scanPath of scanPaths) {
      try {
        const files = await this.scanDirectory(scanPath);
        context.files.push(...files);
      } catch {
        // Directory might not exist
      }
    }
    
    // Detect features from content and files
    this.detectFeatures(context);
    
    return context;
  }

  /**
   * Scan directory for relevant files (recursive)
   */
  async scanDirectory(dirPath, maxDepth = 3) {
    const files = [];
    const fullPath = path.join(process.cwd(), dirPath);
    
    try {
      await this._scanRecursive(fullPath, dirPath, files, 0, maxDepth);
    } catch {
      // Directory doesn't exist
    }
    
    return files;
  }

  /**
   * Recursive directory scanning helper
   */
  async _scanRecursive(fullPath, relativePath, files, currentDepth, maxDepth) {
    if (currentDepth > maxDepth) return;
    
    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryFullPath = path.join(fullPath, entry.name);
        const entryRelativePath = path.join(relativePath, entry.name);
        
        if (entry.isFile()) {
          // Include relevant file types
          if (this.isRelevantFile(entry.name)) {
            files.push(entryRelativePath);
          }
        } else if (entry.isDirectory()) {
          // Skip node_modules and other irrelevant directories
          if (!this.shouldSkipDirectory(entry.name)) {
            await this._scanRecursive(
              entryFullPath, 
              entryRelativePath, 
              files, 
              currentDepth + 1, 
              maxDepth
            );
          }
        }
      }
    } catch {
      // Can't read directory
    }
  }

  /**
   * Check if file is relevant for analysis
   */
  isRelevantFile(filename) {
    const relevantExtensions = [
      '.js', '.jsx', '.ts', '.tsx',
      '.sql', '.md', '.json', 
      '.test.js', '.spec.js'
    ];
    
    return relevantExtensions.some(ext => filename.endsWith(ext)) ||
           filename === 'Dockerfile' ||
           filename.includes('docker-compose');
  }

  /**
   * Check if directory should be skipped
   */
  shouldSkipDirectory(dirname) {
    const skipDirs = [
      'node_modules', '.git', '.next', 'dist', 'build',
      'coverage', '.nyc_output', 'tmp', '.cache'
    ];
    return skipDirs.includes(dirname);
  }

  /**
   * Detect features from context
   */
  detectFeatures(context) {
    const contentLower = context.content.toLowerCase();
    
    // Testing features
    if (context.files.some(f => f.includes('test') || f.includes('spec'))) {
      context.features.add('hasTests');
    }
    if (contentLower.includes('e2e') || contentLower.includes('end-to-end')) {
      context.features.add('hasE2E');
    }
    if (contentLower.includes('coverage')) {
      context.features.add('coverageRequired');
    }
    
    // Security features
    if (contentLower.includes('auth') || contentLower.includes('token')) {
      context.features.add('hasAuth');
    }
    if (contentLower.includes('api') || context.files.some(f => f.includes('api'))) {
      context.features.add('hasAPI');
    }
    if (contentLower.includes('security') || contentLower.includes('secure')) {
      context.features.add('mentionsSecurity');
    }
    if (contentLower.includes('encrypt')) {
      context.features.add('hasEncryption');
    }
    
    // Performance features
    if (contentLower.includes('latency') || contentLower.includes('ms')) {
      context.features.add('hasLatencyRequirements');
    }
    if (contentLower.includes('performance') || contentLower.includes('optimize')) {
      context.features.add('hasMetrics');
    }
    if (contentLower.includes('cache') || contentLower.includes('caching')) {
      context.features.add('hasCaching');
    }
    
    // Database features
    if (context.files.some(f => f.includes('migration') || f.includes('.sql'))) {
      context.features.add('hasSchemaChanges');
      context.features.add('hasMigrations');
    }
    if (contentLower.includes('rls') || contentLower.includes('row level')) {
      context.features.add('hasRLS');
    }
    
    // UI/Design features
    if (context.files.filter(f => f.includes('component')).length >= 2) {
      context.features.add('hasUIComponents');
    }
    if (contentLower.includes('ux') || contentLower.includes('user experience')) {
      context.features.add('hasUXRequirements');
    }
    if (contentLower.includes('responsive') || contentLower.includes('mobile')) {
      context.features.add('hasResponsive');
    }
    
    // Integration features
    if (contentLower.includes('webhook')) {
      context.features.add('hasWebhooks');
    }
    if (contentLower.includes('oauth')) {
      context.features.add('hasOAuth');
    }
    if (contentLower.includes('payment') || contentLower.includes('stripe')) {
      context.features.add('hasPayments');
    }
    
    // DevOps features
    if (context.files.some(f => f.includes('.github/workflows'))) {
      context.features.add('hasCI');
    }
    if (contentLower.includes('docker') || context.files.some(f => f.includes('Dockerfile'))) {
      context.features.add('hasContainers');
    }
    if (contentLower.includes('monitor') || contentLower.includes('observability')) {
      context.features.add('hasMonitoring');
    }
    
    // Compliance features
    if (contentLower.includes('gdpr')) {
      context.features.add('hasGDPR');
    }
    if (contentLower.includes('privacy') || contentLower.includes('personal data')) {
      context.features.add('hasDataPrivacy');
    }
    if (contentLower.includes('audit')) {
      context.features.add('hasAuditLog');
    }
  }

  /**
   * Evaluate if a trigger condition is met
   */
  async evaluateTrigger(condition, context) {
    // Check if it's a phase condition
    if (condition.startsWith('phase:')) {
      const phase = condition.split(':')[1];
      return context.phase === phase;
    }
    
    // Check if feature is detected
    return context.features.has(condition);
  }

  /**
   * Enforce sub-agent requirements
   */
  async enforceSubAgents(sdId, phase, usedSubAgents = []) {
    console.log('═'.repeat(70));
    console.log('SUB-AGENT ENFORCEMENT CHECK');
    console.log('═'.repeat(70));
    console.log(`\nSD: ${sdId}`);
    console.log(`Phase: ${phase}\n`);
    
    // Analyze what sub-agents are required
    const analysis = await this.analyzeContext(sdId, phase);
    
    // Check which required sub-agents were not used
    const missingSubAgents = analysis.requiredSubAgents.filter(
      agent => !usedSubAgents.includes(agent)
    );
    
    // Display results
    console.log('📋 Required Sub-Agents:');
    if (analysis.requiredSubAgents.length === 0) {
      console.log('  None detected');
    } else {
      for (const agent of analysis.requiredSubAgents) {
        const used = usedSubAgents.includes(agent);
        const status = used ? '✅' : '❌';
        console.log(`  ${status} ${agent}`);
        
        // Show why it was triggered
        const triggers = analysis.detectedTriggers[agent];
        if (triggers) {
          for (const trigger of triggers) {
            console.log(`      ↳ ${trigger.description}`);
          }
        }
      }
    }
    
    console.log('\n📊 Enforcement Result:');
    
    if (missingSubAgents.length === 0) {
      console.log('  ✅ All required sub-agents were activated');
      return {
        valid: true,
        requiredSubAgents: analysis.requiredSubAgents,
        usedSubAgents,
        missingSubAgents: []
      };
    } else {
      console.log('  ❌ Missing required sub-agents:');
      for (const agent of missingSubAgents) {
        console.log(`     • ${agent}: ${this.subAgentTriggers[agent].description}`);
      }
      
      console.log('\n⚠️  HANDOFF BLOCKED');
      console.log('   Required sub-agents must be activated before proceeding.');
      console.log('\n   To activate missing sub-agents:');
      for (const agent of missingSubAgents) {
        console.log(`   node scripts/activate-subagent.js ${agent} ${sdId}`);
      }
      
      return {
        valid: false,
        requiredSubAgents: analysis.requiredSubAgents,
        usedSubAgents,
        missingSubAgents,
        detectedTriggers: analysis.detectedTriggers
      };
    }
  }

  /**
   * Record sub-agent activation
   */
  async recordSubAgentActivation(agentType, sdId, phase, result) {
    const activation = {
      sd_id: sdId,
      phase,
      agent_type: agentType,
      activation_time: new Date().toISOString(),
      result: result || {},
      status: 'completed'
    };
    
    // Store in database
    const { error } = await this.supabase
      .from('subagent_activations')
      .insert(activation);
    
    if (!error) {
      console.log(`✅ ${agentType} sub-agent activation recorded`);
    }
    
    return activation;
  }

  /**
   * Get list of used sub-agents for an SD
   */
  async getUsedSubAgents(sdId) {
    const { data } = await this.supabase
      .from('subagent_activations')
      .select('agent_type')
      .eq('sd_id', sdId);
    
    if (!data) return [];
    
    return [...new Set(data.map(d => d.agent_type))];
  }

  /**
   * Generate enforcement report
   */
  generateReport(result) {
    const report = `
# Sub-Agent Enforcement Report

**SD**: ${result.sdId || 'N/A'}
**Phase**: ${result.phase || 'N/A'}
**Date**: ${new Date().toISOString()}

## Required Sub-Agents
${result.requiredSubAgents.map(agent => `- ${agent}`).join('\n') || 'None'}

## Used Sub-Agents
${result.usedSubAgents.map(agent => `- ✅ ${agent}`).join('\n') || 'None'}

## Missing Sub-Agents
${result.missingSubAgents.map(agent => `- ❌ ${agent}`).join('\n') || 'None'}

## Enforcement Decision
**Valid**: ${result.valid ? 'YES ✅' : 'NO ❌'}

${!result.valid ? `
## Action Required
The following sub-agents must be activated before handoff:
${result.missingSubAgents.map(agent => `1. ${agent}`).join('\n')}
` : ''}
`;
    
    return report;
  }
}

// Main execution
async function main() {
  const enforcer = new SubAgentEnforcementSystem();
  
  // Parse command line arguments
  const [,, sdId, phase, ...usedAgents] = process.argv;
  
  if (!sdId || !phase) {
    console.log('Usage: node subagent-enforcement-system.js SD_ID PHASE [USED_AGENTS...]');
    console.log('Example: node subagent-enforcement-system.js SD-2025-001 PLAN_VERIFICATION Testing Security');
    process.exit(1);
  }
  
  // Check enforcement
  const result = await enforcer.enforceSubAgents(sdId, phase, usedAgents);
  
  // Save report
  const report = enforcer.generateReport({ ...result, sdId, phase });
  const reportPath = path.join(process.cwd(), 'docs', `SUBAGENT_ENFORCEMENT_${sdId}_${Date.now()}.md`);
  await fs.writeFile(reportPath, report);
  console.log(`\n📄 Report saved to: ${reportPath}`);
  
  // Exit with appropriate code
  process.exit(result.valid ? 0 : 1);
}

// Export for use in other scripts
export default SubAgentEnforcementSystem;

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}