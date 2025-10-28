/**
 * Schema Documentation Helper
 *
 * Helper functions for regenerating schema documentation after database migrations.
 * Can be imported and called from migration scripts for immediate doc updates.
 *
 * Usage in migration scripts:
 * ```javascript
 * import { regenerateSchemaDocsAfterMigration } from '../lib/schema-docs-helper.js';
 *
 * async function main() {
 *   // ... apply migrations ...
 *
 *   if (allMigrationsSucceeded) {
 *     await regenerateSchemaDocsAfterMigration('engineer');
 *   }
 * }
 * ```
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Regenerate schema documentation after a successful migration
 *
 * @param {string} target - Which database to regenerate docs for ('engineer', 'app', or 'both')
 * @param {Object} options - Options for doc generation
 * @param {boolean} options.verbose - Show detailed output
 * @param {boolean} options.silent - Suppress output (only show errors)
 * @returns {Promise<Object>} Result with success status and output
 */
export async function regenerateSchemaDocsAfterMigration(target = 'engineer', options = {}) {
  const { verbose = false, silent = false } = options;

  if (!silent) {
    console.log('\n📚 Regenerating schema documentation...');
    console.log(`   Target: ${target}`);
  }

  const results = {
    success: true,
    target,
    outputs: {},
    errors: []
  };

  try {
    // Determine which npm scripts to run
    const commands = [];
    if (target === 'both') {
      commands.push({ name: 'engineer', script: 'npm run schema:docs:engineer' });
      commands.push({ name: 'app', script: 'npm run schema:docs:app' });
    } else if (target === 'engineer') {
      commands.push({ name: 'engineer', script: 'npm run schema:docs:engineer' });
    } else if (target === 'app') {
      commands.push({ name: 'app', script: 'npm run schema:docs:app' });
    } else {
      throw new Error(`Invalid target: ${target}. Must be 'engineer', 'app', or 'both'`);
    }

    // Execute each command
    for (const { name, script } of commands) {
      try {
        if (!silent) {
          console.log(`   Generating ${name} database docs...`);
        }

        const { stdout, stderr } = await execAsync(script);

        results.outputs[name] = {
          success: true,
          stdout: verbose ? stdout : '(output suppressed, use verbose=true to see)',
          stderr: stderr || null
        };

        if (!silent) {
          console.log(`   ✅ ${name} database docs generated`);
        }

        if (verbose && stdout) {
          console.log(stdout);
        }

      } catch (error) {
        results.success = false;
        results.errors.push({
          database: name,
          message: error.message,
          stderr: error.stderr
        });

        if (!silent) {
          console.error(`   ❌ Failed to generate ${name} database docs`);
          console.error(`   Error: ${error.message}`);
        }
      }
    }

    if (results.success && !silent) {
      console.log('\n✅ Schema documentation regenerated successfully');
      console.log('   📁 Location: docs/reference/schema/');
    } else if (!results.success && !silent) {
      console.error('\n⚠️  Some schema docs failed to regenerate (see errors above)');
    }

    return results;

  } catch (error) {
    results.success = false;
    results.errors.push({
      database: 'all',
      message: error.message
    });

    if (!silent) {
      console.error('\n❌ Error regenerating schema documentation:', error.message);
    }

    return results;
  }
}

/**
 * Check if schema documentation exists and is recent
 *
 * @param {string} target - Which database to check ('engineer' or 'app')
 * @returns {Promise<Object>} Status with exists flag and age
 */
export async function checkSchemaDocsStatus(target = 'engineer') {
  const fs = await import('fs/promises');
  const path = await import('path');

  const schemaPath = path.join(
    process.cwd(),
    'docs',
    'reference',
    'schema',
    target,
    'database-schema-overview.md'
  );

  try {
    const stats = await fs.stat(schemaPath);
    const ageMs = Date.now() - stats.mtimeMs;
    const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
    const ageDays = Math.floor(ageHours / 24);

    return {
      exists: true,
      path: schemaPath,
      lastModified: stats.mtime,
      ageMs,
      ageHours,
      ageDays,
      needsUpdate: ageDays > 7  // Suggest update if older than 7 days
    };
  } catch (error) {
    return {
      exists: false,
      path: schemaPath,
      error: error.message
    };
  }
}

/**
 * Recommend whether schema docs should be regenerated
 *
 * @param {string} target - Which database to check
 * @returns {Promise<Object>} Recommendation with reasoning
 */
export async function shouldRegenerateSchemaD ocs(target = 'engineer') {
  const status = await checkSchemaDocsStatus(target);

  if (!status.exists) {
    return {
      shouldRegenerate: true,
      reason: 'Schema documentation does not exist',
      priority: 'HIGH'
    };
  }

  if (status.needsUpdate) {
    return {
      shouldRegenerate: true,
      reason: `Schema docs are ${status.ageDays} days old`,
      priority: 'MEDIUM'
    };
  }

  return {
    shouldRegenerate: false,
    reason: `Schema docs are up-to-date (${status.ageHours} hours old)`,
    priority: 'LOW'
  };
}

/**
 * Display schema documentation status in terminal
 *
 * @param {string} target - Which database to check
 */
export async function displaySchemaDocsStatus(target = 'engineer') {
  console.log(`\n📊 Schema Documentation Status (${target})`);
  console.log('='.repeat(50));

  const status = await checkSchemaDocsStatus(target);

  if (status.exists) {
    console.log(`✅ Status: Exists`);
    console.log(`📁 Path: ${status.path}`);
    console.log(`🕐 Last Modified: ${status.lastModified.toLocaleString()}`);
    console.log(`⏱️  Age: ${status.ageDays} days, ${status.ageHours % 24} hours`);

    if (status.needsUpdate) {
      console.log(`⚠️  Recommendation: Update (docs are ${status.ageDays} days old)`);
      console.log(`💡 Run: npm run schema:docs:${target}`);
    } else {
      console.log(`✅ Recommendation: Up-to-date`);
    }
  } else {
    console.log(`❌ Status: Not found`);
    console.log(`📁 Expected path: ${status.path}`);
    console.log(`⚠️  Recommendation: Generate schema docs`);
    console.log(`💡 Run: npm run schema:docs:${target}`);
  }

  console.log('='.repeat(50));
}

export default {
  regenerateSchemaDocsAfterMigration,
  checkSchemaDocsStatus,
  shouldRegenerateSchemaD ocs,
  displaySchemaDocsStatus
};
