const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function analyzeHighPriorityEHG() {
  // Get all SDs and backlog data
  const { data: sds } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('status', 'active')
    .order('sd_id');
    
  const { data: backlogSummary } = await supabase
    .from('strategic_directives_backlog')
    .select('*')
    .order('sequence_rank');
    
  console.log('\n🎯 EHG APPLICATION - HIGH/MEDIUM PRIORITY VISION\n');
  console.log('='.repeat(60));
  
  if (backlogSummary && sds) {
    // Focus on SDs with significant H/M counts
    const prioritySDs = backlogSummary.filter(b => 
      (b.h_count > 0 || b.m_count > 0) && b.total_items > 0
    ).sort((a, b) => {
      // Sort by H+M count descending
      const scoreA = (a.h_count || 0) + (a.m_count || 0);
      const scoreB = (b.h_count || 0) + (b.m_count || 0);
      return scoreB - scoreA;
    });
    
    console.log('\n🔥 TOP PRIORITY FEATURES (High/Medium Focus):\n');
    
    let totalHigh = 0;
    let totalMedium = 0;
    let categories = {
      'Chairman Dashboard': [],
      'AI & EVA': [],
      'Venture Stages': [],
      'Analytics & Insights': [],
      'Team & Collaboration': [],
      'Core Infrastructure': []
    };
    
    prioritySDs.forEach(backlog => {
      const sd = sds.find(s => s.sd_id === backlog.sd_id);
      if (sd) {
        totalHigh += backlog.h_count || 0;
        totalMedium += backlog.m_count || 0;
        
        // Categorize
        const title = sd.title.toLowerCase();
        if (title.includes('chairman') || title.includes('dashboard')) {
          categories['Chairman Dashboard'].push({ sd, backlog });
        } else if (title.includes('eva') || title.includes('ai') || title.includes('agent')) {
          categories['AI & EVA'].push({ sd, backlog });
        } else if (title.includes('stage')) {
          categories['Venture Stages'].push({ sd, backlog });
        } else if (title.includes('analytics') || title.includes('insight') || title.includes('report')) {
          categories['Analytics & Insights'].push({ sd, backlog });
        } else if (title.includes('team') || title.includes('communication')) {
          categories['Team & Collaboration'].push({ sd, backlog });
        } else {
          categories['Core Infrastructure'].push({ sd, backlog });
        }
      }
    });
    
    // Print categorized vision
    console.log('\n📋 FUTURE EHG APPLICATION - PRIORITY FEATURES BY AREA:\n');
    
    Object.entries(categories).forEach(([category, items]) => {
      if (items.length > 0) {
        const categoryHigh = items.reduce((sum, i) => sum + (i.backlog.h_count || 0), 0);
        const categoryMedium = items.reduce((sum, i) => sum + (i.backlog.m_count || 0), 0);
        
        console.log(`\n🔷 ${category}`);
        console.log(`   Priority Items: H:${categoryHigh} M:${categoryMedium}`);
        
        items.slice(0, 5).forEach(item => {
          const title = item.sd.title.replace(/: Consolidated.*$/, '');
          console.log(`   • ${title}`);
          if (item.backlog.h_count > 0 || item.backlog.m_count > 0) {
            console.log(`     └─ ${item.backlog.h_count || 0} high, ${item.backlog.m_count || 0} medium priority items`);
          }
        });
      }
    });
    
    console.log('\n\n📊 IMPLEMENTATION SCOPE (High/Medium Only):');
    console.log(`   🔴 High Priority Items: ${totalHigh}`);
    console.log(`   🟡 Medium Priority Items: ${totalMedium}`);
    console.log(`   📌 Total Priority Items: ${totalHigh + totalMedium}`);
    console.log(`   ⚡ Readiness: Focus on items with >70% readiness first`);
  }
}

analyzeHighPriorityEHG().catch(console.error);