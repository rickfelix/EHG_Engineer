#!/usr/bin/env node

/**
 * Sub-agent Scanner
 * 
 * Scans PRD content for trigger keywords and activates sub-agents
 * Idempotent upserts with audit trail
 */

import { getDb } from '../gates/lib/db';
import { emit } from '../../lib/websocket/leo-events';

interface TriggerMatch {
  sub_agent_id: string;
  trigger_phrase: string;
  priority: number;
}

interface ScanResult {
  prd_id: string;
  activated: string[];
  matched_triggers: string[];
}

/**
 * Scan PRD content and activate matching sub-agents
 */
export async function scanSubAgents(prdId: string): Promise<ScanResult> {
  const db = await getDb();

  // 1) Load PRD content from DB only (no filesystem)
  const { data: prd, error: prdError } = await db
    .from('product_requirements_v2')
    .select('id, title, content')
    .eq('id', prdId)
    .single();

  if (prdError || !prd) {
    throw new Error(`PRD not found in database: ${prdId}`);
  }

  console.log(`\n🔍 Scanning PRD: ${prd.title || prdId}`);

  // 2) Load sub-agent triggers
  const { data: triggers, error: triggerError } = await db
    .from('leo_sub_agent_triggers')
    .select(`
      sub_agent_id,
      trigger_phrase,
      priority,
      sub_agent:leo_sub_agents(id, name, code)
    `)
    .eq('active', true)
    .order('priority', { ascending: false });

  if (triggerError) {
    throw new Error(`Failed to load triggers: ${triggerError.message}`);
  }

  if (!triggers || triggers.length === 0) {
    console.log('  No active triggers found');
    return { prd_id: prdId, activated: [], matched_triggers: [] };
  }

  // 3) Match triggers (case-insensitive)
  const content = (prd.content || '').toLowerCase();
  const matches: TriggerMatch[] = [];
  const matchedPhrases: string[] = [];

  for (const trigger of triggers) {
    const phrase = String(trigger.trigger_phrase).toLowerCase();
    if (content.includes(phrase)) {
      matches.push({
        sub_agent_id: trigger.sub_agent_id,
        trigger_phrase: trigger.trigger_phrase,
        priority: trigger.priority || 0
      });
      matchedPhrases.push(trigger.trigger_phrase);
      console.log(`  ✓ Matched: "${trigger.trigger_phrase}" → ${trigger.sub_agent?.name}`);
    }
  }

  // Sort by priority (highest first)
  matches.sort((a, b) => b.priority - a.priority);

  // 4) Idempotent upserts with audit trail
  const activated: string[] = [];

  for (const match of matches) {
    try {
      // Get sub-agent details
      const { data: subAgent } = await db
        .from('leo_sub_agents')
        .select('id, code, name')
        .eq('id', match.sub_agent_id)
        .single();

      if (!subAgent) continue;

      // Idempotent upsert using ON CONFLICT
      const { error: upsertError } = await db
        .from('sub_agent_executions')
        .upsert({
          prd_id: prdId,
          sub_agent_id: match.sub_agent_id,
          status: 'pending'
        }, {
          onConflict: 'prd_id,sub_agent_id',
          ignoreDuplicates: false  // Update status if exists
        });

      if (upsertError && !upsertError.message.includes('duplicate')) {
        console.error(`  Failed to activate ${subAgent.name}: ${upsertError.message}`);
        continue;
      }

      // Audit trail
      await db.from('compliance_alerts').insert({
        alert_type: 'missing_artifact',  // Using existing enum value
        severity: 'info',
        source: 'subagent-scanner',
        message: `Sub-agent ${subAgent.name} activated for PRD ${prdId}`,
        payload: {
          prd_id: prdId,
          sub_agent_id: match.sub_agent_id,
          sub_agent_code: subAgent.code,
          trigger_phrase: match.trigger_phrase,
          reason: 'trigger_match',
          activated_by: process.env.USER || 'system',
          activated_at: new Date().toISOString()
        }
      });

      activated.push(subAgent.code);

      // Emit WebSocket event
      emit('leo/subagent:status', {
        v: 1,
        prd_id: prdId,
        agent: subAgent.code,
        status: 'pending',
        ts: new Date().toISOString()
      });

      console.log(`  🚀 Activated: ${subAgent.name} (${subAgent.code})`);
    } catch (error) {
      console.error(`  Error activating sub-agent: ${error}`);
    }
  }

  console.log(`\n📊 Summary: ${activated.length} sub-agents activated`);

  return {
    prd_id: prdId,
    activated,
    matched_triggers: matchedPhrases
  };
}

/**
 * Manually force activation of a sub-agent (override)
 */
export async function forceActivateSubAgent(
  prdId: string,
  agentCode: string,
  reason: string = 'manual_override'
): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();

  // Resolve agent code to ID
  const { data: agent, error: agentError } = await db
    .from('leo_sub_agents')
    .select('id, code, name')
    .eq('code', agentCode.toUpperCase())
    .single();

  if (agentError || !agent) {
    throw new Error(`Unknown agent code: ${agentCode}`);
  }

  console.log(`\n🔧 Force activating ${agent.name} for PRD ${prdId}`);

  // Idempotent upsert
  const { error: upsertError } = await db
    .from('sub_agent_executions')
    .upsert({
      prd_id: prdId,
      sub_agent_id: agent.id,
      status: 'pending'
    }, {
      onConflict: 'prd_id,sub_agent_id',
      ignoreDuplicates: false
    });

  if (upsertError && !upsertError.message.includes('duplicate')) {
    throw new Error(`Failed to activate: ${upsertError.message}`);
  }

  // Audit trail for manual activation
  await db.from('compliance_alerts').insert({
    alert_type: 'missing_artifact',
    severity: 'info',
    source: 'subagent-scanner',
    message: `Sub-agent ${agent.name} manually activated for PRD ${prdId}`,
    payload: {
      prd_id: prdId,
      sub_agent_id: agent.id,
      sub_agent_code: agent.code,
      reason,
      activated_by: process.env.USER || process.env.GITHUB_ACTOR || 'manual',
      activated_at: new Date().toISOString()
    }
  });

  // Emit WebSocket event
  emit('leo/subagent:status', {
    v: 1,
    prd_id: prdId,
    agent: agent.code,
    status: 'pending',
    ts: new Date().toISOString()
  });

  return {
    ok: true,
    message: `${agent.name} activated successfully for ${prdId}`
  };
}

/**
 * CLI interface for testing
 */
if (require.main === module) {
  const command = process.argv[2];
  const prdId = process.argv[3];

  if (command === 'scan' && prdId) {
    scanSubAgents(prdId)
      .then(result => {
        console.log('\nResult:', JSON.stringify(result, null, 2));
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
      });
  } else if (command === 'force' && prdId) {
    const agentCode = process.argv[4];
    const reason = process.argv[5] || 'manual_override';

    if (!agentCode) {
      console.error('Usage: scan.ts force <PRD_ID> <AGENT_CODE> [reason]');
      process.exit(1);
    }

    forceActivateSubAgent(prdId, agentCode, reason)
      .then(result => {
        console.log('\nResult:', result.message);
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Error:', error.message);
        process.exit(1);
      });
  } else {
    console.log('Usage:');
    console.log('  scan.ts scan <PRD_ID>           - Scan PRD and activate matching sub-agents');
    console.log('  scan.ts force <PRD_ID> <AGENT>  - Force activate a specific sub-agent');
    console.log('\nAgent codes: SECURITY, TESTING, PERFORMANCE, DATABASE, DESIGN');
    process.exit(1);
  }
}