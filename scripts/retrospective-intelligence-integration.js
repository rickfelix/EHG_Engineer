#!/usr/bin/env node

/**
 * Retrospective to Cross-Agent Intelligence Integration
 * Links retrospective insights to agent learning outcomes and updates intelligence patterns
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client with service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class RetrospectiveIntelligenceIntegration {
  /**
   * Main integration process
   */
  async integrate() {
    console.log('🔗 Integrating Retrospectives with Cross-Agent Intelligence System\n');

    try {
      // 1. Process retrospective insights
      await this.processRetrospectiveInsights();

      // 2. Update agent learning outcomes
      await this.updateLearningOutcomes();

      // 3. Generate intelligence patterns
      await this.generateIntelligencePatterns();

      // 4. Create agent intelligence insights
      await this.createAgentInsights();

      // 5. Update cross-agent correlations
      await this.updateCrossAgentCorrelations();

      console.log('\n✅ Integration completed successfully!');
    } catch (error) {
      console.error('❌ Integration failed:', error);
      process.exit(1);
    }
  }

  /**
   * Process retrospective insights and extract patterns
   */
  async processRetrospectiveInsights() {
    console.log('📊 Processing retrospective insights...');

    // Get recent insights that haven't been processed
    const { data: insights } = await supabase
      .from('retrospective_insights')
      .select(`
        *,
        retrospective:retrospectives(*)
      `)
      .eq('action_taken', false)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!insights || insights.length === 0) {
      console.log('No new insights to process');
      return;
    }

    console.log(`Found ${insights.length} insights to process`);

    // Group insights by type and pattern
    const patternGroups = {};

    for (const insight of insights) {
      const key = `${insight.insight_type}:${insight.impact_level}`;

      if (!patternGroups[key]) {
        patternGroups[key] = {
          type: insight.insight_type,
          impact: insight.impact_level,
          insights: [],
          retrospectives: new Set()
        };
      }

      patternGroups[key].insights.push(insight);
      if (insight.retrospective?.sd_id) {
        patternGroups[key].retrospectives.add(insight.retrospective.sd_id);
      }
    }

    // Create or update intelligence patterns
    for (const [key, group] of Object.entries(patternGroups)) {
      if (group.insights.length >= 3) { // Pattern threshold
        await this.createIntelligencePattern(group);
      }
    }

    console.log(`✅ Processed ${Object.keys(patternGroups).length} pattern groups`);
  }

  /**
   * Update agent learning outcomes with retrospective data
   */
  async updateLearningOutcomes() {
    console.log('\n📈 Updating agent learning outcomes...');

    // Get retrospectives with SD links
    const { data: retrospectives } = await supabase
      .from('retrospectives')
      .select(`
        *,
        insights:retrospective_insights(*)
      `)
      .not('sd_id', 'is', null)
      .eq('status', 'PUBLISHED')
      .order('conducted_date', { ascending: false })
      .limit(50);

    if (!retrospectives || retrospectives.length === 0) {
      console.log('No SD-linked retrospectives found');
      return;
    }

    let updatedCount = 0;

    for (const retro of retrospectives) {
      // Check if learning outcome exists
      const { data: outcome } = await supabase
        .from('agent_learning_outcomes')
        .select('*')
        .eq('sd_id', retro.sd_id)
        .single();

      if (!outcome) {
        // Create new learning outcome
        await this.createLearningOutcome(retro);
        updatedCount++;
      } else {
        // Update existing outcome with retrospective data
        await this.enrichLearningOutcome(outcome, retro);
        updatedCount++;
      }
    }

    console.log(`✅ Updated ${updatedCount} learning outcomes`);
  }

  /**
   * Generate intelligence patterns from retrospectives
   */
  async generateIntelligencePatterns() {
    console.log('\n🧠 Generating intelligence patterns...');

    // Aggregate pattern data from retrospectives
    const { data: retrospectives } = await supabase
      .from('retrospectives')
      .select('success_patterns, failure_patterns, improvement_areas')
      .eq('status', 'PUBLISHED');

    const patternCounts = {
      success: {},
      failure: {},
      improvement: {}
    };

    // Count pattern occurrences
    for (const retro of retrospectives || []) {
      for (const pattern of retro.success_patterns || []) {
        patternCounts.success[pattern] = (patternCounts.success[pattern] || 0) + 1;
      }
      for (const pattern of retro.failure_patterns || []) {
        patternCounts.failure[pattern] = (patternCounts.failure[pattern] || 0) + 1;
      }
      for (const area of retro.improvement_areas || []) {
        patternCounts.improvement[area] = (patternCounts.improvement[area] || 0) + 1;
      }
    }

    // Create intelligence patterns for frequent patterns
    let createdPatterns = 0;

    for (const [type, patterns] of Object.entries(patternCounts)) {
      for (const [pattern, count] of Object.entries(patterns)) {
        if (count >= 2) { // Minimum occurrence threshold
          await this.upsertIntelligencePattern({
            pattern_type: 'PROJECT_TYPE',
            pattern_value: pattern,
            pattern_description: `Pattern discovered from ${count} retrospectives`,
            total_occurrences: count,
            success_count: type === 'success' ? count : 0,
            failure_count: type === 'failure' ? count : 0,
            confidence_level: count >= 5 ? 'HIGH' : count >= 3 ? 'MEDIUM' : 'LOW'
          });
          createdPatterns++;
        }
      }
    }

    console.log(`✅ Generated ${createdPatterns} intelligence patterns`);
  }

  /**
   * Create agent-specific insights from retrospectives
   */
  async createAgentInsights() {
    console.log('\n💡 Creating agent-specific insights...');

    // Analyze patterns by agent
    const agentPatterns = {
      LEAD: {
        patterns: [],
        insights: []
      },
      PLAN: {
        patterns: [],
        insights: []
      },
      EXEC: {
        patterns: [],
        insights: []
      }
    };

    // Get insights assigned to agents
    const { data: actionItems } = await supabase
      .from('retrospective_action_items')
      .select(`
        *,
        retrospective:retrospectives(*)
      `)
      .in('assigned_to', ['LEAD', 'PLAN', 'EXEC'])
      .eq('status', 'PENDING');

    // Group by agent
    for (const item of actionItems || []) {
      const agent = item.assigned_to;
      if (agentPatterns[agent]) {
        agentPatterns[agent].patterns.push({
          category: item.category,
          priority: item.priority,
          title: item.title
        });
      }
    }

    // Create insights for each agent
    const insights = [];

    for (const [agent, data] of Object.entries(agentPatterns)) {
      if (data.patterns.length > 0) {
        // Analyze patterns for common themes
        const categories = {};
        for (const pattern of data.patterns) {
          categories[pattern.category] = (categories[pattern.category] || 0) + 1;
        }

        // Create insight for most common category
        const topCategory = Object.entries(categories)
          .sort((a, b) => b[1] - a[1])[0];

        if (topCategory) {
          insights.push({
            agent_type: agent,
            insight_type: 'DECISION_ADJUSTMENT',
            insight_title: `Focus on ${topCategory[0]} improvements`,
            insight_description: `${topCategory[1]} retrospective action items identified in ${topCategory[0]} category`,
            insight_details: {
              action_count: topCategory[1],
              category: topCategory[0],
              patterns: data.patterns.slice(0, 5)
            },
            confidence_threshold: 75,
            is_active: true
          });
        }
      }
    }

    // Insert insights
    if (insights.length > 0) {
      const { error } = await supabase
        .from('agent_intelligence_insights')
        .insert(insights);

      if (error) {
        console.warn('Warning: Could not insert all insights:', error.message);
      } else {
        console.log(`✅ Created ${insights.length} agent insights`);
      }
    }
  }

  /**
   * Update cross-agent correlations based on retrospectives
   */
  async updateCrossAgentCorrelations() {
    console.log('\n🔄 Updating cross-agent correlations...');

    // Get retrospectives with multiple agent involvement
    const { data: retrospectives } = await supabase
      .from('retrospectives')
      .select('*')
      .contains('agents_involved', ['LEAD', 'PLAN', 'EXEC'])
      .eq('status', 'PUBLISHED')
      .limit(50);

    if (!retrospectives || retrospectives.length === 0) {
      console.log('No multi-agent retrospectives found');
      return;
    }

    // Analyze agent interactions
    const correlations = [];

    for (const retro of retrospectives) {
      if (retro.objectives_met) {
        // Successful collaboration
        correlations.push({
          from_agent: 'LEAD',
          to_agent: 'PLAN',
          correlation_type: 'POSITIVE',
          correlation_strength: 0.8,
          context: { retrospective_id: retro.id }
        });

        correlations.push({
          from_agent: 'PLAN',
          to_agent: 'EXEC',
          correlation_type: 'POSITIVE',
          correlation_strength: 0.8,
          context: { retrospective_id: retro.id }
        });
      } else {
        // Identify weak links
        if (retro.failure_patterns?.includes('planning-inaccuracy')) {
          correlations.push({
            from_agent: 'PLAN',
            to_agent: 'EXEC',
            correlation_type: 'NEGATIVE',
            correlation_strength: 0.6,
            context: {
              retrospective_id: retro.id,
              issue: 'planning-inaccuracy'
            }
          });
        }
      }
    }

    // Store correlations (if table exists)
    if (correlations.length > 0) {
      const { error } = await supabase
        .from('cross_agent_correlations')
        .insert(correlations);

      if (error) {
        console.warn('Note: Cross-agent correlations table may not exist yet');
      } else {
        console.log(`✅ Created ${correlations.length} cross-agent correlations`);
      }
    }
  }

  /**
   * Helper: Create intelligence pattern
   */
  async createIntelligencePattern(group) {
    const pattern = {
      pattern_type: this.mapInsightTypeToPatternType(group.type),
      pattern_value: `${group.type.toLowerCase()}_${group.impact.toLowerCase()}`,
      pattern_description: `Pattern from ${group.insights.length} retrospective insights`,
      total_occurrences: group.insights.length,
      confidence_level: group.insights.length >= 5 ? 'HIGH' : 'MEDIUM',
      typical_business_outcome: group.impact === 'CRITICAL' ? 'FAILURE' : 'SUCCESS',
      common_failure_modes: group.type === 'FAILURE_MODE' ?
        group.insights.map(i => i.title).slice(0, 5) : [],
      risk_mitigation_strategies: group.type === 'PROCESS_IMPROVEMENT' ?
        group.insights.map(i => i.recommended_actions).filter(Boolean).flat() : []
    };

    await this.upsertIntelligencePattern(pattern);
  }

  /**
   * Helper: Create learning outcome from retrospective
   */
  async createLearningOutcome(retrospective) {
    const outcome = {
      sd_id: retrospective.sd_id,
      business_outcome: retrospective.objectives_met ? 'SUCCESS' : 'PARTIAL_SUCCESS',
      business_outcome_date: retrospective.conducted_date,
      business_outcome_notes: retrospective.description,
      project_tags: retrospective.improvement_areas || [],
      success_factors: retrospective.success_patterns || [],
      failure_factors: retrospective.failure_patterns || [],
      created_at: new Date(),
      updated_at: new Date()
    };

    const { error } = await supabase
      .from('agent_learning_outcomes')
      .insert(outcome);

    if (error) {
      console.warn(`Could not create learning outcome for ${retrospective.sd_id}:`, error.message);
    }
  }

  /**
   * Helper: Enrich existing learning outcome
   */
  async enrichLearningOutcome(outcome, retrospective) {
    const updates = {};

    // Add retrospective patterns if not already present
    if (retrospective.success_patterns?.length > 0) {
      updates.success_factors = [
        ...(outcome.success_factors || []),
        ...retrospective.success_patterns
      ].filter((v, i, a) => a.indexOf(v) === i); // Unique values
    }

    if (retrospective.failure_patterns?.length > 0) {
      updates.failure_factors = [
        ...(outcome.failure_factors || []),
        ...retrospective.failure_patterns
      ].filter((v, i, a) => a.indexOf(v) === i);
    }

    // Update quality score if available
    if (retrospective.quality_score) {
      updates.exec_final_quality_score = retrospective.quality_score;
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date();

      const { error } = await supabase
        .from('agent_learning_outcomes')
        .update(updates)
        .eq('id', outcome.id);

      if (error) {
        console.warn(`Could not update learning outcome:`, error.message);
      }
    }
  }

  /**
   * Helper: Upsert intelligence pattern
   */
  async upsertIntelligencePattern(pattern) {
    const { data: existing } = await supabase
      .from('intelligence_patterns')
      .select('*')
      .eq('pattern_value', pattern.pattern_value)
      .single();

    if (existing) {
      // Update existing pattern
      const updates = {
        total_occurrences: existing.total_occurrences + (pattern.total_occurrences || 1),
        success_count: existing.success_count + (pattern.success_count || 0),
        failure_count: existing.failure_count + (pattern.failure_count || 0),
        updated_at: new Date()
      };

      if (pattern.confidence_level && pattern.confidence_level !== existing.confidence_level) {
        updates.confidence_level = pattern.confidence_level;
      }

      await supabase
        .from('intelligence_patterns')
        .update(updates)
        .eq('id', existing.id);
    } else {
      // Create new pattern
      await supabase
        .from('intelligence_patterns')
        .insert({
          ...pattern,
          created_at: new Date(),
          updated_at: new Date()
        });
    }
  }

  /**
   * Helper: Map insight type to pattern type
   */
  mapInsightTypeToPatternType(insightType) {
    const mapping = {
      'SUCCESS_FACTOR': 'PROJECT_TYPE',
      'FAILURE_MODE': 'COMPLEXITY_FACTOR',
      'PROCESS_IMPROVEMENT': 'BUSINESS_DOMAIN',
      'TECHNICAL_LEARNING': 'TECHNICAL_STACK',
      'BUSINESS_LEARNING': 'BUSINESS_DOMAIN',
      'TEAM_DYNAMIC': 'TEAM_SKILL',
      'TOOL_EFFECTIVENESS': 'TECHNICAL_STACK',
      'COMMUNICATION_PATTERN': 'TEAM_SKILL'
    };

    return mapping[insightType] || 'PROJECT_TYPE';
  }
}

// Execute integration
if (require.main === module) {
  const integration = new RetrospectiveIntelligenceIntegration();
  integration.integrate();
}

module.exports = RetrospectiveIntelligenceIntegration;