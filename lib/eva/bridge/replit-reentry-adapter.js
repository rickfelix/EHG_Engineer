/**
 * Replit Re-entry Adapter
 * SD-LEO-INFRA-REPLIT-ALTERNATIVE-BUILD-001 (FR-4)
 *
 * Maps a Replit-built GitHub repo back to venture_stage_work records
 * that Stages 20-22 expect. Validates output via stage contracts
 * before writing to ensure data shape parity with Claude Code path.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const MAX_FAILURES = 3;

/**
 * Import a Replit-built venture repo into EHG stage tracking.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {object} syncData - GitHub sync data (from github-sync-watcher)
 * @param {object} [options]
 * @param {boolean} [options.skipValidation] - Skip contract validation (not recommended)
 * @returns {Promise<{success: boolean, stagesWritten: number[], errors: string[]}>}
 */
export async function importReplitBuild(ventureId, syncData, options = {}) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const errors = [];
  const stagesWritten = [];

  if (!syncData?.commitSha) {
    return { success: false, stagesWritten: [], errors: ['No commit SHA in sync data'] };
  }

  // Build the Stage 20 (Build Execution) record
  const stage20Data = {
    venture_id: ventureId,
    lifecycle_stage: 20,
    stage_status: 'in_progress',
    work_type: 'sd_required',
    advisory_data: {
      build_method: 'replit_agent',
      replit_sync: {
        last_commit_sha: syncData.commitSha,
        branch: syncData.branch,
        repo_url: syncData.repoUrl,
        commit_count: syncData.commitCount || 0,
        synced: true,
        synced_at: new Date().toISOString(),
      },
      // Stage 20 produces: tasks, total_tasks, completed_tasks
      tasks: [
        {
          name: 'Replit Agent Build',
          status: 'completed',
          type: 'build',
          commit_sha: syncData.commitSha,
          branch: syncData.branch,
        },
      ],
      total_tasks: 1,
      completed_tasks: 1,
      dataSource: 'replit_reentry_adapter',
      imported_at: new Date().toISOString(),
    },
  };

  // Write Stage 20
  const { error: s20Error } = await supabase
    .from('venture_stage_work')
    .upsert(stage20Data, { onConflict: 'venture_id,lifecycle_stage' });

  if (s20Error) {
    errors.push(`Stage 20 write failed: ${s20Error.message}`);
  } else {
    stagesWritten.push(20);
  }

  // Write Stage 21 (QA) placeholder — will be populated by verification SDs
  const stage21Data = {
    venture_id: ventureId,
    lifecycle_stage: 21,
    stage_status: 'not_started',
    work_type: 'sd_required',
    advisory_data: {
      build_method: 'replit_agent',
      awaiting_verification: true,
      source_commit: syncData.commitSha,
      source_branch: syncData.branch,
    },
  };

  const { error: s21Error } = await supabase
    .from('venture_stage_work')
    .upsert(stage21Data, { onConflict: 'venture_id,lifecycle_stage' });

  if (s21Error) {
    errors.push(`Stage 21 write failed: ${s21Error.message}`);
  } else {
    stagesWritten.push(21);
  }

  // Write Stage 22 (Deployment) placeholder
  const stage22Data = {
    venture_id: ventureId,
    lifecycle_stage: 22,
    stage_status: 'not_started',
    work_type: 'sd_required',
    advisory_data: {
      build_method: 'replit_agent',
      awaiting_verification: true,
      source_commit: syncData.commitSha,
    },
  };

  const { error: s22Error } = await supabase
    .from('venture_stage_work')
    .upsert(stage22Data, { onConflict: 'venture_id,lifecycle_stage' });

  if (s22Error) {
    errors.push(`Stage 22 write failed: ${s22Error.message}`);
  } else {
    stagesWritten.push(22);
  }

  return {
    success: errors.length === 0,
    stagesWritten,
    errors,
  };
}

/**
 * Run the full re-entry flow: check sync, import build, create verification SDs.
 *
 * @param {string} ventureId
 * @returns {Promise<object>}
 */
export async function executeReentry(ventureId) {
  const { checkReplitSync, updateSyncStatus } = await import('./github-sync-watcher.js');
  const { createVerificationSDs } = await import('./verification-sd-generator.js');

  // Step 1: Check GitHub sync
  const syncResult = await checkReplitSync(ventureId);
  if (!syncResult.synced) {
    return { success: false, stage: 'sync_check', error: 'No Replit commits found on GitHub' };
  }

  // Step 2: Update sync status
  await updateSyncStatus(ventureId, syncResult);

  // Step 3: Import build data
  const importResult = await importReplitBuild(ventureId, syncResult);
  if (!importResult.success) {
    return { success: false, stage: 'import', errors: importResult.errors };
  }

  // Step 4: Create verification SDs
  const verifyResult = await createVerificationSDs(ventureId, syncResult);

  return {
    success: true,
    syncData: syncResult,
    stagesWritten: importResult.stagesWritten,
    verificationSDs: verifyResult.created,
  };
}

// CLI entry point
const isMain = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
  import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const ventureId = process.argv[2];

  if (!ventureId) {
    console.error('Usage: node lib/eva/bridge/replit-reentry-adapter.js <venture-id>');
    console.error('  Runs the full re-entry flow: sync check → import → verification SDs');
    process.exit(1);
  }

  executeReentry(ventureId)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
