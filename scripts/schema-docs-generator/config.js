/**
 * Schema Documentation Generator - Configuration
 * Database connection and configuration constants
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Detect which database to document based on CLI flags
export const isEHGApp = process.argv.includes('--app') || process.argv.includes('--ehg');

// Select database configuration
let supabaseUrl, supabaseKey, poolerUrl, databaseTarget;

if (isEHGApp) {
  // EHG Application database
  supabaseUrl = process.env.EHG_SUPABASE_URL;
  supabaseKey = process.env.EHG_SUPABASE_SERVICE_ROLE_KEY || process.env.EHG_SUPABASE_ANON_KEY;
  poolerUrl = process.env.EHG_POOLER_URL;
  databaseTarget = 'ehg';
} else {
  // EHG_Engineer database (default)
  supabaseUrl = process.env.SUPABASE_URL;
  supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  poolerUrl = process.env.SUPABASE_POOLER_URL;
  databaseTarget = 'engineer';
}

// Main configuration object
export const CONFIG = {
  outputDir: path.join(__dirname, '..', '..', 'docs', 'reference', 'schema', databaseTarget),
  tablesDir: path.join(__dirname, '..', '..', 'docs', 'reference', 'schema', databaseTarget, 'tables'),
  supabaseUrl,
  supabaseKey,
  poolerUrl,
  databaseTarget,
  verbose: process.argv.includes('--verbose'),
  singleTable: process.argv.includes('--table') ? process.argv[process.argv.indexOf('--table') + 1] : null,

  // Tables to skip (internal Supabase tables)
  skipTables: [
    'schema_migrations',
    'supabase_migrations',
    'supabase_functions_migrations',
    '_analytics_',
    '_realtime_'
  ],

  // High-traffic tables that should include usage examples (Engineer-specific)
  keyTablesEngineer: [
    'strategic_directives_v2',
    'product_requirements_v2',
    'retrospectives',
    'leo_protocols',
    'leo_sub_agents',
    'sd_phase_handoffs'
  ],

  // High-traffic tables that should include usage examples (EHG App-specific)
  keyTablesEHG: [
    'users',
    'ventures',
    'participants',
    'strategic_plans'
  ]
};

// Select appropriate key tables based on database
CONFIG.keyTables = isEHGApp ? CONFIG.keyTablesEHG : CONFIG.keyTablesEngineer;

/**
 * Database mappings for application context
 */
export const DB_MAPPINGS = {
  'dedlbzhpgkmetvhbkyzq': {
    getName: (target) => target === 'ehg' ? 'EHG' : 'EHG_Engineer',
    getDescription: (target) => target === 'ehg'
      ? 'Business Application (Customer-Facing) - CONSOLIDATED DB'
      : 'LEO Protocol Management Dashboard - CONSOLIDATED DB',
    getPath: (target) => target === 'ehg' ? '../ehg/' : 'EHG_Engineer (this repository)',
    getPurpose: (target) => target === 'ehg'
      ? 'Customer features, business logic, user-facing functionality'
      : 'Strategic Directive management, PRD tracking, retrospectives, LEO Protocol configuration'
  }
};
