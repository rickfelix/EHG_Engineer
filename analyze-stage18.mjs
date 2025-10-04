import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function analyzeStage18() {
  const { data: sd, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', 'SD-2025-09-11-stage-18-documentation-sync-consolidated')
    .single();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 SD Analysis: Stage 18 - Documentation Sync: Consolidated');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log('🔑 SD Key:', sd.sd_key);
  console.log('📌 Title:', sd.title);
  console.log('📊 Status:', sd.status);
  console.log('🎯 Priority:', sd.priority);
  console.log('');
  
  if (sd.description) {
    console.log('📝 Description:');
    console.log(sd.description);
    console.log('');
  }
  
  if (sd.backlog_items && sd.backlog_items.length > 0) {
    console.log(`📦 BACKLOG ITEMS (${sd.backlog_items.length} total):`);
    console.log('═══════════════════════════════════════════════════════════\n');
    
    sd.backlog_items.forEach((item, i) => {
      console.log(`${i + 1}. ${item.title || item.task || 'Untitled Item'}`);
      console.log(`   Status: ${item.status || 'Not set'}`);
      console.log(`   Priority: ${item.priority || 'Not set'}`);
      if (item.effort_hours) console.log(`   Effort: ${item.effort_hours}h`);
      if (item.assignee) console.log(`   Assigned to: ${item.assignee}`);
      
      if (item.description) {
        console.log(`   Description: ${item.description}`);
      }
      
      if (item.acceptance_criteria) {
        console.log(`   Acceptance Criteria:`);
        if (Array.isArray(item.acceptance_criteria)) {
          item.acceptance_criteria.forEach(ac => console.log(`     - ${ac}`));
        } else {
          console.log(`     ${item.acceptance_criteria}`);
        }
      }
      
      if (item.dependencies && item.dependencies.length > 0) {
        console.log(`   Dependencies: ${item.dependencies.join(', ')}`);
      }
      
      console.log('');
    });
  } else {
    console.log('⚠️  No backlog items found for this SD');
    console.log('');
  }
  
  if (sd.metadata) {
    console.log('📊 METADATA:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(JSON.stringify(sd.metadata, null, 2));
    console.log('');
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📈 BACKLOG ANALYSIS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  if (sd.backlog_items) {
    const byStatus = {};
    const byPriority = {};
    let totalEffort = 0;
    
    sd.backlog_items.forEach(item => {
      const status = item.status || 'Not set';
      const priority = item.priority || 'Not set';
      
      byStatus[status] = (byStatus[status] || 0) + 1;
      byPriority[priority] = (byPriority[priority] || 0) + 1;
      
      if (item.effort_hours) totalEffort += item.effort_hours;
    });
    
    console.log('By Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`  ${status}: ${count} items`);
    });
    
    console.log('\nBy Priority:');
    Object.entries(byPriority).forEach(([priority, count]) => {
      console.log(`  ${priority}: ${count} items`);
    });
    
    if (totalEffort > 0) {
      console.log(`\nTotal Estimated Effort: ${totalEffort} hours`);
    }
  }
}

analyzeStage18();
