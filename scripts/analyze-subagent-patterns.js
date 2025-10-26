#!/usr/bin/env node

/**
 * Analyze Sub-Agent Patterns for Cross-Functional Learnings
 * Compares enhanced vs non-enhanced sub-agents to identify best practices
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function analyzeSubAgentPatterns() {
  console.log('🔍 Analyzing Sub-Agent Patterns for Cross-Functional Learnings...\n');

  try {
    // Query all sub-agents
    const { data: agents, error } = await supabase
      .from('leo_sub_agents')
      .select('*')
      .order('code');

    if (error) {
      console.error('❌ Error querying sub-agents:', error);
      process.exit(1);
    }

    console.log(`📊 Total Sub-Agents Found: ${agents.length}\n`);

    // Categorize agents
    const enhanced = [];
    const notEnhanced = [];

    agents.forEach(agent => {
      const hasVersion = agent.metadata?.version && agent.metadata.version !== 'N/A';
      const hasCapabilities = agent.capabilities && agent.capabilities.length >= 5;
      const hasLongDescription = agent.description && agent.description.length > 5000;
      const hasSuccessPatterns = agent.metadata?.success_patterns?.length > 0;

      if (hasVersion && hasCapabilities && hasLongDescription && hasSuccessPatterns) {
        enhanced.push(agent);
      } else {
        notEnhanced.push(agent);
      }
    });

    // Display categorization
    console.log('✅ ENHANCED SUB-AGENTS (with comprehensive improvements):\n');
    enhanced.forEach(agent => {
      console.log(`  ${agent.code} - ${agent.name}`);
      console.log(`    Version: ${agent.metadata?.version || 'N/A'}`);
      console.log(`    Description Length: ${agent.description?.length || 0} chars`);
      console.log(`    Capabilities: ${agent.capabilities?.length || 0}`);
      console.log(`    Success Patterns: ${agent.metadata?.success_patterns?.length || 0}`);
      console.log(`    Failure Patterns: ${agent.metadata?.failure_patterns?.length || 0}`);
      console.log(`    Last Updated: ${agent.metadata?.last_updated || 'N/A'}`);
      console.log('');
    });

    console.log('\n❌ NOT ENHANCED SUB-AGENTS (need improvements):\n');
    notEnhanced.forEach(agent => {
      console.log(`  ${agent.code} - ${agent.name}`);
      console.log(`    Version: ${agent.metadata?.version || 'N/A'}`);
      console.log(`    Description Length: ${agent.description?.length || 0} chars`);
      console.log(`    Capabilities: ${agent.capabilities?.length || 0}`);
      console.log(`    Success Patterns: ${agent.metadata?.success_patterns?.length || 0}`);
      console.log('');
    });

    // Identify common patterns across enhanced sub-agents
    console.log('\n📋 COMMON PATTERNS IN ENHANCED SUB-AGENTS:\n');

    // Pattern 1: Proactive Learning Integration
    const hasProactiveLearning = enhanced.filter(a =>
      a.description?.includes('PROACTIVE LEARNING INTEGRATION') ||
      a.description?.includes('SD-LEO-LEARN-001')
    );
    console.log('1. Proactive Learning Integration (SD-LEO-LEARN-001)');
    console.log(`   Found in: ${hasProactiveLearning.map(a => a.code).join(', ')}`);
    console.log(`   Coverage: ${hasProactiveLearning.length}/${enhanced.length} (${Math.round(hasProactiveLearning.length/enhanced.length*100)}%)`);
    console.log('   Pattern: Query issue_patterns table before starting work\n');

    // Pattern 2: Version Tracking
    console.log('2. Version Tracking in Metadata');
    console.log(`   Found in: ${enhanced.map(a => `${a.code} (v${a.metadata?.version})`).join(', ')}`);
    console.log(`   Coverage: ${enhanced.length}/${enhanced.length} (100%)`);
    console.log('   Pattern: metadata.version field with semantic versioning\n');

    // Pattern 3: Capabilities Array
    const avgCapabilities = enhanced.reduce((sum, a) => sum + (a.capabilities?.length || 0), 0) / enhanced.length;
    console.log('3. Comprehensive Capabilities Array');
    console.log(`   Average capabilities: ${Math.round(avgCapabilities)} per agent`);
    console.log(`   Range: ${Math.min(...enhanced.map(a => a.capabilities?.length || 0))}-${Math.max(...enhanced.map(a => a.capabilities?.length || 0))} capabilities`);
    console.log('   Pattern: 12 capabilities per agent (standard)\n');

    // Pattern 4: Success/Failure Patterns Documentation
    const hasSuccessFailure = enhanced.filter(a =>
      a.metadata?.success_patterns?.length > 0 && a.metadata?.failure_patterns?.length > 0
    );
    console.log('4. Success/Failure Patterns Documentation');
    console.log(`   Found in: ${hasSuccessFailure.map(a => a.code).join(', ')}`);
    console.log(`   Coverage: ${hasSuccessFailure.length}/${enhanced.length} (${Math.round(hasSuccessFailure.length/enhanced.length*100)}%)`);
    console.log('   Pattern: metadata.success_patterns and metadata.failure_patterns arrays\n');

    // Pattern 5: Evidence Base with Metrics
    const hasMetrics = enhanced.filter(a => a.metadata?.key_metrics);
    console.log('5. Evidence Base with Key Metrics');
    console.log(`   Found in: ${hasMetrics.map(a => a.code).join(', ')}`);
    console.log(`   Coverage: ${hasMetrics.length}/${enhanced.length} (${Math.round(hasMetrics.length/enhanced.length*100)}%)`);
    console.log('   Pattern: metadata.key_metrics with quantifiable evidence\n');

    // Pattern 6: Improvements Documentation
    const hasImprovements = enhanced.filter(a => a.metadata?.improvements?.length > 0);
    console.log('6. Improvements Documentation');
    console.log(`   Found in: ${hasImprovements.map(a => a.code).join(', ')}`);
    console.log(`   Coverage: ${hasImprovements.length}/${enhanced.length} (${Math.round(hasImprovements.length/enhanced.length*100)}%)`);
    console.log('   Pattern: metadata.improvements array with title, impact, source, benefit\n');

    // Pattern 7: Sources/Evidence Attribution
    const hasSources = enhanced.filter(a => a.metadata?.sources?.length > 0);
    console.log('7. Sources/Evidence Attribution');
    console.log(`   Found in: ${hasSources.map(a => a.code).join(', ')}`);
    console.log(`   Coverage: ${hasSources.length}/${enhanced.length} (${Math.round(hasSources.length/enhanced.length*100)}%)`);
    console.log('   Pattern: metadata.sources array referencing retrospectives and SDs\n');

    // Pattern 8: Database-First Enforcement
    const hasDatabaseFirst = enhanced.filter(a =>
      a.description?.includes('database-first') || a.description?.includes('Database-first')
    );
    console.log('8. Database-First Principle Enforcement');
    console.log(`   Found in: ${hasDatabaseFirst.map(a => a.code).join(', ')}`);
    console.log(`   Coverage: ${hasDatabaseFirst.length}/${enhanced.length} (${Math.round(hasDatabaseFirst.length/enhanced.length*100)}%)`);
    console.log('   Pattern: Explicit database-first architecture enforcement\n');

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS FOR STANDARDIZATION:\n');

    console.log('1. Apply to ALL sub-agents:');
    console.log('   - Proactive learning integration (query issue_patterns first)');
    console.log('   - Version tracking in metadata (semantic versioning)');
    console.log('   - 12 capabilities per agent (comprehensive coverage)');
    console.log('   - Success/failure patterns documentation');
    console.log('   - Evidence base with quantifiable metrics');
    console.log('   - Sources attribution (retrospectives, SDs, patterns)');
    console.log('   - Improvements documentation with impact levels\n');

    console.log('2. Priority sub-agents to enhance next:');
    notEnhanced.forEach((agent, idx) => {
      console.log(`   ${idx + 1}. ${agent.code} - ${agent.name}`);
      console.log(`      Current capabilities: ${agent.capabilities?.length || 0}`);
      console.log(`      Current description: ${agent.description?.length || 0} chars`);
    });
    console.log('');

    console.log('3. Standardized Metadata Structure:');
    console.log('   {');
    console.log('     version: "X.0.0",');
    console.log('     last_updated: "ISO timestamp",');
    console.log('     sources: ["74+ retrospectives", "PAT-XXX patterns", "SD-XXX lessons"],');
    console.log('     success_patterns: ["pattern 1", "pattern 2", ...],');
    console.log('     failure_patterns: ["anti-pattern 1", "anti-pattern 2", ...],');
    console.log('     key_metrics: { metric1: value1, metric2: value2, ... },');
    console.log('     improvements: [');
    console.log('       { title: "X", impact: "HIGH|MEDIUM|LOW", source: "SD-XXX", benefit: "..." }');
    console.log('     ]');
    console.log('   }\n');

    console.log('4. Cross-Functional Best Practices:');
    console.log('   - Query lessons BEFORE starting work (prevents 2-4 hours rework)');
    console.log('   - Document both success AND failure patterns');
    console.log('   - Include specific metrics (not generic statements)');
    console.log('   - Reference specific SDs as evidence');
    console.log('   - Track version evolution over time');
    console.log('   - Maintain 100% database compliance (no markdown files)\n');

    console.log('\n📈 SUMMARY:\n');
    console.log(`Enhanced Sub-Agents: ${enhanced.length}/${agents.length} (${Math.round(enhanced.length/agents.length*100)}%)`);
    console.log(`Remaining to Enhance: ${notEnhanced.length}/${agents.length} (${Math.round(notEnhanced.length/agents.length*100)}%)`);
    console.log('Common Patterns Identified: 8 major patterns');
    console.log(`Average Capabilities (Enhanced): ${Math.round(avgCapabilities)} capabilities`);
    console.log(`Average Description Length (Enhanced): ${Math.round(enhanced.reduce((sum, a) => sum + (a.description?.length || 0), 0) / enhanced.length)} chars\n`);

  } catch (err) {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  }
}

analyzeSubAgentPatterns();
