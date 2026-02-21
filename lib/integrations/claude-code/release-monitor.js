/**
 * Claude Code Release Monitor
 *
 * Fetches GitHub releases for anthropics/claude-code, deduplicates against
 * eva_claude_code_intake, and inserts new releases as pending intake rows.
 *
 * Pattern: lib/integrations/todoist/todoist-sync.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const GITHUB_REPO = 'anthropics/claude-code';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
const SOURCE_TYPE = 'claude_code';

/**
 * Create a Supabase client
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createSupabaseClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Fetch releases from the GitHub API
 * @param {Object} options
 * @param {boolean} [options.includePrerelease=false]
 * @param {number} [options.perPage=20]
 * @returns {Promise<Array>} GitHub release objects
 */
async function fetchGitHubReleases(options = {}) {
  const { includePrerelease = false, perPage = 20 } = options;
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'EHG-Release-Monitor/1.0'
  };

  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const url = `${GITHUB_API_URL}?per_page=${perPage}`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    throw new Error(
      `GitHub API returned ${response.status}: ${response.statusText}` +
      (remaining === '0' ? ' (rate limit exceeded)' : '')
    );
  }

  const releases = await response.json();

  if (!includePrerelease) {
    return releases.filter(r => !r.prerelease);
  }
  return releases;
}

/**
 * Load known release IDs from database for dedup
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<Set<number>>} Set of known github_release_id values
 */
async function loadKnownReleases(supabase) {
  const { data } = await supabase
    .from('eva_claude_code_intake')
    .select('github_release_id');

  return new Set((data || []).map(r => r.github_release_id));
}

/**
 * Map a GitHub release to an intake row
 * @param {Object} release - GitHub release object
 * @returns {Object} Row for insert
 */
function mapReleaseToIntakeRow(release) {
  return {
    github_release_id: release.id,
    tag_name: release.tag_name,
    title: release.name || release.tag_name,
    description: release.body || null,
    release_url: release.html_url,
    published_at: release.published_at,
    is_prerelease: release.prerelease || false,
    raw_data: release
  };
}

/**
 * Insert new releases into eva_claude_code_intake
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array} rows - Mapped intake rows
 * @param {Set<number>} knownIds - Pre-loaded known release IDs
 * @returns {Promise<{inserted: number, skipped: number, errors: Array}>}
 */
async function insertNewReleases(supabase, rows, knownIds) {
  const results = { inserted: 0, skipped: 0, errors: [] };

  for (const row of rows) {
    if (knownIds.has(row.github_release_id)) {
      results.skipped++;
      continue;
    }

    const { error } = await supabase
      .from('eva_claude_code_intake')
      .insert(row);

    if (error) {
      // Handle unique constraint violation gracefully (race condition)
      if (error.code === '23505') {
        results.skipped++;
      } else {
        results.errors.push({ release_id: row.github_release_id, tag: row.tag_name, error: error.message });
      }
    } else {
      results.inserted++;
    }
  }

  return results;
}

/**
 * Update sync state tracking in eva_sync_state
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} syncedCount
 * @param {string|null} error
 */
async function updateSyncState(supabase, syncedCount, error = null) {
  const { data: existing } = await supabase
    .from('eva_sync_state')
    .select('id, total_synced, consecutive_failures')
    .eq('source_type', SOURCE_TYPE)
    .eq('source_identifier', GITHUB_REPO)
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
        source_type: SOURCE_TYPE,
        source_identifier: GITHUB_REPO,
        last_sync_at: error ? null : now,
        total_synced: syncedCount,
        consecutive_failures: error ? 1 : 0,
        last_error: error || null,
        last_error_at: error ? now : null
      });
  }
}

/**
 * Check circuit breaker — skip sync if 3+ consecutive failures
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<boolean>} true if circuit is open (should skip)
 */
async function isCircuitOpen(supabase) {
  const { data } = await supabase
    .from('eva_sync_state')
    .select('consecutive_failures')
    .eq('source_type', SOURCE_TYPE)
    .eq('source_identifier', GITHUB_REPO)
    .maybeSingle();

  return data?.consecutive_failures >= 3;
}

/**
 * Main sync function — fetch GitHub releases and insert new ones
 * @param {Object} options
 * @param {boolean} [options.dryRun=false]
 * @param {boolean} [options.includePrerelease=false]
 * @param {boolean} [options.verbose=false]
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase]
 * @returns {Promise<Object>} Sync results
 */
export async function syncReleases(options = {}) {
  const { dryRun = false, includePrerelease = false, verbose = false } = options;
  const supabase = options.supabase || createSupabaseClient();

  const results = {
    releasesFound: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
    dryRun
  };

  // Circuit breaker check
  if (!dryRun && await isCircuitOpen(supabase)) {
    console.log('  Circuit OPEN for Claude Code releases (3+ consecutive failures) — skipping');
    results.circuitOpen = true;
    return results;
  }

  try {
    // Fetch releases from GitHub
    const releases = await fetchGitHubReleases({ includePrerelease });
    results.releasesFound = releases.length;

    if (verbose) {
      console.log(`  GitHub: ${releases.length} releases found`);
    }

    // Map to intake rows
    const rows = releases.map(mapReleaseToIntakeRow);

    if (dryRun) {
      const knownIds = await loadKnownReleases(supabase);
      const newRows = rows.filter(r => !knownIds.has(r.github_release_id));
      console.log(`  [DRY RUN] ${rows.length} releases (${newRows.length} new)`);
      for (const r of newRows) {
        console.log(`    + ${r.tag_name}: ${r.title}`);
      }
      results.inserted = newRows.length;
      results.skipped = rows.length - newRows.length;
    } else {
      const knownIds = await loadKnownReleases(supabase);
      const insertResult = await insertNewReleases(supabase, rows, knownIds);

      results.inserted = insertResult.inserted;
      results.skipped = insertResult.skipped;
      results.errors = insertResult.errors;

      await updateSyncState(supabase, insertResult.inserted);
    }
  } catch (err) {
    results.errors.push({ error: err.message });

    if (!dryRun) {
      await updateSyncState(supabase, 0, err.message);
    }

    console.error(`  Error syncing releases: ${err.message}`);
  }

  return results;
}

export default { syncReleases, GITHUB_REPO };
