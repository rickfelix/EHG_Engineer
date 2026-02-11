#!/usr/bin/env node
/**
 * Agent Reconciliation Audit
 * SD-LEO-INFRA-BRIDGE-AGENT-SYSTEMS-001 (FR-3)
 *
 * Compares Claude Code agents (.claude/agents/*.partial) against LEO database
 * sub-agents (leo_sub_agents table) and outputs a gap analysis report.
 *
 * Usage:
 *   node scripts/agent-reconciliation-audit.js              # Live DB mode
 *   node scripts/agent-reconciliation-audit.js --snapshot <path>  # Offline mode
 *
 * Outputs:
 *   artifacts/agent-reconciliation.json  (machine-readable)
 *   artifacts/agent-reconciliation.md    (human-readable)
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { AGENT_CODE_MAP } from './generate-agent-md-from-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const AGENTS_DIR = path.join(__dirname, '..', '.claude', 'agents');
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'phase-model-routing.json');
const ARTIFACTS_DIR = path.join(__dirname, '..', 'artifacts');

// Invert the mapping: LEO code → agent filename
const CODE_TO_AGENT = {};
for (const [agent, code] of Object.entries(AGENT_CODE_MAP)) {
  CODE_TO_AGENT[code] = agent;
}

async function fetchAuditData(supabase) {
  const { data: agents, error: agentErr } = await supabase
    .from('leo_sub_agents')
    .select('id, code, name, description, capabilities, active')
    .order('code');

  if (agentErr) throw new Error(`Failed to fetch agents: ${agentErr.message}`);

  // Count triggers per agent
  const { data: triggerCounts, error: trigErr } = await supabase
    .from('leo_sub_agent_triggers')
    .select('sub_agent_id')
    .eq('active', true);

  if (trigErr) throw new Error(`Failed to fetch triggers: ${trigErr.message}`);

  const trigCountMap = {};
  for (const t of triggerCounts) {
    trigCountMap[t.sub_agent_id] = (trigCountMap[t.sub_agent_id] || 0) + 1;
  }

  // Count patterns per category
  const { data: patterns, error: patErr } = await supabase
    .from('issue_patterns')
    .select('category')
    .eq('status', 'active');

  if (patErr) throw new Error(`Failed to fetch patterns: ${patErr.message}`);

  const patCountMap = {};
  for (const p of patterns) {
    patCountMap[p.category] = (patCountMap[p.category] || 0) + 1;
  }

  return { agents, trigCountMap, patCountMap };
}

function getClaudeAgents() {
  return fs.readdirSync(AGENTS_DIR)
    .filter(f => f.endsWith('.partial'))
    .map(f => f.replace('.partial', ''))
    .sort();
}

function checkConfigRegistration(agentCode) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const issues = [];

  if (!config.defaults?.[agentCode]) {
    issues.push('Missing from defaults');
  }
  const inAnyPhase = Object.entries(config.phaseOverrides || {}).some(([, p]) => p[agentCode]);
  if (!inAnyPhase) {
    issues.push('Missing from phaseOverrides');
  }
  if (!config.categoryMappings?.[agentCode]) {
    issues.push('Missing from categoryMappings');
  }

  return issues;
}

function determineGapStatus(claudeAgent, leoAgent, triggerCount, configIssues) {
  if (!claudeAgent && !leoAgent) return 'UNKNOWN';
  if (!claudeAgent) return 'MISSING_IN_CLAUDE';
  if (!leoAgent) return 'MISSING_IN_LEO';

  const issues = [];
  if (triggerCount === 0) issues.push('no triggers');
  if (configIssues.length > 0) issues.push(`config: ${configIssues.join(', ')}`);

  if (issues.length === 0) return 'MATCHED';
  return 'PARTIAL';
}

async function main() {
  const args = process.argv.slice(2);
  const snapshotIdx = args.indexOf('--snapshot');
  const snapshotPath = snapshotIdx !== -1 ? args[snapshotIdx + 1] : null;

  console.log('🔍 Agent Reconciliation Audit v1.0.0');

  // Fetch data
  let auditData;
  if (snapshotPath) {
    const raw = fs.readFileSync(snapshotPath, 'utf8');
    auditData = JSON.parse(raw);
  } else {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials');
      process.exit(1);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    auditData = await fetchAuditData(supabase);
  }

  const claudeAgents = getClaudeAgents();
  const leoAgentMap = {};
  for (const a of auditData.agents) {
    leoAgentMap[a.code] = a;
  }

  // Build comprehensive report
  const entries = [];
  const allCodes = new Set([
    ...Object.values(AGENT_CODE_MAP),
    ...auditData.agents.map(a => a.code),
  ]);

  for (const code of [...allCodes].sort()) {
    const claudeAgentName = CODE_TO_AGENT[code] || null;
    const leoAgent = leoAgentMap[code] || null;
    const triggerCount = leoAgent ? (auditData.trigCountMap[leoAgent.id] || 0) : 0;
    const configIssues = checkConfigRegistration(code);

    const gapStatus = determineGapStatus(claudeAgentName, leoAgent, triggerCount, configIssues);

    const notes = [];
    if (!claudeAgentName) notes.push('No Claude Code agent file exists');
    if (!leoAgent) notes.push('No LEO sub-agent record exists');
    if (leoAgent && !leoAgent.active) notes.push('LEO agent is INACTIVE');
    if (triggerCount === 0 && leoAgent) notes.push('No active trigger phrases');
    if (configIssues.length > 0) notes.push(`Config issues: ${configIssues.join('; ')}`);

    entries.push({
      leo_code: code,
      claude_agent: claudeAgentName,
      leo_name: leoAgent?.name || null,
      gap_status: gapStatus,
      trigger_count: triggerCount,
      config_registered: configIssues.length === 0,
      notes: notes,
    });
  }

  // Check if any required Claude agent has no LEO source
  const claudeWithoutLeo = claudeAgents.filter(a => {
    const code = AGENT_CODE_MAP[a];
    return !code || !leoAgentMap[code];
  });

  // Ensure artifacts directory exists
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  // Write JSON report
  const jsonReport = {
    generated_at: new Date().toISOString(),
    summary: {
      total_claude_agents: claudeAgents.length,
      total_leo_agents: auditData.agents.length,
      matched: entries.filter(e => e.gap_status === 'MATCHED').length,
      partial: entries.filter(e => e.gap_status === 'PARTIAL').length,
      missing_in_claude: entries.filter(e => e.gap_status === 'MISSING_IN_CLAUDE').length,
      missing_in_leo: entries.filter(e => e.gap_status === 'MISSING_IN_LEO').length,
    },
    entries,
  };

  const jsonPath = path.join(ARTIFACTS_DIR, 'agent-reconciliation.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));

  // Write Markdown report
  const statusIcon = { MATCHED: '✅', PARTIAL: '⚠️', MISSING_IN_CLAUDE: '❌', MISSING_IN_LEO: '❌' };
  const mdLines = [
    '# Agent Reconciliation Audit',
    '',
    `**Generated**: ${jsonReport.generated_at}`,
    '',
    '## Summary',
    '',
    '| Metric | Count |',
    '|--------|-------|',
    `| Claude Code Agents | ${jsonReport.summary.total_claude_agents} |`,
    `| LEO Sub-Agents | ${jsonReport.summary.total_leo_agents} |`,
    `| Fully Matched | ${jsonReport.summary.matched} |`,
    `| Partially Matched | ${jsonReport.summary.partial} |`,
    `| Missing in Claude | ${jsonReport.summary.missing_in_claude} |`,
    `| Missing in LEO | ${jsonReport.summary.missing_in_leo} |`,
    '',
    '## Detailed Report',
    '',
    '| Status | LEO Code | Claude Agent | LEO Name | Triggers | Config | Notes |',
    '|--------|----------|-------------|----------|----------|--------|-------|',
  ];

  for (const e of entries) {
    const icon = statusIcon[e.gap_status] || '❓';
    mdLines.push(`| ${icon} ${e.gap_status} | ${e.leo_code} | ${e.claude_agent || '-'} | ${e.leo_name || '-'} | ${e.trigger_count} | ${e.config_registered ? '✅' : '❌'} | ${e.notes.join('; ') || '-'} |`);
  }

  mdLines.push('');
  mdLines.push('---');
  mdLines.push('*Generated by scripts/agent-reconciliation-audit.js*');

  const mdPath = path.join(ARTIFACTS_DIR, 'agent-reconciliation.md');
  fs.writeFileSync(mdPath, mdLines.join('\n'));

  // Display summary
  console.log('\n📊 Reconciliation Results:');
  console.log(`   Claude Agents: ${jsonReport.summary.total_claude_agents}`);
  console.log(`   LEO Sub-Agents: ${jsonReport.summary.total_leo_agents}`);
  console.log(`   ✅ Matched: ${jsonReport.summary.matched}`);
  console.log(`   ⚠️  Partial: ${jsonReport.summary.partial}`);
  console.log(`   ❌ Missing in Claude: ${jsonReport.summary.missing_in_claude}`);
  console.log(`   ❌ Missing in LEO: ${jsonReport.summary.missing_in_leo}`);

  console.log('\n📄 Reports written to:');
  console.log(`   ${jsonPath}`);
  console.log(`   ${mdPath}`);

  // Exit non-zero if required Claude agents have no LEO mapping
  if (claudeWithoutLeo.length > 0) {
    console.error(`\n❌ Claude agents without LEO mapping: ${claudeWithoutLeo.join(', ')}`);
    process.exit(1);
  }

  // Check for required config registrations
  const requiredMissing = entries.filter(e =>
    e.claude_agent && !e.config_registered
  );
  if (requiredMissing.length > 0) {
    console.error('\n❌ Agents with missing config registrations:');
    requiredMissing.forEach(e => console.error(`   ${e.leo_code}: ${e.notes.join('; ')}`));
    process.exit(1);
  }

  console.log('\n✅ Reconciliation audit passed');
}

const normalizedArgv = process.argv[1]?.replace(/\\/g, '/');
if (import.meta.url === `file:///${normalizedArgv}`) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}

export { main };
