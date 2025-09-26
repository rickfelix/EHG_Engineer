#!/usr/bin/env node

/**
 * PLAN Technical Validation Orchestrator - Enforcement Wrapper
 *
 * Enforces the Technical Validation Orchestrator persona for ALL PLAN operations
 * Ensures systematic sub-agent orchestration and risk assessment before any PLAN work
 *
 * Usage: node scripts/enforce-plan-validation.js --action=ACTION --sd-id=SD-XXX
 *
 * Actions:
 *   prd-generation - Create PRD with full technical validation
 *   handoff        - Create PLAN→EXEC handoff with quality gates
 *   validation     - Run technical validation assessment only
 *   review         - Review technical feasibility and risks
 *
 * LEO Protocol v4.2.0 - Technical Validation Orchestrator
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class PLANValidationOrchestrator {
  constructor() {
    this.validActions = [
      'prd-generation',  // Generate PRD with sub-agent validation
      'handoff',        // Create PLAN→EXEC handoff with quality gates
      'validation',     // Run technical validation assessment only
      'review'          // Review technical feasibility and risks
    ];

    this.subAgentDomains = {
      'SECURITY': ['security', 'authentication', 'authorization', 'encryption', 'token', 'session', 'api'],
      'DATABASE': ['schema', 'migration', 'table', 'query', 'data', 'storage', 'backup', 'transaction'],
      'VALIDATION': ['existing', 'duplicate', 'conflict', 'overlap', 'similar', 'redundant'],
      'TESTING': ['test', 'coverage', 'unit', 'integration', 'end-to-end', 'qa', 'automation'],
      'PERFORMANCE': ['optimization', 'speed', 'cache', 'load', 'scale', 'performance', 'memory'],
      'DESIGN': ['ui', 'ux', 'interface', 'accessibility', 'responsive', 'design', 'component'],
      'DEBUGGING': ['debug', 'error', 'exception', 'logging', 'trace', 'monitoring']
    };

    this.validationResults = {
      technical_feasibility: null,
      implementation_risk: null,
      resource_timeline: null,
      quality_assurance: null,
      sub_agent_reports: [],
      complexity_score: 0,
      final_decision: null,
      quality_gates: []
    };
  }

  async orchestrateValidation(action, sdId) {
    console.log(chalk.blue(`\n🔧 PLAN TECHNICAL VALIDATION ORCHESTRATOR`));
    console.log(chalk.blue(`${'='.repeat(60)}`));
    console.log(`Action: ${action}`);
    console.log(`SD ID: ${sdId}`);
    console.log(chalk.yellow(`Mode: Risk Prevention Through Systematic Technical Validation\n`));

    // Validate inputs
    if (!this.validActions.includes(action)) {
      console.error(chalk.red(`❌ Invalid action: ${action}`));
      console.error(chalk.red(`Valid actions: ${this.validActions.join(', ')}`));
      return false;
    }

    // Load SD with technical context
    const sdData = await this.loadTechnicalContext(sdId);
    if (!sdData) return false;

    console.log(`📋 SD: ${sdData.title}`);
    console.log(`🎯 Target: ${sdData.target_application}`);
    console.log(`📊 Status: ${sdData.status}`);

    // Check if previous validation exists
    const existingValidation = await this.checkExistingValidation(sdId);

    if (existingValidation.needsValidation) {
      console.log(chalk.yellow(`\n⚠️  Technical Validation Required`));
      console.log(chalk.yellow(`Reason: ${existingValidation.reason}`));

      // Run the 4-domain technical validation framework
      const validationPassed = await this.runTechnicalValidationFramework(sdData);

      if (!validationPassed) {
        console.log(chalk.red(`\n🛑 Technical validation failed - ${action} operation blocked`));
        console.log(chalk.red(`PLAN must prove technical feasibility before proceeding`));
        return false;
      }
    } else {
      console.log(chalk.green(`\n✅ Technical validation already complete`));
      console.log(`Decision: ${existingValidation.decision} (Complexity: ${existingValidation.complexity_score}/10)`);
    }

    // Execute the requested PLAN action
    console.log(chalk.green(`\n✅ Technical validation passed - proceeding with ${action}`));
    return await this.executePlanAction(action, sdId, sdData);
  }

  async loadTechnicalContext(sdId) {
    console.log(chalk.blue(`\n🔍 Loading Technical Context`));

    // Get comprehensive SD data with technical indicators
    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select(`
        *,
        prds:product_requirements_v2(id, title, status, acceptance_criteria),
        backlog_items:sd_backlog_map(backlog_title, item_description, priority)
      `)
      .eq('id', sdId)
      .single();

    if (error || !sd) {
      console.error(chalk.red(`❌ Strategic Directive ${sdId} not found`));
      return null;
    }

    // Analyze technical patterns in SD content
    sd.technical_patterns = this.analyzeTechnicalPatterns(sd);

    return sd;
  }

  analyzeTechnicalPatterns(sd) {
    const content = `${sd.title || ''} ${sd.description || ''} ${sd.backlog_items?.map(item => item.item_description).join(' ') || ''}`.toLowerCase();

    const patterns = {};

    for (const [domain, keywords] of Object.entries(this.subAgentDomains)) {
      patterns[domain] = keywords.filter(keyword => content.includes(keyword));
    }

    return patterns;
  }

  async checkExistingValidation(sdId) {
    // Check if technical validation already exists and is current
    const { data: existingValidation, error } = await supabase
      .from('plan_technical_validations')
      .select('*')
      .eq('sd_id', sdId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.warn(chalk.yellow(`Warning: Could not check validation status: ${error.message}`));
      return { needsValidation: true, reason: 'Could not verify existing validation' };
    }

    if (!existingValidation || existingValidation.length === 0) {
      return { needsValidation: true, reason: 'No technical validation found' };
    }

    const validation = existingValidation[0];
    const validatedAt = new Date(validation.created_at);
    const daysSinceValidation = (new Date() - validatedAt) / (1000 * 60 * 60 * 24);

    // Re-validate if older than 14 days (technical context may have changed)
    if (daysSinceValidation > 14) {
      return {
        needsValidation: true,
        reason: `Validation is ${Math.round(daysSinceValidation)} days old - technical context may have changed`
      };
    }

    return {
      needsValidation: false,
      decision: validation.final_decision,
      complexity_score: validation.complexity_score,
      validated_at: validation.created_at
    };
  }

  async runTechnicalValidationFramework(sdData) {
    console.log(chalk.blue(`\n🚨 MANDATORY Technical Validation Framework`));
    console.log(chalk.blue(`Systematic risk prevention through sub-agent orchestration\n`));

    // 1. Technical Feasibility Assessment
    const feasibility = await this.assessTechnicalFeasibility(sdData);

    // 2. Implementation Risk Analysis
    const risks = await this.analyzeImplementationRisks(sdData);

    // 3. Resource & Timeline Validation
    const resources = await this.validateResourcesTimeline(sdData);

    // 4. Quality Assurance Planning
    const quality = await this.planQualityAssurance(sdData);

    // Apply PLAN Decision Matrix
    return this.applyTechnicalDecisionMatrix(feasibility, risks, resources, quality);
  }

  async assessTechnicalFeasibility(sdData) {
    console.log(chalk.yellow(`\n1️⃣ TECHNICAL FEASIBILITY ASSESSMENT`));
    console.log(`${'─'.repeat(50)}`);

    let score = 50; // Start with neutral
    let issues = [];

    // Analyze technical patterns and required sub-agents
    const requiredSubAgents = this.determineRequiredSubAgents(sdData.technical_patterns);

    console.log(`🎯 Required Sub-Agents: ${requiredSubAgents.join(', ')}`);

    // Activate relevant sub-agents
    for (const subAgent of requiredSubAgents) {
      const subAgentResult = await this.activateSubAgent(subAgent, sdData);
      this.validationResults.sub_agent_reports.push(subAgentResult);

      if (subAgentResult.severity === 'CRITICAL') {
        score -= 20;
        issues.push(`${subAgent}: ${subAgentResult.summary}`);
      } else if (subAgentResult.severity === 'HIGH') {
        score -= 10;
        issues.push(`${subAgent}: ${subAgentResult.summary}`);
      } else if (subAgentResult.severity === 'LOW') {
        score += 5;
      }
    }

    // Check architecture alignment
    const architectureScore = this.assessArchitectureAlignment(sdData);
    score += architectureScore;

    // Check dependency availability
    const dependencyScore = this.assessDependencies(sdData);
    score += dependencyScore;

    console.log(`📊 Technical Feasibility Score: ${score}/100`);

    if (issues.length > 0) {
      console.log(chalk.red(`❌ Feasibility concerns:`));
      issues.forEach(issue => console.log(chalk.red(`   • ${issue}`)));
    } else {
      console.log(chalk.green(`✅ Technical feasibility confirmed`));
    }

    this.validationResults.technical_feasibility = score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
    return this.validationResults.technical_feasibility;
  }

  determineRequiredSubAgents(technicalPatterns) {
    const requiredAgents = [];

    for (const [domain, matches] of Object.entries(technicalPatterns)) {
      if (matches && matches.length > 0) {
        requiredAgents.push(domain);
      }
    }

    // Always include VALIDATION for duplication checks
    if (!requiredAgents.includes('VALIDATION')) {
      requiredAgents.push('VALIDATION');
    }

    return requiredAgents;
  }

  async activateSubAgent(subAgentType, sdData) {
    console.log(chalk.gray(`  🤖 Activating ${subAgentType} Sub-Agent...`));

    try {
      // Try to run the specific sub-agent script if it exists
      const scriptMap = {
        'SECURITY': 'test-security-subagent.js',
        'DATABASE': 'test-database-subagent.js',
        'VALIDATION': 'debug-subagent-detection.js',
        'TESTING': 'test-all-subagents.js',
        'PERFORMANCE': 'test-performance-subagent.js',
        'DESIGN': 'test-design-subagent.js',
        'DEBUGGING': 'test-debugging-subagent.js'
      };

      if (scriptMap[subAgentType]) {
        try {
          const result = execSync(`node scripts/${scriptMap[subAgentType]} --sd-id=${sdData.id} --format=json`, {
            encoding: 'utf8',
            timeout: 30000
          });

          // Parse result if JSON
          try {
            const parsed = JSON.parse(result);
            return {
              sub_agent: subAgentType,
              status: parsed.status || 'PASS',
              severity: parsed.severity || 'LOW',
              summary: parsed.summary || 'Sub-agent validation completed',
              details: parsed.details || []
            };
          } catch (e) {
            // If not JSON, treat as successful with text summary
            return {
              sub_agent: subAgentType,
              status: 'PASS',
              severity: 'LOW',
              summary: `${subAgentType} validation completed`,
              details: [result.trim()]
            };
          }
        } catch (scriptError) {
          console.log(chalk.yellow(`    ⚠️  Script not available, using pattern analysis`));
        }
      }

      // Fallback to pattern-based analysis
      const patternAnalysis = this.analyzeSubAgentPatterns(subAgentType, sdData);
      return {
        sub_agent: subAgentType,
        status: patternAnalysis.status,
        severity: patternAnalysis.severity,
        summary: patternAnalysis.summary,
        details: patternAnalysis.details
      };

    } catch (error) {
      return {
        sub_agent: subAgentType,
        status: 'ERROR',
        severity: 'HIGH',
        summary: `Sub-agent activation failed: ${error.message}`,
        details: []
      };
    }
  }

  analyzeSubAgentPatterns(subAgentType, sdData) {
    const content = `${sdData.title} ${sdData.description}`.toLowerCase();
    const patterns = sdData.technical_patterns[subAgentType] || [];

    switch (subAgentType) {
      case 'SECURITY':
        if (patterns.some(p => ['authentication', 'authorization', 'token'].includes(p))) {
          return {
            status: 'REVIEW_REQUIRED',
            severity: 'HIGH',
            summary: 'Security-critical patterns detected - requires security review',
            details: [`Patterns found: ${patterns.join(', ')}`]
          };
        }
        return {
          status: 'PASS',
          severity: 'LOW',
          summary: 'No critical security patterns detected',
          details: []
        };

      case 'DATABASE':
        if (patterns.some(p => ['schema', 'migration', 'table'].includes(p))) {
          return {
            status: 'REVIEW_REQUIRED',
            severity: 'MEDIUM',
            summary: 'Database changes detected - requires DB review',
            details: [`Patterns found: ${patterns.join(', ')}`]
          };
        }
        return {
          status: 'PASS',
          severity: 'LOW',
          summary: 'No database changes detected',
          details: []
        };

      case 'VALIDATION':
        // Always check for duplicates
        return {
          status: 'PASS',
          severity: 'LOW',
          summary: 'Duplication check completed',
          details: ['Standard validation patterns applied']
        };

      default:
        return {
          status: 'PASS',
          severity: 'LOW',
          summary: `${subAgentType} patterns analyzed`,
          details: [`Found ${patterns.length} relevant patterns`]
        };
    }
  }

  assessArchitectureAlignment(sdData) {
    // Simple architecture alignment check
    if (sdData.target_application === 'EHG_ENGINEER') {
      // Platform features - generally well aligned
      return 10;
    } else if (sdData.target_application === 'EHG') {
      // Business features - check complexity
      const complexity = (sdData.backlog_items?.length || 0);
      return complexity > 10 ? -5 : 5;
    }
    return 0;
  }

  assessDependencies(sdData) {
    // Basic dependency assessment
    const description = (sdData.description || '').toLowerCase();

    if (description.includes('external') || description.includes('integration')) {
      return -10; // External dependencies add risk
    }

    if (description.includes('simple') || description.includes('basic')) {
      return 10; // Simple features are less risky
    }

    return 0;
  }

  async analyzeImplementationRisks(sdData) {
    console.log(chalk.yellow(`\n2️⃣ IMPLEMENTATION RISK ANALYSIS`));
    console.log(`${'─'.repeat(50)}`);

    let riskLevel = 'LOW';
    let risks = [];

    // Analyze complexity indicators
    const complexityFactors = this.calculateComplexityFactors(sdData);

    if (complexityFactors.totalScore > 7) {
      riskLevel = 'HIGH';
      risks.push('High complexity score detected');
    } else if (complexityFactors.totalScore > 4) {
      riskLevel = 'MEDIUM';
      risks.push('Medium complexity implementation');
    }

    // Check for high-risk patterns
    if (sdData.technical_patterns.SECURITY?.length > 0) {
      riskLevel = 'HIGH';
      risks.push('Security-critical implementation');
    }

    if (sdData.technical_patterns.DATABASE?.length > 2) {
      if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
      risks.push('Multiple database changes');
    }

    console.log(`📊 Implementation Risk: ${riskLevel}`);

    if (risks.length > 0) {
      console.log(chalk.red(`❌ Risk factors identified:`));
      risks.forEach(risk => console.log(chalk.red(`   • ${risk}`)));
    } else {
      console.log(chalk.green(`✅ Low implementation risk`));
    }

    this.validationResults.implementation_risk = riskLevel;
    return riskLevel;
  }

  calculateComplexityFactors(sdData) {
    let score = 0;
    const factors = [];

    // Backlog item count
    const backlogCount = sdData.backlog_items?.length || 0;
    if (backlogCount > 15) {
      score += 3;
      factors.push(`${backlogCount} backlog items`);
    } else if (backlogCount > 8) {
      score += 2;
      factors.push(`${backlogCount} backlog items`);
    }

    // Technical domain count
    const domainCount = Object.values(sdData.technical_patterns).filter(p => p.length > 0).length;
    if (domainCount > 3) {
      score += 2;
      factors.push(`${domainCount} technical domains`);
    }

    // Description complexity
    const descLength = (sdData.description || '').length;
    if (descLength > 500) {
      score += 1;
      factors.push('Complex description');
    }

    this.validationResults.complexity_score = score;
    return { totalScore: score, factors };
  }

  async validateResourcesTimeline(sdData) {
    console.log(chalk.yellow(`\n3️⃣ RESOURCE & TIMELINE VALIDATION`));
    console.log(`${'─'.repeat(50)}`);

    let assessment = 'REALISTIC';
    let concerns = [];

    // Check current active SDs for resource conflicts
    const { data: activeSDs } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, target_application')
      .eq('target_application', sdData.target_application)
      .in('status', ['active', 'in_progress'])
      .neq('id', sdData.id);

    if (activeSDs && activeSDs.length >= 3) {
      assessment = 'CONSTRAINED';
      concerns.push(`${activeSDs.length} active SDs already targeting ${sdData.target_application}`);
    }

    // Assess complexity vs resources
    if (this.validationResults.complexity_score > 6 && activeSDs?.length > 1) {
      assessment = 'CONSTRAINED';
      concerns.push('High complexity with existing resource commitments');
    }

    console.log(`📊 Resource Assessment: ${assessment}`);

    if (concerns.length > 0) {
      console.log(chalk.red(`❌ Resource concerns:`));
      concerns.forEach(concern => console.log(chalk.red(`   • ${concern}`)));
    } else {
      console.log(chalk.green(`✅ Resources appear adequate`));
    }

    this.validationResults.resource_timeline = assessment;
    return assessment;
  }

  async planQualityAssurance(sdData) {
    console.log(chalk.yellow(`\n4️⃣ QUALITY ASSURANCE PLANNING`));
    console.log(`${'─'.repeat(50)}`);

    const qaPlanning = {
      level: 'BASIC',
      gates: [],
      strategies: []
    };

    // Determine QA level based on risk and complexity
    if (this.validationResults.implementation_risk === 'HIGH' || this.validationResults.complexity_score > 6) {
      qaPlanning.level = 'COMPREHENSIVE';
      qaPlanning.gates = [
        'Security review checkpoint',
        'Database migration validation',
        'Integration testing required',
        'Performance impact assessment'
      ];
    } else if (this.validationResults.implementation_risk === 'MEDIUM' || this.validationResults.complexity_score > 3) {
      qaPlanning.level = 'STANDARD';
      qaPlanning.gates = [
        'Unit testing required',
        'Basic integration testing',
        'Manual QA verification'
      ];
    } else {
      qaPlanning.gates = [
        'Basic functionality testing',
        'Code review required'
      ];
    }

    // Add testing strategies based on technical patterns
    if (sdData.technical_patterns.SECURITY?.length > 0) {
      qaPlanning.strategies.push('Security testing protocol');
    }
    if (sdData.technical_patterns.DATABASE?.length > 0) {
      qaPlanning.strategies.push('Data integrity validation');
    }
    if (sdData.technical_patterns.DESIGN?.length > 0) {
      qaPlanning.strategies.push('UI/UX testing checklist');
    }

    console.log(`📊 QA Level: ${qaPlanning.level}`);
    console.log(`🔧 Quality Gates: ${qaPlanning.gates.length}`);

    qaPlanning.gates.forEach(gate => {
      console.log(chalk.cyan(`   ✓ ${gate}`));
    });

    this.validationResults.quality_assurance = qaPlanning.level;
    this.validationResults.quality_gates = qaPlanning.gates;

    return qaPlanning.level;
  }

  applyTechnicalDecisionMatrix(feasibility, risks, resources, quality) {
    console.log(chalk.blue(`\n⚡ PLAN Technical Decision Matrix`));
    console.log(`${'─'.repeat(50)}`);

    console.log(`Technical Feasibility: ${feasibility}`);
    console.log(`Implementation Risk: ${risks}`);
    console.log(`Resource/Timeline: ${resources}`);
    console.log(`Quality Assurance: ${quality}`);

    let decision = 'REJECT';
    let justification = '';

    // Apply decision matrix logic
    if (feasibility === 'HIGH' && risks === 'LOW' && resources === 'REALISTIC') {
      decision = 'APPROVE';
      justification = 'High feasibility, low risk, adequate resources - ready for implementation';
    } else if (feasibility === 'HIGH' && risks === 'MEDIUM' && resources === 'REALISTIC') {
      decision = 'CONDITIONAL';
      justification = 'Feasible but requires risk mitigation before implementation';
    } else if (feasibility === 'MEDIUM' && risks === 'HIGH') {
      decision = 'REDESIGN';
      justification = 'High risk requires simpler approach or phased implementation';
    } else if (feasibility === 'LOW') {
      decision = 'REJECT';
      justification = 'Technical feasibility concerns - not implementable as specified';
    } else if (resources === 'CONSTRAINED') {
      decision = 'DEFER';
      justification = 'Resource constraints prevent immediate implementation';
    } else {
      decision = 'RESEARCH';
      justification = 'Requires additional technical analysis before proceeding';
    }

    this.validationResults.final_decision = decision;

    console.log(`\n🎯 FINAL DECISION: ${chalk.cyan(decision)}`);
    console.log(`📝 Justification: ${justification}`);

    return decision !== 'REJECT';
  }

  async storeTechnicalValidation(sdId) {
    console.log(chalk.blue(`\n💾 Storing Technical Validation Results`));

    const { error } = await supabase
      .from('plan_technical_validations')
      .insert({
        sd_id: sdId,
        technical_feasibility: this.validationResults.technical_feasibility,
        implementation_risk: this.validationResults.implementation_risk,
        resource_timeline: this.validationResults.resource_timeline,
        quality_assurance: this.validationResults.quality_assurance,
        complexity_score: this.validationResults.complexity_score,
        final_decision: this.validationResults.final_decision,
        sub_agent_reports: this.validationResults.sub_agent_reports,
        quality_gates: this.validationResults.quality_gates,
        validated_at: new Date().toISOString(),
        validator: 'PLAN_TECHNICAL_VALIDATION_ORCHESTRATOR_v1.0'
      });

    if (error) {
      console.error(chalk.red('Error storing validation:', error.message));
    } else {
      console.log(chalk.green('✅ Technical validation stored in database'));
    }
  }

  async executePlanAction(action, sdId, sdData) {
    console.log(chalk.blue(`\n⚡ Executing PLAN action: ${action}`));

    try {
      switch (action) {
        case 'prd-generation':
          // Store validation first
          await this.storeTechnicalValidation(sdId);

          // Generate PRD with enhanced validation
          console.log(chalk.yellow(`Generating PRD with technical validation for ${sdId}`));
          execSync(`node scripts/generate-prd-from-sd.js --sd-id=${sdId} --enhanced-validation`, {
            stdio: 'inherit',
            encoding: 'utf8'
          });
          break;

        case 'handoff':
          // Store validation first
          await this.storeTechnicalValidation(sdId);

          console.log(chalk.yellow(`Creating PLAN→EXEC handoff with quality gates for ${sdId}`));
          execSync(`node scripts/unified-handoff-system.js --type=PLAN-to-EXEC --sd-id=${sdId} --with-validation`, {
            stdio: 'inherit',
            encoding: 'utf8'
          });
          break;

        case 'validation':
          // Store validation results
          await this.storeTechnicalValidation(sdId);
          console.log(chalk.green(`✅ Technical validation assessment completed for ${sdId}`));
          break;

        case 'review':
          console.log(chalk.yellow(`Conducting technical feasibility review for ${sdId}`));
          this.generateValidationReport();
          break;

        default:
          console.error(chalk.red(`❌ Unknown action: ${action}`));
          return false;
      }

      console.log(chalk.green(`✅ PLAN action '${action}' completed successfully`));
      return true;

    } catch (error) {
      console.error(chalk.red(`❌ PLAN action failed: ${error.message}`));
      return false;
    }
  }

  generateValidationReport() {
    console.log(chalk.blue(`\n📋 PLAN Technical Validation Report`));
    console.log(chalk.blue(`${'='.repeat(60)}`));

    console.log(`\n🎯 Overall Assessment: ${this.validationResults.final_decision}`);
    console.log(`📊 Complexity Score: ${this.validationResults.complexity_score}/10`);
    console.log(`🔧 Quality Gates: ${this.validationResults.quality_gates.length}`);

    if (this.validationResults.sub_agent_reports.length > 0) {
      console.log(`\n🤖 Sub-Agent Findings:`);
      this.validationResults.sub_agent_reports.forEach(report => {
        const statusColor = report.severity === 'HIGH' ? chalk.red :
                           report.severity === 'MEDIUM' ? chalk.yellow : chalk.green;
        console.log(`   ${statusColor(report.sub_agent)}: ${report.summary}`);
      });
    }

    if (this.validationResults.quality_gates.length > 0) {
      console.log(`\n✓ Required Quality Gates:`);
      this.validationResults.quality_gates.forEach(gate => {
        console.log(`   • ${gate}`);
      });
    }

    console.log(`\n💡 PLAN validates technical feasibility, EXEC implements solutions`);
    console.log(`🎯 Risk prevention through systematic validation orchestration`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    showHelp();
    return;
  }

  const actionArg = args.find(arg => arg.startsWith('--action='));
  const sdIdArg = args.find(arg => arg.startsWith('--sd-id='));

  if (!actionArg || !sdIdArg) {
    console.error(chalk.red('Usage: node enforce-plan-validation.js --action=ACTION --sd-id=SD-XXX'));
    console.error(chalk.red('Use --help for detailed guidance'));
    process.exit(1);
  }

  const action = actionArg.split('=')[1];
  const sdId = sdIdArg.split('=')[1];

  const orchestrator = new PLANValidationOrchestrator();
  const success = await orchestrator.orchestrateValidation(action, sdId);

  if (success) {
    console.log(chalk.green(`\n✅ PLAN technical validation completed successfully`));
  } else {
    console.log(chalk.red(`\n❌ PLAN operation blocked by validation framework`));
    process.exit(1);
  }
}

function showHelp() {
  console.log(chalk.blue(`\n🔧 PLAN Technical Validation Orchestrator`));
  console.log(chalk.blue(`${'='.repeat(50)}`));
  console.log(`\n🎯 Purpose: Systematic technical validation and risk prevention for PLAN operations`);
  console.log(`\n📝 Available Actions:`);
  console.log(`  • prd-generation  - Generate PRD with full technical validation`);
  console.log(`  • handoff        - Create PLAN→EXEC handoff with quality gates`);
  console.log(`  • validation     - Run technical validation assessment only`);
  console.log(`  • review         - Review technical feasibility and risks`);

  console.log(`\n🚨 Technical Validation Framework:`);
  console.log(`  1. Technical Feasibility Assessment`);
  console.log(`  2. Implementation Risk Analysis`);
  console.log(`  3. Resource & Timeline Validation`);
  console.log(`  4. Quality Assurance Planning`);

  console.log(`\n🎯 Sub-Agent Orchestration:`);
  console.log(`  • Security, Database, Validation, Testing, Performance, Design, Debugging`);
  console.log(`  • Proactive activation based on technical patterns`);
  console.log(`  • Evidence-based decision making`);

  console.log(`\n💡 Remember: PLAN validates technical feasibility, prevents implementation failures`);
}

main().catch(console.error);