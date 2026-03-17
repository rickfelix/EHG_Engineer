/**
 * Query Database Sub-Agent Configuration
 * Get full details, capabilities, and trigger patterns
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

async function queryDatabaseSubAgent() {
  console.log('🔍 QUERYING DATABASE SUB-AGENT CONFIGURATION\n');

  const client = new Client({
    connectionString: process.env.SUPABASE_POOLER_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Query sub-agent details
    console.log('📋 DATABASE SUB-AGENT DETAILS:\n');

    const subAgentQuery = `
      SELECT
        code,
        name,
        description,
        capabilities,
        priority,
        auto_trigger,
        phase_applicability,
        output_format,
        decision_authority,
        escalation_criteria
      FROM leo_sub_agents
      WHERE code = 'DATABASE' OR name ILIKE '%database%'
      ORDER BY priority DESC;
    `;

    const subAgentResult = await client.query(subAgentQuery);

    if (subAgentResult.rows.length === 0) {
      console.log('❌ No Database Sub-Agent found\n');
      return;
    }

    const dbAgent = subAgentResult.rows[0];

    console.log('🤖 Sub-Agent: ' + dbAgent.name);
    console.log('   Code: ' + dbAgent.code);
    console.log('   Priority: ' + dbAgent.priority);
    console.log('   Auto-Trigger: ' + (dbAgent.auto_trigger ? '✅' : '❌'));
    console.log('   Phase Applicability: ' + (dbAgent.phase_applicability || 'ALL'));
    console.log('   Decision Authority: ' + (dbAgent.decision_authority || 'ADVISORY'));
    console.log('\n📝 Description:');
    console.log('   ' + dbAgent.description);
    console.log('\n🎯 Capabilities:');
    if (typeof dbAgent.capabilities === 'object') {
      dbAgent.capabilities.forEach(cap => console.log('   - ' + cap));
    } else {
      console.log('   ' + dbAgent.capabilities);
    }
    console.log('\n📊 Output Format:');
    console.log('   ' + (dbAgent.output_format || 'Standard assessment format'));
    console.log('\n🚨 Escalation Criteria:');
    console.log('   ' + (dbAgent.escalation_criteria || 'Critical issues, data loss risk'));

    // Query triggers
    console.log('\n\n🔔 TRIGGER PATTERNS:\n');

    const triggersQuery = `
      SELECT
        trigger_phrase,
        trigger_type,
        trigger_context,
        active
      FROM leo_sub_agent_triggers
      WHERE sub_agent_id = (
        SELECT id FROM leo_sub_agents WHERE code = 'DATABASE'
      )
      ORDER BY trigger_type, trigger_phrase;
    `;

    const triggersResult = await client.query(triggersQuery);

    if (triggersResult.rows.length === 0) {
      console.log('❌ No triggers configured\n');
    } else {
      const triggersByType = {};
      triggersResult.rows.forEach(trigger => {
        const type = trigger.trigger_type || 'KEYWORD';
        if (!triggersByType[type]) {
          triggersByType[type] = [];
        }
        triggersByType[type].push({
          phrase: trigger.trigger_phrase,
          context: trigger.trigger_context,
          active: trigger.active
        });
      });

      Object.keys(triggersByType).forEach(type => {
        console.log(`   ${type} Triggers:`);
        triggersByType[type].forEach(t => {
          const status = t.active ? '✅' : '❌';
          console.log(`      ${status} "${t.phrase}"`);
          if (t.context) {
            console.log(`         Context: ${t.context}`);
          }
        });
        console.log('');
      });
    }

    // Query recent executions
    console.log('\n📈 RECENT EXECUTIONS (Last 5):\n');

    const executionsQuery = `
      SELECT
        sd_id,
        verdict,
        confidence_score,
        created_at,
        execution_metadata->>'execution_duration' as duration
      FROM sub_agent_execution_results
      WHERE sub_agent_code = 'DATABASE'
      ORDER BY created_at DESC
      LIMIT 5;
    `;

    const executionsResult = await client.query(executionsQuery);

    if (executionsResult.rows.length === 0) {
      console.log('   No recent executions found\n');
    } else {
      executionsResult.rows.forEach((exec, idx) => {
        console.log(`   ${idx + 1}. SD: ${exec.sd_id}`);
        console.log(`      Verdict: ${exec.verdict}`);
        console.log(`      Confidence: ${exec.confidence_score || 'N/A'}`);
        console.log(`      Duration: ${exec.duration || 'N/A'}`);
        console.log(`      Date: ${exec.created_at}`);
        console.log('');
      });
    }

    // Best practices
    console.log('\n💡 INVOCATION BEST PRACTICES:\n');
    console.log('   1. Invoke for: Schema validation, migration planning, RLS issues');
    console.log('   2. Provide: SD_ID, migration file path, target database');
    console.log('   3. Auto-triggers: Migration keywords, schema changes, RLS errors');
    console.log('   4. Output: Stored in sub_agent_execution_results table');
    console.log('   5. Blocking: Can block PLAN→EXEC handoff if verdict is BLOCKED');
    console.log('\n   Script example:');
    console.log('   node scripts/invoke-database-architect.js --sd-id SD-EVA-CONTENT-001 --migration-file path/to/migration.sql\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    await client.end();
  }
}

queryDatabaseSubAgent();
