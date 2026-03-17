/**
 * Claude Code Release Monitor
 *
 * Checks npm registry for new @anthropic-ai/claude-code releases,
 * compares against stored versions, and logs new releases.
 *
 * Usage: node scripts/claude-code-release-check.mjs
 *
 * Part of SD-LEO-INFRA-IMPLEMENT-CLAUDE-CODE-001
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@anthropic-ai/claude-code';
const PACKAGE_NAME = '@anthropic-ai/claude-code';

/**
 * Fetch latest version info from npm registry.
 * @returns {Promise<{version: string, date: string}|null>}
 */
async function fetchLatestVersion() {
  try {
    const res = await fetch(NPM_REGISTRY_URL);
    if (!res.ok) {
      console.error(`[ReleaseMonitor] npm registry returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    const latest = data['dist-tags']?.latest;
    if (!latest) {
      console.error('[ReleaseMonitor] No latest dist-tag found');
      return null;
    }
    const releaseDate = data.time?.[latest] || null;
    return { version: latest, date: releaseDate };
  } catch (err) {
    console.error(`[ReleaseMonitor] Failed to fetch from npm: ${err.message}`);
    return null;
  }
}

/**
 * Get the most recent known version from the database.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<string|null>}
 */
async function getLatestKnownVersion(supabase) {
  const { data, error } = await supabase
    .from('claude_code_releases')
    .select('version')
    .order('detected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[ReleaseMonitor] DB query error: ${error.message}`);
    return null;
  }
  return data?.version || null;
}

/**
 * Store a new release in the database.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{version: string, date: string}} release
 */
async function storeRelease(supabase, release) {
  const { error } = await supabase
    .from('claude_code_releases')
    .upsert({
      version: release.version,
      release_date: release.date,
      changelog_url: `https://www.npmjs.com/package/${PACKAGE_NAME}/v/${release.version}`,
      status: 'new',
    }, { onConflict: 'version' });

  if (error) {
    console.error(`[ReleaseMonitor] Failed to store release: ${error.message}`);
    return false;
  }
  return true;
}

/**
 * Get currently installed version from local CLI.
 * @returns {Promise<string|null>}
 */
async function getInstalledVersion() {
  try {
    const { execSync } = await import('child_process');
    const version = execSync('claude --version 2>/dev/null || echo unknown', { encoding: 'utf8' }).trim();
    return version === 'unknown' ? null : version;
  } catch {
    return null;
  }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('[ReleaseMonitor] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('═══════════════════════════════════════════════');
  console.log('  CLAUDE CODE RELEASE MONITOR');
  console.log('═══════════════════════════════════════════════');
  console.log();

  // Fetch latest from npm
  const latest = await fetchLatestVersion();
  if (!latest) {
    console.log('  ❌ Could not fetch latest version from npm registry');
    process.exit(1);
  }

  console.log(`  📦 Latest on npm: ${latest.version}`);
  if (latest.date) {
    console.log(`  📅 Released: ${new Date(latest.date).toLocaleDateString()}`);
  }

  // Check installed version
  const installed = await getInstalledVersion();
  if (installed) {
    console.log(`  💻 Installed: ${installed}`);
    if (installed !== latest.version) {
      console.log(`  ⚠️  Update available: ${installed} → ${latest.version}`);
    } else {
      console.log('  ✅ You are on the latest version');
    }
  }

  // Check against DB
  const known = await getLatestKnownVersion(supabase);
  console.log();

  if (known === latest.version) {
    console.log('  ✅ No new releases since last check');
    console.log(`  📋 Latest known: ${known}`);
  } else {
    console.log(`  🆕 New release detected: ${latest.version}`);
    if (known) {
      console.log(`  📋 Previous known: ${known}`);
    } else {
      console.log('  📋 First check — storing baseline');
    }

    const stored = await storeRelease(supabase, latest);
    if (stored) {
      console.log('  ✅ Release record stored in database');
    }
  }

  console.log();
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error(`[ReleaseMonitor] Unexpected error: ${err.message}`);
  process.exit(1);
});
