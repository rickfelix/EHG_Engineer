#!/usr/bin/env node
/**
 * LEO Resume — Canonical script for session state restoration.
 *
 * Reads .claude/unified-session-state.json and outputs structured state
 * for Claude to parse. Does NOT interpolate raw JSON into stdout —
 * outputs only structured key=value lines (CISO constraint).
 *
 * Usage:
 *   node scripts/leo-resume.js                    — Check and display state
 *   node scripts/leo-resume.js --check-only       — Just check if state exists
 *
 * SD: SD-LEO-INFRA-CUSTOM-SKILLS-PHASE-001-B
 */
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const stateFile = join(process.cwd(), '.claude', 'unified-session-state.json');
const checkOnly = process.argv.includes('--check-only');

if (!existsSync(stateFile)) {
  console.log('STATE_EXISTS=false');
  process.exit(0);
}

const stat = statSync(stateFile);
const ageMinutes = Math.round((Date.now() - stat.mtime.getTime()) / 60000);
console.log('STATE_EXISTS=true');
console.log('STATE_AGE_MINUTES=' + ageMinutes);

if (checkOnly) process.exit(0);

try {
  let content = readFileSync(stateFile, 'utf8');
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  const state = JSON.parse(content);

  console.log('');
  console.log('============================================================');
  console.log('[CONTEXT RESTORED] Session state from ' + state.timestamp);
  console.log('============================================================');

  if (state.git) {
    console.log('[GIT] Branch: ' + state.git.branch);
    if (state.git.recentCommits && state.git.recentCommits[0]) {
      console.log('[GIT] Latest: ' + state.git.recentCommits[0]);
    }
  }

  if (state.sd && state.sd.id) {
    console.log('[SD] Working on: ' + state.sd.id);
    if (state.sd.phase) console.log('[SD] Phase: ' + state.sd.phase);
    if (state.sd.progress !== null && state.sd.progress !== undefined) {
      console.log('[SD] Progress: ' + state.sd.progress + '%');
    }
  }

  if (state.workflow && state.workflow.currentPhase && state.workflow.currentPhase !== 'unknown') {
    console.log('[WORKFLOW] Phase: ' + state.workflow.currentPhase);
  }

  if (state.decisions && state.decisions.length > 0) {
    console.log('[DECISIONS] ' + state.decisions.length + ' recorded');
  }

  if (state.constraints) {
    const blocking = state.constraints.filter(c => c.blocking);
    if (blocking.length > 0) {
      console.log('[CONSTRAINTS] ' + blocking.length + ' BLOCKING');
    }
  }

  if (state.openQuestions) {
    const unresolved = state.openQuestions.filter(q => !q.resolved);
    if (unresolved.length > 0) {
      console.log('[QUESTIONS] ' + unresolved.length + ' open');
    }
  }

  if (state.summaries?.pendingActions?.length > 0) {
    console.log('[TODO] Pending actions: ' + state.summaries.pendingActions.length);
    state.summaries.pendingActions.slice(0, 3).forEach(action => {
      console.log('       - ' + action);
    });
  }

  console.log('============================================================');
  console.log('[RESTORED] Context automatically loaded - ready to continue');
  console.log('');

  if (state.sd && state.sd.id) {
    console.log('RESUME_SD_ID=' + state.sd.id);
    console.log('RESUME_SD_PHASE=' + (state.sd.phase || 'unknown'));
  }
} catch (error) {
  console.error('Error loading state: ' + error.message);
  process.exit(1);
}
