require('dotenv').config();
const { createClient} = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

(async () => {
  const { data: minRank } = await supabase
    .from('strategic_directives_v2')
    .select('sequence_ranking')
    .order('sequence_ranking', { ascending: true})
    .limit(1)
    .single();
  
  const lowestRank = minRank ? minRank.sequence_ranking - 10 : 10;
  
  const newSD = {
    id: 'SD-AGENT-ADMIN-002',
    title: 'Agent Engineering Admin Suite - Complete Missing Subsystems',
    version: '1.0',
    description: 'Complete remaining 70% of SD-AGENT-ADMIN-001 based on comprehensive codebase analysis. Gap: 5 subsystems missing (Preset Management, Prompt Library, Agent Settings completion, Search Preferences, Advanced Performance Dashboard). Evidence: Screenshot audit + code review. Leverage: AgentSettingsTab (30% done), 113+ Recharts components, Radix UI. Must build: Monaco editor, 4 database tables, A/B testing framework.',
    rationale: 'Business Impact: 42-agent platform operationally bottlenecked without admin tools. ROI: 17.5 hrs/week saved, +15-20% quality improvement. Codebase analysis validated all 5 gaps + leverage opportunities.',
    status: 'draft',
    priority: 95,
    category: 'admin-tooling',
    target_application: 'EHG',
    sequence_ranking: lowestRank,
    scope: {
      total_story_points: 115,
      subsystems: [
        { name: 'Preset Management', priority: 'HIGH', story_points: 25 },
        { name: 'Prompt Library', priority: 'CRITICAL', story_points: 35 },
        { name: 'Agent Settings Panel', priority: 'HIGH', story_points: 15 },
        { name: 'Search Preferences', priority: 'MEDIUM', story_points: 20 },
        { name: 'Advanced Performance Dashboard', priority: 'HIGH', story_points: 20 }
      ]
    },
    metadata: {
      parent_sd: 'SD-AGENT-ADMIN-001',
      gap_analysis_date: '2025-10-08',
      evidence: 'Screenshot + codebase audit',
      codebase_leverage: 'AgentSettingsTab, 113+ Recharts, Radix UI'
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'LEAD',
    current_phase: 'LEAD',
    progress: 0
  };

  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .insert(newSD)
    .select()
    .single();

  if (error) {
    console.error('❌ Error:', JSON.stringify(error, null, 2));
    process.exit(1);
  }

  console.log('✅ Strategic Directive Created Successfully!');
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚨 SD-AGENT-ADMIN-002 (CRITICAL PRIORITY)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('📌 Title:', data.title);
  console.log('🎯 Priority:', data.priority, '(CRITICAL)');
  console.log('📊 Sequence Rank:', data.sequence_ranking, '(LOWEST = TOP OF BACKLOG)');
  console.log('🏗️ Target:', data.target_application);
  console.log('📈 Progress:', data.progress + '%');
  console.log('');
  console.log('📊 Comprehensive Analysis Results:');
  console.log('  ✅ 5 Analysis Prompts Executed');
  console.log('  ✅ Codebase Audit Completed');
  console.log('  ✅ Gap Analysis: 70% missing');
  console.log('  ✅ Leverage Opportunities Identified');
  console.log('');
  console.log('🎯 5 Subsystems (115 Story Points):');
  data.scope.subsystems.forEach((sub, i) => {
    console.log(\`  \${i+1}. \${sub.name} - \${sub.priority} (\${sub.story_points} pts)\`);
  });
  console.log('');
  console.log('🔗 Metadata:');
  console.log('  Parent SD:', data.metadata.parent_sd);
  console.log('  Analysis Date:', data.metadata.gap_analysis_date);
  console.log('  Evidence:', data.metadata.evidence);
  console.log('  Leverage:', data.metadata.codebase_leverage);
  console.log('');
  console.log('📍 View: /strategic-directives/SD-AGENT-ADMIN-002');
})();
