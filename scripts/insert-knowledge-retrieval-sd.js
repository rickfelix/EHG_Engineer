#!/usr/bin/env node

/**
 * Insert Knowledge Retrieval Strategic Directive into Database
 * SD-KNOWLEDGE-001: Automated Knowledge Retrieval & PRD Enrichment System
 *
 * Part of LEO Protocol v4.2.0 Infrastructure Enhancement
 * Implements Thread 1: Knowledge Retrieval & Fresh Documentation automation
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function insertKnowledgeRetrievalSD() {
  console.log('📋 Inserting Strategic Directive SD-KNOWLEDGE-001 into database...');
  console.log('================================================================');

  try {
    const strategicDirective = {
      id: 'SD-KNOWLEDGE-001',
      sd_key: 'SD-KNOWLEDGE-001',
      title: 'Automated Knowledge Retrieval & PRD Enrichment System',
      version: '1.0',
      status: 'draft',
      category: 'LEO Protocol Infrastructure',
      priority: 'high',
      description: 'Implement automated knowledge retrieval and PRD enrichment pipeline to reduce planning cycle time by 40-50% and improve PRD completeness from 70% to 85%. System combines local retrospective search with Context7 MCP integration for live documentation, creating a self-reinforcing institutional knowledge flywheel.',

      strategic_intent: 'Transform LEO Protocol planning phase from manual research-heavy process to automated, intelligence-augmented workflow. Target outcomes: 578% ROI in 90 days, 1.4 hours/day time savings, 50% reduction in EXEC clarification questions, and establishment of compounding knowledge reuse across all future ventures.',

      rationale: 'Current PLAN phase spends 30-45 minutes per PRD on manual research, resulting in incomplete context (70% completeness), high EXEC clarification rates (5-7 per SD), and lost institutional knowledge from past projects. Analysis shows 40% of SDs suffer from missing implementation context, 30% reinvent existing solutions, and 20% specify deprecated technologies. Automation addresses all three failure modes while building organizational memory that compounds over time.',

      scope: `1. Context7 MCP integration for live library documentation
2. Retrospective semantic search engine for institutional knowledge
3. PRD auto-enrichment pipeline (user_stories.implementation_context)
4. Circuit breaker & resilience architecture for external API failures
5. Telemetry & audit logging system (prd_research_audit_log)
6. Feature flag system for gradual rollout and emergency disable
7. Database schema additions (tech_stack_references, system_health tables)`,

      strategic_objectives: [
        'Reduce PLAN→EXEC handoff time by 40-50% (45 min → 25 min)',
        'Increase PRD completeness score from 70% to 85%',
        'Reduce EXEC clarification questions by 50% (7 → 3 per SD)',
        'Achieve 578% ROI within 90 days of deployment',
        'Establish self-reinforcing knowledge flywheel (compounding returns)',
        'Maintain 95%+ system uptime with graceful degradation'
      ],

      success_criteria: [
        'PLAN→EXEC handoff time ≤30 minutes avg (measured via sd_phase_handoffs timestamps)',
        'PRD completeness score ≥85% (sub-agent audit of implementation_context)',
        'EXEC clarification count ≤3 per SD (tracked in handoff questions)',
        'Context7 query success rate ≥80% (tracked in prd_research_audit_log)',
        'Circuit breaker trips <2 per week (system_health monitoring)',
        'Token usage ≤15k per PRD (hard cap enforcement)',
        '60-70% of PRDs reference ≥2 retrospectives by day 45',
        'All unit tests pass (100% coverage for core logic)',
        'E2E tests validate full workflow in <30 seconds'
      ],

      key_changes: [
        'Create automated-knowledge-retrieval.js orchestrator with local-first fallback',
        'Integrate Context7 MCP server for live documentation queries',
        'Implement circuit breaker pattern (3-failure threshold, 1-hour recovery)',
        'Add tech_stack_references table (cache with 24-hour TTL)',
        'Add prd_research_audit_log table (telemetry for all research operations)',
        'Add system_health table (circuit breaker state tracking)',
        'Enhance user_stories table with implementation_context JSONB field',
        'Enhance product_requirements_v2 with research_confidence_score',
        'Create enrich-prd-with-research.js (populates implementation_context)',
        'Hook into unified-handoff-system.js at LEAD→PLAN transition',
        'Add PLAN→EXEC validation gate (check research_confidence_score)',
        'Implement feature flags (context7_enabled, auto_prd_enrichment)',
        'Create unit tests for query logic, cache, circuit breaker',
        'Create E2E tests for full pipeline and failure scenarios'
      ],

      key_principles: [
        'Database-first: All results cached in Supabase, zero markdown drift',
        'Local-first: Query retrospectives before external APIs (≤500 tokens, 2-sec timeout)',
        'Graceful degradation: System operates at 60-70% effectiveness even with 100% Context7 downtime',
        'Token budget discipline: Hard caps at 5k/query, 15k/PRD to prevent runaway consumption',
        'Confidence-based gating: Auto-apply >0.85, human review 0.7-0.85, reject <0.7',
        'Versioned caching: Cache invalidation tied to package.json hash changes',
        'Reversibility: Feature flags enable instant disable without code changes',
        'Evidence-based validation: All claims backed by telemetry and audit logs'
      ],

      metadata: {
        automation_thread: 'Thread 1: Knowledge Retrieval & Fresh Documentation',
        estimated_effort_hours: '20-26',
        payback_period_days: 18,
        roi_90_days: '578%',
        time_savings_per_day: '1.4 hours',
        created_by: 'BRAINSTORMING_ANALYSIS',
        analysis_version: '1.0',
        stress_test_results: {
          peak_context_usage: '16.8%',
          token_usage_per_prd: '15,000',
          circuit_breaker_validated: true,
          graceful_degradation_mode: 'local_retrospectives_only'
        },
        outcome_forecast: {
          operational_efficiency: 'HIGH',
          knowledge_reuse: 'MEDIUM (short-term), HIGH (long-term)',
          decision_quality: 'HIGH',
          system_reliability: 'HIGH',
          strategic_impact: 'MEDIUM (short-term), HIGH (long-term)'
        },
        kpi_targets: {
          handoff_time_reduction: '44%',
          clarification_reduction: '57%',
          prd_completeness_gain: '+15 points',
          circuit_breaker_trips_per_week: '<2',
          context7_success_rate: '>80%',
          time_saved_90_days: '126 hours'
        }
      },

      created_by: 'LEO_PROTOCOL_ENHANCEMENT',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Check if SD already exists
    const { data: existing } = await supabase
      .from('strategic_directives_v2')
      .select('id')
      .eq('id', strategicDirective.id)
      .single();

    if (existing) {
      // Update existing SD
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .update(strategicDirective)
        .eq('id', strategicDirective.id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ Strategic Directive updated successfully!');
      console.log('   ID:', data.id);
      console.log('   Title:', data.title);
      console.log('   Priority:', data.priority);
      console.log('   Status:', data.status);
    } else {
      // Insert new SD
      const { data, error } = await supabase
        .from('strategic_directives_v2')
        .insert(strategicDirective)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ Strategic Directive inserted successfully!');
      console.log('   ID:', data.id);
      console.log('   Title:', data.title);
      console.log('   Priority:', data.priority);
      console.log('   Status:', data.status);
    }

    console.log('\n📊 Summary:');
    console.log('   - Estimated Effort: 20-26 hours');
    console.log('   - Payback Period: 18 days');
    console.log('   - 90-Day ROI: 578%');
    console.log('   - Daily Time Savings: 1.4 hours');
    console.log('   - Handoff Time Reduction: 44% (45 min → 25 min)');
    console.log('   - EXEC Clarifications: 57% reduction (7 → 3 per SD)');
    console.log('\n📈 Outcome Forecast:');
    console.log('   - Operational Efficiency: HIGH');
    console.log('   - Knowledge Reuse: MEDIUM → HIGH (compounding)');
    console.log('   - Decision Quality: HIGH');
    console.log('   - System Reliability: HIGH');
    console.log('   - Strategic Impact: MEDIUM → HIGH (long-term)');
    console.log('\n🌐 View in Dashboard: http://localhost:3000/strategic-directives');
    console.log('================================================================');

  } catch (error) {
    console.error('❌ Error inserting Strategic Directive:', error.message);
    if (error.code === 'PGRST116') {
      console.log('⚠️  Table strategic_directives_v2 does not exist');
      console.log('   Run: npm run setup-db-supabase to create tables');
    } else if (error.code === '23505') {
      console.log('⚠️  Strategic Directive with this ID already exists');
    }
    console.error('Full error:', error);
    process.exit(1);
  }
}

// Execute
insertKnowledgeRetrievalSD();
