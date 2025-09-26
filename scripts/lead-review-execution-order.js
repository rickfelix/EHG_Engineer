#!/usr/bin/env node

/**
 * LEAD Agent Strategic Directive Prioritization Workflow
 *
 * This workflow allows the LEAD agent to:
 * 1. Review current execution order
 * 2. Apply WSJF scoring recommendations
 * 3. Make manual adjustments based on business strategy
 * 4. Approve and commit the final sequencing
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');
const { calculateWsjfScore } = require('./calculate-sd-execution-order');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function loadStrategicDirectives() {
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .order('execution_order', { ascending: true, nullsFirst: false })
    .order('priority')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load strategic directives: ${error.message}`);
  }

  return data;
}

async function displayCurrentOrder(sds) {
  console.log('\n📊 Current Execution Order:\n');
  console.log('Order | Status   | Priority | WSJF  | ID                    | Title');
  console.log('------|----------|----------|-------|----------------------|--------------------------------');

  const activeOnly = sds.filter(sd => sd.status !== 'completed');

  activeOnly.slice(0, 20).forEach(sd => {
    const wsjf = calculateWsjfScore(sd);
    const order = sd.execution_order ? String(sd.execution_order).padStart(5) : ' null';

    console.log(
      `${order} | ` +
      `${sd.status.padEnd(8)} | ` +
      `${sd.priority.padEnd(8)} | ` +
      `${String(wsjf.wsjfScore).padStart(5)} | ` +
      `${sd.id.padEnd(20)} | ` +
      `${sd.title.substring(0, 30)}...`
    );
  });

  if (activeOnly.length > 20) {
    console.log(`\n... and ${activeOnly.length - 20} more active directives`);
  }

  const withoutOrder = sds.filter(sd => !sd.execution_order && sd.status !== 'completed');
  if (withoutOrder.length > 0) {
    console.log(`\n⚠️  ${withoutOrder.length} active/draft directives without execution_order set`);
  }
}

async function reviewProposedChanges(sds) {
  // Calculate WSJF for all SDs
  const sdsWithScores = sds.map(sd => ({
    ...sd,
    wsjfScore: calculateWsjfScore(sd).wsjfScore
  }));

  // Sort by WSJF score
  const sorted = [...sdsWithScores]
    .filter(sd => sd.status !== 'completed')
    .sort((a, b) => b.wsjfScore - a.wsjfScore);

  // Find discrepancies
  const discrepancies = [];
  sorted.forEach((sd, index) => {
    const expectedOrder = index + 1;
    if (sd.execution_order !== expectedOrder) {
      discrepancies.push({
        id: sd.id,
        title: sd.title,
        current: sd.execution_order || null,
        proposed: expectedOrder,
        wsjfScore: sd.wsjfScore,
        priority: sd.priority,
        status: sd.status
      });
    }
  });

  if (discrepancies.length === 0) {
    console.log('\n✅ Current execution order matches WSJF recommendations!');
    return [];
  }

  console.log(`\n🔄 Found ${discrepancies.length} directives that could be reordered:\n`);
  console.log('Current → Proposed | WSJF  | Priority | ID');
  console.log('-------------------|-------|----------|--------------------');

  discrepancies.slice(0, 15).forEach(d => {
    const change = `${d.current || 'null'} → ${d.proposed}`.padEnd(17);
    console.log(
      `${change} | ${String(d.wsjfScore).padStart(5)} | ` +
      `${d.priority.padEnd(8)} | ${d.id}`
    );
  });

  if (discrepancies.length > 15) {
    console.log(`... and ${discrepancies.length - 15} more changes`);
  }

  return discrepancies;
}

async function manualAdjustments(sds) {
  console.log('\n🎯 LEAD Strategic Adjustments\n');
  console.log('You can make manual adjustments to override WSJF recommendations.');
  console.log('This is useful when business strategy requires different prioritization.\n');

  const adjustments = [];

  while (true) {
    const sdId = await question('\nEnter SD ID to adjust (or "done" to finish): ');

    if (sdId.toLowerCase() === 'done' || sdId === '') {
      break;
    }

    const sd = sds.find(s => s.id === sdId);
    if (!sd) {
      console.log('❌ SD not found. Please try again.');
      continue;
    }

    console.log(`\n📋 ${sd.title}`);
    console.log(`   Current execution_order: ${sd.execution_order || 'null'}`);
    console.log(`   Status: ${sd.status}, Priority: ${sd.priority}`);

    const newOrder = await question('Enter new execution_order (1-999): ');
    const order = parseInt(newOrder);

    if (isNaN(order) || order < 1 || order > 999) {
      console.log('❌ Invalid order. Please enter a number between 1 and 999.');
      continue;
    }

    const reason = await question('Reason for adjustment: ');

    adjustments.push({
      id: sdId,
      title: sd.title,
      oldOrder: sd.execution_order,
      newOrder: order,
      reason: reason || 'Strategic priority adjustment'
    });

    console.log('✅ Adjustment recorded');
  }

  return adjustments;
}

async function applyChanges(changes, isManual = false) {
  console.log('\n🔄 Applying changes...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const change of changes) {
    const updateData = {
      execution_order: change.newOrder || change.proposed
    };

    // Add metadata for tracking
    const { data: current } = await supabase
      .from('strategic_directives_v2')
      .select('metadata')
      .eq('id', change.id)
      .single();

    updateData.metadata = {
      ...current?.metadata,
      execution_order_updated_at: new Date().toISOString(),
      execution_order_updated_by: 'LEAD Agent',
      update_reason: isManual ? change.reason : 'WSJF optimization',
      wsjf_score: change.wsjfScore
    };

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update(updateData)
      .eq('id', change.id);

    if (error) {
      console.error(`❌ Failed to update ${change.id}: ${error.message}`);
      errorCount++;
    } else {
      const oldVal = change.oldOrder || change.current || 'null';
      const newVal = change.newOrder || change.proposed;
      console.log(`✅ Updated ${change.id}: ${oldVal} → ${newVal}`);
      successCount++;
    }
  }

  return { successCount, errorCount };
}

async function main() {
  console.log('🎯 LEAD Agent - Strategic Directive Prioritization Workflow');
  console.log('=' .repeat(60) + '\n');

  try {
    // Load current state
    const sds = await loadStrategicDirectives();
    console.log(`📊 Loaded ${sds.length} strategic directives`);

    // Display current order
    await displayCurrentOrder(sds);

    // Show WSJF recommendations
    const discrepancies = await reviewProposedChanges(sds);

    // Menu
    console.log('\n' + '='.repeat(60));
    console.log('\n📋 LEAD Agent Options:\n');
    console.log('  1. Apply WSJF recommendations automatically');
    console.log('  2. Make manual adjustments');
    console.log('  3. Apply WSJF then make adjustments');
    console.log('  4. View detailed SD information');
    console.log('  5. Exit without changes\n');

    const choice = await question('Select option (1-5): ');

    switch (choice) {
      case '1':
        // Apply WSJF automatically
        if (discrepancies.length > 0) {
          const confirm = await question(`\nApply ${discrepancies.length} WSJF optimizations? (yes/no): `);
          if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
            const result = await applyChanges(discrepancies);
            console.log('\n✨ WSJF optimization complete!');
            console.log(`   Successful: ${result.successCount}`);
            console.log(`   Failed: ${result.errorCount}`);
          }
        }
        break;

      case '2':
        // Manual adjustments only
        const manualChanges = await manualAdjustments(sds);
        if (manualChanges.length > 0) {
          const confirm = await question(`\nApply ${manualChanges.length} manual adjustments? (yes/no): `);
          if (confirm.toLowerCase() === 'yes' || confirm.toLowerCase() === 'y') {
            const result = await applyChanges(manualChanges, true);
            console.log('\n✨ Manual adjustments complete!');
            console.log(`   Successful: ${result.successCount}`);
            console.log(`   Failed: ${result.errorCount}`);
          }
        }
        break;

      case '3':
        // Apply WSJF then adjust
        if (discrepancies.length > 0) {
          console.log('\n📊 First, applying WSJF recommendations...');
          await applyChanges(discrepancies);

          // Reload data with new order
          const updatedSds = await loadStrategicDirectives();
          console.log('\n✅ WSJF applied. Now make manual adjustments:');

          const manualChanges = await manualAdjustments(updatedSds);
          if (manualChanges.length > 0) {
            const result = await applyChanges(manualChanges, true);
            console.log('\n✨ All changes complete!');
          }
        }
        break;

      case '4':
        // View detailed information
        const sdId = await question('\nEnter SD ID to view details: ');
        const sd = sds.find(s => s.id === sdId);
        if (sd) {
          const wsjf = calculateWsjfScore(sd);
          console.log('\n' + '='.repeat(60));
          console.log(`\n📋 ${sd.id}: ${sd.title}\n`);
          console.log(`Status: ${sd.status}`);
          console.log(`Priority: ${sd.priority}`);
          console.log(`Category: ${sd.category || 'N/A'}`);
          console.log(`Execution Order: ${sd.execution_order || 'Not set'}`);
          console.log(`WSJF Score: ${wsjf.wsjfScore}`);
          console.log(`\nWSJF Components:`);
          console.log(`  Priority Score: ${wsjf.components.priorityScore}`);
          console.log(`  Category Value: ${wsjf.components.categoryValue}`);
          console.log(`  Time Urgency: ${wsjf.components.timeUrgency.toFixed(2)}`);
          console.log(`  Special Bonus: ${wsjf.components.specialBonus}`);
          console.log(`  Status Modifier: ${wsjf.components.statusModifier}`);
          console.log(`\nDescription:\n${sd.description}`);
        } else {
          console.log('❌ SD not found');
        }
        // Recurse to show menu again
        rl.close();
        process.exit(0);
        break;

      case '5':
        console.log('\n👋 Exiting without changes.');
        break;

      default:
        console.log('\n❌ Invalid option');
    }

    console.log('\n🎯 LEAD prioritization workflow complete.');
    console.log('   View updated order at: http://localhost:3000/strategic-directives\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  } finally {
    rl.close();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { loadStrategicDirectives, reviewProposedChanges };