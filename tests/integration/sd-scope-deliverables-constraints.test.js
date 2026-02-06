/**
 * Integration Test: sd_scope_deliverables Constraint Drift Detection
 *
 * SD-LEO-FIX-ENUM-DOCS-001: Validates that documented constraint values
 * match the actual database CHECK constraints.
 *
 * This test will FAIL if:
 * - A value is added to the database but not documented
 * - A value is removed from the database but still documented
 * - Any mismatch between documentation and database schema
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Documented values from sd_scope_deliverables_constraints.md
const DOCUMENTED_CONSTRAINTS = {
  deliverable_type: [
    'database',
    'ui_feature',
    'api',
    'documentation',
    'configuration',
    'test',
    'migration',
    'integration',
    'other'
  ],
  priority: [
    'required',
    'optional',
    'nice_to_have'
  ],
  completion_status: [
    'pending',
    'in_progress',
    'completed',
    'skipped',
    'blocked'
  ],
  verified_by: [
    // NULL is allowed - tested separately
    'EXEC',
    'PLAN',
    'LEAD',
    'QA_DIRECTOR',
    'DATABASE_ARCHITECT',
    'DESIGN_AGENT',
    'ARCHITECT',
    'database',
    'DATABASE',
    'database-agent',
    'DESIGN',
    'DESIGN_REVIEWER',
    'devops',
    'DOCMON',
    'EXEC_IMPL',
    'GITHUB',
    'GITHUB_ACTIONS',
    'LEAD_PRE_APPROVAL',
    'LEAD_VALIDATION',
    'PERFORMANCE',
    'qa',
    'QA',
    'RETRO',
    'RISK',
    'SD-CREWAI-ARCHITECTURE-001',
    'SD-VENTURE-UNIFICATION-001',
    'SECURITY',
    'STORIES',
    'testing',
    'TESTING',
    'TESTING_VALIDATOR',
    'VALIDATION',
    'VALIDATION_GATE'
  ]
};

/**
 * Parse PostgreSQL CHECK constraint to extract allowed values
 */
function parseCheckConstraint(constraintDef) {
  // Extract all quoted values from the constraint definition
  // Matches patterns like 'value'::character varying
  const values = [];
  const regex = /'([^']+)'::character varying/g;
  let match;
  while ((match = regex.exec(constraintDef)) !== null) {
    values.push(match[1]);
  }
  return values.sort();
}

describe('SD-LEO-FIX-ENUM-DOCS-001: sd_scope_deliverables Constraint Validation', () => {
  let client;
  let dbConstraints = {};

  beforeAll(async () => {
    client = new Client({
      connectionString: process.env.SUPABASE_POOLER_URL,
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();

    // Fetch actual constraints from database
    const result = await client.query(`
      SELECT
        conname as constraint_name,
        pg_get_constraintdef(oid) as constraint_definition
      FROM pg_constraint
      WHERE conrelid = 'sd_scope_deliverables'::regclass
      AND contype = 'c'
      ORDER BY conname;
    `);

    // Parse constraints
    for (const row of result.rows) {
      const name = row.constraint_name;
      const values = parseCheckConstraint(row.constraint_definition);

      if (name.includes('deliverable_type')) {
        dbConstraints.deliverable_type = values;
      } else if (name.includes('priority')) {
        dbConstraints.priority = values;
      } else if (name.includes('completion_status')) {
        dbConstraints.completion_status = values;
      } else if (name.includes('verified_by')) {
        dbConstraints.verified_by = values;
      }
    }
  });

  afterAll(async () => {
    await client.end();
  });

  it('1. deliverable_type: documented values match database', () => {
    const documented = [...DOCUMENTED_CONSTRAINTS.deliverable_type].sort();
    const actual = dbConstraints.deliverable_type || [];

    const missingInDocs = actual.filter(v => !documented.includes(v));
    const extraInDocs = documented.filter(v => !actual.includes(v));

    if (missingInDocs.length > 0) {
      console.error('Values in DB but NOT in documentation:', missingInDocs);
    }
    if (extraInDocs.length > 0) {
      console.error('Values in documentation but NOT in DB:', extraInDocs);
    }

    expect(missingInDocs).toEqual([]);
    expect(extraInDocs).toEqual([]);
    expect(documented).toEqual(actual);
  });

  it('2. priority: documented values match database', () => {
    const documented = [...DOCUMENTED_CONSTRAINTS.priority].sort();
    const actual = dbConstraints.priority || [];

    const missingInDocs = actual.filter(v => !documented.includes(v));
    const extraInDocs = documented.filter(v => !actual.includes(v));

    if (missingInDocs.length > 0) {
      console.error('Values in DB but NOT in documentation:', missingInDocs);
    }
    if (extraInDocs.length > 0) {
      console.error('Values in documentation but NOT in DB:', extraInDocs);
    }

    expect(missingInDocs).toEqual([]);
    expect(extraInDocs).toEqual([]);
    expect(documented).toEqual(actual);
  });

  it('3. completion_status: documented values match database', () => {
    const documented = [...DOCUMENTED_CONSTRAINTS.completion_status].sort();
    const actual = dbConstraints.completion_status || [];

    const missingInDocs = actual.filter(v => !documented.includes(v));
    const extraInDocs = documented.filter(v => !actual.includes(v));

    if (missingInDocs.length > 0) {
      console.error('Values in DB but NOT in documentation:', missingInDocs);
    }
    if (extraInDocs.length > 0) {
      console.error('Values in documentation but NOT in DB:', extraInDocs);
    }

    expect(missingInDocs).toEqual([]);
    expect(extraInDocs).toEqual([]);
    expect(documented).toEqual(actual);
  });

  it('4. verified_by: documented values match database', () => {
    const documented = [...DOCUMENTED_CONSTRAINTS.verified_by].sort();
    const actual = dbConstraints.verified_by || [];

    const missingInDocs = actual.filter(v => !documented.includes(v));
    const extraInDocs = documented.filter(v => !actual.includes(v));

    if (missingInDocs.length > 0) {
      console.error('Values in DB but NOT in documentation:', missingInDocs);
    }
    if (extraInDocs.length > 0) {
      console.error('Values in documentation but NOT in DB:', extraInDocs);
    }

    expect(missingInDocs).toEqual([]);
    expect(extraInDocs).toEqual([]);
    expect(documented).toEqual(actual);
  });

  it('5. Documentation file exists', () => {
    const docPath = path.join(
      process.cwd(),
      'docs/reference/schema/engineer/tables/sd_scope_deliverables_constraints.md'
    );
    expect(fs.existsSync(docPath)).toBe(true);
  });

  it('6. README includes link to constraints document', () => {
    const readmePath = path.join(
      process.cwd(),
      'docs/reference/schema/engineer/README.md'
    );
    const content = fs.readFileSync(readmePath, 'utf8');
    expect(content).toContain('sd_scope_deliverables_constraints.md');
  });
});
