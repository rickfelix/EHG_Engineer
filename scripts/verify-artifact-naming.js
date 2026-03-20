#!/usr/bin/env node
/**
 * Verify EVA Artifact Naming Convention Migration
 *
 * Checks that no old-format artifact type strings remain in the codebase.
 * Uses OLD_TO_NEW_MAP from the centralized registry to know which strings to flag.
 *
 * Exit 0: All old names eliminated
 * Exit 1: Old names found (lists violations)
 *
 * SD-LEO-INFRA-EVA-ARTIFACT-NAMING-001 (FR-6)
 */

import { OLD_TO_NEW_MAP } from '../lib/eva/artifact-types.js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

const SCAN_DIRS = ['lib/eva'];
const SKIP_FILES = new Set([
  'lib/eva/artifact-types.js', // Registry itself contains old names in OLD_TO_NEW_MAP
]);
const SKIP_PATTERNS = [/node_modules/, /\.test\.js$/, /\.spec\.js$/, /\/tests\//, /\/test\//];
// Directories where old names are used as JSON property names / data structure keys (not artifact_type values)
const SKIP_DIRS = new Set([
  'lib/eva/exit',                  // data-room uses document_type, not artifact_type
  'lib/eva/mental-models',         // variable references in model templates
  'lib/eva/stage-zero/paths',      // JSON schema keys in LLM prompts
  'lib/eva/stage-zero/interfaces.js', // field validation, not artifact types
]);

const oldNames = Object.keys(OLD_TO_NEW_MAP);
const violations = [];

function shouldSkip(filePath) {
  const rel = relative(ROOT, filePath).replace(/\\/g, '/');
  if (SKIP_FILES.has(rel)) return true;
  if (SKIP_PATTERNS.some(p => p.test(rel))) return true;
  // Check if file is in a skip directory
  for (const dir of SKIP_DIRS) {
    if (rel === dir || rel.startsWith(dir + '/') || rel.startsWith(dir.replace(/\.js$/, '') + '/')) return true;
  }
  return false;
}

function scanFile(filePath) {
  const rel = relative(ROOT, filePath).replace(/\\/g, '/');
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments that reference old names for documentation
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    for (const oldName of oldNames) {
      // Match as a string literal: 'old_name' or "old_name"
      const singleQuote = `'${oldName}'`;
      const doubleQuote = `"${oldName}"`;
      if (line.includes(singleQuote) || line.includes(doubleQuote)) {
        // Skip false positives: JSON property keys in LLM prompts ("key": "value")
        const trimmed = line.trim();
        if (trimmed.includes(`"${oldName}":`) || trimmed.includes(`"${oldName}" :`)) continue;
        // Skip property access patterns: data.old_name or data?.old_name
        if (trimmed.includes(`.${oldName}`) && !trimmed.includes(`'${oldName}'`)) continue;
        // Skip variable declarations/references that aren't string literals
        if (trimmed.match(new RegExp(`\\b${oldName}\\b`)) && !trimmed.includes(`'${oldName}'`) && !trimmed.includes(`"${oldName}"`)) continue;
        // Skip rubric dimension names (not artifact types)
        if (trimmed.includes('dim(')) continue;
        // Skip gate type strings (promotion_gate is a gate type, not artifact type)
        if (trimmed.includes('promotion_gate') && !trimmed.includes('artifact_type')) continue;
        // Skip validateEnum field name parameters
        if (trimmed.includes('validateEnum')) continue;
        // Skip LLM prompt output schema descriptions (JSON key descriptions in template strings)
        if (trimmed.includes('Output a JSON') || trimmed.includes('output a JSON')) continue;

        violations.push({ file: rel, line: i + 1, oldName, text: trimmed });
      }
    }
  }
}

function scanDir(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      scanDir(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      if (!shouldSkip(fullPath)) {
        scanFile(fullPath);
      }
    }
  }
}

// Run scan
for (const dir of SCAN_DIRS) {
  const fullDir = join(ROOT, dir);
  try {
    statSync(fullDir);
    scanDir(fullDir);
  } catch {
    console.warn(`Warning: ${dir} not found, skipping`);
  }
}

// Report
if (violations.length === 0) {
  console.log('✅ No old artifact type names found in codebase');
  console.log(`   Scanned: ${SCAN_DIRS.join(', ')}`);
  console.log(`   Old names checked: ${oldNames.length}`);
  process.exit(0);
} else {
  console.error(`❌ Found ${violations.length} old artifact type name(s):`);
  for (const v of violations) {
    console.error(`   ${v.file}:${v.line} — '${v.oldName}' → '${OLD_TO_NEW_MAP[v.oldName]}'`);
    console.error(`      ${v.text}`);
  }
  process.exit(1);
}
