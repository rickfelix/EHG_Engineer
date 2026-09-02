/**
 * SD-FDBK-INFRA-WORKTREES-CARRY-SNAPSHOT-001 / FR-3.
 *
 * Verifies the eslint.config.js block banning NEW direct `dotenv`/`dotenv/config`
 * imports under lib/ (outside the two sanctioned shared-loader files), added to stop
 * the ~175-file legacy population (grandfathered via tools/eslint-rules/
 * dotenv-legacy-allowlist.json, TR-1) from growing.
 *
 * TESTING REVIEW CORRECTION: the eva-support precedent this mirrors
 * (tests/ci/eva-support-eslint-restricted-imports-config.test.js) is a static-source
 * regex scan that never actually runs ESLint -- it can drift silently from what the
 * config actually does. This suite keeps that static-scan style ONLY for the
 * config-existence assertion (acceptance criterion: "independent of a live lint run"),
 * and adds a SEPARATE describe block that runs the real rule via ESLint().lintText()
 * against in-memory strings -- no permanent fixture file is added to the repo, so
 * these in-memory violations never fail a real `npm run lint`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ESLint } from 'eslint';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ESLINT_CONFIG_PATH = join(REPO_ROOT, 'eslint.config.js');

describe('config-existence: dotenv ESLint no-restricted-imports block (static scan, independent of a live lint run)', () => {
  const source = readFileSync(ESLINT_CONFIG_PATH, 'utf8');

  it('eslint.config.js targets lib/**/*.{js,mjs,cjs}', () => {
    expect(source).toMatch(/files:\s*\[\s*['"]lib\/\*\*\/\*\.\{js,mjs,cjs\}['"]/);
  });

  it('eslint.config.js declares no-restricted-imports for both dotenv and dotenv/config', () => {
    expect(source).toMatch(/['"]no-restricted-imports['"]/);
    expect(source).toMatch(/name:\s*['"]dotenv['"]/);
    expect(source).toMatch(/name:\s*['"]dotenv\/config['"]/);
  });

  it('eslint.config.js also declares no-restricted-syntax to catch CJS require(\'dotenv\') (no-restricted-imports only sees import/export syntax)', () => {
    expect(source).toMatch(/['"]no-restricted-syntax['"]/);
    expect(source).toMatch(/arguments\.0\.value=['"]dotenv['"]/);
    expect(source).toMatch(/arguments\.0\.value=['"]dotenv\/config['"]/);
  });

  it('excludes the two sanctioned shared-loader files from the ban', () => {
    expect(source).toMatch(/ignores:\s*\[\s*\n?\s*['"]lib\/supabase-client\.js['"]/);
    expect(source).toMatch(/['"]lib\/supabase-client\.cjs['"]/);
  });

  it('grandfathers the pre-existing legacy population via the generated allowlist, not a hand-maintained list', () => {
    expect(source).toMatch(/dotenvLegacyAllowlist/);
    expect(source).toMatch(/dotenv-legacy-allowlist\.json/);
  });

  it('cites the canonical SD reference (auditability)', () => {
    expect(source).toMatch(/SD-FDBK-INFRA-WORKTREES-CARRY-SNAPSHOT-001/);
  });
});

describe('behavior: the rule actually fires (real ESLint, in-memory strings only -- no fixture file)', () => {
  const RAW_DOTENV_IMPORT = "import dotenv from 'dotenv';\ndotenv.config();\n";
  const RAW_DOTENV_CONFIG_IMPORT = "import 'dotenv/config';\n";

  it('flags a raw `dotenv` import in a brand-new lib/ file', async () => {
    const eslint = new ESLint({ overrideConfigFile: ESLINT_CONFIG_PATH });
    const [result] = await eslint.lintText(RAW_DOTENV_IMPORT, {
      filePath: join(REPO_ROOT, 'lib/__ci-fixture-does-not-exist-on-disk__.js'),
    });
    expect(result.messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('flags a raw `dotenv/config` import in a brand-new lib/ file', async () => {
    const eslint = new ESLint({ overrideConfigFile: ESLINT_CONFIG_PATH });
    const [result] = await eslint.lintText(RAW_DOTENV_CONFIG_IMPORT, {
      filePath: join(REPO_ROOT, 'lib/__ci-fixture-does-not-exist-on-disk-2__.js'),
    });
    expect(result.messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(true);
  });

  it('flags a CJS require(\'dotenv\') in a brand-new lib/ .cjs file (import-only ban would miss this)', async () => {
    const eslint = new ESLint({ overrideConfigFile: ESLINT_CONFIG_PATH });
    const [result] = await eslint.lintText("const dotenv = require('dotenv');\ndotenv.config();\n", {
      filePath: join(REPO_ROOT, 'lib/__ci-fixture-does-not-exist-on-disk-3__.cjs'),
    });
    expect(result.messages.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(true);
  });

  it('does NOT flag a CJS require(\'dotenv\') in the sanctioned .cjs loader itself', async () => {
    const eslint = new ESLint({ overrideConfigFile: ESLINT_CONFIG_PATH });
    const [result] = await eslint.lintText("const dotenv = require('dotenv');\n", {
      filePath: join(REPO_ROOT, 'lib/supabase-client.cjs'),
    });
    expect(result.messages.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(false);
  });

  it('does NOT flag the same import in a sanctioned shared-loader file', async () => {
    const eslint = new ESLint({ overrideConfigFile: ESLINT_CONFIG_PATH });
    const [result] = await eslint.lintText(RAW_DOTENV_IMPORT, {
      filePath: join(REPO_ROOT, 'lib/supabase-client.js'),
    });
    expect(result.messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(false);
  });

  it('does NOT retroactively flag a real pre-existing (grandfathered) legacy importer', async () => {
    const eslint = new ESLint({ overrideConfigFile: ESLINT_CONFIG_PATH });
    const allowlist = JSON.parse(
      readFileSync(join(REPO_ROOT, 'tools/eslint-rules/dotenv-legacy-allowlist.json'), 'utf8')
    );
    expect(allowlist.length).toBeGreaterThan(0);
    const [result] = await eslint.lintText(RAW_DOTENV_IMPORT, {
      filePath: join(REPO_ROOT, allowlist[0]),
    });
    expect(result.messages.some((m) => m.ruleId === 'no-restricted-imports')).toBe(false);
  });
});
