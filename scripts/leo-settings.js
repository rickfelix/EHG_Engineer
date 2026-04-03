#!/usr/bin/env node
/**
 * LEO Settings — Canonical script for viewing and modifying session settings.
 *
 * Usage:
 *   node scripts/leo-settings.js view              — Display current settings
 *   node scripts/leo-settings.js session <ap> <ch>  — Update session settings
 *   node scripts/leo-settings.js global <ap> <ch>   — Update global defaults
 *
 * SD: SD-LEO-INFRA-CUSTOM-SKILLS-PHASE-001-A
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const [,, command, arg1, arg2] = process.argv;

async function viewSettings() {
  const { data: globalData } = await supabase.rpc('get_leo_global_defaults');
  const globals = globalData?.[0] || { auto_proceed: true, chain_orchestrators: false };

  const { data: sessionData } = await supabase
    .from('claude_sessions')
    .select('session_id, metadata')
    .eq('status', 'active')
    .order('heartbeat_at', { ascending: false })
    .limit(1)
    .single();

  const sessionAP = sessionData?.metadata?.auto_proceed;
  const sessionChain = sessionData?.metadata?.chain_orchestrators;

  console.log('GLOBAL_AUTO_PROCEED=' + globals.auto_proceed);
  console.log('GLOBAL_CHAIN=' + globals.chain_orchestrators);
  console.log('SESSION_ID=' + (sessionData?.session_id || 'none'));
  console.log('SESSION_AUTO_PROCEED=' + (sessionAP === undefined ? 'inherited' : sessionAP));
  console.log('SESSION_CHAIN=' + (sessionChain === undefined ? 'inherited' : sessionChain));
}

async function updateSession(autoProceed, chainOrchestrators) {
  const ap = autoProceed === 'true';
  const ch = chainOrchestrators === 'true';
  const { error } = await supabase.from('claude_sessions')
    .upsert({
      session_id: 'session_' + Date.now(),
      status: 'active',
      heartbeat_at: new Date().toISOString(),
      metadata: { auto_proceed: ap, chain_orchestrators: ch }
    }, { onConflict: 'session_id' });
  if (error) console.error('Error:', error.message);
  else console.log('Session preferences saved: auto_proceed=' + ap + ', chain_orchestrators=' + ch);
}

async function updateGlobal(autoProceed, chainOrchestrators) {
  const ap = autoProceed === 'true';
  const ch = chainOrchestrators === 'true';
  const { error } = await supabase.rpc('set_leo_global_defaults', {
    p_auto_proceed: ap,
    p_chain_orchestrators: ch,
    p_updated_by: 'claude-session'
  });
  if (error) console.error('Error:', error.message);
  else console.log('Global defaults updated: auto_proceed=' + ap + ', chain_orchestrators=' + ch);
}

switch (command) {
  case 'view':
    await viewSettings();
    break;
  case 'session':
    await updateSession(arg1, arg2);
    break;
  case 'global':
    await updateGlobal(arg1, arg2);
    break;
  default:
    await viewSettings();
}
