#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function analyzeRecentRetros() {
  console.log('🔍 Analyzing Recent Retrospectives for Protocol Improvements\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Get recent retrospectives
  const { data: retrospectives, error } = await supabase
    .from('retrospectives')
    .select('*')
    .order('conducted_date', { ascending: false })
    .limit(15);

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  console.log(`📊 Analyzing ${retrospectives.length} Most Recent Retrospectives\n`);

  // Collect all learnings and improvements
  const allImprovements = [];
  const allLearnings = [];
  const allWentWell = [];
  const actionsByCategory = {};

  retrospectives.forEach((retro, idx) => {
    if (!retro.sd_id) return; // Skip null SD IDs

    console.log(`\n${idx + 1}. 📋 ${retro.sd_id} - ${retro.retro_type || 'General'}`);
    console.log(`   📅 ${new Date(retro.conducted_date).toLocaleDateString()}`);
    console.log(`   📝 ${retro.title || 'No title'}`);

    // What went well
    if (retro.what_went_well && retro.what_went_well.length > 0) {
      console.log(`   ✅ What Went Well: ${retro.what_went_well.length} items`);
      retro.what_went_well.forEach(item => {
        allWentWell.push({ sd: retro.sd_id, item });
        if (typeof item === 'string') {
          console.log(`      - ${item.substring(0, 80)}`);
        }
      });
    }

    // What needs improvement
    if (retro.what_needs_improvement && retro.what_needs_improvement.length > 0) {
      console.log(`   ⚠️  Needs Improvement: ${retro.what_needs_improvement.length} items`);
      retro.what_needs_improvement.forEach(item => {
        allImprovements.push({ sd: retro.sd_id, item });
        if (typeof item === 'string') {
          console.log(`      - ${item.substring(0, 80)}`);
        }
      });
    }

    // Key learnings
    if (retro.key_learnings && retro.key_learnings.length > 0) {
      console.log(`   💡 Key Learnings: ${retro.key_learnings.length} items`);
      retro.key_learnings.forEach(item => {
        allLearnings.push({ sd: retro.sd_id, item });
        if (typeof item === 'string') {
          console.log(`      - ${item.substring(0, 80)}`);
        }
      });
    }

    // Action items by category
    if (retro.action_items && retro.action_items.length > 0) {
      retro.action_items.forEach(action => {
        const category = action.category || 'general';
        if (!actionsByCategory[category]) actionsByCategory[category] = 0;
        actionsByCategory[category]++;
      });
    }
  });

  // Pattern Analysis
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('📊 PATTERN ANALYSIS\n');

  // Most common action categories
  console.log('🎯 Action Item Categories (Top 5):');
  Object.entries(actionsByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([category, count]) => {
      console.log(`   ${count}x - ${category}`);
    });

  // Critical improvements to analyze
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('🔴 CRITICAL IMPROVEMENTS NEEDED\n');

  // Look for patterns in improvements
  const improvementKeywords = [
    'database',
    'migration',
    'test',
    'verify',
    'documentation',
    'handoff',
    'scope',
    'protocol',
    'sub-agent',
    'communication'
  ];

  improvementKeywords.forEach(keyword => {
    const matches = allImprovements.filter(imp => {
      const text = typeof imp.item === 'string' ? imp.item.toLowerCase() : '';
      return text.includes(keyword);
    });

    if (matches.length >= 2) {
      console.log(`\n⚠️  "${keyword.toUpperCase()}" mentioned ${matches.length} times:`);
      matches.slice(0, 3).forEach(match => {
        console.log(`   - [${match.sd}] ${match.item}`);
      });
    }
  });

  // Success patterns
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('✅ SUCCESS PATTERNS TO REPLICATE\n');

  // Look for patterns in what went well
  const successKeywords = [
    'database',
    'test',
    'reuse',
    'existing',
    'simple',
    'automated',
    'clear',
    'documented'
  ];

  successKeywords.forEach(keyword => {
    const matches = allWentWell.filter(success => {
      const text = typeof success.item === 'string' ? success.item.toLowerCase() : '';
      return text.includes(keyword);
    });

    if (matches.length >= 1) {
      console.log(`\n✅ "${keyword.toUpperCase()}" success pattern (${matches.length}x):`);
      matches.slice(0, 2).forEach(match => {
        console.log(`   - [${match.sd}] ${match.item}`);
      });
    }
  });

  // Key learnings synthesis
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('💡 KEY LEARNINGS TO ADD TO PROTOCOL\n');

  allLearnings.slice(0, 10).forEach((learning, idx) => {
    console.log(`${idx + 1}. [${learning.sd}] ${learning.item}`);
  });

  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('🎯 RECOMMENDATIONS FOR PROTOCOL UPDATES\n');

  console.log('Based on retrospective analysis, consider adding to CLAUDE.md:\n');

  console.log('1. 📊 TESTING PATTERNS:');
  console.log('   - Add mandatory E2E test execution checklist');
  console.log('   - Document authentication setup patterns');
  console.log('   - Add port configuration verification steps\n');

  console.log('2. 🗄️ DATABASE OPERATIONS:');
  console.log('   - Expand migration verification checklist');
  console.log('   - Add RLS policy validation steps');
  console.log('   - Document connection troubleshooting\n');

  console.log('3. 🔄 HANDOFF QUALITY:');
  console.log('   - Add handoff completeness verification');
  console.log('   - Document evidence requirements');
  console.log('   - Clarify phase transition criteria\n');

  console.log('4. 🤖 SUB-AGENT IMPROVEMENTS:');
  console.log('   - QA Director: Enhance E2E test generation');
  console.log('   - Database Architect: Add migration validation');
  console.log('   - Continuous Improvement Coach: Automate retrospective generation\n');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ Analysis Complete\n');
}

analyzeRecentRetros();
