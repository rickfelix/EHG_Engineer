#!/usr/bin/env node
/**
 * Security Fix: Remove hardcoded database passwords
 * Part of SD-LEO-GEN-REMEDIATE-CRITICAL-SECURITY-001
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PATTERN = 'Fl!M32DaM00n!1';
const SCRIPTS_DIR = path.join(__dirname);

function findFiles(dir, pattern, files = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !item.startsWith('.')) {
      findFiles(fullPath, pattern, files);
    } else if (stat.isFile() && (item.endsWith('.js') || item.endsWith('.mjs'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes(pattern)) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Pattern 1: password: process.env.X || 'Fl!...' (object property)
  content = content.replace(
    /password:\s*process\.env\.(SUPABASE_DB_PASSWORD|EHG_DB_PASSWORD)\s*\|\|\s*'Fl!M32DaM00n!1'/g,
    'password: process.env.$1 // SECURITY: env var required'
  );

  // Pattern 2: const password = process.env.X || 'Fl!...'
  content = content.replace(
    /const\s+password\s*=\s*process\.env\.(SUPABASE_DB_PASSWORD|EHG_DB_PASSWORD)\s*\|\|\s*'Fl!M32DaM00n!1';/g,
    "const password = process.env.$1;\nif (!password) throw new Error('SUPABASE_DB_PASSWORD required');"
  );

  // Pattern 3: const dbPassword = process.env.X || 'Fl!...'
  content = content.replace(
    /const\s+dbPassword\s*=\s*process\.env\.(SUPABASE_DB_PASSWORD|EHG_DB_PASSWORD)\s*\|\|\s*'Fl!M32DaM00n!1';/g,
    "const dbPassword = process.env.$1;\nif (!dbPassword) throw new Error('SUPABASE_DB_PASSWORD required');"
  );

  // Pattern 4: Hardcoded password without env fallback
  content = content.replace(
    /const\s+password\s*=\s*'Fl!M32DaM00n!1';/g,
    "const password = process.env.SUPABASE_DB_PASSWORD;\nif (!password) throw new Error('SUPABASE_DB_PASSWORD required');"
  );

  // Pattern 5: Full connection string with embedded password
  content = content.replace(
    /postgresql:\/\/postgres\.dedlbzhpgkmetvhbkyzq:Fl!M32DaM00n!1@/g,
    'postgresql://postgres.dedlbzhpgkmetvhbkyzq:${process.env.SUPABASE_DB_PASSWORD}@'
  );

  // Pattern 6: export PGPASSWORD='Fl!...'
  content = content.replace(
    /export PGPASSWORD="$SUPABASE_DB_PASSWORD"/g,
    'export PGPASSWORD="$SUPABASE_DB_PASSWORD"'
  );

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

// Main
console.log('🔐 Security Fix: Removing hardcoded passwords...\n');

const files = findFiles(SCRIPTS_DIR, PATTERN);
console.log(`Found ${files.length} files with hardcoded password\n`);

let fixed = 0;
for (const file of files) {
  const relativePath = path.relative(SCRIPTS_DIR, file);
  if (fixFile(file)) {
    console.log(`  ✅ Fixed: ${relativePath}`);
    fixed++;
  } else {
    console.log(`  ⚠️  Pattern not matched: ${relativePath}`);
  }
}

console.log(`\n✅ Fixed ${fixed}/${files.length} files`);
console.log('\n⚠️  Ensure SUPABASE_DB_PASSWORD is set in .env before running scripts');
