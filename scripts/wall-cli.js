#!/usr/bin/env node
/**
 * LEO 5.0 Wall Management CLI
 *
 * Commands for managing phase boundaries (walls) in the LEO Protocol.
 *
 * Usage:
 *   node scripts/wall-cli.js status SD-XXX-001
 *   node scripts/wall-cli.js check SD-XXX-001 PLAN-WALL
 *   node scripts/wall-cli.js invalidate SD-XXX-001 PLAN-WALL "reason"
 *   node scripts/wall-cli.js overview SD-XXX-001
 *
 * @see lib/tasks/wall-manager.js for implementation
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { WallManager, WALL_STATUS, GATE_RESULT } from '../lib/tasks/wall-manager.js';
import { WallEnforcement } from '../lib/tasks/wall-enforcement.js';
import { selectTrack, TRACK_CONFIG } from '../lib/tasks/track-selector.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const wallManager = new WallManager(supabase);
const wallEnforcement = new WallEnforcement(supabase);

// ============ CLI Commands ============

async function handleStatus(sdId) {
  if (!sdId) {
    console.log('Usage: node scripts/wall-cli.js status SD-XXX-001');
    console.log('\nShows all wall states for an SD.');
    return;
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO 5.0 WALL STATUS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SD: ${sdId}`);
  console.log('');

  try {
    const overview = await wallEnforcement.getWallOverview(sdId);

    console.log(`  Track: ${overview.track}`);
    console.log(`  Current Phase: ${overview.currentPhase}`);
    console.log(`  Progress: ${overview.passedWalls}/${overview.totalWalls} walls passed`);
    console.log('');
    console.log('  WALLS:');
    console.log('  ─────────────────────────────────────────────────────────────');

    for (const wall of overview.walls) {
      const statusIcon = {
        [WALL_STATUS.PASSED]: '✅',
        [WALL_STATUS.BLOCKED]: '🚧',
        [WALL_STATUS.PENDING]: '⏳',
        [WALL_STATUS.READY]: '🟢',
        [WALL_STATUS.INVALIDATED]: '❌',
        'not_initialized': '⚪'
      }[wall.status] || '❓';

      console.log(`    ${statusIcon} ${wall.wallName.padEnd(15)} ${wall.status.padEnd(15)}`);

      if (wall.blockedBy.length > 0) {
        console.log(`       Blocked by: ${wall.blockedBy.join(', ')}`);
      }

      if (wall.passedAt) {
        console.log(`       Passed at: ${new Date(wall.passedAt).toLocaleString()}`);
      }

      if (wall.validationScore !== null) {
        console.log(`       Score: ${wall.validationScore}%`);
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function handleCheck(sdId, wallName) {
  if (!sdId || !wallName) {
    console.log('Usage: node scripts/wall-cli.js check SD-XXX-001 WALL-NAME');
    console.log('\nChecks if a specific wall can be passed.');
    console.log('');
    console.log('Wall names: LEAD-WALL, PLAN-WALL, EXEC-WALL, VERIFY-WALL, SAFETY-WALL');
    return;
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO 5.0 WALL CHECK');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SD: ${sdId}`);
  console.log(`  Wall: ${wallName}`);
  console.log('');

  try {
    const status = await wallManager.checkWallStatus(sdId, wallName);

    if (!status.exists) {
      console.log('  Status: NOT INITIALIZED');
      console.log('  This wall has not been created yet.');
      console.log('');
      console.log('  Walls are initialized when executing the handoff that');
      console.log('  transitions to the phase guarded by this wall.');
    } else {
      console.log(`  Status: ${status.status}`);
      console.log(`  Can Pass: ${status.canPass ? 'YES' : 'NO'}`);

      if (status.pendingGates?.length > 0) {
        console.log('');
        console.log('  Pending Gates:');
        status.pendingGates.forEach(gate => console.log(`    ⏳ ${gate}`));
      }

      if (status.failedGates?.length > 0) {
        console.log('');
        console.log('  Failed Gates:');
        status.failedGates.forEach(gate => console.log(`    ❌ ${gate}`));
      }

      if (status.status === WALL_STATUS.PASSED) {
        console.log(`  Passed At: ${new Date(status.passedAt).toLocaleString()}`);
      }

      if (status.status === WALL_STATUS.INVALIDATED) {
        console.log(`  Invalidated Reason: ${status.invalidatedReason}`);
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function handleInvalidate(sdId, wallName, reason) {
  if (!sdId || !wallName || !reason) {
    console.log('Usage: node scripts/wall-cli.js invalidate SD-XXX-001 WALL-NAME "reason"');
    console.log('\nInvalidates a wall (for kickback or correction scenarios).');
    console.log('');
    console.log('Example:');
    console.log('  node scripts/wall-cli.js invalidate SD-LEO-001 PLAN-WALL "PRD failed review"');
    return;
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO 5.0 WALL INVALIDATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SD: ${sdId}`);
  console.log(`  Wall: ${wallName}`);
  console.log(`  Reason: ${reason}`);
  console.log('');

  try {
    const result = await wallManager.invalidateWall(sdId, wallName, reason, {
      invalidatedBy: 'cli'
    });

    if (result.success) {
      console.log('  ✅ Wall invalidated successfully');
      console.log(`  Invalidated At: ${result.invalidatedAt}`);
    } else {
      console.log(`  ❌ Invalidation failed: ${result.error}`);
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function handleOverview(sdId) {
  if (!sdId) {
    console.log('Usage: node scripts/wall-cli.js overview SD-XXX-001');
    console.log('\nShows detailed wall overview with track context.');
    return;
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO 5.0 WALL OVERVIEW');
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    // Load SD to get track info
    const { data: sd, error } = await supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (error || !sd) {
      // Try UUID
      const result = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('uuid_id', sdId)
        .single();

      if (result.error || !result.data) {
        throw new Error(`SD not found: ${sdId}`);
      }
    }

    const trackResult = selectTrack(sd || {});
    const trackConfig = TRACK_CONFIG[trackResult.track];

    console.log(`  SD: ${sdId}`);
    console.log(`  Title: ${sd?.title || 'N/A'}`);
    console.log(`  Type: ${sd?.sd_type || 'N/A'}`);
    console.log(`  Status: ${sd?.status || 'N/A'}`);
    console.log('');
    console.log(`  Track: ${trackResult.track}`);
    console.log(`  Phases: ${trackConfig.phases.join(' → ')}`);
    console.log(`  Walls: ${trackConfig.walls.length}`);
    console.log('');

    // Show phase/wall diagram
    console.log('  WORKFLOW:');
    console.log('  ─────────────────────────────────────────────────────────────');
    console.log('');

    const phases = trackConfig.phases;
    const walls = trackConfig.walls;

    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const wall = walls[i];
      const isCurrentPhase = sd?.current_phase === phase;

      const phaseIcon = isCurrentPhase ? '►' : '○';
      console.log(`    ${phaseIcon} [${phase}]`);

      if (wall) {
        const wallStates = await wallManager.getWallStates(sdId);
        const wallState = wallStates.find(w => w.wall_name === wall);
        const wallStatus = wallState?.status || 'not_initialized';

        const wallIcon = {
          [WALL_STATUS.PASSED]: '═══',
          [WALL_STATUS.BLOCKED]: '▓▓▓',
          [WALL_STATUS.READY]: '───',
          [WALL_STATUS.INVALIDATED]: '╳╳╳',
          'not_initialized': '···'
        }[wallStatus] || '???';

        console.log(`         ${wallIcon} ${wall} (${wallStatus})`);
        console.log('         │');
      }
    }

    console.log('');
    console.log('  LEGEND:');
    console.log('    ═══ Passed    ▓▓▓ Blocked    ─── Ready');
    console.log('    ╳╳╳ Invalid   ··· Not Init   ► Current');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

async function handleGates(sdId) {
  if (!sdId) {
    console.log('Usage: node scripts/wall-cli.js gates SD-XXX-001');
    console.log('\nShows all gate results for an SD.');
    return;
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  LEO 5.0 GATE RESULTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  SD: ${sdId}`);
  console.log('');

  try {
    // Load SD UUID
    let sdUuid = sdId;
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('uuid_id')
      .eq('id', sdId)
      .single();

    if (sd?.uuid_id) {
      sdUuid = sd.uuid_id;
    }

    const { data: gates, error } = await supabase
      .from('sd_gate_results')
      .select('*')
      .eq('sd_id', sdUuid)
      .order('executed_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    if (!gates || gates.length === 0) {
      console.log('  No gate results recorded yet.');
    } else {
      console.log('  GATES:');
      console.log('  ─────────────────────────────────────────────────────────────');

      for (const gate of gates) {
        const icon = {
          [GATE_RESULT.PASS]: '✅',
          [GATE_RESULT.FAIL]: '❌',
          [GATE_RESULT.SKIP]: '⏭️',
          [GATE_RESULT.PENDING]: '⏳'
        }[gate.result] || '❓';

        const score = gate.score !== null ? `${gate.score}/${gate.max_score || '?'}` : 'N/A';

        console.log(`    ${icon} ${gate.gate_id.padEnd(25)} ${gate.result.padEnd(8)} Score: ${score}`);

        if (gate.issues?.length > 0) {
          gate.issues.forEach(issue => {
            const issueText = typeof issue === 'string' ? issue : issue.message || JSON.stringify(issue);
            console.log(`       └─ ${issueText}`);
          });
        }
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

function displayHelp() {
  console.log('');
  console.log('LEO 5.0 Wall Management CLI');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('COMMANDS:');
  console.log('  status SD-ID           Show wall states for an SD');
  console.log('  check SD-ID WALL       Check if a wall can be passed');
  console.log('  invalidate SD-ID WALL  Invalidate a wall (kickback)');
  console.log('  overview SD-ID         Show visual workflow diagram');
  console.log('  gates SD-ID            Show all gate results');
  console.log('  help                   Show this help');
  console.log('');
  console.log('WALLS:');
  console.log('  LEAD-WALL     Blocks PLAN phase entry');
  console.log('  PLAN-WALL     Blocks EXEC phase entry');
  console.log('  EXEC-WALL     Blocks VERIFY/SAFETY phase entry');
  console.log('  VERIFY-WALL   Blocks FINAL phase entry (FULL track)');
  console.log('  SAFETY-WALL   Compensating control (HOTFIX track)');
  console.log('');
  console.log('EXAMPLES:');
  console.log('  node scripts/wall-cli.js status SD-LEO-001');
  console.log('  node scripts/wall-cli.js check SD-LEO-001 PLAN-WALL');
  console.log('  node scripts/wall-cli.js overview SD-LEO-001');
  console.log('');
}

// ============ Main Entry Point ============

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'status':
      await handleStatus(args[1]);
      break;

    case 'check':
      await handleCheck(args[1], args[2]);
      break;

    case 'invalidate':
      await handleInvalidate(args[1], args[2], args[3]);
      break;

    case 'overview':
      await handleOverview(args[1]);
      break;

    case 'gates':
      await handleGates(args[1]);
      break;

    case 'help':
    default:
      displayHelp();
      break;
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
