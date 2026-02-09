/**
 * Todoist Sync Client
 * SD: SD-LEO-ORCH-EVA-IDEA-PROCESSING-001B
 *
 * Syncs tasks from Todoist "EVA" and "EVA Next Steps" projects
 * to the eva_todoist_intake table for evaluation processing.
 */

import { TodoistApi } from '@doist/todoist-api-typescript';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const TARGET_PROJECTS = ['EVA', 'EVA Next Steps'];

/**
 * Create a configured Todoist API client
 * @returns {TodoistApi}
 */
function createTodoistClient() {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) {
    throw new Error('TODOIST_API_TOKEN environment variable is required. Get your token from https://todoist.com/app/settings/integrations/developer');
  }
  return new TodoistApi(token);
}

/**
 * Create a Supabase client for database operations
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Find target projects by name
 * @param {TodoistApi} api
 * @returns {Promise<Array>} Matching projects
 */
async function findTargetProjects(api) {
  const response = await api.getProjects();
  const projects = response.results || response;
  return projects.filter(p => TARGET_PROJECTS.includes(p.name));
}

/**
 * Fetch all tasks from a project
 * @param {TodoistApi} api
 * @param {string} projectId
 * @returns {Promise<Array>} Tasks
 */
async function fetchProjectTasks(api, projectId) {
  const response = await api.getTasks({ projectId });
  return response.results || response;
}

/**
 * Map a Todoist task to the eva_todoist_intake row format
 * @param {Object} task - Todoist task
 * @param {Object} project - Todoist project
 * @returns {Object} Row for upsert
 */
function mapTaskToIntakeRow(task, project) {
  return {
    todoist_task_id: task.id,
    todoist_project_id: project.id,
    todoist_project_name: project.name,
    title: task.content,
    description: task.description || null,
    todoist_labels: task.labels || [],
    todoist_priority: task.priority || 1,
    todoist_url: task.url || null,
    todoist_due_date: task.due?.datetime || task.due?.date || null,
    raw_data: task
  };
}

/**
 * Upsert tasks to eva_todoist_intake table
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array} rows - Mapped intake rows
 * @returns {Promise<{inserted: number, updated: number, errors: Array}>}
 */
async function upsertTasks(supabase, rows) {
  const results = { inserted: 0, updated: 0, errors: [] };

  for (const row of rows) {
    // Check if exists
    const { data: existing } = await supabase
      .from('eva_todoist_intake')
      .select('id, status')
      .eq('todoist_task_id', row.todoist_task_id)
      .maybeSingle();

    if (existing) {
      // Update only if still in pending state (don't overwrite evaluated items)
      if (existing.status === 'pending') {
        const { error } = await supabase
          .from('eva_todoist_intake')
          .update({
            title: row.title,
            description: row.description,
            todoist_labels: row.todoist_labels,
            todoist_priority: row.todoist_priority,
            todoist_url: row.todoist_url,
            todoist_due_date: row.todoist_due_date,
            raw_data: row.raw_data
          })
          .eq('id', existing.id);

        if (error) {
          results.errors.push({ task_id: row.todoist_task_id, error: error.message });
        } else {
          results.updated++;
        }
      }
    } else {
      // Insert new
      const { error } = await supabase
        .from('eva_todoist_intake')
        .insert(row);

      if (error) {
        results.errors.push({ task_id: row.todoist_task_id, error: error.message });
      } else {
        results.inserted++;
      }
    }
  }

  return results;
}

/**
 * Update sync state tracking
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectName
 * @param {number} syncedCount
 * @param {string|null} error
 */
async function updateSyncState(supabase, projectName, syncedCount, error = null) {
  const { data: existing } = await supabase
    .from('eva_sync_state')
    .select('id, total_synced, consecutive_failures')
    .eq('source_type', 'todoist')
    .eq('source_identifier', projectName)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    const update = error
      ? {
          consecutive_failures: existing.consecutive_failures + 1,
          last_error: error,
          last_error_at: now
        }
      : {
          last_sync_at: now,
          total_synced: existing.total_synced + syncedCount,
          consecutive_failures: 0,
          last_error: null,
          last_error_at: null
        };

    await supabase
      .from('eva_sync_state')
      .update(update)
      .eq('id', existing.id);
  } else {
    await supabase
      .from('eva_sync_state')
      .insert({
        source_type: 'todoist',
        source_identifier: projectName,
        last_sync_at: error ? null : now,
        total_synced: syncedCount,
        consecutive_failures: error ? 1 : 0,
        last_error: error || null,
        last_error_at: error ? now : null
      });
  }
}

/**
 * Check circuit breaker - skip sync if too many consecutive failures
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} projectName
 * @returns {Promise<boolean>} true if circuit is open (should skip)
 */
async function isCircuitOpen(supabase, projectName) {
  const { data } = await supabase
    .from('eva_sync_state')
    .select('consecutive_failures')
    .eq('source_type', 'todoist')
    .eq('source_identifier', projectName)
    .maybeSingle();

  return data?.consecutive_failures >= 3;
}

/**
 * Main sync function
 * @param {Object} options
 * @param {boolean} [options.dryRun=false] - If true, fetch but don't save
 * @param {number} [options.limit] - Max tasks to sync per project
 * @param {boolean} [options.verbose=false] - Verbose logging
 * @returns {Promise<Object>} Sync results
 */
export async function syncTodoist(options = {}) {
  const { dryRun = false, limit, verbose = false } = options;
  const api = createTodoistClient();
  const supabase = createSupabaseClient();

  const results = {
    projects: [],
    totalInserted: 0,
    totalUpdated: 0,
    totalErrors: 0,
    dryRun
  };

  // Find target projects
  const projects = await findTargetProjects(api);

  if (projects.length === 0) {
    console.log('  No matching Todoist projects found. Expected:', TARGET_PROJECTS.join(', '));
    return results;
  }

  for (const project of projects) {
    const projectResult = {
      name: project.name,
      id: project.id,
      tasksFound: 0,
      inserted: 0,
      updated: 0,
      errors: []
    };

    // Circuit breaker check
    if (!dryRun && await isCircuitOpen(supabase, project.name)) {
      console.log(`  Circuit OPEN for "${project.name}" (3+ consecutive failures) - skipping`);
      projectResult.skipped = true;
      results.projects.push(projectResult);
      continue;
    }

    try {
      // Fetch tasks
      let tasks = await fetchProjectTasks(api, project.id);
      projectResult.tasksFound = tasks.length;

      if (verbose) {
        console.log(`  Project "${project.name}": ${tasks.length} tasks found`);
      }

      if (limit && tasks.length > limit) {
        tasks = tasks.slice(0, limit);
      }

      // Map to intake rows
      const rows = tasks.map(t => mapTaskToIntakeRow(t, project));

      if (dryRun) {
        console.log(`  [DRY RUN] "${project.name}": ${rows.length} tasks would be synced`);
        rows.forEach(r => console.log(`    - ${r.title}`));
      } else {
        // Upsert to database
        const upsertResult = await upsertTasks(supabase, rows);
        projectResult.inserted = upsertResult.inserted;
        projectResult.updated = upsertResult.updated;
        projectResult.errors = upsertResult.errors;

        results.totalInserted += upsertResult.inserted;
        results.totalUpdated += upsertResult.updated;
        results.totalErrors += upsertResult.errors.length;

        // Update sync state (success)
        await updateSyncState(supabase, project.name, upsertResult.inserted + upsertResult.updated);
      }
    } catch (err) {
      projectResult.errors.push({ error: err.message });
      results.totalErrors++;

      if (!dryRun) {
        await updateSyncState(supabase, project.name, 0, err.message);
      }

      console.error(`  Error syncing "${project.name}": ${err.message}`);
    }

    results.projects.push(projectResult);
  }

  return results;
}

export default { syncTodoist, createTodoistClient, TARGET_PROJECTS };
