#!/usr/bin/env node
/**
 * Session State Validator
 *
 * Validates and reconciles auto-proceed state between database and local file.
 * Database is authoritative - local file is updated to match.
 *
 * Part of PAT-STATE-SYNC-001: Database as single source of truth
 *
 * Usage:
 *   node scripts/validate-session-state.js
 *   node scripts/validate-session-state.js --fix    # Auto-fix mismatches
 *   node scripts/validate-session-state.js --json   # JSON output
 */

import { validateState, _initializeFromDb, updateExecutionContext } from './modules/handoff/auto-proceed-state.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const jsonOutput = args.includes('--json');

async function getCurrentSessionId() {
  try {
    const sessionDir = path.join(os.homedir(), '.claude-sessions');
    if (!fs.existsSync(sessionDir)) return null;

    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.json'));
    const pid = process.ppid || process.pid;

    for (const file of files) {
      const data = JSON.parse(fs.readFileSync(path.join(sessionDir, file), 'utf8'));
      if (data.pid === pid) {
        return data.session_id;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function getActiveSDFromDatabase() {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sessionId = await getCurrentSessionId();
  if (!sessionId) {
    return { sessionId: null, sd: null };
  }

  const { data } = await supabase
    .from('claude_sessions')
    .select('session_id, sd_id, metadata')
    .eq('session_id', sessionId)
    .single();

  return {
    sessionId,
    sd: data?.sd_id,
    metadata: data?.metadata
  };
}

async function main() {
  const result = {
    success: true,
    warnings: [],
    fixes: [],
    state: null
  };

  try {
    // Get database state
    const dbInfo = await getActiveSDFromDatabase();

    if (!dbInfo.sessionId) {
      result.warnings.push('No active session found - state validation skipped');
      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('⚠️  No active session found');
      }
      return;
    }

    // Validate state
    const { state, warnings } = await validateState();
    result.state = state;
    result.warnings = warnings;

    // Check if database SD claim matches execution state
    if (dbInfo.sd && state.currentSd !== dbInfo.sd) {
      result.warnings.push(`SD claim mismatch: claimed=${dbInfo.sd}, execution_state=${state.currentSd}`);

      if (shouldFix) {
        // Fix: Update execution context to match claimed SD
        updateExecutionContext({
          sdKey: dbInfo.sd,
          phase: state.currentPhase,
          task: `Working on ${dbInfo.sd}`
        });
        result.fixes.push(`Updated execution state to match claimed SD: ${dbInfo.sd}`);
      }
    }

    // Output
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('  SESSION STATE VALIDATION');
      console.log('═══════════════════════════════════════════════════════════');
      console.log();
      console.log(`  Session: ${dbInfo.sessionId}`);
      console.log(`  Claimed SD: ${dbInfo.sd || '(none)'}`);
      console.log(`  Execution State SD: ${state.currentSd || '(none)'}`);
      console.log(`  Phase: ${state.currentPhase || '(none)'}`);
      console.log(`  Task: ${state.currentTask || '(none)'}`);
      console.log();

      if (result.warnings.length > 0) {
        console.log('  ⚠️  WARNINGS:');
        result.warnings.forEach(w => console.log(`     - ${w}`));
        console.log();
      }

      if (result.fixes.length > 0) {
        console.log('  ✅ FIXES APPLIED:');
        result.fixes.forEach(f => console.log(`     - ${f}`));
        console.log();
      }

      if (result.warnings.length === 0) {
        console.log('  ✅ State is consistent');
      } else if (!shouldFix) {
        console.log('  💡 Run with --fix to auto-correct mismatches');
      }

      console.log('═══════════════════════════════════════════════════════════');
    }

  } catch (err) {
    result.success = false;
    result.error = err.message;

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error('❌ Validation failed:', err.message);
    }
    process.exit(1);
  }
}

main();
