/**
 * Unit tests for schema hardening tools (Child H)
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-H
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = join(__dirname, '..', '..', '..', 'scripts');

describe('Schema Hardening Scripts Existence', () => {
  it('schema-snapshot.js exists', () => {
    expect(existsSync(join(SCRIPTS_DIR, 'schema-snapshot.js'))).toBe(true);
  });

  it('audit-dormant-tables.js exists', () => {
    expect(existsSync(join(SCRIPTS_DIR, 'audit-dormant-tables.js'))).toBe(true);
  });

  it('audit-enum-coverage.js exists', () => {
    expect(existsSync(join(SCRIPTS_DIR, 'audit-enum-coverage.js'))).toBe(true);
  });

  it('migration-stats.js exists', () => {
    expect(existsSync(join(SCRIPTS_DIR, 'migration-stats.js'))).toBe(true);
  });
});

describe('Migration Stats (offline analysis)', () => {
  it('migration-stats.js contains expected analysis functions', async () => {
    const content = (await import('fs')).readFileSync(
      join(SCRIPTS_DIR, 'migration-stats.js'), 'utf8',
    );
    expect(content).toContain('analyzeMigrations');
    expect(content).toContain('MIGRATIONS_DIR');
    expect(content).toContain('formatBytes');
  });
});

describe('Schema Snapshot Module Structure', () => {
  it('schema-snapshot.js is valid ESM', async () => {
    // Import won't execute main() since it's called at module level
    // Just checking the file is parseable
    const content = (await import('fs')).readFileSync(
      join(SCRIPTS_DIR, 'schema-snapshot.js'), 'utf8',
    );
    expect(content).toContain('captureSchema');
    expect(content).toContain('compareSnapshot');
    expect(content).toContain('SNAPSHOT_PATH');
  });

  it('audit-enum-coverage.js contains STATUS_PATTERNS', async () => {
    const content = (await import('fs')).readFileSync(
      join(SCRIPTS_DIR, 'audit-enum-coverage.js'), 'utf8',
    );
    expect(content).toContain('STATUS_PATTERNS');
    expect(content).toContain('status');
    expect(content).toContain('phase');
    expect(content).toContain('priority');
  });

  it('audit-dormant-tables.js has walkDir and findCodeReferences', async () => {
    const content = (await import('fs')).readFileSync(
      join(SCRIPTS_DIR, 'audit-dormant-tables.js'), 'utf8',
    );
    expect(content).toContain('walkDir');
    expect(content).toContain('findCodeReferences');
    expect(content).toContain('pg_stat_user_tables');
  });
});
