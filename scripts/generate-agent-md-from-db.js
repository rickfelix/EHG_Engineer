#!/usr/bin/env node
/**
 * Agent Prompt Compiler v2.0.0 - Database-Driven Agent System
 * SD-LEO-INFRA-DATABASE-DRIVEN-DYNAMIC-001
 *
 * Compiles .claude/agents/*.partial into .claude/agents/*.md by:
 * 1. Reading agent metadata (tools, model, team_role) from DB
 * 2. Generating YAML frontmatter from DB columns (not from .partial)
 * 3. Injecting team collaboration protocol for team-capable agents
 * 4. Injecting curated knowledge blocks from issue_patterns
 * 5. Supporting DB-only agents (no .partial required if instructions column populated)
 *
 * Usage:
 *   node scripts/generate-agent-md-from-db.js              # Live DB mode
 *   node scripts/generate-agent-md-from-db.js --snapshot <path>  # Offline snapshot mode
 *   node scripts/generate-agent-md-from-db.js --incremental      # Skip if inputs unchanged
 *   node scripts/generate-agent-md-from-db.js --dry-run          # Preview without writing
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { AGENT_CODE_MAP } from '../lib/constants/agent-mappings.js';
import { filterToolsByProfile, isValidProfile } from '../lib/tool-policy.js';
import { loadSkillsFromDirectory, selectSkills, formatSkillsForInjection } from '../lib/skills/index.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: issue_patterns is a growing table;
// per-agent selection below orders by GLOBAL occurrence_count then filters by category, so a
// truncated read can silently drop an entire low-occurrence category from every compiled agent.
import { fetchAllPaginated } from '../lib/db/fetch-all-paginated.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// ─── Constants ───────────────────────────────────────────────────────────────

const AGENTS_DIR = path.join(__dirname, '..', '.claude', 'agents');
const SKILLS_DIR = path.join(__dirname, '..', '.claude', 'skills');
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'phase-model-routing.json');
const HASH_FILE = path.join(__dirname, '..', '.claude', '.agent-gen-hash');
const MAX_KNOWLEDGE_TOKENS = 500;
const CHARS_PER_TOKEN = 4;
const MAX_KNOWLEDGE_CHARS = MAX_KNOWLEDGE_TOKENS * CHARS_PER_TOKEN;

// Required config registrations (FR-4)
const REQUIRED_CONFIG_KEYS = ['RCA', 'ORCHESTRATOR_CHILD'];

// Model name mapping for frontmatter
// Thinking effort strategy: all agents use opus, effort is controlled via thinking budget
const MODEL_TIER_MAP = { haiku: 'opus', sonnet: 'opus', opus: 'opus' };

const NOT_EXHAUSTIVE_DISCLAIMER = '> **NOT EXHAUSTIVE**: This section contains curated institutional knowledge compiled from the LEO database at generation time. It does NOT represent all available knowledge. When uncertain, query the database directly via `node scripts/execute-subagent.js --code <CODE> --sd-id <SD-ID>` or check `issue_patterns` and `leo_sub_agents` tables for the latest data.';

const TEAM_COLLABORATION_PROTOCOL = `### Team Collaboration Protocol
When spawned as a teammate in a team:
1. **Claim your task**: Use TaskUpdate with status="in_progress" and owner=your-name
2. **Do your work**: Use your specialist tools to investigate/implement
3. **Report findings**: Use SendMessage to report to team lead AND relevant peers
4. **Mark complete**: Use TaskUpdate with status="completed" when done
5. **Check for more work**: Use TaskList to find additional available tasks
6. **Coordinate**: Read team config at ~/.claude/teams/{team-name}/config.json to discover teammates`;

const TEAM_SPAWNING_PROTOCOL = `### Requesting Specialist Assistance
When your task requires expertise outside your domain, you can assemble a team:

**When to spawn help** (use judgment — only when genuinely needed):
- The problem spans multiple domains (e.g., a DB issue that also involves API and security)
- You lack the expertise to investigate a specific aspect
- Parallel investigation would significantly speed up resolution

**How to spawn help**:
1. Use \`TeamCreate\` to create a team for the investigation
2. Use \`TaskCreate\` to define tasks for each specialist needed
3. Use the \`Task\` tool to spawn teammates with clear, scoped prompts
4. Teammates report findings back to you via \`SendMessage\`
5. Synthesize findings and report to whoever spawned you

**Available team templates** (pre-built in database):
- \`rca-investigation\` — RCA lead + DB specialist + API specialist
- \`security-audit\` — Security lead + DB + API + Testing specialists
- \`performance-review\` — Performance lead + DB + API specialists

To use a template: \`node scripts/spawn-team.js --template <id> --task "<description>"\`

**Dynamic agent creation**: If no existing agent fits, create one at runtime:
\`\`\`javascript
import { createDynamicAgent } from './lib/team/agent-creator.js';
await createDynamicAgent({ code: 'SPECIALIST_NAME', name: '...', description: '...', instructions: '...' });
\`\`\`
Dynamic agents are always teammates (depth limit = 1, no cascading).

**When NOT to spawn help**:
- You can handle the task yourself with your existing tools
- The task is simple and well-scoped to your domain
- Adding coordination overhead would slow things down`;

// ─── Data Fetching ───────────────────────────────────────────────────────────

async function fetchLiveData(supabase) {
  // Fetch all active sub-agents WITH new metadata columns
  const { data: agents, error: agentErr } = await supabase
    .from('leo_sub_agents')
    .select('id, code, name, description, capabilities, metadata, model_tier, allowed_tools, team_role, instructions, category_mappings, tool_policy_profile')
    .eq('active', true)
    .order('code');

  if (agentErr) throw new Error(`Failed to fetch agents: ${agentErr.message}`);

  const agentByCode = {};
  const agentIdToCode = {};
  for (const agent of agents) {
    agentByCode[agent.code] = agent;
    agentIdToCode[agent.id] = agent.code;
  }

  // Fetch all active triggers
  const { data: triggers, error: trigErr } = await supabase
    .from('leo_sub_agent_triggers')
    .select('sub_agent_id, trigger_phrase, priority')
    .eq('active', true)
    .order('priority', { ascending: false });

  if (trigErr) throw new Error(`Failed to fetch triggers: ${trigErr.message}`);

  const triggersByCode = {};
  for (const t of triggers) {
    const code = agentIdToCode[t.sub_agent_id];
    if (!code) continue;
    if (!triggersByCode[code]) triggersByCode[code] = [];
    triggersByCode[code].push({ phrase: t.trigger_phrase, priority: t.priority });
  }

  // Fetch active issue patterns
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: paginate to completion --
  // a bare fetch here would silently truncate at the PostgREST cap, ordered by GLOBAL
  // occurrence_count, which can drop whole categories out of every agent's compiled knowledge.
  let patterns;
  try {
    patterns = await fetchAllPaginated(() => supabase
      .from('issue_patterns')
      .select('pattern_id, category, issue_summary, proven_solutions, occurrence_count')
      .eq('status', 'active')
      .order('occurrence_count', { ascending: false })
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (patErr) {
    throw new Error(`Failed to fetch patterns: ${patErr.message}`);
  }

  return { agentByCode, triggersByCode, patterns };
}

function loadSnapshot(snapshotPath) {
  const raw = fs.readFileSync(snapshotPath, 'utf8');
  return JSON.parse(raw);
}

// ─── Frontmatter Generation ─────────────────────────────────────────────────

function generateFrontmatter(agentName, agent) {
  const model = MODEL_TIER_MAP[agent.model_tier] || 'opus';
  const profile = agent.tool_policy_profile || 'full';

  let toolList = Array.isArray(agent.allowed_tools)
    ? agent.allowed_tools
    : ['Bash', 'Read', 'Write'];

  // Apply tool policy profile filtering
  if (profile !== 'full') {
    const before = toolList.length;
    toolList = filterToolsByProfile(profile, toolList);
    if (!isValidProfile(profile)) {
      console.warn(`  ⚠️  Unknown tool_policy_profile '${profile}' for ${agentName} — treating as 'full'`);
    } else {
      console.log(`  📋 Tool policy '${profile}' applied to ${agentName}: ${before} → ${toolList.length} tools`);
    }
  }

  const tools = toolList.join(', ');

  // Use first sentence/line of description for frontmatter (Claude Code shows this as tooltip)
  const fullDesc = agent.description || '';
  const firstLine = fullDesc.split(/\n/)[0].replace(/^#+\s*/, '').trim();
  const description = firstLine.length > 300 ? firstLine.substring(0, 297) + '...' : firstLine;

  const profileComment = profile !== 'full' ? `\n# tool_policy_profile: ${profile}` : '';
  return `---\nname: ${agentName}\ndescription: ${JSON.stringify(description)}\ntools: ${tools}\nmodel: ${model}\n---${profileComment}\n`;
}

// ─── Knowledge Block Composition ─────────────────────────────────────────────

function getCategoryMappings(agentCode, data, configCategoryMappings) {
  // Prefer DB-stored category_mappings, fall back to config file
  const agent = data.agentByCode[agentCode];
  if (agent?.category_mappings && Array.isArray(agent.category_mappings) && agent.category_mappings.length > 0) {
    return agent.category_mappings;
  }
  return configCategoryMappings[agentCode] || [];
}

function composeKnowledgeBlock(agentCode, data, configCategoryMappings) {
  const sections = [];
  const agent = data.agentByCode[agentCode];

  // 1. Trigger context
  const triggers = data.triggersByCode[agentCode] || [];
  if (triggers.length > 0) {
    const topTriggers = triggers.slice(0, 8).map(t => t.phrase);
    sections.push(`### Trigger Context\nThis agent activates on: ${topTriggers.join(', ')}${triggers.length > 8 ? ` (+${triggers.length - 8} more in database)` : ''}`);
  }

  // 2. Relevant issue patterns (from DB category_mappings first, config fallback)
  const categories = getCategoryMappings(agentCode, data, configCategoryMappings);
  const relevantPatterns = data.patterns
    .filter(p => categories.includes(p.category))
    .slice(0, 3);

  if (relevantPatterns.length > 0) {
    const patternLines = relevantPatterns.map(p => {
      const solution = p.proven_solutions
        ? (Array.isArray(p.proven_solutions) ? p.proven_solutions[0] : p.proven_solutions)
        : null;
      const solutionText = typeof solution === 'string'
        ? solution.substring(0, 80)
        : (solution?.description || '').substring(0, 80);
      return `- **${p.pattern_id}** (${p.occurrence_count}x): ${p.issue_summary.substring(0, 100)}${solutionText ? `\n  Proven fix: ${solutionText}` : ''}`;
    });
    sections.push(`### Recent Issue Patterns\n${patternLines.join('\n')}`);
  }

  // 3. Capabilities from DB
  if (agent && agent.capabilities) {
    const capsList = Array.isArray(agent.capabilities)
      ? agent.capabilities
      : (typeof agent.capabilities === 'string' ? JSON.parse(agent.capabilities) : []);
    if (capsList.length > 0) {
      const caps = capsList.slice(0, 6).join(', ');
      sections.push(`### Registered Capabilities\n${caps}`);
    }
  }

  if (sections.length === 0) return null;

  let block = `## Institutional Memory (Generated)\n\n${NOT_EXHAUSTIVE_DISCLAIMER}\n\n${sections.join('\n\n')}`;

  if (block.length > MAX_KNOWLEDGE_CHARS) {
    block = block.substring(0, MAX_KNOWLEDGE_CHARS - 50) + '\n\n*[Truncated to 500-token cap]*';
  }

  return block;
}

// ─── Skill Block Composition ─────────────────────────────────────────────────

/**
 * Load skills from .claude/skills/ and match them to this agent's context.
 * Returns a formatted skill block for injection, or null if no skills match.
 */
function composeSkillBlock(agentCode, data, allSkills) {
  if (!allSkills || allSkills.length === 0) return null;

  const agent = data.agentByCode[agentCode];
  if (!agent) return null;

  // Build context from agent's category_mappings, triggers, and capabilities
  const categories = Array.isArray(agent.category_mappings) ? agent.category_mappings : [];
  const triggers = (data.triggersByCode[agentCode] || []).map(t => t.phrase);
  const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];

  const context = {
    keywords: [...categories, ...triggers.slice(0, 10), ...capabilities.slice(0, 5)],
    agentCode,
    tools: Array.isArray(agent.allowed_tools) ? agent.allowed_tools : []
  };

  const matched = selectSkills(allSkills, context, { threshold: 25, maxSkills: 3 });
  if (matched.length === 0) return null;

  const { injectedContent, skillCount } = formatSkillsForInjection(matched, 1000);
  if (skillCount === 0) return null;

  return injectedContent;
}

// ─── Agent Body Extraction ───────────────────────────────────────────────────

function stripYamlFrontmatter(content) {
  // Remove YAML frontmatter (--- ... ---) from .partial content
  // Handle both Unix (\n) and Windows (\r\n) line endings
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (match) {
    return content.substring(match[0].length);
  }
  return content;
}

// ─── Agent File Compilation ──────────────────────────────────────────────────

function findInjectionPoint(content) {
  // QF-20260509-AGENT-MD: skip past YAML frontmatter so both the H1 search
  // AND the no-H1 fallback land inside the body. Without this, agents whose
  // body has no H1 (stories-agent, risk-agent, uat-agent, redis-specialist)
  // had the knowledge block prepended at offset 0 — BEFORE frontmatter —
  // breaking Claude Code's agent registration (Task tool reported the
  // subagent_type as not-found).
  const fmMatch = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  const baseOffset = fmMatch ? fmMatch[0].length : 0;
  const body = content.substring(baseOffset);
  const h1Match = body.match(/\n(# [^\n]+)\n/);
  if (h1Match) {
    const h1End = baseOffset + h1Match.index + h1Match[0].length;
    const nextBlank = content.indexOf('\n\n', h1End);
    if (nextBlank !== -1) return nextBlank + 2;
    return h1End;
  }
  return baseOffset;
}

function compileAgentFromPartial(partialPath, agentName, agentCode, data, configCategoryMappings, allSkills) {
  const rawContent = fs.readFileSync(partialPath, 'utf8');
  const agent = data.agentByCode[agentCode];

  // 27edb2c0: when the DB has no row for this agentCode (agent authored as a
  // .partial but not in leo_sub_agents — or fetch returned an unexpectedly
  // empty agentByCode) preserve the .partial's frontmatter rather than
  // stripping it and writing a frontmatter-less .md. Without this fallback,
  // Claude Code couldn't recognize the file as an agent and the subagent_type
  // was effectively unregistered (witnessed for stories-agent and risk-agent).
  const body = agent ? stripYamlFrontmatter(rawContent) : rawContent;

  // Remove any existing "Institutional Memory (Generated)" section
  const cleanedBody = body.replace(/## Institutional Memory \(Generated\)[\s\S]*?(?=\n## [^I]|\n---\n|$)/, '');

  // Generate new frontmatter from DB; falls back to '' when no DB row, in
  // which case cleanedBody still carries the .partial's frontmatter.
  const frontmatter = agent ? generateFrontmatter(agentName, agent) : '';
  if (!agent) {
    console.warn(`  ⚠️  No DB row for ${agentCode} (${agentName}) — preserving .partial frontmatter as fallback`);
  }

  // Compose knowledge block
  const knowledgeBlock = composeKnowledgeBlock(agentCode, data, configCategoryMappings);

  // Build team protocol section if agent has team tools
  let teamProtocol = '';
  if (agent?.allowed_tools && Array.isArray(agent.allowed_tools)) {
    const tools = agent.allowed_tools;
    if (tools.includes('SendMessage')) {
      teamProtocol = `\n${TEAM_COLLABORATION_PROTOCOL}\n`;
    }
    if (tools.includes('TeamCreate') && tools.includes('Task')) {
      teamProtocol += `\n${TEAM_SPAWNING_PROTOCOL}\n`;
    }
  }

  // Assemble: frontmatter + body with injected knowledge + team protocol
  let assembled = frontmatter + cleanedBody;

  // Inject knowledge block after H1
  if (knowledgeBlock) {
    const injectionPoint = findInjectionPoint(assembled);
    const before = assembled.substring(0, injectionPoint);
    const after = assembled.substring(injectionPoint);
    assembled = `${before}${knowledgeBlock}\n\n${after}`;
  }

  // Inject matched skills
  const skillBlock = composeSkillBlock(agentCode, data, allSkills);
  if (skillBlock) {
    assembled = assembled.trimEnd() + '\n\n' + skillBlock;
  }

  // Inject team protocol at end if applicable
  if (teamProtocol) {
    assembled = assembled.trimEnd() + '\n\n' + teamProtocol;
  }

  return assembled;
}

function compileAgentFromDB(agentName, agentCode, data, configCategoryMappings, allSkills) {
  // DB-only agent: no .partial file, instructions come from DB
  const agent = data.agentByCode[agentCode];
  if (!agent?.instructions) {
    throw new Error(`DB-only agent ${agentCode} has no instructions column`);
  }

  const frontmatter = generateFrontmatter(agentName, agent);
  const knowledgeBlock = composeKnowledgeBlock(agentCode, data, configCategoryMappings);

  let teamProtocol = '';
  if (agent.allowed_tools && Array.isArray(agent.allowed_tools)) {
    const tools = agent.allowed_tools;
    if (tools.includes('SendMessage')) {
      teamProtocol = `\n${TEAM_COLLABORATION_PROTOCOL}\n`;
    }
    if (tools.includes('TeamCreate') && tools.includes('Task')) {
      teamProtocol += `\n${TEAM_SPAWNING_PROTOCOL}\n`;
    }
  }

  let assembled = frontmatter + '\n' + agent.instructions;

  if (knowledgeBlock) {
    const injectionPoint = findInjectionPoint(assembled);
    const before = assembled.substring(0, injectionPoint);
    const after = assembled.substring(injectionPoint);
    assembled = `${before}${knowledgeBlock}\n\n${after}`;
  }

  // Inject matched skills
  const skillBlock = composeSkillBlock(agentCode, data, allSkills);
  if (skillBlock) {
    assembled = assembled.trimEnd() + '\n\n' + skillBlock;
  }

  if (teamProtocol) {
    assembled = assembled.trimEnd() + '\n\n' + teamProtocol;
  }

  return assembled;
}

// ─── Incremental Mode Support ────────────────────────────────────────────────

function computeInputHash(partialsDir, data) {
  const hash = crypto.createHash('sha256');

  const partials = fs.readdirSync(partialsDir)
    .filter(f => f.endsWith('.partial'))
    .sort();

  for (const f of partials) {
    const content = fs.readFileSync(path.join(partialsDir, f), 'utf8');
    hash.update(f + ':' + content);
  }

  // Include DB metadata in hash for change detection
  hash.update(JSON.stringify(data.agentByCode, Object.keys(data.agentByCode).sort()));
  hash.update(JSON.stringify(data.triggersByCode, Object.keys(data.triggersByCode).sort()));
  hash.update(JSON.stringify(data.patterns));

  // Include skill files in hash for change detection
  const skillsDir = path.join(partialsDir, '..', 'skills');
  if (fs.existsSync(skillsDir)) {
    const skillFiles = fs.readdirSync(skillsDir)
      .filter(f => f.endsWith('.skill.md') || f.endsWith('.SKILL.md'))
      .sort();
    for (const sf of skillFiles) {
      const skillContent = fs.readFileSync(path.join(skillsDir, sf), 'utf8');
      hash.update('skill:' + sf + ':' + skillContent);
    }
  }

  return hash.digest('hex');
}

// ─── Config Validation (FR-4) ────────────────────────────────────────────────

function validateConfig(configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const missing = [];

  for (const key of REQUIRED_CONFIG_KEYS) {
    if (!config.defaults?.[key]) missing.push(`defaults.${key}`);
    const inAnyPhase = Object.values(config.phaseOverrides || {}).some(p => p[key]);
    if (!inAnyPhase) missing.push(`phaseOverrides.*.${key}`);
    // categoryMappings check is optional now (DB is primary source)
  }

  return missing;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const snapshotIdx = args.indexOf('--snapshot');
  const snapshotPath = snapshotIdx !== -1 ? args[snapshotIdx + 1] : null;
  const incremental = args.includes('--incremental');
  const dryRun = args.includes('--dry-run');

  console.log('🔧 Agent Prompt Compiler v2.0.0 (DB-driven)');
  console.log(`   Mode: ${snapshotPath ? 'snapshot' : 'live-db'}${incremental ? ' (incremental)' : ''}${dryRun ? ' (dry-run)' : ''}`);

  // FR-4: Validate required config registrations
  const configMissing = validateConfig(CONFIG_PATH);
  if (configMissing.length > 0) {
    console.error(`\n❌ Missing required config registrations in ${CONFIG_PATH}:`);
    configMissing.forEach(m => console.error(`   - ${m}`));
    process.exit(1);
  }
  console.log('   ✅ Config validation passed');

  // Fetch data
  let data;
  if (snapshotPath) {
    console.log(`   📸 Loading snapshot: ${snapshotPath}`);
    data = loadSnapshot(snapshotPath);
  } else {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
      process.exit(1);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('   📡 Fetching data from LEO database...');
    data = await fetchLiveData(supabase);
  }

  const agentCount = Object.keys(data.agentByCode).length;
  const triggerCount = Object.values(data.triggersByCode).reduce((sum, arr) => sum + arr.length, 0);
  const patternCount = data.patterns.length;
  console.log(`   📊 Loaded: ${agentCount} agents, ${triggerCount} triggers, ${patternCount} patterns`);

  // Load config category mappings (fallback for agents without DB mappings)
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const configCategoryMappings = config.categoryMappings || {};

  // Load skills from .claude/skills/ directory
  const allSkills = loadSkillsFromDirectory(SKILLS_DIR);
  if (allSkills.length > 0) {
    console.log(`   🎯 Loaded ${allSkills.length} skill(s) from ${SKILLS_DIR}`);
  }

  // Incremental check
  if (incremental) {
    const currentHash = computeInputHash(AGENTS_DIR, data);
    if (fs.existsSync(HASH_FILE)) {
      const previousHash = fs.readFileSync(HASH_FILE, 'utf8').trim();
      if (currentHash === previousHash) {
        console.log('   ⏭️  No changes detected, skipping generation');
        process.exit(0);
      }
    }
  }

  // Find all partial files
  const partialFiles = fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.partial'))
    .sort();

  // Build reverse map: code → agent name (for DB-only agents)
  const codeToName = {};
  for (const [name, code] of Object.entries(AGENT_CODE_MAP)) {
    codeToName[code] = name;
  }

  // Find DB-only agents (have instructions but no .partial file)
  const partialAgentNames = new Set(partialFiles.map(f => f.replace('.partial', '')));
  const dbOnlyAgents = [];
  for (const [code, agent] of Object.entries(data.agentByCode)) {
    if (agent.instructions && !codeToName[code]) {
      // Dynamic agent — generate name from code
      const agentName = code.toLowerCase().replace(/_/g, '-') + '-agent';
      if (!partialAgentNames.has(agentName)) {
        dbOnlyAgents.push({ code, agentName });
      }
    }
  }

  const totalCount = partialFiles.length + dbOnlyAgents.length;
  console.log(`\n📝 Compiling ${totalCount} agents (${partialFiles.length} partial + ${dbOnlyAgents.length} DB-only)...`);

  const results = { success: [], failed: [], skipped: [], dbOnly: [] };

  // Compile .partial-based agents
  for (const partialFile of partialFiles) {
    const agentName = partialFile.replace('.partial', '');
    const agentCode = AGENT_CODE_MAP[agentName];

    if (!agentCode) {
      console.log(`   ⏭️  ${agentName}: no LEO mapping, copying as-is`);
      if (!dryRun) {
        const content = fs.readFileSync(path.join(AGENTS_DIR, partialFile), 'utf8');
        fs.writeFileSync(path.join(AGENTS_DIR, `${agentName}.md`), content);
      }
      results.skipped.push(agentName);
      continue;
    }

    try {
      const partialPath = path.join(AGENTS_DIR, partialFile);
      const outputPath = path.join(AGENTS_DIR, `${agentName}.md`);

      const compiled = compileAgentFromPartial(partialPath, agentName, agentCode, data, configCategoryMappings, allSkills);

      if (!dryRun) {
        fs.writeFileSync(outputPath, compiled);
      }

      const hasKnowledge = compiled.includes('## Institutional Memory (Generated)');
      const hasTeam = compiled.includes('### Team Collaboration Protocol');
      const hasSpawn = compiled.includes('### Requesting Specialist Assistance');
      const hasSkills = compiled.includes('## Injected Skills');
      const sizeKB = (Buffer.byteLength(compiled) / 1024).toFixed(1);
      const flags = [hasKnowledge ? 'knowledge' : null, hasSkills ? 'skills' : null, hasTeam ? 'team' : null, hasSpawn ? 'spawn' : null].filter(Boolean).join('+');
      console.log(`   ✅ ${agentName} → ${sizeKB}KB${flags ? ` (${flags})` : ''}`);
      results.success.push(agentName);

    } catch (err) {
      console.error(`   ❌ ${agentName}: ${err.message}`);
      results.failed.push({ agent: agentName, error: err.message });
    }
  }

  // Compile DB-only agents
  for (const { code, agentName } of dbOnlyAgents) {
    try {
      const outputPath = path.join(AGENTS_DIR, `${agentName}.md`);
      const compiled = compileAgentFromDB(agentName, code, data, configCategoryMappings, allSkills);

      if (!dryRun) {
        fs.writeFileSync(outputPath, compiled);
      }

      const sizeKB = (Buffer.byteLength(compiled) / 1024).toFixed(1);
      console.log(`   ✅ ${agentName} → ${sizeKB}KB (DB-only)`);
      results.dbOnly.push(agentName);

    } catch (err) {
      console.error(`   ❌ ${agentName} (DB-only): ${err.message}`);
      results.failed.push({ agent: agentName, error: err.message });
    }
  }

  // Save hash for incremental mode
  if (!dryRun && results.failed.length === 0) {
    const currentHash = computeInputHash(AGENTS_DIR, data);
    fs.writeFileSync(HASH_FILE, currentHash);
  }

  // Summary
  const total = results.success.length + results.dbOnly.length;
  console.log(`\n📊 Summary: ${total} compiled (${results.dbOnly.length} DB-only), ${results.skipped.length} skipped, ${results.failed.length} failed`);

  if (results.failed.length > 0) {
    console.error('\n❌ Failed agents:');
    results.failed.forEach(f => console.error(`   ${f.agent}: ${f.error}`));
    process.exit(1);
  }

  console.log('✅ Agent prompt compilation complete');
}

// Run if called directly
const normalizedArgv = process.argv[1]?.replace(/\\/g, '/');
if (import.meta.url === `file:///${normalizedArgv}`) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

export { main, composeKnowledgeBlock, composeSkillBlock, compileAgentFromPartial, compileAgentFromDB, fetchLiveData, AGENT_CODE_MAP, generateFrontmatter, findInjectionPoint };
