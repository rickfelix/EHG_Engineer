#!/usr/bin/env node

/**
 * Strategic Directive Execution Order Calculator
 *
 * Uses WSJF (Weighted Shortest Job First) methodology to calculate
 * optimal execution order for all strategic directives.
 *
 * WSJF Score = Cost of Delay / Job Duration
 *
 * Cost of Delay factors:
 * - User/Business Value
 * - Time Criticality
 * - Risk Reduction/Opportunity Enablement
 *
 * Higher WSJF score = Higher priority (lower execution_order number)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Priority weights for WSJF calculation
const PRIORITY_WEIGHTS = {
  critical: 100,
  high: 70,
  medium: 40,
  low: 10
};

// Status weights (active SDs should be prioritized)
const STATUS_WEIGHTS = {
  active: 1.5,
  draft: 1.0,
  superseded: 0.3,
  completed: 0.1
};

// Category business value multipliers
const CATEGORY_VALUES = {
  'governance': 90,
  'platform': 85,
  'infrastructure': 80,
  'ui-ux': 70,
  'integration': 65,
  'documentation': 40,
  'other': 50
};

/**
 * Calculate WSJF score for a strategic directive
 */
function calculateWsjfScore(sd) {
  // Base priority score
  const priorityScore = PRIORITY_WEIGHTS[sd.priority?.toLowerCase()] || 50;

  // Status modifier
  const statusModifier = STATUS_WEIGHTS[sd.status?.toLowerCase()] || 0.5;

  // Category value
  const categoryValue = CATEGORY_VALUES[sd.category?.toLowerCase()] || 50;

  // Time criticality (newer items might be more urgent)
  const daysSinceCreation = (Date.now() - new Date(sd.created_at).getTime()) / (1000 * 60 * 60 * 24);
  const timeUrgency = Math.max(1, Math.min(100, daysSinceCreation / 3)); // Cap at 100

  // Check for special markers in title/description
  let specialBonus = 0;
  const content = (sd.title + ' ' + sd.description).toLowerCase();

  if (content.includes('wsjf')) specialBonus += 30;
  if (content.includes('vision')) specialBonus += 25;
  if (content.includes('pipeline')) specialBonus += 20;
  if (content.includes('monitoring')) specialBonus += 20;
  if (content.includes('governance')) specialBonus += 25;
  if (content.includes('pilot')) specialBonus += 15;
  if (content.includes('mvp')) specialBonus += 20;
  if (content.includes('critical')) specialBonus += 30;
  if (content.includes('blocker')) specialBonus += 35;
  if (content.includes('urgent')) specialBonus += 25;

  // Existing execution_order preference (if already set, give slight preference)
  const hasExistingOrder = sd.execution_order ? 10 : 0;

  // Calculate final WSJF score
  const wsjfScore = (
    (priorityScore * 0.35) +
    (categoryValue * 0.25) +
    (timeUrgency * 0.15) +
    (specialBonus * 0.25) +
    hasExistingOrder
  ) * statusModifier;

  return {
    wsjfScore: Math.round(wsjfScore * 100) / 100,
    components: {
      priorityScore,
      categoryValue,
      timeUrgency,
      specialBonus,
      statusModifier,
      hasExistingOrder
    }
  };
}

async function calculateExecutionOrder() {
  console.log('🎯 Strategic Directive Execution Order Calculator');
  console.log('================================================\n');

  try {
    // Fetch all strategic directives
    const { data: allSDs, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch strategic directives: ${error.message}`);
    }

    console.log(`📊 Found ${allSDs.length} strategic directives\n`);

    // Calculate WSJF scores for each SD
    const sdsWithScores = allSDs.map(sd => {
      const scoreData = calculateWsjfScore(sd);
      return {
        ...sd,
        ...scoreData,
        originalExecutionOrder: sd.execution_order
      };
    });

    // Sort by WSJF score (highest first)
    sdsWithScores.sort((a, b) => b.wsjfScore - a.wsjfScore);

    // Assign new execution orders
    let executionOrder = 1;
    const updates = [];

    console.log('📋 Recommended Execution Order:\n');
    console.log('Rank | WSJF  | Status   | Priority | ID                    | Title');
    console.log('-----|-------|----------|----------|----------------------|--------------------------------');

    sdsWithScores.forEach((sd, index) => {
      // Skip completed SDs from getting low execution orders
      if (sd.status === 'completed') {
        sd.newExecutionOrder = 900 + index;
      } else {
        sd.newExecutionOrder = executionOrder++;
      }

      const change = sd.originalExecutionOrder
        ? `(was ${sd.originalExecutionOrder})`
        : '(new)';

      console.log(
        `${String(sd.newExecutionOrder).padStart(4)} | ` +
        `${String(sd.wsjfScore).padStart(5)} | ` +
        `${sd.status.padEnd(8)} | ` +
        `${sd.priority.padEnd(8)} | ` +
        `${sd.id.padEnd(20)} | ` +
        `${sd.title.substring(0, 30)}... ${change}`
      );

      // Prepare update if execution order changed
      if (sd.originalExecutionOrder !== sd.newExecutionOrder) {
        updates.push({
          id: sd.id,
          oldOrder: sd.originalExecutionOrder,
          newOrder: sd.newExecutionOrder,
          wsjfScore: sd.wsjfScore
        });
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log(`\n📊 Summary:`);
    console.log(`   Total SDs: ${allSDs.length}`);
    console.log(`   Updates needed: ${updates.length}`);
    console.log(`   Already ordered correctly: ${allSDs.length - updates.length}`);

    // Show top 5 by WSJF score
    console.log('\n🏆 Top 5 by WSJF Score:');
    sdsWithScores.slice(0, 5).forEach((sd, i) => {
      console.log(`   ${i + 1}. [${sd.wsjfScore}] ${sd.id}: ${sd.title}`);
      console.log(`      Components: Priority=${sd.components.priorityScore}, ` +
                  `Category=${sd.components.categoryValue}, ` +
                  `Urgency=${sd.components.timeUrgency}, ` +
                  `Special=${sd.components.specialBonus}`);
    });

    // Ask for confirmation before applying
    console.log('\n' + '='.repeat(80));
    console.log('\n⚠️  Ready to update execution_order for ' + updates.length + ' strategic directives.');
    console.log('   This will affect the display order in the dashboard.\n');

    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('Apply these changes? (yes/no): ', async (answer) => {
      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        console.log('\n🔄 Applying updates...\n');

        let successCount = 0;
        let errorCount = 0;

        for (const update of updates) {
          const { error } = await supabase
            .from('strategic_directives_v2')
            .update({
              execution_order: update.newOrder,
              metadata: {
                ...sdsWithScores.find(sd => sd.id === update.id).metadata,
                wsjf_score: update.wsjfScore,
                execution_order_updated_at: new Date().toISOString(),
                execution_order_updated_by: 'WSJF Calculator'
              }
            })
            .eq('id', update.id);

          if (error) {
            console.error(`   ❌ Failed to update ${update.id}: ${error.message}`);
            errorCount++;
          } else {
            console.log(`   ✅ Updated ${update.id}: ${update.oldOrder || 'null'} → ${update.newOrder}`);
            successCount++;
          }
        }

        console.log('\n' + '='.repeat(80));
        console.log(`\n✨ Update Complete!`);
        console.log(`   Successful: ${successCount}`);
        console.log(`   Failed: ${errorCount}`);
        console.log('\n🎯 Strategic directives are now ordered by WSJF priority.');
        console.log('   View the updated order at: http://localhost:3000/strategic-directives\n');
      } else {
        console.log('\n❌ Update cancelled. No changes were made.\n');
      }

      readline.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  calculateExecutionOrder();
}

module.exports = { calculateWsjfScore, calculateExecutionOrder };