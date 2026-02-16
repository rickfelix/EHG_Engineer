/**
 * Security Audit Dashboard
 *
 * Comprehensive security overview showing:
 * - RLS policy coverage
 * - API authentication status
 * - Secret management (env var check)
 * - Chairman authorization function status
 *
 * Part of SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-J
 *
 * Usage: node scripts/security-audit-dashboard.js [--json]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JSON_MODE = process.argv.includes('--json');
const ROOT = resolve(import.meta.dirname, '..');

function log(msg = '') {
  if (!JSON_MODE) console.log(msg);
}

async function checkRlsCoverage() {
  const { data: tables } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT relname as tablename, relrowsecurity as rls_enabled
      FROM pg_class
      WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND relkind = 'r'
    `
  });

  if (!tables) return { total: 0, enabled: 0, coverage: 0 };

  const total = tables.length;
  const enabled = tables.filter(t => t.rls_enabled).length;
  return { total, enabled, coverage: total > 0 ? Math.round((enabled / total) * 100) : 0 };
}

async function checkFnIsChairman() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT routine_name, routine_type
      FROM information_schema.routines
      WHERE routine_schema = 'public'
        AND routine_name = 'fn_is_chairman'
    `
  });

  return {
    exists: data && data.length > 0,
    type: data?.[0]?.routine_type || 'N/A',
  };
}

function checkSecretManagement() {
  const envPath = resolve(ROOT, '.env');
  const envExists = existsSync(envPath);
  const gitignorePath = resolve(ROOT, '.gitignore');
  const gitignoreExists = existsSync(gitignorePath);

  let envInGitignore = false;
  if (gitignoreExists) {
    const gitignore = readFileSync(gitignorePath, 'utf-8');
    envInGitignore = gitignore.includes('.env');
  }

  // Check for common secret env vars
  const requiredSecrets = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ANON_KEY',
  ];

  const secretStatus = requiredSecrets.map(key => ({
    key,
    present: !!process.env[key],
    // Never expose actual values
  }));

  return {
    envFileExists: envExists,
    envInGitignore,
    secrets: secretStatus,
    allSecretsPresent: secretStatus.every(s => s.present),
  };
}

function checkApiAuthMiddleware() {
  const authPath = resolve(ROOT, 'lib/middleware/api-auth.js');
  const exists = existsSync(authPath);

  if (!exists) return { exists: false, hasJwtValidation: false, hasChairmanCheck: false };

  const src = readFileSync(authPath, 'utf-8');
  return {
    exists: true,
    hasJwtValidation: src.includes('Bearer') && src.includes('getUser'),
    hasChairmanCheck: src.includes('requireChairman') || src.includes('isChairman'),
    hasServiceRoleAuth: src.includes('x-api-key') || src.includes('service_role'),
    hasPublicRoutes: src.includes('PUBLIC_ROUTES'),
  };
}

async function checkApiRouteProtection() {
  // Check if routes use auth middleware
  const routesDir = resolve(ROOT, 'server/routes');
  const routeFiles = ['chairman.js', 'ventures.js', 'discovery.js', 'sdip.js', 'calibration.js'];

  const results = [];
  for (const file of routeFiles) {
    const path = resolve(routesDir, file);
    if (!existsSync(path)) continue;

    const src = readFileSync(path, 'utf-8');
    results.push({
      route: file,
      hasAuth: src.includes('auth') || src.includes('authenticate') || src.includes('requireChairman'),
      hasValidation: src.includes('validate') || src.includes('!decisionId') || src.includes('400'),
    });
  }

  return results;
}

async function main() {
  log('');
  log('='.repeat(60));
  log('  SECURITY AUDIT DASHBOARD');
  log('='.repeat(60));

  // 1. RLS Coverage
  const rls = await checkRlsCoverage();
  const rlsIcon = rls.coverage >= 90 ? 'PASS' : rls.coverage >= 50 ? 'WARN' : 'FAIL';
  log('');
  log(`  [${rlsIcon}] RLS Coverage`);
  log('  ' + '-'.repeat(40));
  log(`  Total tables:    ${rls.total}`);
  log(`  RLS enabled:     ${rls.enabled}`);
  log(`  Coverage:        ${rls.coverage}%`);

  // 2. API Auth
  const auth = checkApiAuthMiddleware();
  const authIcon = auth.exists && auth.hasJwtValidation ? 'PASS' : 'FAIL';
  log('');
  log(`  [${authIcon}] API Authentication Middleware`);
  log('  ' + '-'.repeat(40));
  log(`  Middleware exists:     ${auth.exists}`);
  log(`  JWT validation:       ${auth.hasJwtValidation || false}`);
  log(`  Chairman check:       ${auth.hasChairmanCheck || false}`);
  log(`  Service role auth:    ${auth.hasServiceRoleAuth || false}`);
  log(`  Public routes:        ${auth.hasPublicRoutes || false}`);

  // 3. fn_is_chairman
  const fnChairman = await checkFnIsChairman();
  const fnIcon = fnChairman.exists ? 'PASS' : 'FAIL';
  log('');
  log(`  [${fnIcon}] fn_is_chairman Function`);
  log('  ' + '-'.repeat(40));
  log(`  Exists:     ${fnChairman.exists}`);
  log(`  Type:       ${fnChairman.type}`);

  // 4. Secret Management
  const secrets = checkSecretManagement();
  const secretIcon = secrets.envInGitignore && secrets.allSecretsPresent ? 'PASS' : 'WARN';
  log('');
  log(`  [${secretIcon}] Secret Management`);
  log('  ' + '-'.repeat(40));
  log(`  .env exists:         ${secrets.envFileExists}`);
  log(`  .env in .gitignore:  ${secrets.envInGitignore}`);
  log(`  All secrets present: ${secrets.allSecretsPresent}`);
  for (const s of secrets.secrets) {
    log(`    ${s.key}: ${s.present ? 'SET' : 'MISSING'}`);
  }

  // 5. Route Protection
  const routes = await checkApiRouteProtection();
  const protectedCount = routes.filter(r => r.hasAuth).length;
  const routeIcon = protectedCount === routes.length ? 'PASS' : 'WARN';
  log('');
  log(`  [${routeIcon}] API Route Protection`);
  log('  ' + '-'.repeat(40));
  log(`  Protected: ${protectedCount}/${routes.length}`);
  for (const r of routes) {
    log(`    ${r.route}: auth=${r.hasAuth}, validation=${r.hasValidation}`);
  }

  // Overall Score
  const scores = [
    rls.coverage >= 50 ? 1 : 0,
    auth.exists && auth.hasJwtValidation ? 1 : 0,
    fnChairman.exists ? 1 : 0,
    secrets.envInGitignore ? 1 : 0,
    protectedCount > 0 ? 1 : 0,
  ];
  const overallScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);

  log('');
  log('  Overall Security Score');
  log('  ' + '-'.repeat(40));
  log(`  Score: ${overallScore}%`);
  log(`  Checks passed: ${scores.filter(s => s).length}/${scores.length}`);

  log('');
  log('='.repeat(60));

  if (JSON_MODE) {
    const output = { rls, auth, fnChairman, secrets, routes, overallScore };
    console.log(JSON.stringify(output, null, 2));
  }
}

main().catch(err => {
  console.error('Dashboard error:', err.message);
  process.exit(1);
});
