#!/usr/bin/env node
/**
 * Check if model routing is actually being used in sub-agent executions
 */
import { createSupabaseServiceClient } from './lib/supabase-connection.js';

async function checkRouting() {
  const supabase = await createSupabaseServiceClient('engineer');

  console.log('=== Checking for Model Routing Evidence ===\n');

  // Check for executions with routing metadata
  const { data: withRouting, error: err1 } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_code, verdict, metadata, created_at')
    .not('metadata->routing', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (err1) {
    console.log('Error querying with routing:', err1.message);
    return;
  }

  // Check total executions for comparison
  const { count: totalCount } = await supabase
    .from('sub_agent_execution_results')
    .select('*', { count: 'exact', head: true });

  console.log(`Total executions in database: ${totalCount}`);
  console.log(`Executions with routing metadata: ${withRouting?.length || 0}\n`);

  if (!withRouting || withRouting.length === 0) {
    console.log('⚠️  NO executions found with routing metadata!');
    console.log('   This means the model routing system is NOT being used yet.\n');

    // Check recent executions to see if they have metadata at all
    const { data: recent } = await supabase
      .from('sub_agent_execution_results')
      .select('sub_agent_code, verdict, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recent && recent.length > 0) {
      console.log('Recent executions (no routing):');
      recent.forEach(r => {
        console.log(`  [${r.created_at}] ${r.sub_agent_code}: ${r.verdict}`);
        console.log(`     Metadata keys: ${Object.keys(r.metadata || {}).join(', ') || 'none'}`);
      });
    }
    return;
  }

  console.log('✅ Found executions with model routing!\n');
  console.log('=== Recent Executions with Model Routing ===');

  const routingStats = {};

  withRouting.forEach(r => {
    const routing = r.metadata?.routing;
    const key = `${r.sub_agent_code}|${routing?.sdPhase || 'unknown'}|${routing?.recommendedModel}`;
    routingStats[key] = (routingStats[key] || 0) + 1;

    console.log(`\n[${r.created_at}] ${r.sub_agent_code}: ${r.verdict}`);
    if (routing) {
      console.log(`   Phase: ${routing.sdPhase || 'unknown'}`);
      console.log(`   Model: ${routing.recommendedModel}`);
    }
  });

  console.log('\n=== Routing Statistics ===');
  Object.entries(routingStats).forEach(([key, count]) => {
    const [agent, phase, model] = key.split('|');
    console.log(`${agent} in ${phase} → ${model}: ${count} executions`);
  });
}

checkRouting().catch(console.error);
