#!/usr/bin/env node
/**
 * Check current session tracking data and model capture opportunities
 */
import { createSupabaseServiceClient } from './lib/supabase-connection.js';

async function checkSessions() {
  const supabase = await createSupabaseServiceClient('engineer');

  console.log('=== Claude Session Tracking Analysis ===\n');

  // Check claude_sessions
  const { data: sessions, error: e1 } = await supabase
    .from('claude_sessions')
    .select('session_id, sd_id, track, heartbeat_at, status, metadata, created_at')
    .order('heartbeat_at', { ascending: false })
    .limit(10);

  if (e1) {
    console.log('Error querying claude_sessions:', e1.message);
  } else if (!sessions || sessions.length === 0) {
    console.log('No sessions found in claude_sessions table');
  } else {
    console.log(`Found ${sessions.length} sessions:\n`);
    sessions.forEach(s => {
      console.log(`[${s.status}] ${s.session_id}`);
      console.log(`   SD: ${s.sd_id || 'none'}, Track: ${s.track || 'none'}`);
      console.log(`   Heartbeat: ${s.heartbeat_at}`);
      console.log(`   Metadata keys: ${Object.keys(s.metadata || {}).join(', ') || 'empty'}`);
      if (s.metadata && Object.keys(s.metadata).length > 0) {
        console.log(`   Metadata: ${JSON.stringify(s.metadata, null, 2).substring(0, 200)}`);
      }
      console.log('');
    });
  }

  // Check if model is being captured anywhere
  console.log('\n=== Searching for Model Capture ===\n');

  // Check sub_agent_execution_results for model info
  const { data: execResults, error: e2 } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_code, metadata, created_at')
    .not('metadata->routing', 'is', null)
    .order('created_at', { ascending: false })
    .limit(3);

  if (e2) {
    console.log('Error:', e2.message);
  } else if (execResults && execResults.length > 0) {
    console.log('Sub-agent results with routing metadata:');
    execResults.forEach(r => {
      const routing = r.metadata?.routing;
      console.log(`  ${r.sub_agent_code}: model=${routing?.recommendedModel}, phase=${routing?.sdPhase}`);
    });
  } else {
    console.log('No routing metadata found in sub_agent_execution_results');
  }

  // Summary
  console.log('\n=== Opportunity Analysis ===\n');
  console.log('Current state:');
  console.log('  - claude_sessions table EXISTS with heartbeat mechanism');
  console.log('  - metadata JSONB column available for model capture');
  console.log('  - update_session_heartbeat() function exists');
  console.log('');
  console.log('Opportunity:');
  console.log('  - Add "model" field to metadata during heartbeat updates');
  console.log('  - Capture via ANTHROPIC_MODEL env var or claude --version output');
  console.log('  - Track model changes during session lifecycle');
  console.log('');
  console.log('Implementation points:');
  console.log('  1. sd-next.js - when session is created/updated');
  console.log('  2. Heartbeat hook - when pulse is sent');
  console.log('  3. Sub-agent invocation - when Task tool is called');
}

checkSessions().catch(console.error);
