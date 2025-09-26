#!/usr/bin/env node

/**
 * LEAD Critical Evaluator - Mandatory Business Value Assessment
 *
 * ENFORCES the Critical Evaluator persona for ALL strategic directive interactions
 * Runs the 4-question challenge framework before ANY LEAD work begins
 *
 * Usage: node scripts/lead-critical-evaluator.js --sd-id SD-XXX
 *
 * LEO Protocol v4.2.0 - Database First
 */

import { createClient } from '@supabase/supabase-js';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class LEADCriticalEvaluator {
  constructor(sdId) {
    this.sdId = sdId;
    this.evaluationResults = {
      business_value: null,
      duplication_risk: null,
      resource_cost: null,
      scope_complexity: null,
      final_decision: null,
      confidence_score: 0,
      justification: '',
      required_actions: []
    };
  }

  async runFullEvaluation() {
    console.log(chalk.blue(`\n🎯 LEAD CRITICAL EVALUATOR - Strategic Directive Assessment`));
    console.log(chalk.blue(`${'='.repeat(70)}`));
    console.log(chalk.yellow(`SD ID: ${this.sdId}`));
    console.log(chalk.yellow(`Evaluation Mode: SKEPTICAL SCRUTINY (NOT helpful accommodation)`));

    // Load SD data with full context
    const sdData = await this.loadSDContext();
    if (!sdData) return false;

    console.log(`\n📋 Strategic Directive: ${sdData.title}`);
    console.log(`📅 Status: ${sdData.status}`);
    console.log(`🎯 Target App: ${sdData.target_application || 'NOT SET'}`);

    // Run the 4 mandatory challenge questions
    const passed = await this.runChallengeFramework(sdData);

    if (passed) {
      await this.storeEvaluationResults();
      this.generateDecisionReport();
    }

    return passed;
  }

  async loadSDContext() {
    console.log(chalk.blue(`\n🔍 Loading Strategic Directive Context`));

    // Get full SD with related data
    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select(`
        *,
        prds:product_requirements_v2(id, title, status, acceptance_criteria),
        backlog_items:sd_backlog_map(backlog_title, item_description, priority),
        backlog_summary:strategic_directives_backlog(h_count, m_count, l_count, must_have_pct)
      `)
      .eq('id', this.sdId)
      .single();

    if (error || !sd) {
      console.error(chalk.red(`❌ Strategic Directive ${this.sdId} not found`));
      return null;
    }

    // Check for duplicates immediately
    const { data: similarSDs } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, target_application')
      .ilike('title', `%${sd.title.split(' ').slice(0, 3).join('%')}%`)
      .neq('id', this.sdId);

    sd.similar_directives = similarSDs || [];

    return sd;
  }

  async runChallengeFramework(sdData) {
    console.log(chalk.red(`\n🚨 MANDATORY CHALLENGE FRAMEWORK`));
    console.log(chalk.red(`LEAD must prove business value before proceeding\n`));

    // Question 1: Business Value Interrogation
    const businessValue = await this.assessBusinessValue(sdData);

    // Question 2: Duplication & Redundancy Check
    const duplicationRisk = await this.checkDuplication(sdData);

    // Question 3: Resource Justification
    const resourceCost = await this.assessResourceJustification(sdData);

    // Question 4: Scope & Complexity Assessment
    const scopeComplexity = await this.assessScopeComplexity(sdData);

    // Apply LEAD Decision Matrix
    return this.applyDecisionMatrix(businessValue, duplicationRisk, resourceCost, scopeComplexity);
  }

  async assessBusinessValue(sdData) {
    console.log(chalk.yellow(`\n1️⃣ BUSINESS VALUE INTERROGATION`));
    console.log(`${'─'.repeat(40)}`);

    const questions = [
      "What specific business problem does this solve?",
      "What's the measurable ROI or impact?",
      "How does this advance our strategic objectives?",
      "What happens if we DON'T do this?"
    ];

    let score = 0;
    let issues = [];

    // Analyze description for business justification
    const description = sdData.description || '';
    const title = sdData.title || '';

    // Check for business impact keywords
    const businessKeywords = ['revenue', 'cost', 'efficiency', 'user', 'customer', 'competitive', 'growth', 'market'];
    const hasBusinessContext = businessKeywords.some(keyword =>
      description.toLowerCase().includes(keyword) || title.toLowerCase().includes(keyword)
    );

    if (!hasBusinessContext) {
      issues.push("No clear business impact identified in description");
      score -= 20;
    } else {
      score += 20;
    }

    // Check for measurable outcomes
    const measurementKeywords = ['increase', 'reduce', 'improve', 'by %', 'users', 'time', 'performance'];
    const hasMeasurableOutcomes = measurementKeywords.some(keyword =>
      description.toLowerCase().includes(keyword)
    );

    if (!hasMeasurableOutcomes) {
      issues.push("No measurable outcomes defined");
      score -= 15;
    } else {
      score += 15;
    }

    // Check urgency indicators
    const urgencyKeywords = ['critical', 'urgent', 'blocking', 'immediate', 'asap'];
    const hasUrgency = urgencyKeywords.some(keyword =>
      description.toLowerCase().includes(keyword) || title.toLowerCase().includes(keyword)
    );

    if (hasUrgency) score += 10;

    // Check if this is "nice to have" language
    const niceToHaveKeywords = ['nice', 'could', 'maybe', 'eventually', 'someday'];
    const seemsNiceToHave = niceToHaveKeywords.some(keyword =>
      description.toLowerCase().includes(keyword)
    );

    if (seemsNiceToHave) {
      issues.push("Contains 'nice to have' language - questionable priority");
      score -= 25;
    }

    console.log(`📊 Business Value Score: ${score}/45`);

    if (issues.length > 0) {
      console.log(chalk.red(`❌ Issues found:`));
      issues.forEach(issue => console.log(chalk.red(`   • ${issue}`)));
    } else {
      console.log(chalk.green(`✅ Business value clearly articulated`));
    }

    this.evaluationResults.business_value = score >= 25 ? 'HIGH' : score >= 10 ? 'MEDIUM' : 'LOW';
    return this.evaluationResults.business_value;
  }

  async checkDuplication(sdData) {
    console.log(chalk.yellow(`\n2️⃣ DUPLICATION & REDUNDANCY CHECK`));
    console.log(`${'─'.repeat(40)}`);

    let riskLevel = 'LOW';
    let issues = [];

    // Check similar titles
    if (sdData.similar_directives && sdData.similar_directives.length > 0) {
      console.log(chalk.yellow(`⚠️  Found ${sdData.similar_directives.length} similar directive(s):`));

      sdData.similar_directives.forEach(similar => {
        console.log(`   • ${similar.id}: ${similar.title} (${similar.status})`);
        if (similar.status === 'active' || similar.status === 'in_progress') {
          riskLevel = 'HIGH';
          issues.push(`Active SD ${similar.id} may overlap`);
        }
      });
    }

    // Check same target application
    const { data: sameAppSDs } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status')
      .eq('target_application', sdData.target_application)
      .in('status', ['active', 'in_progress'])
      .neq('id', this.sdId);

    if (sameAppSDs && sameAppSDs.length > 3) {
      issues.push(`${sameAppSDs.length} active SDs already targeting ${sdData.target_application}`);
      riskLevel = 'MEDIUM';
    }

    // Check PRD overlap
    if (sdData.prds && sdData.prds.length > 0) {
      const prdKeywords = sdData.prds[0].acceptance_criteria || '';
      // This would ideally check against other PRDs for similar acceptance criteria
      // For now, we'll flag if there are too many PRDs for one SD
      if (sdData.prds.length > 1) {
        issues.push('Multiple PRDs may indicate scope creep');
      }
    }

    console.log(`📊 Duplication Risk: ${riskLevel}`);

    if (issues.length > 0) {
      console.log(chalk.red(`❌ Duplication concerns:`));
      issues.forEach(issue => console.log(chalk.red(`   • ${issue}`)));
    } else {
      console.log(chalk.green(`✅ No significant duplication detected`));
    }

    this.evaluationResults.duplication_risk = riskLevel;
    return riskLevel;
  }

  async assessResourceJustification(sdData) {
    console.log(chalk.yellow(`\n3️⃣ RESOURCE JUSTIFICATION`));
    console.log(`${'─'.repeat(40)}`);

    let costLevel = 'MEDIUM'; // Default assumption
    let issues = [];

    // Analyze scope indicators
    const description = sdData.description || '';

    // High cost indicators
    const highCostKeywords = ['complete', 'full', 'entire', 'rebuild', 'rewrite', 'migrate', 'integrate'];
    const hasHighCostIndicators = highCostKeywords.some(keyword =>
      description.toLowerCase().includes(keyword)
    );

    if (hasHighCostIndicators) {
      costLevel = 'HIGH';
      issues.push('Contains high-effort keywords suggesting major work');
    }

    // Check backlog complexity
    if (sdData.backlog_items && sdData.backlog_items.length > 10) {
      costLevel = 'HIGH';
      issues.push(`${sdData.backlog_items.length} backlog items suggest complex implementation`);
    }

    // Check if PRDs exist (indicates planning effort already invested)
    if (!sdData.prds || sdData.prds.length === 0) {
      issues.push('No PRDs found - planning effort required before approval');
    }

    // Check target application resource availability
    const { data: activeSameApp } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('target_application', sdData.target_application)
      .in('status', ['active', 'in_progress']);

    if (activeSameApp && activeSameApp.length >= 3) {
      costLevel = 'HIGH';
      issues.push(`${sdData.target_application} team already has ${activeSameApp.length} active SDs`);
    }

    // Low cost indicators
    const lowCostKeywords = ['fix', 'update', 'small', 'quick', 'simple', 'minor'];
    const hasLowCostIndicators = lowCostKeywords.some(keyword =>
      description.toLowerCase().includes(keyword)
    );

    if (hasLowCostIndicators && costLevel === 'MEDIUM') {
      costLevel = 'LOW';
    }

    console.log(`📊 Resource Cost: ${costLevel}`);

    if (issues.length > 0) {
      console.log(chalk.red(`❌ Resource concerns:`));
      issues.forEach(issue => console.log(chalk.red(`   • ${issue}`)));
    } else {
      console.log(chalk.green(`✅ Resource requirements appear justified`));
    }

    this.evaluationResults.resource_cost = costLevel;
    return costLevel;
  }

  async assessScopeComplexity(sdData) {
    console.log(chalk.yellow(`\n4️⃣ SCOPE & COMPLEXITY ASSESSMENT`));
    console.log(`${'─'.repeat(40)}`);

    let complexityLevel = 'MEDIUM';
    let issues = [];

    const description = sdData.description || '';
    const title = sdData.title || '';

    // Scope creep indicators
    const scopeCreepKeywords = ['and', 'also', 'plus', 'additionally', 'including', 'comprehensive'];
    const hasScopeCreep = scopeCreepKeywords.filter(keyword =>
      description.toLowerCase().includes(keyword) || title.toLowerCase().includes(keyword)
    ).length > 2;

    if (hasScopeCreep) {
      complexityLevel = 'HIGH';
      issues.push('Multiple conjunctions suggest scope creep');
    }

    // Check if scope is well-defined
    const vagueKeywords = ['better', 'improve', 'enhance', 'optimize', 'various', 'multiple'];
    const hasVagueLanguage = vagueKeywords.some(keyword =>
      description.toLowerCase().includes(keyword) || title.toLowerCase().includes(keyword)
    );

    if (hasVagueLanguage) {
      issues.push('Vague language - scope needs better definition');
    }

    // Check for MVP indicators
    const mvpKeywords = ['mvp', 'minimum', 'basic', 'simple', 'core', 'essential'];
    const hasMVPApproach = mvpKeywords.some(keyword =>
      description.toLowerCase().includes(keyword) || title.toLowerCase().includes(keyword)
    );

    if (hasMVPApproach) {
      complexityLevel = 'LOW';
      console.log(chalk.green(`✅ MVP approach detected - good scope control`));
    }

    // Check backlog item distribution
    if (sdData.backlog_summary && sdData.backlog_summary.length > 0) {
      const summary = sdData.backlog_summary[0];
      const totalItems = (summary.h_count || 0) + (summary.m_count || 0) + (summary.l_count || 0);

      if (totalItems > 15) {
        complexityLevel = 'HIGH';
        issues.push(`${totalItems} backlog items suggest high complexity`);
      }

      if ((summary.must_have_pct || 0) < 60) {
        issues.push(`Only ${summary.must_have_pct}% must-have items - scope may be inflated`);
      }
    }

    console.log(`📊 Scope Complexity: ${complexityLevel}`);

    if (issues.length > 0) {
      console.log(chalk.red(`❌ Complexity concerns:`));
      issues.forEach(issue => console.log(chalk.red(`   • ${issue}`)));
    } else {
      console.log(chalk.green(`✅ Scope appears well-controlled`));
    }

    this.evaluationResults.scope_complexity = complexityLevel;
    return complexityLevel;
  }

  applyDecisionMatrix(businessValue, duplicationRisk, resourceCost, scopeComplexity) {
    console.log(chalk.blue(`\n🔍 LEAD DECISION MATRIX`));
    console.log(`${'─'.repeat(40)}`);

    console.log(`Business Value: ${businessValue}`);
    console.log(`Duplication Risk: ${duplicationRisk}`);
    console.log(`Resource Cost: ${resourceCost}`);
    console.log(`Scope Complexity: ${scopeComplexity}`);

    let decision = 'REJECT';
    let justification = '';
    let actions = [];

    // Apply decision matrix logic from CLAUDE.md
    if (businessValue === 'HIGH' && duplicationRisk === 'LOW' && resourceCost === 'LOW') {
      decision = 'APPROVE';
      justification = 'High value, low risk, reasonable cost - fast-track to PLAN';
      this.evaluationResults.confidence_score = 90;
    } else if (businessValue === 'HIGH' && duplicationRisk === 'LOW' && resourceCost === 'HIGH') {
      decision = 'CONDITIONAL';
      justification = 'High value but high cost - require detailed ROI analysis';
      actions.push('Create detailed ROI projection');
      actions.push('Break into phases if possible');
      this.evaluationResults.confidence_score = 70;
    } else if (businessValue === 'HIGH' && duplicationRisk === 'HIGH') {
      decision = 'CONSOLIDATE';
      justification = 'High value but overlaps existing work - consolidate with existing SDs';
      actions.push('Identify consolidation opportunities');
      actions.push('Consider enhancing existing SD instead');
      this.evaluationResults.confidence_score = 60;
    } else if (businessValue === 'MEDIUM' && duplicationRisk === 'LOW' && resourceCost === 'LOW') {
      decision = 'DEFER';
      justification = 'Medium value - add to lower priority queue';
      actions.push('Set priority to MEDIUM (50-69)');
      actions.push('Revisit after high-value SDs complete');
      this.evaluationResults.confidence_score = 50;
    } else if (businessValue === 'MEDIUM' && (duplicationRisk === 'HIGH' || resourceCost === 'HIGH')) {
      decision = 'REJECT';
      justification = 'Medium value not worth high cost or duplication risk';
      this.evaluationResults.confidence_score = 30;
    } else if (businessValue === 'LOW') {
      decision = 'REJECT';
      justification = 'Low business value - no justification for resource allocation';
      this.evaluationResults.confidence_score = 20;
    } else {
      decision = 'CLARIFY';
      justification = 'Unclear business case - requires better definition before evaluation';
      actions.push('Rewrite SD with clear business objectives');
      actions.push('Define measurable success criteria');
      actions.push('Re-submit for LEAD evaluation');
      this.evaluationResults.confidence_score = 10;
    }

    this.evaluationResults.final_decision = decision;
    this.evaluationResults.justification = justification;
    this.evaluationResults.required_actions = actions;

    return decision !== 'REJECT';
  }

  async storeEvaluationResults() {
    console.log(chalk.blue(`\n💾 Storing Evaluation Results`));

    const { error } = await supabase
      .from('lead_evaluations')
      .insert({
        sd_id: this.sdId,
        business_value: this.evaluationResults.business_value,
        duplication_risk: this.evaluationResults.duplication_risk,
        resource_cost: this.evaluationResults.resource_cost,
        scope_complexity: this.evaluationResults.scope_complexity,
        final_decision: this.evaluationResults.final_decision,
        confidence_score: this.evaluationResults.confidence_score,
        justification: this.evaluationResults.justification,
        required_actions: this.evaluationResults.required_actions,
        evaluated_at: new Date().toISOString(),
        evaluator: 'LEAD_CRITICAL_EVALUATOR_v1.0'
      });

    if (error) {
      console.error(chalk.red('Error storing evaluation:', error.message));
    } else {
      console.log(chalk.green('✅ Evaluation stored in database'));
    }
  }

  generateDecisionReport() {
    console.log(chalk.blue(`\n📋 LEAD CRITICAL EVALUATION REPORT`));
    console.log(chalk.blue(`${'='.repeat(70)}`));

    const decision = this.evaluationResults.final_decision;
    const confidence = this.evaluationResults.confidence_score;

    // Color-code decision
    let decisionColor = chalk.red;
    if (decision === 'APPROVE') decisionColor = chalk.green;
    else if (decision === 'CONDITIONAL' || decision === 'DEFER') decisionColor = chalk.yellow;

    console.log(`\n🎯 FINAL DECISION: ${decisionColor(decision)}`);
    console.log(`📊 Confidence Score: ${confidence}%`);
    console.log(`📝 Justification: ${this.evaluationResults.justification}`);

    if (this.evaluationResults.required_actions.length > 0) {
      console.log(`\n📋 Required Actions:`);
      this.evaluationResults.required_actions.forEach((action, index) => {
        console.log(`   ${index + 1}. ${action}`);
      });
    }

    console.log(`\n${'─'.repeat(70)}`);

    if (decision === 'REJECT') {
      console.log(chalk.red(`🛑 SD ${this.sdId} REJECTED - No further work authorized`));
      console.log(chalk.red(`LEAD must reject requests that don't meet business value threshold`));
    } else if (decision === 'APPROVE') {
      console.log(chalk.green(`✅ SD ${this.sdId} APPROVED - Proceed to LEAD→PLAN handoff`));
    } else {
      console.log(chalk.yellow(`⚠️  SD ${this.sdId} requires additional work before approval`));
    }

    console.log(`\n💡 Remember: LEAD's job is to protect resources, not accommodate requests`);
    console.log(`🎯 Only high-value, well-justified SDs should consume PLAN/EXEC resources`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const sdIdArg = args.find(arg => arg.startsWith('--sd-id='));

  if (!sdIdArg) {
    console.error('Usage: node lead-critical-evaluator.js --sd-id=SD-XXX');
    process.exit(1);
  }

  const sdId = sdIdArg.split('=')[1];
  const evaluator = new LEADCriticalEvaluator(sdId);

  const approved = await evaluator.runFullEvaluation();

  console.log(chalk.blue(`\n${'='.repeat(70)}`));
  if (approved) {
    console.log(chalk.green('✅ LEAD Critical Evaluation Complete - SD may proceed'));
  } else {
    console.log(chalk.red('🛑 LEAD Critical Evaluation Complete - SD blocked'));
    process.exit(1);
  }
}

main().catch(console.error);