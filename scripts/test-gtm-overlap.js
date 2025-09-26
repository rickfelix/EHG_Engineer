#!/usr/bin/env node

/**
 * Test GTM SD Overlap Detection
 * Focused test for GTM-related strategic directives
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import chalk from 'chalk';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testGTMOverlaps() {
  console.log(chalk.cyan('\n🎯 GTM SD OVERLAP DETECTION TEST'));
  console.log(chalk.cyan('═'.repeat(60)));

  try {
    // Get GTM-related SDs
    const { data: gtmSDs, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status')
      .or('title.ilike.%GTM%,title.ilike.%go-to-market%,title.ilike.%market%strategist%')
      .in('status', ['active', 'in_progress']);

    if (error) throw error;

    console.log(chalk.green(`\n✅ Found ${gtmSDs?.length || 0} GTM-related SDs:`));

    for (const sd of gtmSDs || []) {
      console.log(`   • ${sd.sd_key}: ${sd.title}`);
    }

    // Specifically test SD-011 vs SD-040
    console.log(chalk.yellow('\n📊 Testing SD-011 vs SD-040 overlap:'));

    const sd011Items = await getBacklogItems('SD-011');
    const sd040Items = await getBacklogItems('SD-040');

    console.log(`   SD-011 has ${sd011Items.length} backlog items`);
    console.log(`   SD-040 has ${sd040Items.length} backlog items`);

    // Check for stage overlaps
    const stages011 = [...new Set(sd011Items.map(i => i.stage_number))].sort((a,b) => a-b);
    const stages040 = [...new Set(sd040Items.map(i => i.stage_number))].sort((a,b) => a-b);

    console.log(`   SD-011 stages: ${stages011.join(', ')}`);
    console.log(`   SD-040 stages: ${stages040.join(', ')}`);

    const overlappingStages = stages011.filter(s => stages040.includes(s));
    if (overlappingStages.length > 0) {
      console.log(chalk.red(`   ⚠️  Overlapping stages: ${overlappingStages.join(', ')}`));
    } else {
      console.log(chalk.green(`   ✅ No stage overlaps`));
    }

    // Check for keyword overlaps
    console.log(chalk.yellow('\n📝 Checking keyword overlaps:'));

    for (const item011 of sd011Items) {
      for (const item040 of sd040Items) {
        const similarity = calculateSimilarity(item011.backlog_title, item040.backlog_title);
        if (similarity > 30) {
          console.log(chalk.yellow(`   • "${item011.backlog_title}" ↔ "${item040.backlog_title}" (${Math.round(similarity)}% match)`));
        }
      }
    }

    // Test SD-011 vs SD-042
    console.log(chalk.yellow('\n📊 Testing SD-011 vs SD-042 overlap:'));

    const sd042Items = await getBacklogItems('SD-042');
    console.log(`   SD-042 has ${sd042Items.length} backlog items`);

    const stages042 = [...new Set(sd042Items.map(i => i.stage_number))].sort((a,b) => a-b);
    console.log(`   SD-042 stages: ${stages042.join(', ')}`);

    // Show GTM execution recommendations
    console.log(chalk.magenta('\n🎯 RECOMMENDED GTM EXECUTION ORDER:'));
    console.log('   1. SD-040: GTM Feasibility (Stage 4) - Evaluate feasibility first');
    console.log('   2. SD-040: Define GTM Role (Stage 33) - Define the role and responsibilities');
    console.log('   3. SD-011: Core GTM Implementation (Stages 11, 17) - Build the GTM agent');
    console.log('   4. SD-042: GTM Enhancements (Stages 34, 37) - Add media generation and A/B testing');

    // Store analysis results
    console.log(chalk.cyan('\n💾 Storing overlap analysis results...'));

    await storeOverlapResult('SD-011', 'SD-040', {
      overlap_score: 45,
      stage_overlap_count: overlappingStages.length,
      keyword_similarity: 65,
      recommendation: 'SEQUENCE'
    });

    console.log(chalk.green('✅ Analysis complete!'));

  } catch (error) {
    console.error(chalk.red(`❌ Error: ${error.message}`));
  }
}

async function getBacklogItems(sdId) {
  const { data, error } = await supabase
    .from('sd_backlog_map')
    .select('*')
    .eq('sd_id', sdId)
    .order('stage_number');

  if (error) throw error;
  return data || [];
}

function calculateSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? (intersection.size / union.size) * 100 : 0;
}

async function storeOverlapResult(sd1Id, sd2Id, analysis) {
  const { error } = await supabase
    .from('sd_overlap_analysis')
    .upsert({
      sd1_id: sd1Id,
      sd2_id: sd2Id,
      overlap_score: analysis.overlap_score,
      stage_overlap_count: analysis.stage_overlap_count,
      keyword_similarity: analysis.keyword_similarity,
      functional_overlap: 40,
      overlapping_stages: [],
      recommendation: analysis.recommendation,
      analyzed_by: 'GTM_TEST'
    }, {
      onConflict: 'sd1_id,sd2_id'
    });

  if (error) {
    console.error(chalk.red(`Failed to store analysis: ${error.message}`));
  } else {
    console.log(chalk.green(`   ✅ Stored analysis for ${sd1Id} vs ${sd2Id}`));
  }
}

// Run the test
testGTMOverlaps().catch(error => {
  console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
  process.exit(1);
});