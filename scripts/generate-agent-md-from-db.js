#!/usr/bin/env node
/**
 * Agent Prompt Compiler - Bridge Agent Systems
 * SD-LEO-INFRA-BRIDGE-AGENT-SYSTEMS-001
 *
 * Compiles .claude/agents/*.partial.md into .claude/agents/*.md by injecting
 * curated knowledge blocks from the LEO database (issue_patterns, triggers,
 * agent capabilities) while preserving base agent instructions.
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// ─── Constants ───────────────────────────────────────────────────────────────

const AGENTS_DIR = path.join(__dirname, '..', '.claude', 'agents');
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'phase-model-routing.json');
const HASH_FILE = path.join(__dirname, '..', '.claude', '.agent-gen-hash');
const MAX_KNOWLEDGE_TOKENS = 500;
const CHARS_PER_TOKEN = 4; // Conservative estimate
const MAX_KNOWLEDGE_CHARS = MAX_KNOWLEDGE_TOKENS * CHARS_PER_TOKEN;

// Required config registrations (FR-4)
const REQUIRED_CONFIG_KEYS = ['RCA', 'ORCHESTRATOR_CHILD'];

// Agent filename → LEO sub-agent code mapping
const AGENT_CODE_MAP = {
  'api-agent': 'API',
  'database-agent': 'DATABASE',
  'dependency-agent': 'DEPENDENCY',
  'design-agent': 'DESIGN',
  'docmon-agent': 'DOCMON',
  'github-agent': 'GITHUB',
  'orchestrator-child-agent': 'ORCHESTRATOR_CHILD',
  'performance-agent': 'PERFORMANCE',
  'rca-agent': 'RCA',
  'regression-agent': 'REGRESSION',
  'retro-agent': 'RETRO',
  'risk-agent': 'RISK',
  'security-agent': 'SECURITY',
  'stories-agent': 'STORIES',
  'testing-agent': 'TESTING',
  'uat-agent': 'UAT',
  'validation-agent': 'VALIDATION',
};

const NOT_EXHAUSTIVE_DISCLAIMER = '> **NOT EXHAUSTIVE**: This section contains curated institutional knowledge compiled from the LEO database at generation time. It does NOT represent all available knowledge. When uncertain, query the database directly via `node scripts/execute-subagent.js --code <CODE> --sd-id <SD-ID>` or check `issue_patterns` and `leo_sub_agents` tables for the latest data.';

// ─── Data Fetching ───────────────────────────────────────────────────────────

async function fetchLiveData(supabase) {
  // Fetch all active sub-agents
  const { data: agents, error: agentErr } = await supabase
    .from('leo_sub_agents')
    .select('id, code, name, description, capabilities, metadata')
    .eq('active', true)
    .order('code');

  if (agentErr) throw new Error(`Failed to fetch agents: ${agentErr.message}`);

  // Build agent lookup by code
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

  // Group triggers by agent code
  const triggersByCode = {};
  for (const t of triggers) {
    const code = agentIdToCode[t.sub_agent_id];
    if (!code) continue;
    if (!triggersByCode[code]) triggersByCode[code] = [];
    triggersByCode[code].push({ phrase: t.trigger_phrase, priority: t.priority });
  }

  // Fetch active issue patterns
  const { data: patterns, error: patErr } = await supabase
    .from('issue_patterns')
    .select('pattern_id, category, issue_summary, proven_solutions, occurrence_count')
    .eq('status', 'active')
    .order('occurrence_count', { ascending: false });

  if (patErr) throw new Error(`Failed to fetch patterns: ${patErr.message}`);

  return { agentByCode, triggersByCode, patterns };
}

function loadSnapshot(snapshotPath) {
  const raw = fs.readFileSync(snapshotPath, 'utf8');
  return JSON.parse(raw);
}

// ─── Knowledge Block Composition ─────────────────────────────────────────────

function composeKnowledgeBlock(agentCode, data, categoryMappings) {
  const sections = [];
  const agent = data.agentByCode[agentCode];

  // 1. Trigger context (top priority triggers)
  const triggers = data.triggersByCode[agentCode] || [];
  if (triggers.length > 0) {
    const topTriggers = triggers.slice(0, 8).map(t => t.phrase);
    sections.push(`### Trigger Context\nThis agent activates on: ${topTriggers.join(', ')}${triggers.length > 8 ? ` (+${triggers.length - 8} more in database)` : ''}`);
  }

  // 2. Relevant issue patterns (matched via categoryMappings)
  const categories = categoryMappings[agentCode] || [];
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

  // 3. Capabilities from DB (if different from static file)
  if (agent && agent.capabilities) {
    const capsList = Array.isArray(agent.capabilities)
      ? agent.capabilities
      : (typeof agent.capabilities === 'string' ? JSON.parse(agent.capabilities) : []);
    if (capsList.length > 0) {
      const caps = capsList.slice(0, 6).join(', ');
      sections.push(`### Registered Capabilities\n${caps}`);
    }
  }

  // Compose the full block
  if (sections.length === 0) {
    return null; // No knowledge to inject
  }

  let block = `## Institutional Memory (Generated)\n\n${NOT_EXHAUSTIVE_DISCLAIMER}\n\n${sections.join('\n\n')}`;

  // Enforce 500-token cap (TR-1)
  if (block.length > MAX_KNOWLEDGE_CHARS) {
    block = block.substring(0, MAX_KNOWLEDGE_CHARS - 50) + '\n\n*[Truncated to 500-token cap]*';
  }

  return block;
}

// ─── Agent File Compilation ──────────────────────────────────────────────────

function findInjectionPoint(content) {
  // Find the "## Model Usage Tracking" section, then find the NEXT heading (# or ##) after it.
  // Inject right before that next heading.
  const trackingStart = content.indexOf('## Model Usage Tracking');
  if (trackingStart !== -1) {
    // Find the next markdown heading (any level) after the tracking section
    // Look for \n# or \n## (but not inside code blocks)
    const afterTracking = content.substring(trackingStart + 25);
    const headingMatch = afterTracking.match(/\n(#{1,3} [^\n])/);
    if (headingMatch) {
      const offset = trackingStart + 25 + headingMatch.index + 1; // +1 to skip the \n
      return offset;
    }
  }

  // Fallback: inject after YAML frontmatter
  const frontmatterEnd = content.indexOf('---', 4); // Skip first ---
  if (frontmatterEnd !== -1) {
    const afterFrontmatter = content.indexOf('\n\n', frontmatterEnd);
    return afterFrontmatter !== -1 ? afterFrontmatter + 2 : frontmatterEnd + 4;
  }

  return 0; // Beginning of file as last resort
}

function compileAgent(partialPath, agentCode, data, categoryMappings) {
  const content = fs.readFileSync(partialPath, 'utf8');

  // Remove any existing "Institutional Memory (Generated)" section
  const cleaned = content.replace(/## Institutional Memory \(Generated\)[\s\S]*?(?=\n## [^I]|\n---\n|$)/, '');

  const knowledgeBlock = composeKnowledgeBlock(agentCode, data, categoryMappings);

  if (!knowledgeBlock) {
    return cleaned; // No knowledge to inject, return as-is
  }

  const injectionPoint = findInjectionPoint(cleaned);
  const before = cleaned.substring(0, injectionPoint);
  const after = cleaned.substring(injectionPoint);

  return `${before}${knowledgeBlock}\n\n${after}`;
}

// ─── Incremental Mode Support ────────────────────────────────────────────────

function computeInputHash(partialsDir, data) {
  const hash = crypto.createHash('sha256');

  // Hash all partial file contents (sorted for determinism)
  const partials = fs.readdirSync(partialsDir)
    .filter(f => f.endsWith('.partial.md'))
    .sort();

  for (const f of partials) {
    const content = fs.readFileSync(path.join(partialsDir, f), 'utf8');
    hash.update(f + ':' + content);
  }

  // Hash DB data snapshot
  hash.update(JSON.stringify(data.agentByCode, Object.keys(data.agentByCode).sort()));
  hash.update(JSON.stringify(data.triggersByCode, Object.keys(data.triggersByCode).sort()));
  hash.update(JSON.stringify(data.patterns));

  return hash.digest('hex');
}

// ─── Config Validation (FR-4) ────────────────────────────────────────────────

function validateConfig(configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const missing = [];

  for (const key of REQUIRED_CONFIG_KEYS) {
    // Check defaults
    if (!config.defaults?.[key]) {
      missing.push(`defaults.${key}`);
    }
    // Check at least one phaseOverride
    const inAnyPhase = Object.values(config.phaseOverrides || {}).some(p => p[key]);
    if (!inAnyPhase) {
      missing.push(`phaseOverrides.*.${key}`);
    }
    // Check categoryMappings
    if (!config.categoryMappings?.[key]) {
      missing.push(`categoryMappings.${key}`);
    }
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

  console.log('🔧 Agent Prompt Compiler v1.0.0');
  console.log(`   Mode: ${snapshotPath ? 'snapshot' : 'live-db'}${incremental ? ' (incremental)' : ''}${dryRun ? ' (dry-run)' : ''}`);

  // FR-4: Validate required config registrations
  const configMissing = validateConfig(CONFIG_PATH);
  if (configMissing.length > 0) {
    console.error(`\n❌ Missing required config registrations in ${CONFIG_PATH}:`);
    configMissing.forEach(m => console.error(`   - ${m}`));
    process.exit(1);
  }
  console.log('   ✅ Config validation passed (RCA, ORCHESTRATOR_CHILD registered)');

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

  // Load category mappings from config
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const categoryMappings = config.categoryMappings || {};

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
    .filter(f => f.endsWith('.partial.md'))
    .sort();

  if (partialFiles.length === 0) {
    console.error('❌ No .partial.md files found in', AGENTS_DIR);
    process.exit(1);
  }

  console.log(`\n📝 Compiling ${partialFiles.length} agents...`);

  const results = { success: [], failed: [], skipped: [] };

  for (const partialFile of partialFiles) {
    const agentName = partialFile.replace('.partial.md', '');
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

      const compiled = compileAgent(partialPath, agentCode, data, categoryMappings);

      if (!dryRun) {
        fs.writeFileSync(outputPath, compiled);
      }

      const hasKnowledge = compiled.includes('## Institutional Memory (Generated)');
      const sizeKB = (Buffer.byteLength(compiled) / 1024).toFixed(1);
      console.log(`   ✅ ${agentName} → ${sizeKB}KB${hasKnowledge ? ' (with knowledge)' : ' (no matching data)'}`);
      results.success.push(agentName);

    } catch (err) {
      console.error(`   ❌ ${agentName}: ${err.message}`);
      results.failed.push({ agent: agentName, error: err.message });
    }
  }

  // Save hash for incremental mode
  if (!dryRun && results.failed.length === 0) {
    const currentHash = computeInputHash(AGENTS_DIR, data);
    fs.writeFileSync(HASH_FILE, currentHash);
  }

  // Summary
  console.log(`\n📊 Summary: ${results.success.length} compiled, ${results.skipped.length} skipped, ${results.failed.length} failed`);

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

export { main, composeKnowledgeBlock, compileAgent, fetchLiveData, AGENT_CODE_MAP };
