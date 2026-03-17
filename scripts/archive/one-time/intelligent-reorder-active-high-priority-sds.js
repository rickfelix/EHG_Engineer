import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function intelligentReorder() {
  console.log('🎯 Intelligent Reordering of ACTIVE High Priority SDs\n');
  console.log('=' .repeat(80));

  // Get only ACTIVE high priority SDs (not completed)
  const { data: activeSDs, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('priority', 'high')
    .neq('status', 'completed')
    .order('sequence_rank', { ascending: true });

  if (error) {
    console.error('Error fetching SDs:', error);
    return;
  }

  console.log(`\nFound ${activeSDs.length} ACTIVE high priority SDs that need reordering:\n`);

  // Display current active SDs
  activeSDs.forEach(sd => {
    console.log(`• ${sd.id}: ${sd.title}`);
    console.log(`  Status: ${sd.status} | Current Sequence: ${sd.sequence_rank || 'N/A'}`);
  });

  console.log('\n' + '=' .repeat(80));
  console.log('\n📊 INTELLIGENT DEPENDENCY-BASED REORDERING:\n');

  // Define logical ordering based on dependencies
  const logicalOrder = [
    // 1. INFRASTRUCTURE & FOUNDATION (Must come first)
    {
      id: 'SD-PIPELINE-001',
      sequence: 10,
      category: 'Infrastructure',
      reason: 'CI/CD pipeline is foundation for all deployments'
    },

    // 2. GOVERNANCE & FRAMEWORK
    {
      id: 'SD-GOVERNANCE-UI-001',
      sequence: 20,
      category: 'Governance',
      reason: 'Governance UI needed for managing all other SDs'
    },

    // 3. CORE CONFIGURATION
    {
      id: 'SD-006',
      sequence: 30,
      category: 'Core Setup',
      reason: 'Settings and configuration for system features'
    },

    // 4. STANDARDS & CONVENTIONS
    {
      id: 'SD-036',
      sequence: 40,
      category: 'Standards',
      reason: 'Strategic naming conventions before development'
    },

    // 5. DEVELOPMENT PREPARATION
    {
      id: 'SD-009',
      sequence: 50,
      category: 'Development',
      reason: 'Development environment setup'
    },

    // 6. ORCHESTRATION & AUTOMATION
    {
      id: 'SD-029',
      sequence: 60,
      category: 'Orchestration',
      reason: 'Process orchestration after dev environment'
    },

    // 7. FEATURES & PAGES
    {
      id: 'SD-044',
      sequence: 70,
      category: 'Features',
      reason: 'New pages/features after core system ready'
    },

    // 8. MVP LAUNCH (Final)
    {
      id: 'SD-016',
      sequence: 80,
      category: 'Launch',
      reason: 'MVP launch only after everything is ready'
    }
  ];

  console.log('CATEGORY BREAKDOWN:\n');
  console.log('Priority | Category        | SD ID                 | Reasoning');
  console.log('-' .repeat(80));

  logicalOrder.forEach(item => {
    const sd = activeSDs.find(s => s.id === item.id);
    if (sd) {
      console.log(`${String(item.sequence).padEnd(8)} | ${item.category.padEnd(15)} | ${item.id.padEnd(21)} | ${item.reason}`);
    }
  });

  // Apply the new ordering
  console.log('\n' + '=' .repeat(80));
  console.log('\n🚀 Applying intelligent reordering...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const item of logicalOrder) {
    const sd = activeSDs.find(s => s.id === item.id);
    if (!sd) {
      console.log(`⚠️  ${item.id}: Not found in active SDs (may be completed or not exist)`);
      continue;
    }

    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({
        sequence_rank: item.sequence,
        metadata: {
          ...sd.metadata,
          reorder_reason: item.reason,
          reorder_category: item.category,
          reordered_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', item.id);

    if (error) {
      console.log(`❌ ${item.id}: Error - ${error.message}`);
      errorCount++;
    } else {
      console.log(`✅ ${item.id}: Sequence ${sd.sequence_rank || 'N/A'} → ${item.sequence} (${item.category})`);
      successCount++;
    }
  }

  console.log('\n' + '=' .repeat(80));
  console.log('\n📊 REORDERING SUMMARY:\n');
  console.log(`✅ Successfully reordered: ${successCount} SDs`);
  console.log(`❌ Errors encountered: ${errorCount} SDs`);
  console.log(`⚠️  Not found/skipped: ${logicalOrder.length - successCount - errorCount} SDs`);

  // Show final order
  console.log('\n📋 FINAL SEQUENCE ORDER:\n');
  const { data: finalOrder } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sequence_rank, status')
    .eq('priority', 'high')
    .neq('status', 'completed')
    .order('sequence_rank', { ascending: true })
    .limit(10);

  if (finalOrder) {
    console.log('Seq  | SD ID                 | Title');
    console.log('-' .repeat(80));
    finalOrder.forEach(sd => {
      console.log(`${String(sd.sequence_rank).padEnd(4)} | ${sd.id.padEnd(21)} | ${sd.title.substring(0, 50)}`);
    });
  }

  console.log('\n✨ Intelligent reordering complete!');
}

intelligentReorder().catch(console.error);