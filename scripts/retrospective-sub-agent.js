#!/usr/bin/env node

/**
 * Retrospective Sub-Agent (RETRO)
 * Automatically generates retrospectives, extracts patterns, and feeds insights to cross-agent intelligence
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class RetrospectiveSubAgent {
  constructor() {
    this.agentCode = 'RETRO';
    this.agentName = 'Retrospective Sub-Agent';
  }

  /**
   * Main entry point - triggered by events or manually
   */
  async execute(context = {}) {
    console.log('🔄 Retrospective Sub-Agent activated\n');

    const {
      trigger = 'manual',
      entityType = 'sprint',
      entityId,
      template = 'sprint_retrospective',
      autoGenerate = true
    } = context;

    try {
      if (autoGenerate) {
        return await this.generateRetrospective(entityType, entityId, template);
      } else {
        return await this.analyzeExistingRetrospectives();
      }
    } catch (error) {
      console.error('❌ Retrospective Sub-Agent error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate a new retrospective
   */
  async generateRetrospective(entityType, entityId, templateName) {
    console.log(`📝 Generating ${entityType} retrospective...`);

    // Get template
    const template = await this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    // Gather data based on entity type
    let retrospectiveData;
    switch (entityType) {
      case 'sprint':
        retrospectiveData = await this.gatherSprintData(entityId);
        break;
      case 'sd':
        retrospectiveData = await this.gatherSDData(entityId);
        break;
      case 'milestone':
        retrospectiveData = await this.gatherMilestoneData(entityId);
        break;
      default:
        retrospectiveData = await this.gatherGeneralData();
    }

    // Analyze patterns
    const patterns = await this.extractPatterns(retrospectiveData);

    // Generate insights
    const insights = await this.generateInsights(retrospectiveData, patterns);

    // Create retrospective record
    const retrospective = await this.createRetrospective({
      ...retrospectiveData,
      ...patterns,
      insights,
      generated_by: 'SUB_AGENT',
      trigger_event: `${entityType}_completion`
    });

    // Link to cross-agent intelligence
    await this.linkToIntelligence(retrospective);

    // Create action items
    await this.createActionItems(retrospective, insights);

    console.log(`✅ Retrospective generated: ${retrospective.title}`);
    return { success: true, retrospectiveId: retrospective.id };
  }

  /**
   * Gather sprint-specific data
   */
  async gatherSprintData(sprintId) {
    console.log(`📊 Gathering data for sprint ${sprintId || 'current'}...`);

    // Get sprint activities
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 14 * 24 * 60 * 60 * 1000); // 2 weeks

    // Get completed SDs in sprint period
    const { data: completedSDs } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .gte('updated_at', startDate.toISOString())
      .lte('updated_at', endDate.toISOString())
      .in('status', ['completed', 'pending_approval']);

    // Get agent activities
    const { data: handoffs } = await supabase
      .from('handoff_state_tracker')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    // Calculate metrics
    const velocity = completedSDs?.length || 0;
    const handoffCount = handoffs?.length || 0;

    // Analyze what went well
    const whatWentWell = [];
    if (velocity > 0) {
      whatWentWell.push({
        text: `Completed ${velocity} strategic directives`,
        category: 'productivity'
      });
    }

    if (handoffCount > 5) {
      whatWentWell.push({
        text: `Smooth handoff process with ${handoffCount} successful transitions`,
        category: 'process'
      });
    }

    // Analyze what needs improvement
    const whatNeedsImprovement = [];
    const blockedSDs = completedSDs?.filter(sd => sd.status === 'pending_approval');
    if (blockedSDs?.length > 0) {
      whatNeedsImprovement.push({
        text: `${blockedSDs.length} SDs stuck in approval process`,
        category: 'process'
      });
    }

    return {
      title: `Sprint Retrospective - ${new Date().toLocaleDateString()}`,
      description: `Automated retrospective for sprint ending ${endDate.toLocaleDateString()}`,
      retro_type: 'SPRINT',
      period_start: startDate,
      period_end: endDate,
      what_went_well: whatWentWell,
      what_needs_improvement: whatNeedsImprovement,
      velocity_achieved: velocity,
      objectives_met: velocity > 3
    };
  }

  /**
   * Gather SD-specific data
   */
  async gatherSDData(sdId) {
    console.log(`📊 Gathering data for SD ${sdId}...`);

    // Get SD details
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (!sd) {
      throw new Error(`SD ${sdId} not found`);
    }

    // Get learning outcomes if they exist
    const { data: learningOutcome } = await supabase
      .from('agent_learning_outcomes')
      .select('*')
      .eq('sd_id', sdId)
      .single();

    // Get handoffs for this SD
    const { data: handoffs } = await supabase
      .from('handoff_state_tracker')
      .select('*')
      .eq('sd_id', sdId)
      .order('created_at');

    // Analyze timeline
    const startDate = new Date(sd.created_at);
    const endDate = new Date();
    const durationDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    // Build retrospective data
    const whatWentWell = [];
    const whatNeedsImprovement = [];
    const keyLearnings = [];

    // Analyze outcomes
    if (learningOutcome) {
      if (learningOutcome.exec_final_quality_score >= 85) {
        whatWentWell.push({
          text: `High quality implementation with score of ${learningOutcome.exec_final_quality_score}`,
          category: 'quality'
        });
      }

      if (learningOutcome.plan_complexity_score && learningOutcome.exec_actual_complexity) {
        const complexityAccuracy = Math.abs(learningOutcome.plan_complexity_score - learningOutcome.exec_actual_complexity);
        if (complexityAccuracy <= 2) {
          whatWentWell.push({
            text: 'Accurate complexity estimation by PLAN agent',
            category: 'planning'
          });
        } else {
          whatNeedsImprovement.push({
            text: `Complexity estimation was off by ${complexityAccuracy} points`,
            category: 'planning'
          });
        }
      }

      // Extract failure factors
      if (learningOutcome.failure_factors?.length > 0) {
        learningOutcome.failure_factors.forEach(factor => {
          whatNeedsImprovement.push({
            text: factor,
            category: 'general'
          });
        });
      }

      // Extract success factors
      if (learningOutcome.success_factors?.length > 0) {
        learningOutcome.success_factors.forEach(factor => {
          whatWentWell.push({
            text: factor,
            category: 'general'
          });
        });
      }
    }

    // Timeline analysis
    if (durationDays > 30) {
      whatNeedsImprovement.push({
        text: `SD took ${durationDays} days to complete (expected < 30)`,
        category: 'timeline'
      });
    } else {
      whatWentWell.push({
        text: `Completed within timeline (${durationDays} days)`,
        category: 'timeline'
      });
    }

    // Handoff analysis
    const handoffDelays = handoffs?.filter(h => {
      const created = new Date(h.created_at);
      const updated = new Date(h.updated_at);
      return (updated - created) > 24 * 60 * 60 * 1000; // More than 1 day
    });

    if (handoffDelays?.length > 0) {
      whatNeedsImprovement.push({
        text: `${handoffDelays.length} handoffs had delays`,
        category: 'process'
      });
    }

    // Key learnings from complexity
    if (learningOutcome?.complexity_factors?.length > 0) {
      keyLearnings.push({
        text: `Key complexity factors: ${learningOutcome.complexity_factors.join(', ')}`,
        category: 'technical'
      });
    }

    return {
      title: `SD Completion Retrospective: ${sd.title}`,
      description: sd.description,
      retro_type: 'SD_COMPLETION',
      sd_id: sdId,
      project_name: sd.title,
      period_start: startDate,
      period_end: endDate,
      what_went_well: whatWentWell,
      what_needs_improvement: whatNeedsImprovement,
      key_learnings: keyLearnings,
      quality_score: learningOutcome?.exec_final_quality_score,
      objectives_met: sd.status === 'completed',
      on_schedule: durationDays <= 30,
      business_value_delivered: sd.business_value || 'TBD',
      agents_involved: ['LEAD', 'PLAN', 'EXEC']
    };
  }

  /**
   * Gather milestone data
   */
  async gatherMilestoneData(milestoneId) {
    // Simplified for now
    return {
      title: `Milestone Retrospective - ${new Date().toLocaleDateString()}`,
      description: 'Automated milestone retrospective',
      retro_type: 'MILESTONE',
      what_went_well: [],
      what_needs_improvement: [],
      key_learnings: []
    };
  }

  /**
   * Gather general data for weekly/monthly retrospectives
   */
  async gatherGeneralData() {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // 1 week

    return {
      title: `Weekly Retrospective - ${endDate.toLocaleDateString()}`,
      description: 'Automated weekly retrospective',
      retro_type: 'WEEKLY',
      period_start: startDate,
      period_end: endDate,
      what_went_well: [],
      what_needs_improvement: [],
      key_learnings: []
    };
  }

  /**
   * Extract patterns from retrospective data
   */
  async extractPatterns(data) {
    const successPatterns = [];
    const failurePatterns = [];
    const improvementAreas = [];

    // Analyze what went well for patterns
    data.what_went_well?.forEach(item => {
      if (item.category === 'quality') {
        successPatterns.push('high-quality-delivery');
      }
      if (item.category === 'timeline') {
        successPatterns.push('on-time-delivery');
      }
      if (item.category === 'process') {
        successPatterns.push('smooth-process');
      }
    });

    // Analyze improvements needed for patterns
    data.what_needs_improvement?.forEach(item => {
      if (item.category === 'planning') {
        failurePatterns.push('planning-inaccuracy');
        improvementAreas.push('estimation');
      }
      if (item.category === 'timeline') {
        failurePatterns.push('timeline-overrun');
        improvementAreas.push('velocity');
      }
      if (item.category === 'process') {
        failurePatterns.push('process-delays');
        improvementAreas.push('handoffs');
      }
    });

    // Check historical patterns
    const { data: historicalPatterns } = await supabase
      .from('intelligence_patterns')
      .select('pattern_value, success_rate')
      .in('pattern_value', [...successPatterns, ...failurePatterns])
      .limit(10);

    // Update pattern frequencies
    for (const pattern of historicalPatterns || []) {
      await this.updatePatternFrequency(pattern.pattern_value);
    }

    return {
      success_patterns: [...new Set(successPatterns)],
      failure_patterns: [...new Set(failurePatterns)],
      improvement_areas: [...new Set(improvementAreas)]
    };
  }

  /**
   * Generate insights from data and patterns
   */
  async generateInsights(data, patterns) {
    const insights = [];

    // Success insights
    patterns.success_patterns?.forEach(pattern => {
      insights.push({
        insight_type: 'SUCCESS_FACTOR',
        title: `Success pattern: ${pattern}`,
        description: `This pattern contributed to positive outcomes`,
        impact_level: 'HIGH',
        is_actionable: false,
        relates_to_patterns: [pattern]
      });
    });

    // Failure insights
    patterns.failure_patterns?.forEach(pattern => {
      insights.push({
        insight_type: 'FAILURE_MODE',
        title: `Failure pattern: ${pattern}`,
        description: `This pattern needs attention to prevent future issues`,
        impact_level: 'HIGH',
        is_actionable: true,
        relates_to_patterns: [pattern],
        recommended_actions: [{
          action: `Review and improve ${pattern} processes`,
          assignTo: this.getResponsibleAgent(pattern)
        }]
      });
    });

    // Process improvements
    patterns.improvement_areas?.forEach(area => {
      insights.push({
        insight_type: 'PROCESS_IMPROVEMENT',
        title: `Improvement needed in ${area}`,
        description: `Focus on improving ${area} to enhance overall performance`,
        impact_level: 'MEDIUM',
        is_actionable: true,
        affected_areas: [area]
      });
    });

    // Learning insights
    data.key_learnings?.forEach(learning => {
      insights.push({
        insight_type: learning.category === 'technical' ? 'TECHNICAL_LEARNING' : 'BUSINESS_LEARNING',
        title: learning.text.substring(0, 100),
        description: learning.text,
        impact_level: 'MEDIUM',
        is_actionable: false
      });
    });

    return insights;
  }

  /**
   * Create retrospective in database
   */
  async createRetrospective(data) {
    // Remove insights from data as it goes in separate table
    const { insights, ...retrospectiveData } = data;

    const { data: retrospective, error } = await supabase
      .from('retrospectives')
      .insert({
        ...retrospectiveData,
        conducted_date: new Date(),
        status: 'PUBLISHED'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create retrospective: ${error.message}`);
    }

    // Insert insights
    if (insights?.length > 0) {
      const insightsToInsert = insights.map(insight => ({
        ...insight,
        retrospective_id: retrospective.id
      }));

      await supabase
        .from('retrospective_insights')
        .insert(insightsToInsert);
    }

    return retrospective;
  }

  /**
   * Link retrospective to cross-agent intelligence
   */
  async linkToIntelligence(retrospective) {
    if (!retrospective.sd_id) return;

    // Check for learning outcome
    const { data: outcome } = await supabase
      .from('agent_learning_outcomes')
      .select('id')
      .eq('sd_id', retrospective.sd_id)
      .single();

    if (outcome) {
      await supabase
        .from('retrospective_learning_links')
        .insert({
          retrospective_id: retrospective.id,
          learning_outcome_id: outcome.id,
          correlation_type: 'DIRECT',
          correlation_strength: 0.9,
          learning_summary: 'Automated retrospective analysis',
          impacts_agent: 'ALL'
        });
    }

    // Update intelligence patterns
    for (const pattern of retrospective.success_patterns || []) {
      await this.updateIntelligencePattern(pattern, 'success');
    }

    for (const pattern of retrospective.failure_patterns || []) {
      await this.updateIntelligencePattern(pattern, 'failure');
    }
  }

  /**
   * Create action items from insights
   */
  async createActionItems(retrospective, insights) {
    const actionItems = [];

    for (const insight of insights) {
      if (insight.is_actionable) {
        actionItems.push({
          retrospective_id: retrospective.id,
          title: `Address: ${insight.title}`,
          description: insight.description,
          category: this.mapInsightToCategory(insight.insight_type),
          assigned_to: insight.assigned_to || this.getResponsibleAgent(insight.title),
          priority: insight.impact_level === 'CRITICAL' ? 'CRITICAL' :
                   insight.impact_level === 'HIGH' ? 'HIGH' : 'MEDIUM',
          status: 'PENDING'
        });
      }
    }

    if (actionItems.length > 0) {
      await supabase
        .from('retrospective_action_items')
        .insert(actionItems);
    }
  }

  /**
   * Analyze existing retrospectives for patterns
   */
  async analyzeExistingRetrospectives() {
    console.log('🔍 Analyzing existing retrospectives for patterns...');

    // Get recent retrospectives
    const { data: retrospectives } = await supabase
      .from('retrospectives')
      .select('*')
      .eq('status', 'PUBLISHED')
      .order('conducted_date', { ascending: false })
      .limit(50);

    if (!retrospectives || retrospectives.length === 0) {
      console.log('No retrospectives found to analyze');
      return { success: false, message: 'No retrospectives found' };
    }

    // Aggregate patterns
    const patternCounts = {};
    const insightTypes = {};

    for (const retro of retrospectives) {
      // Count success patterns
      for (const pattern of retro.success_patterns || []) {
        patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
      }

      // Count failure patterns
      for (const pattern of retro.failure_patterns || []) {
        patternCounts[pattern] = (patternCounts[pattern] || 0) - 1; // Negative for failures
      }
    }

    // Get insights
    const { data: insights } = await supabase
      .from('retrospective_insights')
      .select('insight_type, impact_level')
      .in('retrospective_id', retrospectives.map(r => r.id));

    for (const insight of insights || []) {
      insightTypes[insight.insight_type] = (insightTypes[insight.insight_type] || 0) + 1;
    }

    // Generate summary
    const topPatterns = Object.entries(patternCounts)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 10);

    console.log('\n📊 Pattern Analysis Summary:');
    console.log('=' .repeat(50));

    console.log('\n🎯 Top Patterns:');
    topPatterns.forEach(([pattern, count]) => {
      const indicator = count > 0 ? '✅' : '⚠️';
      console.log(`${indicator} ${pattern}: ${Math.abs(count)} occurrences`);
    });

    console.log('\n💡 Insight Distribution:');
    Object.entries(insightTypes).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    return {
      success: true,
      patterns: topPatterns,
      insights: insightTypes,
      retrospectivesAnalyzed: retrospectives.length
    };
  }

  /**
   * Helper: Get template
   */
  async getTemplate(templateName) {
    const { data } = await supabase
      .from('retrospective_templates')
      .select('*')
      .eq('template_name', templateName)
      .eq('is_active', true)
      .single();

    return data;
  }

  /**
   * Helper: Update pattern frequency
   */
  async updatePatternFrequency(patternValue) {
    await supabase.rpc('increment', {
      table_name: 'intelligence_patterns',
      column_name: 'total_occurrences',
      row_filters: { pattern_value: patternValue }
    }).catch(() => {}); // Ignore if RPC doesn't exist
  }

  /**
   * Helper: Update intelligence pattern
   */
  async updateIntelligencePattern(pattern, type) {
    const { data: existing } = await supabase
      .from('intelligence_patterns')
      .select('*')
      .eq('pattern_value', pattern)
      .single();

    if (existing) {
      const update = type === 'success'
        ? { success_count: existing.success_count + 1 }
        : { failure_count: existing.failure_count + 1 };

      await supabase
        .from('intelligence_patterns')
        .update({
          ...update,
          total_occurrences: existing.total_occurrences + 1
        })
        .eq('id', existing.id);
    } else {
      // Create new pattern
      await supabase
        .from('intelligence_patterns')
        .insert({
          pattern_type: 'PROJECT_TYPE',
          pattern_value: pattern,
          pattern_description: `Auto-discovered pattern: ${pattern}`,
          total_occurrences: 1,
          success_count: type === 'success' ? 1 : 0,
          failure_count: type === 'failure' ? 1 : 0
        });
    }
  }

  /**
   * Helper: Get responsible agent for pattern/issue
   */
  getResponsibleAgent(pattern) {
    const lower = pattern.toLowerCase();

    if (lower.includes('planning') || lower.includes('estimation')) return 'PLAN';
    if (lower.includes('implementation') || lower.includes('quality')) return 'EXEC';
    if (lower.includes('approval') || lower.includes('strategic')) return 'LEAD';

    return 'PLAN'; // Default
  }

  /**
   * Helper: Map insight type to category
   */
  mapInsightToCategory(insightType) {
    const mapping = {
      'SUCCESS_FACTOR': 'PROCESS',
      'FAILURE_MODE': 'TECHNICAL',
      'PROCESS_IMPROVEMENT': 'PROCESS',
      'TECHNICAL_LEARNING': 'TECHNICAL',
      'BUSINESS_LEARNING': 'PROCESS',
      'TEAM_DYNAMIC': 'COMMUNICATION',
      'TOOL_EFFECTIVENESS': 'TOOLING',
      'COMMUNICATION_PATTERN': 'COMMUNICATION'
    };

    return mapping[insightType] || 'PROCESS';
  }
}

// Command line execution
if (require.main === module) {
  const agent = new RetrospectiveSubAgent();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const context = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    const value = args[i + 1];
    context[key] = value;
  }

  // Execute
  agent.execute(context)
    .then(result => {
      console.log('\n✅ Retrospective Sub-Agent completed');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Retrospective Sub-Agent failed:', error);
      process.exit(1);
    });
}

module.exports = RetrospectiveSubAgent;