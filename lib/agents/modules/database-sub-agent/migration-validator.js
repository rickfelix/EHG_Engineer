/**
 * Database Sub-Agent - Migration Validator Module
 *
 * Validates database migrations for best practices and safety.
 *
 * @module lib/agents/modules/database-sub-agent/migration-validator
 */

import fsModule from 'fs';
const fs = fsModule.promises;
import path from 'path';

/**
 * Validate migrations
 *
 * @returns {Promise<Object>} Migration validation results
 */
export async function validateMigrations() {
  const validation = {
    migrations: [],
    issues: [],
    status: 'UNKNOWN'
  };

  // Check for migration files
  const migrationPaths = [
    'supabase/migrations',
    'database/migrations',
    'db/migrate',
    'migrations'
  ];

  for (const migPath of migrationPaths) {
    try {
      const files = await fs.readdir(migPath);
      const migrationFiles = files.filter(f => f.endsWith('.sql') || f.endsWith('.js'));

      // Check migration ordering
      const timestamps = [];

      for (const file of migrationFiles) {
        validation.migrations.push({
          file,
          path: path.join(migPath, file)
        });

        // Extract timestamp from filename
        const timestamp = file.match(/^(\d+)/);
        if (timestamp) {
          timestamps.push(parseInt(timestamp[1]));
        } else {
          validation.issues.push({
            type: 'MIGRATION_NO_TIMESTAMP',
            file,
            severity: 'MEDIUM',
            fix: 'Prefix migration files with timestamps'
          });
        }

        // Check migration content
        const content = await fs.readFile(path.join(migPath, file), 'utf8');

        // Check for reversible migrations
        if (!content.includes('-- Down') && !content.includes('DROP') && !content.includes('rollback')) {
          validation.issues.push({
            type: 'NON_REVERSIBLE_MIGRATION',
            file,
            severity: 'LOW',
            fix: 'Add rollback/down migration'
          });
        }

        // Check for unsafe operations
        if (/DROP\s+TABLE\s+(?!IF\s+EXISTS)/i.test(content)) {
          validation.issues.push({
            type: 'UNSAFE_DROP_TABLE',
            file,
            severity: 'HIGH',
            fix: 'Use DROP TABLE IF EXISTS'
          });
        }

        if (/ALTER\s+TABLE.*DROP\s+COLUMN/i.test(content)) {
          validation.issues.push({
            type: 'DATA_LOSS_RISK',
            file,
            severity: 'HIGH',
            fix: 'Ensure data is backed up before dropping columns'
          });
        }
      }

      // Check for duplicate timestamps
      const duplicates = timestamps.filter((t, i) => timestamps.indexOf(t) !== i);
      if (duplicates.length > 0) {
        validation.issues.push({
          type: 'DUPLICATE_MIGRATION_TIMESTAMPS',
          timestamps: duplicates,
          severity: 'HIGH',
          fix: 'Ensure unique timestamps for migrations'
        });
      }

      break; // Found migrations
    } catch {
      // Directory doesn't exist
    }
  }

  validation.status = validation.issues.filter(i => i.severity === 'HIGH').length > 0 ? 'FAIL' :
                     validation.issues.length > 3 ? 'WARNING' : 'PASS';

  return validation;
}
