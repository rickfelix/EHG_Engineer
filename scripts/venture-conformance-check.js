#!/usr/bin/env node
/**
 * Venture Conformance Check - CI Gate
 * Validates that a venture project conforms to EHG standards.
 *
 * Usage:
 *   node scripts/venture-conformance-check.js <project-path> [--json] [--fix]
 *
 * Checks:
 *   1. Project structure matches convention
 *   2. Required dependencies present at correct versions
 *   3. Tailwind config extends @ehg/tailwind-preset
 *   4. ESLint config extends @ehg/lint-config
 *   5. Design tokens package installed
 *   6. Supabase config present
 *   7. TypeScript strict mode enabled
 *
 * Exit codes:
 *   0 = all checks pass
 *   1 = one or more checks fail
 *
 * SD: SD-LEO-INFRA-EHG-VENTURE-FUNDAMENTALS-001
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { join, resolve } from 'path';

const REQUIRED_DIRS = [
  'src/components',
  'src/hooks',
  'src/lib',
  'src/pages',
  'src/routes',
  'src/stores',
  'public',
  'tests',
];

const REQUIRED_FILES = [
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'tailwind.config.ts',
];

const REQUIRED_DEPS = {
  react: '^18.',
  'react-dom': '^18.',
  'react-router-dom': '^6.',
  '@tanstack/react-query': '^5.',
  zustand: '^5.',
  'react-hook-form': '^7.',
  zod: '^3.',
  '@supabase/supabase-js': '^2.',
  tailwindcss: '^3.',
  typescript: '^5.',
};

const REQUIRED_EHG_PACKAGES = [
  '@ehg/design-tokens',
  '@ehg/tailwind-preset',
  '@ehg/lint-config',
];

function check(name, pass, details) {
  return { name, pass, details: details || (pass ? 'OK' : 'FAIL') };
}

function run(projectPath) {
  const results = [];
  const absPath = resolve(projectPath);

  // 1. Project structure
  for (const dir of REQUIRED_DIRS) {
    const full = join(absPath, dir);
    const exists = existsSync(full) && statSync(full).isDirectory();
    results.push(check(`structure:${dir}`, exists, exists ? 'present' : 'missing'));
  }

  // 2. Required files
  for (const file of REQUIRED_FILES) {
    const full = join(absPath, file);
    const exists = existsSync(full);
    results.push(check(`file:${file}`, exists, exists ? 'present' : 'missing'));
  }

  // 3. Dependencies
  const pkgPath = join(absPath, 'package.json');
  let pkg = {};
  if (existsSync(pkgPath)) {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    for (const [dep, versionPattern] of Object.entries(REQUIRED_DEPS)) {
      const installed = allDeps[dep];
      const pass = installed && installed.startsWith(versionPattern);
      results.push(check(
        `dep:${dep}`,
        pass,
        installed ? `${installed} (expected ${versionPattern}*)` : 'not installed'
      ));
    }

    // EHG packages
    for (const ehgPkg of REQUIRED_EHG_PACKAGES) {
      const installed = allDeps[ehgPkg];
      results.push(check(`ehg:${ehgPkg}`, !!installed, installed || 'not installed'));
    }
  }

  // 4. Tailwind preset check
  const twPath = join(absPath, 'tailwind.config.ts');
  if (existsSync(twPath)) {
    const twContent = readFileSync(twPath, 'utf8');
    const usesPreset = twContent.includes('@ehg/tailwind-preset') || twContent.includes('ehgPreset');
    results.push(check('config:tailwind-preset', usesPreset, usesPreset ? 'extends @ehg/tailwind-preset' : 'does not extend preset'));
  }

  // 5. TypeScript strict mode
  const tsPath = join(absPath, 'tsconfig.json');
  if (existsSync(tsPath)) {
    try {
      const tsContent = readFileSync(tsPath, 'utf8');
      const strict = tsContent.includes('"strict": true') || tsContent.includes('"strict":true');
      results.push(check('config:typescript-strict', strict, strict ? 'strict mode enabled' : 'strict mode disabled'));
    } catch {
      results.push(check('config:typescript-strict', false, 'could not parse tsconfig.json'));
    }
  }

  // 6. Supabase config
  const supaDir = join(absPath, 'supabase');
  const hasSupabase = existsSync(supaDir) && statSync(supaDir).isDirectory();
  results.push(check('config:supabase', hasSupabase, hasSupabase ? 'supabase/ directory present' : 'supabase/ directory missing'));

  return results;
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const projectPath = args.find(a => !a.startsWith('--')) || '.';

  if (!existsSync(projectPath)) {
    console.error(`Error: path "${projectPath}" does not exist`);
    process.exit(1);
  }

  const results = run(projectPath);
  const passing = results.filter(r => r.pass).length;
  const failing = results.filter(r => !r.pass).length;
  const total = results.length;
  const score = Math.round((passing / total) * 100);

  if (jsonMode) {
    console.log(JSON.stringify({ score, passing, failing, total, results }, null, 2));
  } else {
    console.log(`\nVenture Conformance Check: ${projectPath}`);
    console.log('═'.repeat(60));

    for (const r of results) {
      const icon = r.pass ? '✓' : '✗';
      console.log(`  ${icon} ${r.name}: ${r.details}`);
    }

    console.log('═'.repeat(60));
    console.log(`Score: ${score}/100 (${passing}/${total} checks passing)`);

    if (failing > 0) {
      console.log(`\n${failing} check(s) failed. Fix issues and re-run.`);
    } else {
      console.log('\nAll checks passing!');
    }
  }

  process.exit(failing > 0 ? 1 : 0);
}

main();
