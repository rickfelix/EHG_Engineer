/**
 * Team Spawner - Template-Based Team Creation
 * SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001, Phase 4
 *
 * Reads team templates from DB, enriches each role with task-specific
 * knowledge, and assembles ready-to-use spawn prompts for the Task tool.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { enrichTeammatePrompt } from './knowledge-enricher.js';

dotenv.config();

/**
 * Build a team from a database template.
 *
 * @param {Object} options
 * @param {string} options.templateId - Template ID (e.g., 'rca-investigation')
 * @param {Object} options.taskContext - { description, sdId, domain }
 * @param {string} [options.teamName] - Team name (auto-generated if omitted)
 * @returns {Promise<{teamConfig: Object, spawnPrompts: Array}>}
 */
export async function buildTeamFromTemplate({
  templateId,
  taskContext,
  teamName = null,
}) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Fetch template
  const { data: template, error } = await supabase
    .from('team_templates')
    .select('*')
    .eq('id', templateId)
    .eq('active', true)
    .single();

  if (error || !template) {
    throw new Error(`Template '${templateId}' not found: ${error?.message || 'inactive or missing'}`);
  }

  // 2. Fetch agent metadata for each role
  const agentCodes = template.roles.map(r => r.agent_code);
  const { data: agents } = await supabase
    .from('leo_sub_agents')
    .select('code, name, description, model_tier, allowed_tools, team_role')
    .in('code', agentCodes)
    .eq('active', true);

  const agentByCode = {};
  for (const agent of (agents || [])) {
    agentByCode[agent.code] = agent;
  }

  // 3. Generate team name
  const resolvedTeamName = teamName || `${templateId}-${Date.now().toString(36)}`;

  // 4. For each role: enrich with task-specific knowledge
  const spawnPrompts = [];
  for (const role of template.roles) {
    const agent = agentByCode[role.agent_code];
    if (!agent) {
      console.warn(`   ⚠️  Agent ${role.agent_code} not found, skipping role ${role.role_name}`);
      continue;
    }

    // Resolve task template with context
    const taskText = role.task_template
      .replace(/\{task_description\}/g, taskContext.description || '')
      .replace(/\{sd_id\}/g, taskContext.sdId || 'STANDALONE')
      .replace(/\{domain\}/g, taskContext.domain || '');

    // Enrich with knowledge
    let knowledgeBlock = '';
    try {
      const enrichment = await enrichTeammatePrompt({
        agentType: role.agent_code,
        taskDescription: taskText,
        sdId: taskContext.sdId,
        domain: taskContext.domain,
      });
      knowledgeBlock = enrichment.knowledgeBlock;
    } catch (err) {
      console.warn(`   ⚠️  Enrichment failed for ${role.role_name}: ${err.message}`);
    }

    // Map agent code to subagent_type name
    const subagentType = agent.code.toLowerCase().replace(/_/g, '-') + '-agent';

    // Assemble spawn prompt
    const prompt = [
      `You are ${role.role_name} in team "${resolvedTeamName}".`,
      '',
      `**Your task**: ${taskText}`,
      '',
      taskContext.sdId ? `**SD Context**: ${taskContext.sdId}` : '',
      '',
      knowledgeBlock,
    ].filter(line => line !== undefined).join('\n').trim();

    spawnPrompts.push({
      agentType: subagentType,
      name: role.role_name,
      prompt,
      teamRole: role.team_role || agent.team_role,
      modelTier: agent.model_tier,
    });
  }

  // 5. Build task structure with role assignments
  const tasks = (template.task_structure || []).map((task, idx) => ({
    subject: task.subject,
    description: task.description,
    assigneeRole: task.assignee_role,
    blockedBy: task.blocked_by || [],
    taskIndex: idx,
  }));

  return {
    teamConfig: {
      name: resolvedTeamName,
      templateId,
      templateName: template.name,
      description: template.description,
      roles: template.roles.map(r => r.role_name),
      leaderCode: template.leader_agent_code,
    },
    spawnPrompts,
    tasks,
  };
}

/**
 * List available team templates.
 * @returns {Promise<Array<{id: string, name: string, description: string, roleCount: number}>>}
 */
export async function listTemplates() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('team_templates')
    .select('id, name, description, roles, leader_agent_code')
    .eq('active', true)
    .order('id');

  if (error) throw new Error(`Failed to list templates: ${error.message}`);

  return (data || []).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    roleCount: Array.isArray(t.roles) ? t.roles.length : 0,
    leader: t.leader_agent_code,
  }));
}
