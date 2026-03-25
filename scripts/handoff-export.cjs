#!/usr/bin/env node

/**
 * Handoff Export Script
 *
 * Creates a handoff package at .claude/handoff/ containing:
 * - Memory files (from ~/.claude/projects/<path-hash>/memory/)
 * - Session state files (unified-session-state.json, auto-proceed-state.json)
 * - Active SD information (from database)
 * - Git state (branch, recent commits, modified files)
 * - A human-readable briefing.md
 * - metadata.json with timestamp and manifest
 *
 * Usage: node scripts/handoff-export.cjs
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const HANDOFF_DIR = path.join(PROJECT_ROOT, '.claude', 'handoff');
const MEMORY_SRC = path.join(
  os.homedir(),
  '.claude',
  'projects',
  'C--Users-rickf-Projects--EHG-EHG-Engineer',
  'memory'
);
const CLAUDE_DIR = path.join(PROJECT_ROOT, '.claude');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function safeExec(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: PROJECT_ROOT, timeout: 15000, ...opts }).trim();
  } catch {
    return null;
  }
}

function copyMemoryFiles() {
  const memoryDest = path.join(HANDOFF_DIR, 'memory');
  ensureDir(memoryDest);

  const copied = [];
  if (fs.existsSync(MEMORY_SRC)) {
    const files = fs.readdirSync(MEMORY_SRC).filter(f => f.endsWith('.md'));
    for (const file of files) {
      fs.copyFileSync(path.join(MEMORY_SRC, file), path.join(memoryDest, file));
      copied.push(file);
    }
  }
  return copied;
}

function copyStateFiles() {
  const stateDest = path.join(HANDOFF_DIR, 'state');
  ensureDir(stateDest);

  const stateFiles = ['unified-session-state.json', 'auto-proceed-state.json'];
  const copied = [];
  for (const file of stateFiles) {
    const src = path.join(CLAUDE_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(stateDest, file));
      copied.push(file);
    }
  }
  return copied;
}

async function getActiveSD() {
  try {
    require('dotenv').config({ path: path.join(PROJECT_ROOT, '.env') });
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    // Check for SD marked as working on
    const { data: workingOn } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, priority, current_phase, progress, description')
      .eq('is_working_on', true)
      .lt('progress', 100);

    if (workingOn && workingOn.length > 0) {
      return workingOn[0];
    }

    // Check for active session claim — deterministic resolution
    const { resolveOwnSession } = require('../lib/resolve-own-session.cjs');
    const { data: session } = await resolveOwnSession(supabase, {
      select: 'sd_id, metadata',
      warnOnFallback: false
    });

    if (session && session.sd_id) {
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_key, title, status, priority, current_phase, progress, description')
        .eq('sd_key', session.sd_id)
        .single();

      if (sd) {
        return { ...sd, sessionMetadata: session.metadata };
      }
    }

    return null;
  } catch (err) {
    console.error('  Warning: Could not query database:', err.message);
    return null;
  }
}

function getSessionSettings() {
  const settings = {};

  // Read auto-proceed state
  const apPath = path.join(CLAUDE_DIR, 'auto-proceed-state.json');
  if (fs.existsSync(apPath)) {
    try {
      const ap = JSON.parse(fs.readFileSync(apPath, 'utf8'));
      settings.autoProceed = ap.isActive || false;
      settings.currentSd = ap.currentSd || null;
      settings.currentPhase = ap.currentPhase || null;
    } catch { /* ignore parse errors */ }
  }

  // Read unified session state
  const ussPath = path.join(CLAUDE_DIR, 'unified-session-state.json');
  if (fs.existsSync(ussPath)) {
    try {
      settings.unifiedState = JSON.parse(fs.readFileSync(ussPath, 'utf8'));
    } catch { /* ignore parse errors */ }
  }

  return settings;
}

function getGitState() {
  const branch = safeExec('git branch --show-current') || 'unknown';
  const recentCommits = safeExec('git log --oneline -5') || 'No recent commits';
  const modifiedFiles = safeExec('git status --porcelain') || 'No modified files';
  const lastCommitFull = safeExec('git log -1 --format="%H %s"') || 'unknown';

  return { branch, recentCommits, modifiedFiles, lastCommitFull };
}

function generateBriefing({ memoryFiles, stateFiles, activeSD, sessionSettings, gitState, timestamp }) {
  const lines = [];

  lines.push('# Account Handoff Briefing');
  lines.push(`\n**Generated**: ${timestamp}`);
  lines.push(`**Source Account**: Exported before account switch`);

  // Active SD
  lines.push('\n## Active Strategic Directive');
  if (activeSD) {
    const sdId = activeSD.sd_key || activeSD.id;
    lines.push(`- **SD**: ${sdId}`);
    lines.push(`- **Title**: ${activeSD.title}`);
    lines.push(`- **Status**: ${activeSD.status}`);
    lines.push(`- **Phase**: ${activeSD.current_phase || 'not set'}`);
    lines.push(`- **Progress**: ${activeSD.progress || 0}%`);
    lines.push(`- **Priority**: ${activeSD.priority || 'not set'}`);
    if (activeSD.description) {
      lines.push(`- **Description**: ${activeSD.description.substring(0, 200)}${activeSD.description.length > 200 ? '...' : ''}`);
    }
  } else {
    lines.push('No active SD detected. Run `npm run sd:next` to see the queue.');
  }

  // Session Settings
  lines.push('\n## Session Settings');
  lines.push(`- **AUTO-PROCEED**: ${sessionSettings.autoProceed ? 'ON' : 'OFF'}`);
  if (sessionSettings.currentSd) {
    lines.push(`- **Current SD (auto-proceed)**: ${sessionSettings.currentSd}`);
  }
  if (sessionSettings.currentPhase) {
    lines.push(`- **Current Phase**: ${sessionSettings.currentPhase}`);
  }

  // Git State
  lines.push('\n## Git State');
  lines.push(`- **Branch**: ${gitState.branch}`);
  lines.push(`- **Last Commit**: ${gitState.lastCommitFull}`);
  lines.push('\n### Recent Commits');
  lines.push('```');
  lines.push(gitState.recentCommits);
  lines.push('```');
  if (gitState.modifiedFiles && gitState.modifiedFiles !== 'No modified files') {
    lines.push('\n### Uncommitted Changes');
    lines.push('```');
    lines.push(gitState.modifiedFiles);
    lines.push('```');
  }

  // Memory Files
  lines.push('\n## Exported Memory Files');
  if (memoryFiles.length > 0) {
    for (const f of memoryFiles) {
      lines.push(`- ${f}`);
    }
  } else {
    lines.push('No memory files found.');
  }

  // State Files
  lines.push('\n## Exported State Files');
  if (stateFiles.length > 0) {
    for (const f of stateFiles) {
      lines.push(`- ${f}`);
    }
  } else {
    lines.push('No state files found.');
  }

  // Pending Actions
  if (sessionSettings.unifiedState) {
    lines.push('\n## Pending Actions');
    const uss = sessionSettings.unifiedState;
    if (uss.pendingActions && uss.pendingActions.length > 0) {
      for (const action of uss.pendingActions) {
        lines.push(`- ${action}`);
      }
    } else {
      lines.push('No pending actions.');
    }
  }

  // Next Steps
  lines.push('\n## Suggested Next Steps');
  if (activeSD) {
    const sdId = activeSD.sd_key || activeSD.id;
    lines.push(`1. Resume work on **${sdId}** — run \`/leo continue\``);
    lines.push(`2. Or check the queue — run \`npm run sd:next\``);
  } else {
    lines.push('1. Check the SD queue — run `npm run sd:next`');
    lines.push('2. Or start fresh — run `/leo next`');
  }

  return lines.join('\n');
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  HANDOFF EXPORT');
  console.log('========================================');
  console.log('');

  // Clean previous handoff
  if (fs.existsSync(HANDOFF_DIR)) {
    fs.rmSync(HANDOFF_DIR, { recursive: true, force: true });
  }
  ensureDir(HANDOFF_DIR);

  // 1. Copy memory files
  console.log('  Copying memory files...');
  const memoryFiles = copyMemoryFiles();
  console.log(`    ${memoryFiles.length} memory file(s) copied`);

  // 2. Copy state files
  console.log('  Copying state files...');
  const stateFiles = copyStateFiles();
  console.log(`    ${stateFiles.length} state file(s) copied`);

  // 3. Query active SD
  console.log('  Querying active SD...');
  const activeSD = await getActiveSD();
  if (activeSD) {
    const sdId = activeSD.sd_key || activeSD.id;
    console.log(`    Active SD: ${sdId} (${activeSD.current_phase || 'no phase'}, ${activeSD.progress || 0}%)`);
  } else {
    console.log('    No active SD found');
  }

  // 4. Get session settings
  const sessionSettings = getSessionSettings();

  // 5. Get git state
  console.log('  Capturing git state...');
  const gitState = getGitState();
  console.log(`    Branch: ${gitState.branch}`);

  // 6. Generate briefing
  const timestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
  const briefing = generateBriefing({
    memoryFiles, stateFiles, activeSD, sessionSettings, gitState, timestamp
  });
  fs.writeFileSync(path.join(HANDOFF_DIR, 'briefing.md'), briefing, 'utf8');

  // 7. Write metadata
  const metadata = {
    version: '1.0.0',
    timestamp,
    timestampISO: new Date().toISOString(),
    sourceProject: 'EHG_Engineer',
    manifest: {
      memoryFiles,
      stateFiles,
      briefing: 'briefing.md',
      metadata: 'metadata.json'
    },
    activeSD: activeSD ? {
      sdKey: activeSD.sd_key || activeSD.id,
      title: activeSD.title,
      phase: activeSD.current_phase,
      progress: activeSD.progress
    } : null,
    sessionSettings: {
      autoProceed: sessionSettings.autoProceed || false,
      currentSd: sessionSettings.currentSd || null,
      currentPhase: sessionSettings.currentPhase || null
    },
    gitState: {
      branch: gitState.branch,
      lastCommit: gitState.lastCommitFull
    }
  };
  fs.writeFileSync(
    path.join(HANDOFF_DIR, 'metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf8'
  );

  // Summary
  console.log('');
  console.log('========================================');
  console.log('  Handoff Package Created');
  console.log('========================================');
  console.log(`    ${memoryFiles.length} memory file(s) (${memoryFiles.join(', ') || 'none'})`);
  if (activeSD) {
    console.log(`    Active SD: ${activeSD.sd_key || activeSD.id} (${activeSD.current_phase || 'N/A'}, ${activeSD.progress || 0}%)`);
  } else {
    console.log('    No active SD');
  }
  console.log(`    Session: AUTO-PROCEED ${sessionSettings.autoProceed ? 'ON' : 'OFF'}`);
  console.log(`    Git: branch=${gitState.branch}, ${stateFiles.length} state file(s)`);
  console.log('');
  console.log(`  Location: .claude/handoff/`);
  console.log(`  Timestamp: ${timestamp}`);
  console.log('');
  console.log('  To import on new account: /handoff-in');
  console.log('========================================');
}

main().catch(err => {
  console.error('Handoff export failed:', err);
  process.exit(1);
});
