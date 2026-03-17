#!/usr/bin/env node
/**
 * CLI wrapper for Team Spawner
 * SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001
 *
 * Usage:
 *   node scripts/spawn-team.js --template rca-investigation --task "Investigate connection timeout" --sd SD-PERF-001
 *   node scripts/spawn-team.js --list    # List available templates
 */

import { buildTeamFromTemplate, listTemplates } from '../lib/team/team-spawner.js';

async function main() {
  const args = process.argv.slice(2);

  // List mode
  if (args.includes('--list')) {
    const templates = await listTemplates();
    console.log('\n📋 Available Team Templates:\n');
    for (const t of templates) {
      console.log(`   ${t.id}`);
      console.log(`   Name: ${t.name}`);
      console.log(`   Description: ${t.description}`);
      console.log(`   Roles: ${t.roleCount} | Leader: ${t.leader}`);
      console.log('');
    }
    return;
  }

  // Build mode
  const templateIdx = args.indexOf('--template');
  const taskIdx = args.indexOf('--task');
  const sdIdx = args.indexOf('--sd');
  const nameIdx = args.indexOf('--name');

  if (templateIdx === -1 || taskIdx === -1) {
    console.error('Usage: node scripts/spawn-team.js --template <id> --task "<description>" [--sd <SD-ID>] [--name <team-name>]');
    console.error('       node scripts/spawn-team.js --list');
    process.exit(1);
  }

  const templateId = args[templateIdx + 1];
  const description = args[taskIdx + 1];
  const sdId = sdIdx !== -1 ? args[sdIdx + 1] : null;
  const teamName = nameIdx !== -1 ? args[nameIdx + 1] : null;

  console.log(`🏗️  Building team from template: ${templateId}`);
  console.log(`   Task: ${description}`);
  if (sdId) console.log(`   SD: ${sdId}`);

  const result = await buildTeamFromTemplate({
    templateId,
    taskContext: { description, sdId },
    teamName,
  });

  console.log(`\n✅ Team "${result.teamConfig.name}" assembled`);
  console.log(`   Template: ${result.teamConfig.templateName}`);
  console.log(`   Leader: ${result.teamConfig.leaderCode}`);
  console.log(`   Roles: ${result.teamConfig.roles.join(', ')}`);

  console.log('\n📋 Spawn Prompts:\n');
  for (const sp of result.spawnPrompts) {
    console.log(`   --- ${sp.name} (${sp.agentType}, ${sp.modelTier}) ---`);
    console.log(`   Role: ${sp.teamRole}`);
    console.log(`   Prompt length: ${sp.prompt.length} chars`);
    console.log('');
  }

  console.log('📋 Task Structure:\n');
  for (const task of result.tasks) {
    const deps = task.blockedBy.length > 0 ? ` (blocked by: ${task.blockedBy.join(', ')})` : '';
    console.log(`   [${task.taskIndex}] ${task.subject} → ${task.assigneeRole}${deps}`);
  }

  // Output JSON for programmatic use
  if (args.includes('--json')) {
    console.log('\n--- JSON Output ---');
    console.log(JSON.stringify(result, null, 2));
  }
}

const normalizedArgv = process.argv[1]?.replace(/\\/g, '/');
if (import.meta.url === `file:///${normalizedArgv}`) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

export { main };
