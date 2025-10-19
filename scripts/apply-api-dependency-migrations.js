#!/usr/bin/env node
/**
 * Apply API and DEPENDENCY Sub-Agent Migrations
 *
 * This script applies the database migrations for the new API and DEPENDENCY sub-agents.
 * It handles UUID generation and conflict resolution automatically.
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function applyAPIAgentMigration() {
  console.log('📦 Applying API Sub-Agent Migration...');
  console.log('='.repeat(60));

  try {
    // Check if API agent already exists
    const { data: existing } = await supabase
      .from('leo_sub_agents')
      .select('id, code')
      .eq('code', 'API')
      .maybeSingle();

    let apiAgentId;

    if (existing) {
      console.log('⚠️  API agent already exists, updating...');
      apiAgentId = existing.id;

      const { error: updateError } = await supabase
        .from('leo_sub_agents')
        .update({
          name: 'API Architecture Sub-Agent',
          description: 'Handles REST/GraphQL endpoint design, API architecture, versioning, and documentation. Evaluates design quality, performance, security, and documentation completeness.',
          activation_type: 'automatic',
          priority: 75,
          active: true
        })
        .eq('id', apiAgentId);

      if (updateError) {
        throw new Error(`Failed to update API agent: ${updateError.message}`);
      }
      console.log('✅ API sub-agent updated');
    } else {
      // Insert new API sub-agent
      apiAgentId = randomUUID();

      const { error: insertError } = await supabase
        .from('leo_sub_agents')
        .insert({
          id: apiAgentId,
          name: 'API Architecture Sub-Agent',
          code: 'API',
          description: 'Handles REST/GraphQL endpoint design, API architecture, versioning, and documentation. Evaluates design quality, performance, security, and documentation completeness.',
          activation_type: 'automatic',
          priority: 75,
          active: true
        });

      if (insertError) {
        throw new Error(`Failed to insert API agent: ${insertError.message}`);
      }
      console.log('✅ API sub-agent inserted');
    }

    // Insert API triggers
    const triggers = [
      { sub_agent_id: apiAgentId, trigger_phrase: 'API', trigger_type: 'keyword', trigger_context: 'PRD', priority: 75 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'REST', trigger_type: 'keyword', trigger_context: 'PRD', priority: 80 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'RESTful', trigger_type: 'keyword', trigger_context: 'PRD', priority: 80 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'GraphQL', trigger_type: 'keyword', trigger_context: 'PRD', priority: 80 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'endpoint', trigger_type: 'keyword', trigger_context: 'PRD', priority: 75 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'route', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'controller', trigger_type: 'keyword', trigger_context: 'PRD', priority: 75 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'middleware', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'request', trigger_type: 'keyword', trigger_context: 'PRD', priority: 60 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'response', trigger_type: 'keyword', trigger_context: 'PRD', priority: 60 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'payload', trigger_type: 'keyword', trigger_context: 'PRD', priority: 65 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'status code', trigger_type: 'pattern', trigger_context: 'PRD', priority: 65 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'HTTP method', trigger_type: 'pattern', trigger_context: 'PRD', priority: 70 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'OpenAPI', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'Swagger', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'versioning', trigger_type: 'keyword', trigger_context: 'PRD', priority: 65 },
      { sub_agent_id: apiAgentId, trigger_phrase: 'pagination', trigger_type: 'keyword', trigger_context: 'PRD', priority: 60 }
    ];

    let insertedCount = 0;
    let skippedCount = 0;

    for (const trigger of triggers) {
      const { error: triggerError } = await supabase
        .from('leo_sub_agent_triggers')
        .insert(trigger);

      if (triggerError) {
        if (triggerError.code === '23505') {
          // Duplicate, skip
          skippedCount++;
        } else {
          console.warn(`⚠️  Error inserting trigger "${trigger.trigger_phrase}":`, triggerError.message);
        }
      } else {
        insertedCount++;
      }
    }

    console.log(`✅ API triggers: ${insertedCount} inserted, ${skippedCount} skipped`);

    // Verify
    const { data: verifyAgent } = await supabase
      .from('leo_sub_agents')
      .select('code, name, priority')
      .eq('code', 'API')
      .single();

    const { data: verifyTriggers } = await supabase
      .from('leo_sub_agent_triggers')
      .select('trigger_phrase')
      .eq('sub_agent_id', apiAgentId);

    console.log('');
    console.log('✅ API sub-agent migration completed successfully');
    console.log(`  - Agent: ${verifyAgent.name}`);
    console.log(`  - Priority: ${verifyAgent.priority}`);
    console.log(`  - Triggers: ${verifyTriggers.length}`);
    console.log('='.repeat(60));
    console.log('');

    return true;

  } catch (error) {
    console.error('❌ API migration failed:', error.message);
    return false;
  }
}

async function applyDEPENDENCYAgentMigration() {
  console.log('📦 Applying DEPENDENCY Sub-Agent Migration...');
  console.log('='.repeat(60));

  try {
    // Check if DEPENDENCY agent already exists
    const { data: existing } = await supabase
      .from('leo_sub_agents')
      .select('id, code')
      .eq('code', 'DEPENDENCY')
      .maybeSingle();

    let dependencyAgentId;

    if (existing) {
      console.log('⚠️  DEPENDENCY agent already exists, updating...');
      dependencyAgentId = existing.id;

      const { error: updateError } = await supabase
        .from('leo_sub_agents')
        .update({
          name: 'Dependency Management Sub-Agent',
          description: 'Handles npm/package updates, security vulnerabilities (CVE), dependency conflicts, and version management. Evaluates security, maintenance, compatibility, and performance.',
          activation_type: 'automatic',
          priority: 70,
          active: true
        })
        .eq('id', dependencyAgentId);

      if (updateError) {
        throw new Error(`Failed to update DEPENDENCY agent: ${updateError.message}`);
      }
      console.log('✅ DEPENDENCY sub-agent updated');
    } else {
      // Insert new DEPENDENCY sub-agent
      dependencyAgentId = randomUUID();

      const { error: insertError } = await supabase
        .from('leo_sub_agents')
        .insert({
          id: dependencyAgentId,
          name: 'Dependency Management Sub-Agent',
          code: 'DEPENDENCY',
          description: 'Handles npm/package updates, security vulnerabilities (CVE), dependency conflicts, and version management. Evaluates security, maintenance, compatibility, and performance.',
          activation_type: 'automatic',
          priority: 70,
          active: true
        });

      if (insertError) {
        throw new Error(`Failed to insert DEPENDENCY agent: ${insertError.message}`);
      }
      console.log('✅ DEPENDENCY sub-agent inserted');
    }

    // Insert DEPENDENCY triggers
    const triggers = [
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'dependency', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'dependencies', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'npm', trigger_type: 'keyword', trigger_context: 'PRD', priority: 75 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'yarn', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'pnpm', trigger_type: 'keyword', trigger_context: 'PRD', priority: 65 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'package', trigger_type: 'keyword', trigger_context: 'PRD', priority: 65 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'package.json', trigger_type: 'keyword', trigger_context: 'PRD', priority: 80 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'vulnerability', trigger_type: 'keyword', trigger_context: 'PRD', priority: 85 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'CVE', trigger_type: 'keyword', trigger_context: 'PRD', priority: 90 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'security advisory', trigger_type: 'pattern', trigger_context: 'PRD', priority: 85 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'outdated', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'install', trigger_type: 'keyword', trigger_context: 'PRD', priority: 50 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'update', trigger_type: 'keyword', trigger_context: 'PRD', priority: 60 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'upgrade', trigger_type: 'keyword', trigger_context: 'PRD', priority: 65 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'version', trigger_type: 'keyword', trigger_context: 'PRD', priority: 50 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'semver', trigger_type: 'keyword', trigger_context: 'PRD', priority: 60 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'node_modules', trigger_type: 'keyword', trigger_context: 'PRD', priority: 65 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'patch', trigger_type: 'keyword', trigger_context: 'PRD', priority: 55 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'CVSS', trigger_type: 'keyword', trigger_context: 'PRD', priority: 85 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'exploit', trigger_type: 'keyword', trigger_context: 'PRD', priority: 80 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'Snyk', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 },
      { sub_agent_id: dependencyAgentId, trigger_phrase: 'Dependabot', trigger_type: 'keyword', trigger_context: 'PRD', priority: 70 }
    ];

    let insertedCount = 0;
    let skippedCount = 0;

    for (const trigger of triggers) {
      const { error: triggerError } = await supabase
        .from('leo_sub_agent_triggers')
        .insert(trigger);

      if (triggerError) {
        if (triggerError.code === '23505') {
          // Duplicate, skip
          skippedCount++;
        } else {
          console.warn(`⚠️  Error inserting trigger "${trigger.trigger_phrase}":`, triggerError.message);
        }
      } else {
        insertedCount++;
      }
    }

    console.log(`✅ DEPENDENCY triggers: ${insertedCount} inserted, ${skippedCount} skipped`);

    // Verify
    const { data: verifyAgent } = await supabase
      .from('leo_sub_agents')
      .select('code, name, priority')
      .eq('code', 'DEPENDENCY')
      .single();

    const { data: verifyTriggers } = await supabase
      .from('leo_sub_agent_triggers')
      .select('trigger_phrase')
      .eq('sub_agent_id', dependencyAgentId);

    console.log('');
    console.log('✅ DEPENDENCY sub-agent migration completed successfully');
    console.log(`  - Agent: ${verifyAgent.name}`);
    console.log(`  - Priority: ${verifyAgent.priority}`);
    console.log(`  - Triggers: ${verifyTriggers.length}`);
    console.log('='.repeat(60));
    console.log('');

    return true;

  } catch (error) {
    console.error('❌ DEPENDENCY migration failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('\n🚀 Sub-Agent Migrations - Starting...\n');

  const apiSuccess = await applyAPIAgentMigration();
  const dependencySuccess = await applyDEPENDENCYAgentMigration();

  console.log('\n📊 Migration Summary');
  console.log('='.repeat(60));
  console.log(`API Agent: ${apiSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`DEPENDENCY Agent: ${dependencySuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log('='.repeat(60));

  if (apiSuccess && dependencySuccess) {
    console.log('\n🎉 All migrations completed successfully!');
    process.exit(0);
  } else {
    console.log('\n❌ Some migrations failed. Please review errors above.');
    process.exit(1);
  }
}

main();
